import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Emit a self-contained server bundle (.next/standalone) so the Docker
  // image only needs Node + LibreOffice, not the full node_modules tree.
  output: "standalone",
};

export default nextConfig;
