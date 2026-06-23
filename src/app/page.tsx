"use client";

import { useState } from "react";

type FieldType = "text" | "number" | "date" | "time";

type Field = {
  name: string;
  label: string;
  type: FieldType;
  placeholder?: string;
};

type Section = {
  title: string;
  fields: Field[];
};

// Mirrors the {placeholders} in the RAPPORT MYFIN xx.docx template, grouped
// for a cleaner form layout.
const SECTIONS: Section[] = [
  {
    title: "Document",
    fields: [
      {
        name: "status",
        label: "Status",
        type: "text",
        placeholder: "e.g. Completed",
      },
      {
        name: "IBD",
        label: "Document ID",
        type: "text",
        placeholder: "e.g. IBD-2026-0001",
      },
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
      {
        name: "iban1",
        label: "Ordering Customer Account (IBAN)",
        type: "text",
      },
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

export default function Home() {
  const [form, setForm] = useState<Record<string, string>>(EMPTY_FORM);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function update(name: string, value: string) {
    setForm((prev) => ({ ...prev, [name]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      if (!res.ok) {
        // The API returns JSON ({ error }) on failure.
        let message = `Request failed (${res.status}).`;
        try {
          const data = await res.json();
          if (data?.error) message = data.error;
        } catch {
          /* keep default message */
        }
        throw new Error(message);
      }

      // Success: response is a PDF blob — trigger a download.
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

  return (
    <main className="min-h-screen bg-slate-50 py-10 px-4 text-slate-900">
      <div className="mx-auto max-w-3xl">
        <header className="mb-8">
          <h1 className="text-3xl font-semibold tracking-tight">
            MYFIN Report Generator
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Fill in the details below to generate and download the report as a
            PDF.
          </p>
        </header>

        <form
          onSubmit={handleSubmit}
          className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8"
        >
          <div className="space-y-8">
            {SECTIONS.map((section) => (
              <fieldset key={section.title} className="space-y-4">
                <legend className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  {section.title}
                </legend>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  {section.fields.map((field) => (
                    <div key={field.name} className="flex flex-col gap-1.5">
                      <label
                        htmlFor={field.name}
                        className="text-sm font-medium text-slate-700"
                      >
                        {field.label}
                      </label>
                      <input
                        id={field.name}
                        name={field.name}
                        type={field.type}
                        inputMode={
                          field.type === "number" ? "decimal" : undefined
                        }
                        step={field.type === "number" ? "any" : undefined}
                        placeholder={field.placeholder}
                        value={form[field.name]}
                        onChange={(e) => update(field.name, e.target.value)}
                        disabled={loading}
                        className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 disabled:cursor-not-allowed disabled:bg-slate-100"
                      />
                    </div>
                  ))}
                </div>
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
