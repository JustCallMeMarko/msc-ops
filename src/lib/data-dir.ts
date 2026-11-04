import { mkdir } from "node:fs/promises";
import path from "node:path";

export async function getDataDir(): Promise<string> {
  const configured = process.env.MSC_DATA_DIR || path.join(process.cwd(), "data");
  if (configured !== "memory://") {
    await mkdir(configured, { recursive: true });
  }
  return configured;
}
