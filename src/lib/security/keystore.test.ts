import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const originalDataDir = process.env.MSC_DATA_DIR;
let directory: string;
let encryptSecret: typeof import("./keystore").encryptSecret;
let decryptSecret: typeof import("./keystore").decryptSecret;

beforeAll(async () => {
  directory = await mkdtemp(path.join(os.tmpdir(), "msc-keystore-"));
  process.env.MSC_DATA_DIR = directory;
  ({ encryptSecret, decryptSecret } = await import("./keystore"));
});

afterAll(async () => {
  if (originalDataDir === undefined) delete process.env.MSC_DATA_DIR;
  else process.env.MSC_DATA_DIR = originalDataDir;
  await rm(directory, { recursive: true, force: true });
});

describe("provider key encryption", () => {
  it("round-trips a secret", async () => {
    const encrypted = await encryptSecret("sk-test-0123456789");
    expect(encrypted.split(":")).toHaveLength(4);
    expect(await decryptSecret(encrypted)).toBe("sk-test-0123456789");
  });

  it("rejects a tampered ciphertext", async () => {
    const encrypted = await encryptSecret("secret value");
    const [version, iv, tag, ciphertext] = encrypted.split(":");
    const tampered = `${version}:${iv}:${tag}:${ciphertext[0] === "A" ? "B" : "A"}${ciphertext.slice(1)}`;
    await expect(decryptSecret(tampered)).rejects.toThrow();
  });

  it.skipIf(process.platform === "win32")("creates the keyring with mode 0600", async () => {
    await encryptSecret("mode check");
    expect((await stat(path.join(directory, "keyring"))).mode & 0o777).toBe(0o600);
    expect(await readFile(path.join(directory, "keyring"))).toHaveLength(32);
  });
});
