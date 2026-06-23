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
   converts the filled `.docx` to HTML with [`mammoth`](https://www.npmjs.com/package/mammoth),
   then renders that HTML to PDF with headless Chromium
   ([`puppeteer-core`](https://www.npmjs.com/package/puppeteer-core) +
   [`@sparticuz/chromium`](https://www.npmjs.com/package/@sparticuz/chromium)).
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

## PDF rendering

PDF conversion runs entirely in Node with **headless Chromium** — no system
install (LibreOffice, etc.) is required, so it deploys to serverless hosts like
**Vercel** out of the box.

- **On Vercel / AWS Lambda:** uses `@sparticuz/chromium`'s bundled browser
  automatically (detected via the `VERCEL` / `AWS_LAMBDA_FUNCTION_NAME` env vars).
- **Locally:** uses an installed Google Chrome or Microsoft Edge. Override the
  executable with the `CHROME_EXE` env var if needed.

> Note: the PDF is produced by converting the Word document to HTML and
> rendering it, so it is a clean, content-faithful PDF rather than a pixel-exact
> copy of the original Word layout.

## Deploy to Vercel

Push to GitHub and import the repo at [vercel.com/new](https://vercel.com/new).
No extra configuration or environment variables are required. The
`/api/generate` function is allotted up to 60s (`maxDuration`) to cover
Chromium cold starts.

## Run

```bash
npm run dev      # http://localhost:3000
npm run build    # production build
npm start        # run the production build
```
