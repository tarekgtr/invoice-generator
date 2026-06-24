"use client";

import { useEffect, useState } from "react";

type FieldType = "text" | "number" | "date" | "time" | "select";

type Field = {
  name: string;
  label: string;
  type: FieldType;
  placeholder?: string;
  options?: string[];
};

type Section = {
  title: string;
  fields: Field[];
};

const STATUS_OPTIONS = ["Completed", "Signed", "Cancelled"];

// Mirrors the {placeholders} in the RAPPORT MYFIN xx.docx template, grouped
// for a cleaner form layout.
const SECTIONS: Section[] = [
  {
    title: "Document",
    fields: [
      { name: "status", label: "Status", type: "select", options: STATUS_OPTIONS },
      { name: "IBD", label: "Document ID", type: "text", placeholder: "Auto-generated" },
    ],
  },
  {
    title: "Beneficiary",
    fields: [
      { name: "name2", label: "Beneficiary Name", type: "text" },
      { name: "iban2", label: "Beneficiary Account (IBAN)", type: "text" },
      { name: "bic", label: "BIC", type: "text" },
      { name: "bank", label: "Bank", type: "text" },
    ],
  },
  {
    title: "Ordering Customer",
    fields: [
      { name: "name1", label: "Ordering Customer Name", type: "text" },
      { name: "iban1", label: "Ordering Customer Account (IBAN)", type: "text" },
    ],
  },
  {
    title: "Transaction",
    fields: [
      { name: "amount", label: "Amount", type: "number", placeholder: "0.00" },
      { name: "details", label: "Details", type: "text" },
      { name: "date", label: "Date", type: "date" },
      { name: "time", label: "Time", type: "time" },
    ],
  },
];

const ALL_FIELDS = SECTIONS.flatMap((s) => s.fields);

const EMPTY_FORM = Object.fromEntries(
  ALL_FIELDS.map((f) => [f.name, ""]),
) as Record<string, string>;

// --- helpers -------------------------------------------------------------

const pad = (n: number) => String(n).padStart(2, "0");

/** Builds a document ID like `IBD20260508030972597` (IBD + date + random). */
function generateIBD(): string {
  const d = new Date();
  const datePart = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
  let rand = "";
  for (let i = 0; i < 9; i++) rand += Math.floor(Math.random() * 10);
  return `IBD${datePart}${rand}`;
}

/** Current system date/time formatted for <input type="date" | "time">. */
function nowParts() {
  const d = new Date();
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
  };
}

type LookupState = {
  status: "idle" | "loading" | "ok" | "error";
  message?: string;
};

// --- component -----------------------------------------------------------

export default function Home() {
  const [form, setForm] = useState<Record<string, string>>({
    ...EMPTY_FORM,
    status: STATUS_OPTIONS[0],
  });
  const [manualDateTime, setManualDateTime] = useState(false);
  const [lookup, setLookup] = useState<LookupState>({ status: "idle" });
  const [lastLookedUp, setLastLookedUp] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Auto-generate the document ID once, on mount. This must run client-side in
  // an effect (not during render) so Date/Math.random don't cause a hydration
  // mismatch; the one-time setState here is intentional.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mount-only init, hydration-safe
    setForm((prev) => ({ ...prev, IBD: generateIBD() }));
  }, []);

  // When not in manual mode, lock date & time to the current system values.
  // Runs on mount and whenever the toggle is switched back off. Client-only for
  // the same hydration reason as above.
  useEffect(() => {
    if (!manualDateTime) {
      const { date, time } = nowParts();
      // eslint-disable-next-line react-hooks/set-state-in-effect -- syncs inputs to current time
      setForm((prev) => ({ ...prev, date, time }));
    }
  }, [manualDateTime]);

  function update(name: string, value: string) {
    setForm((prev) => ({ ...prev, [name]: value }));
  }

  // Look up BIC + bank name for a beneficiary IBAN via our own /api/iban proxy
  // (which calls ibanapi.com server-side and keeps the API key secret).
  async function lookupIban(rawIban: string) {
    const iban = rawIban.replace(/\s+/g, "").toUpperCase();
    if (iban.length < 15 || iban === lastLookedUp) return;
    setLastLookedUp(iban);
    setLookup({ status: "loading" });

    try {
      const res = await fetch(`/api/iban?iban=${encodeURIComponent(iban)}`);
      const data = await res.json().catch(() => null);

      if (res.ok && data?.valid && (data.bic || data.bank)) {
        setForm((prev) => ({
          ...prev,
          bic: data.bic || prev.bic,
          bank: data.bank || prev.bank,
        }));
        setLookup({ status: "ok", message: "BIC & bank auto-filled." });
      } else if (res.ok && data?.valid) {
        setLookup({
          status: "error",
          message: "No bank data for this IBAN — enter BIC & bank manually.",
        });
      } else {
        setLookup({
          status: "error",
          message:
            data?.error ??
            "IBAN not recognized — check it, or enter details manually.",
        });
      }
    } catch {
      // Network error / rate limit — never block the user; allow manual entry.
      setLookup({
        status: "error",
        message: "Lookup unavailable — enter BIC & bank manually.",
      });
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    // Ensure auto date/time reflect the actual submission moment.
    const submission = { ...form };
    if (!manualDateTime) {
      const { date, time } = nowParts();
      submission.date = date;
      submission.time = time;
    }

    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(submission),
      });

      if (!res.ok) {
        let message = `Request failed (${res.status}).`;
        try {
          const data = await res.json();
          if (data?.error) message = data.error;
        } catch {
          /* keep default message */
        }
        throw new Error(message);
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);

      const disposition = res.headers.get("Content-Disposition") ?? "";
      const match = disposition.match(/filename="?([^"]+)"?/);
      const fileName = match?.[1] ?? "report.pdf";

      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  const inputClass =
    "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500";

  function renderField(field: Field) {
    const isDateTime = field.name === "date" || field.name === "time";
    const disabled = loading || (isDateTime && !manualDateTime);

    let control;
    if (field.type === "select") {
      control = (
        <select
          id={field.name}
          name={field.name}
          value={form[field.name]}
          onChange={(e) => update(field.name, e.target.value)}
          disabled={disabled}
          className={inputClass}
        >
          {field.options!.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      );
    } else {
      control = (
        <input
          id={field.name}
          name={field.name}
          type={field.type}
          inputMode={field.type === "number" ? "decimal" : undefined}
          step={field.type === "number" ? "any" : undefined}
          placeholder={field.placeholder}
          value={form[field.name]}
          onChange={(e) => update(field.name, e.target.value)}
          onBlur={
            field.name === "iban2"
              ? (e) => lookupIban(e.target.value)
              : undefined
          }
          disabled={disabled}
          className={inputClass}
        />
      );
    }

    return (
      <div key={field.name} className="flex flex-col gap-1.5">
        <label htmlFor={field.name} className="text-sm font-medium text-slate-700">
          {field.label}
        </label>
        {control}
        {field.name === "iban2" && lookup.status !== "idle" && (
          <span
            className={
              "text-xs " +
              (lookup.status === "loading"
                ? "text-slate-400"
                : lookup.status === "ok"
                  ? "text-emerald-600"
                  : "text-amber-600")
            }
          >
            {lookup.status === "loading" ? "Looking up BIC & bank…" : lookup.message}
          </span>
        )}
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 py-10 px-4 text-slate-900">
      <div className="mx-auto max-w-3xl">
        <header className="mb-8">
          <h1 className="text-3xl font-semibold tracking-tight">
            MYFIN Report Generator
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Fill in the details below to generate and download the report as a PDF.
          </p>
        </header>

        <form
          onSubmit={handleSubmit}
          className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8"
        >
          <div className="space-y-8">
            {SECTIONS.map((section) => (
              <fieldset key={section.title} className="space-y-4">
                <div className="flex items-center justify-between">
                  <legend className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                    {section.title}
                  </legend>
                  {section.title === "Transaction" && (
                    <label className="flex cursor-pointer items-center gap-2 text-xs font-medium text-slate-600">
                      <input
                        type="checkbox"
                        checked={manualDateTime}
                        onChange={(e) => setManualDateTime(e.target.checked)}
                        disabled={loading}
                        className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-300"
                      />
                      Manual Date/Time Entry
                    </label>
                  )}
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  {section.fields.map(renderField)}
                </div>
                {section.title === "Transaction" && !manualDateTime && (
                  <p className="text-xs text-slate-400">
                    Date &amp; time are locked to the current system time. Enable
                    “Manual Date/Time Entry” to set them yourself.
                  </p>
                )}
              </fieldset>
            ))}
          </div>

          {error && (
            <div
              role="alert"
              className="mt-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
            >
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="mt-8 flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-300 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading && (
              <svg
                className="h-4 w-4 animate-spin"
                viewBox="0 0 24 24"
                fill="none"
                aria-hidden="true"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                />
              </svg>
            )}
            {loading ? "Generating PDF…" : "Generate & Download PDF"}
          </button>
        </form>

        <p className="mt-4 text-center text-xs text-slate-400">TAREK</p>
        <p className="mt-4 text-center text-xs text-slate-400">
          The PDF is rendered from your local Word template via LibreOffice.
        </p>
      </div>
    </main>
  );
}
