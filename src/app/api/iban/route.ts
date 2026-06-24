import { NextResponse } from "next/server";

// Server-side proxy for IBAN validation via ibanapi.com. Keeps the API key off
// the client and sidesteps CORS / browser rate-limit exposure.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const IBANAPI_URL =
  process.env.IBANAPI_URL ?? "https://api.ibanapi.com/v1/validate";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const iban = (searchParams.get("iban") ?? "").replace(/\s+/g, "").toUpperCase();

  if (iban.length < 15) {
    return NextResponse.json(
      { valid: false, error: "IBAN is too short to look up." },
      { status: 400 },
    );
  }

  const apiKey = process.env.IBANAPI_KEY;
  if (!apiKey) {
    return NextResponse.json(
      {
        valid: false,
        error:
          "IBAN lookup is not configured. Set the IBANAPI_KEY environment variable.",
      },
      { status: 503 },
    );
  }

  let upstream: Response;
  try {
    upstream = await fetch(
      `${IBANAPI_URL}/${encodeURIComponent(iban)}?api_key=${encodeURIComponent(apiKey)}`,
      { headers: { Accept: "application/json" }, cache: "no-store" },
    );
  } catch (err) {
    return NextResponse.json(
      { valid: false, error: `Lookup service unreachable: ${(err as Error).message}` },
      { status: 502 },
    );
  }

  const data = await upstream.json().catch(() => null);

  if (!upstream.ok || !data) {
    const message =
      data?.message || `Lookup failed (HTTP ${upstream.status}).`;
    // 429 from upstream => surface as rate limit so the UI can say "try again".
    return NextResponse.json(
      { valid: false, error: message },
      { status: upstream.status === 429 ? 429 : 502 },
    );
  }

  // ibanapi marks success with result === 200. Bank fields vary by plan/shape,
  // so read them defensively (data.bank may be a string or an object).
  const valid = data.result === 200 || data.result === "200";
  const d = data.data ?? {};
  const bankField = d.bank;
  const bankObj = bankField && typeof bankField === "object" ? bankField : {};
  const bic = d.bic || d.swift_code || bankObj.bic || bankObj.swift_code || "";
  const bank =
    (typeof bankField === "string" ? bankField : "") ||
    d.bank_name ||
    bankObj.bank_name ||
    bankObj.name ||
    "";

  return NextResponse.json({
    valid,
    bic,
    bank,
    message: data.message,
  });
}
