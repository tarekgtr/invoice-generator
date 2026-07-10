import { NextResponse } from "next/server";

// Server-side proxy for IBAN validation via openIBAN — a free, keyless service
// (no API key, no usage balance). Returns a normalized { valid, bic, bank }.
// Note: openIBAN's bank data is Europe-focused (DE, NL, BE, AT, CH, LU, ...);
// for other countries it validates the IBAN but may return no bank/BIC, in
// which case the user fills those fields manually.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const OPENIBAN_URL = process.env.OPENIBAN_URL ?? "https://openiban.com/validate";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const iban = (searchParams.get("iban") ?? "").replace(/\s+/g, "").toUpperCase();

  if (iban.length < 15) {
    return NextResponse.json(
      { valid: false, error: "IBAN is too short to look up." },
      { status: 400 },
    );
  }

  let upstream: Response;
  try {
    upstream = await fetch(
      `${OPENIBAN_URL}/${encodeURIComponent(iban)}?getBIC=true&validateBankCode=true`,
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
    return NextResponse.json(
      { valid: false, error: `Lookup failed (HTTP ${upstream.status}).` },
      { status: upstream.status === 429 ? 429 : 502 },
    );
  }

  const bankData = data.bankData ?? {};
  return NextResponse.json({
    valid: Boolean(data.valid),
    bic: bankData.bic || "",
    bank: bankData.name || "",
  });
}
