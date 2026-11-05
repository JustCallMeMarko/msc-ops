import { access, cp, mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";

const root = process.cwd();
const standalone = path.join(root, ".next", "standalone");
const staticAssets = path.join(root, ".next", "static");
const staticDestination = path.join(standalone, ".next", "static");
process.env.MSC_DATA_DIR ??= path.join(root, "data");
const vectorEntry = path.join(
  standalone,
  "node_modules",
  "@electric-sql",
  "pglite-pgvector",
  "dist",
  "index.cjs",
);

await mkdir(path.dirname(staticDestination), { recursive: true });
await cp(staticAssets, staticDestination, { recursive: true });
await mkdir(path.dirname(vectorEntry), { recursive: true });
await cp(
  path.join(root, "node_modules", "@electric-sql", "pglite-pgvector", "dist", "index.cjs"),
  vectorEntry,
);

const publicAssets = path.join(root, "public");
try {
  await access(publicAssets);
  await cp(publicAssets, path.join(standalone, "public"), { recursive: true });
} catch (error) {
  if ((error).code !== "ENOENT") throw error;
}

process.env.HOSTNAME = "127.0.0.1";
process.env.PORT = "3000";
createRequire(path.join(standalone, "server.js"))("./server.js");
