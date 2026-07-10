import { NextResponse } from "next/server";

// Server-side IBAN validation proxy with a two-tier strategy:
//   1. openIBAN — free & keyless, but bank data only for DE/NL (a few EU).
//   2. A keyed global provider (ibanapi.com) as a fallback when openIBAN has no
//      bank data. Only used if IBANAPI_KEY is set; the key never touches the
//      client. Returns a normalized { valid, bic, bank }.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const OPENIBAN_URL = process.env.OPENIBAN_URL ?? "https://openiban.com/validate";
const IBANAPI_URL =
  process.env.IBANAPI_URL ?? "https://api.ibanapi.com/v1/validate";

type Result = { valid: boolean; bic: string; bank: string };

// null => provider unreachable/errored (so we can try the next tier).
async function viaOpenIban(iban: string): Promise<Result | null> {
  try {
    const res = await fetch(
      `${OPENIBAN_URL}/${encodeURIComponent(iban)}?getBIC=true&validateBankCode=true`,
      { headers: { Accept: "application/json" }, cache: "no-store" },
    );
    if (!res.ok) return null;
    const data = await res.json();
    const b = data?.bankData ?? {};
    return { valid: Boolean(data?.valid), bic: b.bic || "", bank: b.name || "" };
  } catch {
    return null;
  }
}

async function viaIbanApi(iban: string, key: string): Promise<Result | null> {
  try {
    const res = await fetch(
      `${IBANAPI_URL}/${encodeURIComponent(iban)}?api_key=${encodeURIComponent(key)}`,
      { headers: { Accept: "application/json" }, cache: "no-store" },
    );
    const data = await res.json().catch(() => null);
    if (!data) return null;
    // ibanapi bank fields vary by plan/shape; read defensively.
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
    return { valid, bic, bank };
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const iban = (searchParams.get("iban") ?? "").replace(/\s+/g, "").toUpperCase();

  if (iban.length < 15) {
    return NextResponse.json(
      { valid: false, error: "IBAN is too short to look up." },
      { status: 400 },
    );
  }

  // Tier 1: free keyless lookup.
  let result = await viaOpenIban(iban);

  // Tier 2: keyed global provider, only when configured and tier 1 gave no bank
  // data (missing provider or valid-but-empty).
  const key = process.env.IBANAPI_KEY;
  if (key && (!result || (!result.bic && !result.bank))) {
    const alt = await viaIbanApi(iban, key);
    if (alt && (alt.bic || alt.bank || !result)) result = alt;
  }

  if (!result) {
    return NextResponse.json(
      { valid: false, error: "IBAN lookup unavailable — enter BIC & bank manually." },
      { status: 502 },
    );
  }

  return NextResponse.json({
    valid: result.valid,
    bic: result.bic,
    bank: result.bank,
  });
}
