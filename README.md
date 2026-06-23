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

## Run

```bash
npm run dev      # http://localhost:3000
npm run build    # production build
npm start        # run the production build
```
