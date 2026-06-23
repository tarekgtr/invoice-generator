import { NextResponse } from "next/server";
import {
  generatePdf,
  TEMPLATE_FIELDS,
  DocumentGenerationError,
  type DocumentData,
} from "@/lib/generateDocument";

// LibreOffice conversion is filesystem/process heavy — force the Node.js
// runtime (not Edge) and disable caching.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Headless Chromium cold-start + render can exceed the default limit.
export const maxDuration = 60;

export async function POST(request: Request) {
  let payload: Record<string, unknown>;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid request body — expected JSON." },
      { status: 400 },
    );
  }

  // Coerce every expected field to a string; reject if a field is entirely
  // missing so the template never renders a literal "undefined".
  const data = {} as DocumentData;
  const missing: string[] = [];
  for (const field of TEMPLATE_FIELDS) {
    const value = payload[field];
    if (value === undefined || value === null || value === "") {
      missing.push(field);
      data[field] = "";
    } else {
      data[field] = String(value);
    }
  }

  if (missing.length === TEMPLATE_FIELDS.length) {
    return NextResponse.json(
      { error: "No form data was submitted." },
      { status: 400 },
    );
  }

  try {
    const pdf = await generatePdf(data);

    const fileName = `MYFIN-${(data.IBD || "report").replace(/[^\w.-]+/g, "_")}.pdf`;

    return new NextResponse(new Uint8Array(pdf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Content-Length": String(pdf.length),
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    if (err instanceof DocumentGenerationError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("Unexpected error generating PDF:", err);
    return NextResponse.json(
      { error: "An unexpected error occurred while generating the PDF." },
      { status: 500 },
    );
  }
}
