import "server-only";

import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";
import libre from "libreoffice-convert";

// libreoffice-convert is callback-based; promisify the variant that lets us
// pass extra options (so we can point it at a custom soffice binary path).
const convertAsync = promisify(libre.convertWithOptions);

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

/**
 * Converts a .docx Buffer into a PDF Buffer using LibreOffice (headless).
 * Requires LibreOffice to be installed on the host. The soffice binary can be
 * pointed at explicitly via the LIBRE_OFFICE_EXE env var.
 */
export async function convertDocxToPdf(docxBuffer: Buffer): Promise<Buffer> {
  const sofficeBinaryPaths = process.env.LIBRE_OFFICE_EXE
    ? [process.env.LIBRE_OFFICE_EXE]
    : [];

  try {
    return await convertAsync(docxBuffer, ".pdf", undefined, {
      sofficeBinaryPaths,
    });
  } catch (err) {
    const message = (err as Error).message ?? "";
    if (/could not find soffice/i.test(message)) {
      throw new DocumentGenerationError(
        "PDF conversion failed: LibreOffice was not found. Install LibreOffice " +
          "(https://www.libreoffice.org/download) or set the LIBRE_OFFICE_EXE " +
          "environment variable to the full path of soffice.exe.",
        503,
      );
    }
    throw new DocumentGenerationError(
      `PDF conversion failed: ${message || "unknown error from LibreOffice."}`,
    );
  }
}

/** Full pipeline: fill the template then convert the result to a PDF Buffer. */
export async function generatePdf(data: DocumentData): Promise<Buffer> {
  const docxBuffer = fillTemplate(data);
  return convertDocxToPdf(docxBuffer);
}
