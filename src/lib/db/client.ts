import { existsSync, readFileSync, unlinkSync } from "node:fs";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite-pgvector";
import { drizzle, type PgliteDatabase } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { getDataDir } from "@/lib/data-dir";
import { files, schema } from "./schema";

export type DrizzleDb = PgliteDatabase<typeof schema>;
export type Database = { pg: PGlite; db: DrizzleDb };

type DbGlobal = typeof globalThis & {
  __mscDb?: Promise<Database>;
  __mscReleaseLock?: () => Promise<void>;
};
const dbGlobal = globalThis as DbGlobal;

export class AlreadyRunningError extends Error {
  constructor() {
    super("MSC Ops is already running with this data directory.");
    this.name = "AlreadyRunningError";
  }
}

async function acquireLock(dataDir: string): Promise<() => Promise<void>> {
  const lockPath = `${dataDir}/pgdata.lock`;
  await mkdir(dataDir, { recursive: true });
  while (true) {
    try {
      await writeFile(lockPath, String(process.pid), { mode: 0o600, flag: "wx" });
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      const pidText = await readFile(lockPath, "utf8").catch((readError: unknown) => {
        if ((readError as NodeJS.ErrnoException).code === "ENOENT") return "";
        throw readError;
      });
      const pid = Number(pidText.trim());
      if (Number.isInteger(pid) && pid > 0 && pid !== process.pid) {
        let alive = true;
        try {
          process.kill(pid, 0);
        } catch (killError) {
          if ((killError as NodeJS.ErrnoException).code === "ESRCH") alive = false;
          else throw killError;
        }
        if (alive) throw new AlreadyRunningError();
      }
      try {
        await unlink(lockPath);
      } catch (unlinkError) {
        if ((unlinkError as NodeJS.ErrnoException).code !== "ENOENT") throw unlinkError;
      }
    }
  }
  const release = async () => {
    try {
      if ((await readFile(lockPath, "utf8")).trim() === String(process.pid)) {
        await unlink(lockPath);
      }
    } catch {
      // The lock may already have been removed during shutdown.
    }
  };
  process.once("exit", () => {
    try {
      if (readFileSync(lockPath, "utf8").trim() === String(process.pid)) unlinkSync(lockPath);
    } catch {
      // The lock may already have been removed during shutdown.
    }
  });
  return release;
}

async function openDatabase(): Promise<Database> {
  const dataDir = await getDataDir();
  const inMemory = dataDir === "memory://";
  const release = inMemory ? async () => undefined : await acquireLock(dataDir);
  dbGlobal.__mscReleaseLock = release;
  let pg: PGlite | undefined;
  try {
    pg = inMemory
      ? new PGlite({ extensions: { vector } })
      : new PGlite(path.join(dataDir, "pgdata"), { extensions: { vector } });
    await pg.waitReady;
    const db = drizzle(pg, { schema });
    await migrate(db, { migrationsFolder: path.join(process.cwd(), "drizzle") });
    const database = { pg, db };
    const { resumeDocumentJobs } = await import("@/lib/docs/job-queue");
    await resumeDocumentJobs(database);
    await db.execute(
      `INSERT INTO app_meta (key, value) VALUES ('schema_version', '"1"'::jsonb)
       ON CONFLICT (key) DO NOTHING`,
    );
    if (!inMemory) {
      const fileRows = await db.select({
        sha256: files.sha256, deletedAt: files.deletedAt, createdAt: files.createdAt,
      }).from(files);
      const { garbageCollectFileBlobs } = await import("@/lib/files/storage");
      await garbageCollectFileBlobs(dataDir, fileRows).catch((error: unknown) => {
        console.warn("File cleanup could not be completed:", error);
      });
      const { createSnapshot } = await import("./snapshot");
      void createSnapshot(pg, dataDir).catch((error: unknown) => {
        console.warn("Snapshot could not be created:", error);
      });
    }
    return database;
  } catch (error) {
    await pg?.close().catch(() => undefined);
    await release();
    dbGlobal.__mscReleaseLock = undefined;
    throw error;
  }
}

export function getDb(): Promise<Database> {
  dbGlobal.__mscDb ??= openDatabase().catch((error: unknown) => {
    dbGlobal.__mscDb = undefined;
    throw error;
  });
  return dbGlobal.__mscDb;
}

export async function closeDb(): Promise<void> {
  const current = dbGlobal.__mscDb;
  const release = dbGlobal.__mscReleaseLock;
  dbGlobal.__mscDb = undefined;
  dbGlobal.__mscReleaseLock = undefined;
  try {
    if (current) {
      const { pg } = await current;
      await pg.close();
    }
  } finally {
    await release?.();
  }
}

export async function restoreSnapshot(snapshotFile: string): Promise<void> {
  const dataDir = await getDataDir();
  const pgPath = path.join(dataDir, "pgdata");
  const current = dbGlobal.__mscDb;
  const previousRelease = dbGlobal.__mscReleaseLock;
  dbGlobal.__mscDb = undefined;
  dbGlobal.__mscReleaseLock = undefined;
  if (current) {
    const { pg: currentPg } = await current;
    await currentPg.close();
  }
  await previousRelease?.();
  const release = await acquireLock(dataDir);
  let pg: PGlite | undefined;
  try {
    if (existsSync(pgPath)) {
      await rename(pgPath, path.join(dataDir, `pgdata.broken-${Date.now()}`));
    }
    const archive = new Blob([await readFile(snapshotFile)]);
    pg = new PGlite(pgPath, { extensions: { vector }, loadDataDir: archive });
    await pg.waitReady;
    const db = drizzle(pg, { schema });
    dbGlobal.__mscDb = Promise.resolve({ pg, db });
    dbGlobal.__mscReleaseLock = release;
  } catch (error) {
    await pg?.close().catch(() => undefined);
    await release();
    throw error;
  }
}
