import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  output: "standalone",
  images: { unoptimized: true },
  serverExternalPackages: ["@electric-sql/pglite", "@electric-sql/pglite-pgvector"],
  outputFileTracingIncludes: {
    "/*": [path.join(process.cwd(), "drizzle/**/*")],
  },
};

export default nextConfig;
