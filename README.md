# MYFIN Report Generator

A Next.js (App Router) tool that takes form input, fills a local Word
(`.docx`) template, converts the result to PDF, and downloads it.

## How it works

1. **Form** ([src/app/page.tsx](src/app/page.tsx)) — collects the 12 template
   fields and POSTs them as JSON, with loading and error states.
2. **API route** ([src/app/api/generate/route.ts](src/app/api/generate/route.ts))
   — validates the payload and runs the pipeline.
3. **Pipeline** ([src/lib/generateDocument.ts](src/lib/generateDocument.ts)) —
   reads the template, fills the `{placeholders}` with
   [`docxtemplater`](https://docxtemplater.com/) + [`pizzip`](https://www.npmjs.com/package/pizzip),
   then converts the `.docx` buffer to PDF with
   [`libreoffice-convert`](https://www.npmjs.com/package/libreoffice-convert).
   The PDF streams back with `Content-Type: application/pdf` and
   `Content-Disposition: attachment`.

## Template

The template path is fixed to the project root:

```
RAPPORT MYFIN xx.docx
```

It must contain these `{}` placeholders: `status`, `name2`, `iban2`, `bic`,
`bank`, `IBD`, `name1`, `iban1`, `amount`, `details`, `date`, `time`.

Override the location with the `TEMPLATE_PATH` env var if needed.

## IBAN auto-fill (BIC & bank)

When a beneficiary IBAN (`iban2`) is entered, the form asks the server route
[src/app/api/iban/route.ts](src/app/api/iban/route.ts) to look up the BIC and
bank name and auto-fills them. The route proxies **ibanapi.com** so the API key
stays on the server (never exposed to the browser).

Set the key via the `IBANAPI_KEY` environment variable (see [.env.example](.env.example)):

- Get a free key at https://www.ibanapi.com/
- **Local:** copy `.env.example` to `.env.local` and set `IBANAPI_KEY`.
- **Render / Vercel:** add `IBANAPI_KEY` in the service's Environment settings.

If the key is missing, the lookup returns a clear message and the user can still
type BIC and bank manually — PDF generation is unaffected.

## Prerequisite: LibreOffice

PDF conversion is done by **LibreOffice running headless**, so it must be
installed on the machine that runs the server.

- Download: https://www.libreoffice.org/download/download-libreoffice/
- The app auto-detects `soffice.exe` in the standard install locations.
- If it's installed somewhere non-standard, point at it explicitly:

  ```bash
  # Windows (PowerShell)
  $env:LIBRE_OFFICE_EXE = "C:\Program Files\LibreOffice\program\soffice.exe"
  ```

Until LibreOffice is available the API returns a clear `503` error explaining
this; the rest of the app (form + template fill) works regardless.

## Run locally

```bash
npm run dev      # http://localhost:3000
npm run build    # production build
npm start        # run the production build
```

For local PDF generation, install LibreOffice as described above.

## Deploy with Docker (recommended)

Because PDF conversion needs LibreOffice, this app deploys as a **Docker
container** (not a pure serverless function). The included
[Dockerfile](Dockerfile) installs LibreOffice headless plus metric-compatible
fonts (Carlito → Calibri, Caladea → Cambria, Liberation → Arial/Times) so the
report renders faithfully. Next.js is built in `output: "standalone"` mode to
keep the image lean.

Build and run it anywhere Docker runs:

```bash
docker build -t myfin-generator .
docker run -p 3000:3000 myfin-generator   # http://localhost:3000
```

### Free hosting

Any container host works. These all build the `Dockerfile` straight from the
GitHub repo on their free tiers:

- **Render** — New → Web Service → connect the repo → Runtime: *Docker*. It auto-detects the Dockerfile.
- **Railway** — New Project → Deploy from GitHub repo (auto-detects the Dockerfile).
- **Fly.io** — `fly launch` in the repo (uses the Dockerfile; pick a 512 MB+ VM).

The container listens on `$PORT` (default `3000`); these platforms set `PORT`
automatically. No other environment variables are required.

> Note: free tiers spin the service down after inactivity, so the first request
> after an idle period may take ~30–60s (cold start + LibreOffice warm-up).
> Subsequent requests are fast.
