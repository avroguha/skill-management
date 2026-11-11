import path from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

// This folder, explicitly: a lockfile in a parent folder would otherwise be taken
// as the workspace root and the standalone output would be nested under it.
const root = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  // One self-contained server bundle for the Docker image (no npm install at runtime).
  output: "standalone",
  outputFileTracingRoot: root,
  // The migrations are read from disk at startup; ship them with the server.
  outputFileTracingIncludes: { "/**": ["./drizzle/**/*"] },
  turbopack: { root },
  // The database drivers are loaded from node_modules at runtime, not bundled.
  serverExternalPackages: ["@electric-sql/pglite", "pg"],
  poweredByHeader: false,
};

export default nextConfig;
