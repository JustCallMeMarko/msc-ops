import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

const HASH_PATTERN = /^[a-f0-9]{64}$/;
const GC_GRACE_MS = 7 * 24 * 60 * 60 * 1_000;
const memoryBlobs = new Map<string, Uint8Array>();

export function fileBlobPath(dataDir: string, sha256: string): string {
  if (!HASH_PATTERN.test(sha256)) throw new Error("Invalid file hash.");
  return path.join(dataDir, "files", sha256.slice(0, 2), sha256);
}

export async function storeFileBlob(dataDir: string, bytes: Uint8Array): Promise<string> {
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  if (dataDir === "memory://") {
    memoryBlobs.set(sha256, Uint8Array.from(bytes));
    return sha256;
  }
  const blobPath = fileBlobPath(dataDir, sha256);
  await mkdir(path.dirname(blobPath), { recursive: true });
  try {
    await writeFile(blobPath, bytes, { flag: "wx" });
  } catch (error) {
    if (!(error instanceof Error) || !("code" in error) || error.code !== "EEXIST") throw error;
  }
  return sha256;
}

export async function readFileBlob(dataDir: string, sha256: string): Promise<Uint8Array> {
  if (dataDir === "memory://") {
    const bytes = memoryBlobs.get(sha256);
    if (!bytes) throw new Error("File content not found.");
    return bytes;
  }
  return readFile(fileBlobPath(dataDir, sha256));
}

export async function garbageCollectFileBlobs(
  dataDir: string,
  records: Array<{ sha256: string; deletedAt: Date | null; createdAt: Date }>,
  currentTime = new Date(),
): Promise<void> {
  if (dataDir === "memory://") return;
  const root = path.join(dataDir, "files");
  let directories;
  try {
    directories = await readdir(root, { withFileTypes: true });
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return;
    throw error;
  }

  const activeHashes = new Set(records.filter((record) => !record.deletedAt).map((record) => record.sha256));
  const lastReference = new Map<string, number>();
  for (const record of records) {
    const value = (record.deletedAt ?? record.createdAt).getTime();
    lastReference.set(record.sha256, Math.max(value, lastReference.get(record.sha256) ?? 0));
  }
  for (const directory of directories) {
    if (!directory.isDirectory() || !/^[a-f0-9]{2}$/.test(directory.name)) continue;
    const entries = await readdir(path.join(root, directory.name), { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile() || !HASH_PATTERN.test(entry.name) || !entry.name.startsWith(directory.name)) continue;
      const hash = entry.name;
      if (activeHashes.has(hash)) continue;
      const filePath = path.join(root, directory.name, hash);
      const info = await stat(filePath);
      const graceStart = lastReference.get(hash) ?? info.mtime.getTime();
      if (currentTime.getTime() - graceStart < GC_GRACE_MS) continue;
      await unlink(filePath);
    }
  }
}
