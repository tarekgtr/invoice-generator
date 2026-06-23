import "server-only";

import fs from "node:fs";
import path from "node:path";
import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";
import mammoth from "mammoth";

/**
 * Absolute path to the .docx template, exactly as specified in the project
 * requirements. Can be overridden via the TEMPLATE_PATH env var.
 */
export const TEMPLATE_PATH =
  process.env.TEMPLATE_PATH ??
  path.join(process.cwd(), "RAPPORT MYFIN xx.docx");

/** The placeholders present in the .docx template (the `{...}` tags). */
export const TEMPLATE_FIELDS = [
  "status",
  "name2",
  "iban2",
  "bic",
  "bank",
  "IBD",
  "name1",
  "iban1",
  "amount",
  "details",
  "date",
  "time",
] as const;

export type TemplateField = (typeof TEMPLATE_FIELDS)[number];
export type DocumentData = Record<TemplateField, string>;

/**
 * Thrown for known, user-actionable failures so the API layer can return a
 * clean message instead of a raw stack trace.
 */
export class DocumentGenerationError extends Error {
  constructor(
    message: string,
    public readonly status = 500,
  ) {
    super(message);
    this.name = "DocumentGenerationError";
  }
}

/**
 * Reads the .docx template, fills the `{...}` placeholders with `data`, and
 * returns the resulting Word document as a Buffer.
 */
export function fillTemplate(data: DocumentData): Buffer {
  if (!fs.existsSync(TEMPLATE_PATH)) {
    throw new DocumentGenerationError(
      `Template not found at "${TEMPLATE_PATH}". Make sure the .docx file exists at that path.`,
      404,
    );
  }

  let content: Buffer;
  try {
    content = fs.readFileSync(TEMPLATE_PATH);
  } catch (err) {
    throw new DocumentGenerationError(
      `Unable to read the template file: ${(err as Error).message}`,
    );
  }

  let zip: PizZip;
  try {
    zip = new PizZip(content);
  } catch {
    throw new DocumentGenerationError(
      "The template file is not a valid .docx archive.",
    );
  }

  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
    // Render any missing placeholder as an empty string instead of throwing.
    nullGetter: () => "",
  });

  try {
    doc.render(data);
  } catch (err) {
    // docxtemplater attaches detailed per-tag errors on `.properties.errors`.
    const e = err as { properties?: { errors?: { message: string }[] } };
    const details = e.properties?.errors?.map((x) => x.message).join("; ");
    throw new DocumentGenerationError(
      `Failed to fill the template${details ? `: ${details}` : "."}`,
    );
  }

  return doc.getZip().generate({ type: "nodebuffer", compression: "DEFLATE" });
}

/** Wraps mammoth's body HTML in a full document with clean print styling. */
function buildHtml(bodyHtml: string): string {
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <style>
      * { box-sizing: border-box; }
      body {
        font-family: "Helvetica Neue", Arial, sans-serif;
        font-size: 11pt;
        line-height: 1.5;
        color: #1a1a1a;
        margin: 0;
      }
      h1, h2, h3 { color: #111; margin: 0.6em 0 0.3em; line-height: 1.25; }
      h1 { font-size: 18pt; }
      h2 { font-size: 14pt; }
      h3 { font-size: 12pt; }
      p { margin: 0.4em 0; }
      table { border-collapse: collapse; width: 100%; margin: 0.6em 0; }
      td, th { border: 1px solid #cbd5e1; padding: 6px 9px; text-align: left; vertical-align: top; }
      th { background: #f1f5f9; }
      img { max-width: 100%; height: auto; }
      ul, ol { margin: 0.4em 0; padding-left: 1.4em; }
    </style>
  </head>
  <body>${bodyHtml}</body>
</html>`;
}

/** Launches a headless Chromium, using @sparticuz/chromium on serverless and a
 * locally installed Chrome/Edge during development. */
async function launchBrowser() {
  const puppeteer = (await import("puppeteer-core")).default;
  const isServerless = !!(
    process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME
  );

  if (isServerless) {
    const chromium = (await import("@sparticuz/chromium")).default;
    return puppeteer.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath(),
      headless: true,
    });
  }

  const executablePath = process.env.CHROME_EXE ?? findLocalChrome();
  if (!executablePath) {
    throw new DocumentGenerationError(
      "PDF conversion failed: no local Chrome/Edge browser was found for " +
        "rendering. Install Google Chrome, or set the CHROME_EXE environment " +
        "variable to a Chromium-based browser executable.",
      503,
    );
  }
  return puppeteer.launch({
    executablePath,
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
}

/** Returns the path to a locally installed Chromium-based browser, if any. */
function findLocalChrome(): string | undefined {
  const candidates = [
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium-browser",
    "/usr/bin/chromium",
  ];
  return candidates.find((p) => fs.existsSync(p));
}

/**
 * Converts a .docx Buffer into a PDF Buffer without any system dependency:
 * mammoth turns the Word document into HTML, then headless Chromium renders
 * that HTML to a PDF. Runs on Vercel's serverless functions.
 */
export async function convertDocxToPdf(docxBuffer: Buffer): Promise<Buffer> {
  let bodyHtml: string;
  try {
    const result = await mammoth.convertToHtml({ buffer: docxBuffer });
    bodyHtml = result.value;
  } catch (err) {
    throw new DocumentGenerationError(
      `Failed to read the generated document: ${(err as Error).message}`,
    );
  }

  let browser: Awaited<ReturnType<typeof launchBrowser>> | undefined;
  try {
    browser = await launchBrowser();
    const page = await browser.newPage();
    await page.setContent(buildHtml(bodyHtml), { waitUntil: "load" });
    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "20mm", bottom: "20mm", left: "18mm", right: "18mm" },
    });
    return Buffer.from(pdf);
  } catch (err) {
    if (err instanceof DocumentGenerationError) throw err;
    throw new DocumentGenerationError(
      `PDF conversion failed: ${(err as Error).message || "unknown rendering error."}`,
    );
  } finally {
    await browser?.close();
  }
}

/** Full pipeline: fill the template then convert the result to a PDF Buffer. */
export async function generatePdf(data: DocumentData): Promise<Buffer> {
  const docxBuffer = fillTemplate(data);
  return convertDocxToPdf(docxBuffer);
}
