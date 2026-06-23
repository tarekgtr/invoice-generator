# syntax=docker/dockerfile:1

# ---------- Build stage ----------
FROM node:20-slim AS builder
WORKDIR /app

# Install dependencies (cached unless lockfile changes)
COPY package.json package-lock.json ./
RUN npm ci

# Build the Next.js app (emits .next/standalone thanks to output: "standalone")
COPY . .
RUN npm run build

# ---------- Runtime stage ----------
FROM node:20-slim AS runner
WORKDIR /app

ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    # LibreOffice writes a per-run user profile under HOME; keep it writable.
    HOME=/tmp

# LibreOffice (headless) + metric-compatible fonts so Word documents render
# with the right look:
#   - carlito  -> Calibri      - caladea -> Cambria
#   - liberation -> Arial / Times New Roman / Courier New
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        libreoffice-writer \
        fonts-liberation \
        fonts-crosextra-carlito \
        fonts-crosextra-caladea \
        fonts-dejavu-core \
        fontconfig \
    && fc-cache -f \
    && rm -rf /var/lib/apt/lists/*

# Copy the standalone server, static assets, and public files
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

# The Word template is read at runtime from the working directory (process.cwd()).
COPY --from=builder ["/app/RAPPORT MYFIN xx.docx", "./RAPPORT MYFIN xx.docx"]

EXPOSE 3000

# server.js is produced by Next.js standalone output
CMD ["node", "server.js"]
