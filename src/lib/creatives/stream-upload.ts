import { createHash, randomUUID } from "node:crypto";
import { access, mkdir, open, rename, unlink } from "node:fs/promises";
import path from "node:path";
import { fileTypeFromBuffer } from "file-type";
import { fileBlobPath, storeFileBlob } from "@/lib/files/storage";

export const MAX_CREATIVE_VIDEO_BYTES = 1024 * 1024 * 1024;

export async function storeCreativeVideoStream(request: Request, dataDir: string): Promise<{ sha256: string; size: number }> {
  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (declaredLength > MAX_CREATIVE_VIDEO_BYTES) throw new Error("MP4 files must be 1 GB or smaller.");
  if (!request.body) throw new Error("Upload request is empty.");
  const tempDirectory = dataDir === "memory://" ? null : path.join(dataDir, "tmp");
  if (tempDirectory) await mkdir(tempDirectory, { recursive: true });
  const tempPath = tempDirectory ? path.join(tempDirectory, `creative-${randomUUID()}.tmp`) : null;
  const handle = tempPath ? await open(tempPath, "wx") : null;
  const hash = createHash("sha256");
  const prefix: Uint8Array[] = [];
  const memoryChunks: Uint8Array[] = [];
  let prefixBytes = 0;
  let size = 0;
  try {
    const reader = request.body.getReader();
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      if (!value) continue;
      size += value.byteLength;
      if (size > MAX_CREATIVE_VIDEO_BYTES) {
        await reader.cancel();
        throw new Error("MP4 files must be 1 GB or smaller.");
      }
      hash.update(value);
      if (prefixBytes < 8192) {
        const part = value.subarray(0, 8192 - prefixBytes);
        prefix.push(part);
        prefixBytes += part.byteLength;
      }
      if (handle) await handle.writeFile(value);
      else memoryChunks.push(value);
    }
    const detected = await fileTypeFromBuffer(Buffer.concat(prefix));
    if (detected?.mime !== "video/mp4") throw new Error("File content is not an MP4.");
    const sha256 = hash.digest("hex");
    if (dataDir === "memory://") {
      await storeFileBlob(dataDir, Buffer.concat(memoryChunks));
    } else if (tempPath) {
      await handle?.close();
      const target = fileBlobPath(dataDir, sha256);
      await mkdir(path.dirname(target), { recursive: true });
      try {
        await access(target);
        await unlink(tempPath);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        await rename(tempPath, target);
      }
    }
    return { sha256, size };
  } catch (error) {
    await handle?.close().catch(() => undefined);
    if (tempPath) await unlink(tempPath).catch(() => undefined);
    throw error;
  }
}
