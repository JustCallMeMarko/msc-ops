import { embed } from "ai";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import type { Database } from "@/lib/db/client";
import { docChunks, documents, providers } from "@/lib/db/schema";
import { getEmbeddingModel } from "@/lib/ai/providers";
import { getSetting } from "@/lib/settings";

export type SearchResult = {
  chunkId: string;
  documentId: string;
  title: string;
  kind: string;
  version: number;
  page: number;
  headingPath: string;
  text: string;
  segments: Array<{ page: number; startItem: number; startOffset: number; endItem: number; endOffset: number }>;
  score: number;
};

export function vectorDocumentFilter(docIds?: string[]) {
  return docIds?.length
    ? sql`and d.id in (${sql.join(docIds.map((id) => sql`${id}::uuid`), sql`, `)})`
    : sql`and d.kind in ('cbl', 'rso_manual') and d.active`;
}

export function reciprocalRankFusion<T extends { chunkId: string; score: number }>(
  lists: T[][],
  limit: number,
  rankConstant = 60,
): T[] {
  const scores = new Map<string, { value: T; score: number }>();
  for (const list of lists) {
    list.forEach((value, index) => {
      const current = scores.get(value.chunkId) ?? { value, score: 0 };
      current.score += 1 / (rankConstant + index + 1);
      if (value.score > current.value.score) current.value = value;
      scores.set(value.chunkId, current);
    });
  }
  return [...scores.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((item) => ({ ...item.value, score: item.score }));
}

export async function searchDocuments(
  database: Database,
  query: string,
  options: { docIds?: string[]; k?: number } = {},
): Promise<SearchResult[]> {
  const { db } = database;
  const k = Math.max(1, Math.min(options.k ?? 6, 10));
  const defaults = await getSetting("ai.defaults");
  const docFilter = options.docIds?.length ? inArray(documents.id, options.docIds) : undefined;
  const defaultFilter = options.docIds?.length
    ? undefined
    : inArray(documents.kind, ["cbl", "rso_manual"]);
  const ftsRank = sql<number>`ts_rank_cd(${docChunks.tsv}, websearch_to_tsquery('english', ${query}))`;
  const conditions = [
    sql`${docChunks.tsv} @@ websearch_to_tsquery('english', ${query})`,
    options.docIds?.length ? undefined : eq(documents.active, true),
    isNull(documents.deletedAt),
    docFilter ?? defaultFilter,
  ].filter((condition): condition is NonNullable<typeof condition> => Boolean(condition));
  const rows = await db.select({
    chunkId: docChunks.id,
    documentId: documents.id,
    title: documents.title,
    kind: documents.kind,
    version: documents.version,
    headingPath: docChunks.headingPath,
    text: docChunks.text,
    segments: docChunks.segments,
    score: ftsRank,
  }).from(docChunks)
    .innerJoin(documents, eq(documents.id, docChunks.documentId))
    .where(and(...conditions))
    .orderBy(desc(ftsRank))
    .limit(k);
  const ftsResults = rows.map((row) => ({
    ...row,
    page: (row.segments as SearchResult["segments"])[0]?.page ?? 1,
    segments: row.segments as SearchResult["segments"],
  }));

  if (!defaults.embedding) return ftsResults;
  try {
    const [provider] = await db.select().from(providers).where(and(eq(providers.id, defaults.embedding.providerId), isNull(providers.deletedAt))).limit(1);
    if (!provider) return ftsResults;
    const modelKey = `${provider.type}:${defaults.embedding.model}`;
    const embeddingModel = await getEmbeddingModel(provider.id, defaults.embedding.model);
    const vector = (await embed({ model: embeddingModel, value: query })).embedding;
    const vectorText = `[${vector.join(",")}]`;
    const idCondition = vectorDocumentFilter(options.docIds);
    const vectorRows = await db.execute(sql`
      select c.id as "chunkId", d.id as "documentId", d.title, d.kind, d.version,
        c.heading_path as "headingPath", c.text, c.segments,
        (c.segments->0->>'page')::int as page,
        1 - (e.embedding <=> ${vectorText}::vector) as score
      from chunk_embeddings e
      join doc_chunks c on c.id = e.chunk_id
      join documents d on d.id = c.document_id
      where e.model_key = ${modelKey} ${idCondition}
      order by e.embedding <=> ${vectorText}::vector
      limit ${k}
    `);
    const vectorResults = (vectorRows.rows as Array<SearchResult>).map((row) => ({
      ...row,
      segments: row.segments as SearchResult["segments"],
    }));
    return reciprocalRankFusion([ftsResults, vectorResults], k);
  } catch {
    return ftsResults;
  }
}
