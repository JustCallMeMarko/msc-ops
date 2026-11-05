import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { chmod, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { getDataDir } from "@/lib/data-dir";

export interface KeyProvider {
  getDataKey(): Promise<Buffer>;
}

export class FileKeyProvider implements KeyProvider {
  async getDataKey(): Promise<Buffer> {
    const dataDir = await getDataDir();
    if (dataDir === "memory://") {
      const globalKey = globalThis as typeof globalThis & { __mscMemoryKey?: Buffer };
      globalKey.__mscMemoryKey ??= randomBytes(32);
      return globalKey.__mscMemoryKey;
    }
    const keyPath = path.join(dataDir, "keyring");
    try {
      return await readFile(keyPath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      const key = randomBytes(32);
      await writeFile(keyPath, key, { mode: 0o600, flag: "wx" }).catch(async (writeError: unknown) => {
        if ((writeError as NodeJS.ErrnoException).code !== "EEXIST") throw writeError;
      });
      await chmod(keyPath, 0o600);
      return readFile(keyPath);
    }
  }
}

let keyProvider: KeyProvider = new FileKeyProvider();

export function setKeyProvider(provider: KeyProvider): void {
  keyProvider = provider;
}

export async function encryptSecret(plain: string): Promise<string> {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", await keyProvider.getDataKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return `v1:${iv.toString("base64")}:${cipher.getAuthTag().toString("base64")}:${ciphertext.toString("base64")}`;
}

export async function decryptSecret(encrypted: string): Promise<string> {
  const [version, iv, tag, ciphertext, ...extra] = encrypted.split(":");
  if (version !== "v1" || !iv || !tag || !ciphertext || extra.length > 0) {
    throw new Error("Unsupported encrypted secret format.");
  }
  const decipher = createDecipheriv(
    "aes-256-gcm",
    await keyProvider.getDataKey(),
    Buffer.from(iv, "base64"),
  );
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertext, "base64")),
    decipher.final(),
  ]).toString("utf8");
}
