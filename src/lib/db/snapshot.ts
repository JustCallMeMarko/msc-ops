import { mkdir, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { PGlite } from "@electric-sql/pglite";

export async function createSnapshot(pg: PGlite, dataDir: string): Promise<void> {
  const snapshotDir = path.join(dataDir, "snapshots");
  await mkdir(snapshotDir, { recursive: true, mode: 0o700 });
  const stamp = new Date().toISOString().replaceAll(":", "-");
  const output = path.join(snapshotDir, `snapshot-${stamp}.tar.gz`);
  const archive = await pg.dumpDataDir("gzip");
  await writeFile(output, Buffer.from(await archive.arrayBuffer()), { mode: 0o600 });
  const files = (await readdir(snapshotDir))
    .filter((file) => file.endsWith(".tar.gz"))
    .sort()
    .reverse();
  await Promise.all(files.slice(5).map((file) => rm(path.join(snapshotDir, file), { force: true })));
}
