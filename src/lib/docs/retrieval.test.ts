import { afterAll, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { getDb, closeDb } from "@/lib/db/client";
import { docChunks, documents, files } from "@/lib/db/schema";
import { reciprocalRankFusion, searchDocuments, vectorDocumentFilter } from "./retrieval";

process.env.MSC_DATA_DIR = "memory://";

afterAll(async () => closeDb());

describe("reciprocal rank fusion", () => {
  it("merges rankings while promoting results found in both lists", () => {
    const left = [{ chunkId: "a", score: 1 }, { chunkId: "b", score: 0.8 }];
    const right = [{ chunkId: "b", score: 1 }, { chunkId: "c", score: 0.9 }];
    expect(reciprocalRankFusion([left, right], 3).map((row) => row.chunkId)).toEqual(["b", "a", "c"]);
  });
});

describe("vector search filters", () => {
  it("matches scoped document ids with parameterized UUID values", async () => {
    const database = await getDb();
    const ids = [crypto.randomUUID(), crypto.randomUUID()];
    const result = await database.db.execute(sql`
      select count(*)::int as count
      from documents d
      where true ${vectorDocumentFilter(ids)}
    `);
    expect(Number(result.rows[0]?.count)).toBe(0);
  });
});

describe("document full-text retrieval", () => {
  it("ranks English search results without requiring an embedding model", async () => {
    const database = await getDb();
    const fileId = crypto.randomUUID();
    const documentId = crypto.randomUUID();
    await database.db.insert(files).values({
      id: fileId,
      sha256: crypto.randomUUID().replaceAll("-", ""),
      originalName: "manual.pdf",
      mime: "application/pdf",
      size: 10,
      kind: "cbl",
    });
    await database.db.insert(documents).values({
      id: documentId,
      fileId,
      lineageId: crypto.randomUUID(),
      title: "Test manual",
      kind: "cbl",
      status: "ready",
      pageCount: 1,
      active: true,
    });
    await database.db.insert(docChunks).values({
      documentId,
      ord: 0,
      headingPath: "Article III › Section 2",
      text: "The proposal must be submitted before the event begins.",
      segments: [{ page: 1, startItem: 0, startOffset: 0, endItem: 0, endOffset: 56 }],
    });
    try {
      const results = await searchDocuments(database, "proposal submitted before event");
      expect(results[0]).toMatchObject({ documentId, page: 1, headingPath: "Article III › Section 2" });
    } finally {
      await database.db.delete(documents).where(eq(documents.id, documentId));
      await database.db.delete(files).where(eq(files.id, fileId));
    }
  });
});
