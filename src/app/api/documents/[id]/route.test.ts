import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

process.env.MSC_DATA_DIR = "memory://";

let documentApi: typeof import("./route");
let getDb: typeof import("@/lib/db/client").getDb;
let closeDb: typeof import("@/lib/db/client").closeDb;
let documents: typeof import("@/lib/db/schema").documents;
let files: typeof import("@/lib/db/schema").files;
let jobs: typeof import("@/lib/db/schema").jobs;

beforeAll(async () => {
  [documentApi] = await Promise.all([import("./route")]);
  ({ getDb, closeDb } = await import("@/lib/db/client"));
  ({ documents, files, jobs } = await import("@/lib/db/schema"));
});

beforeEach(async () => {
  const { db } = await getDb();
  await db.delete(jobs);
  await db.delete(documents);
  await db.delete(files);
});

afterAll(async () => {
  await closeDb();
});

async function createFile() {
  const { db } = await getDb();
  const [file] = await db.insert(files).values({
    sha256: crypto.randomUUID(),
    originalName: "preview.pdf",
    mime: "application/pdf",
    size: 1,
  }).returning();
  return file!;
}

describe("document deletion API", () => {
  it("soft-deletes an unshared file and requests cancellation of active jobs", async () => {
    const { db } = await getDb();
    const file = await createFile();
    const [document] = await db.insert(documents).values({
      fileId: file.id,
      lineageId: crypto.randomUUID(),
      title: "Preview",
      kind: "reference",
    }).returning();
    const [job] = await db.insert(jobs).values({
      kind: "embed",
      refId: document!.id,
      status: "running",
    }).returning();

    const response = await documentApi.DELETE(new Request("http://localhost", { method: "DELETE" }), {
      params: Promise.resolve({ id: document!.id }),
    });
    const payload = await response.json() as { fileDeleted: boolean; cancelRequestedJobIds: string[] };
    const [deletedDocument] = await db.select().from(documents).where(eq(documents.id, document!.id));
    const [deletedFile] = await db.select().from(files).where(eq(files.id, file.id));
    const [updatedJob] = await db.select().from(jobs).where(eq(jobs.id, job!.id));

    expect(response.status).toBe(200);
    expect(deletedDocument?.deletedAt).toBeInstanceOf(Date);
    expect(deletedDocument?.active).toBe(false);
    expect(deletedFile?.deletedAt).toBeInstanceOf(Date);
    expect(payload.fileDeleted).toBe(true);
    expect(payload.cancelRequestedJobIds).toContain(job!.id);
    expect(updatedJob?.cancelRequested).toBe(true);
  });

  it("keeps a file active while another non-deleted document still references it", async () => {
    const { db } = await getDb();
    const file = await createFile();
    const [first] = await db.insert(documents).values({
      fileId: file.id,
      lineageId: crypto.randomUUID(),
      title: "Preview one",
      kind: "reference",
    }).returning();
    await db.insert(documents).values({
      fileId: file.id,
      lineageId: crypto.randomUUID(),
      title: "Preview two",
      kind: "reference",
    });

    const response = await documentApi.DELETE(new Request("http://localhost", { method: "DELETE" }), {
      params: Promise.resolve({ id: first!.id }),
    });
    const [remainingFile] = await db.select().from(files).where(eq(files.id, file.id));

    expect(response.status).toBe(200);
    expect(remainingFile?.deletedAt).toBeNull();
  });
});
