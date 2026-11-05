import { streamText } from "ai";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getLanguageModel } from "@/lib/ai/providers";
import { getDb } from "@/lib/db/client";
import { chatMessages, chatThreads, docChunks, documents, providers } from "@/lib/db/schema";
import { autoCiteAnswer, buildDocumentPrompt, citationNumbers, fitSourcesToBudget, stripInvalidCitations } from "@/lib/docs/chat";
import { searchDocuments } from "@/lib/docs/retrieval";
import { withPurpose } from "@/lib/net/safe-fetch";
import { getSetting } from "@/lib/settings";

export const dynamic = "force-dynamic";

const requestSchema = z.object({
  threadId: z.string().uuid().optional(),
  message: z.string().trim().min(1).max(20_000),
  docIds: z.array(z.string().uuid()).max(40).optional(),
  model: z.string().trim().min(1).max(200).optional(),
});

type CitationRecord = { n: number; chunkId: string; documentId: string; page: number; auto?: boolean };
type BestMatchRecord = { chunkId: string; documentId: string; page: number } | null;
type CitationPayload = { items: CitationRecord[]; bestMatch: BestMatchRecord };

function readCitationPayload(value: unknown): CitationPayload {
  if (Array.isArray(value)) return { items: value as CitationRecord[], bestMatch: null };
  if (!value || typeof value !== "object") return { items: [], bestMatch: null };
  const payload = value as { items?: unknown; bestMatch?: BestMatchRecord };
  return {
    items: Array.isArray(payload.items) ? payload.items as CitationRecord[] : [],
    bestMatch: payload.bestMatch ?? null,
  };
}

async function contextLength(provider: { type: string; baseUrl: string }, model: string): Promise<number> {
  if (provider.type !== "ollama") return 4096;
  try {
    const baseUrl = provider.baseUrl.replace(/\/+$/, "").replace(/\/v1$/i, "");
    const response = await withPurpose("ollama-show")(`${baseUrl}/api/show`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: model }),
    });
    if (!response.ok) return 4096;
    const payload = await response.json() as { model_info?: Record<string, unknown>; parameters?: string };
    const info = Object.entries(payload.model_info ?? {}).find(([key]) => key.endsWith(".context_length"))?.[1];
    const parameter = payload.parameters?.match(/(?:^|\n)num_ctx\s+(\d+)/)?.[1];
    const length = Number(info ?? parameter);
    return Number.isFinite(length) && length > 0 ? length : 4096;
  } catch {
    return 4096;
  }
}

function providerError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (/ECONNREFUSED|fetch failed|connect.*refused/i.test(message)) return "Ollama is not running or the provider is unreachable. Start the provider and retry.";
  if (/\b401\b|unauthorized/i.test(message)) return "The provider rejected its credentials. Check Settings → AI.";
  if (/\b429\b|rate limit/i.test(message)) return "The provider is rate-limiting requests. Wait a moment and retry.";
  return "The response was interrupted. Retry to continue.";
}

export async function GET(request: Request) {
  const threadId = new URL(request.url).searchParams.get("threadId");
  if (!threadId) return NextResponse.json({ messages: [] });
  const { db } = await getDb();
  const messages = await db.select().from(chatMessages)
    .where(and(eq(chatMessages.threadId, threadId), isNull(chatMessages.deletedAt)))
    .orderBy(asc(chatMessages.createdAt));
  const chunkIds = [...new Set(messages.flatMap((message) => {
    const payload = readCitationPayload(message.citations);
    return [...payload.items, ...(payload.bestMatch ? [payload.bestMatch] : [])]
      .map((citation) => citation.chunkId)
      .filter((id): id is string => Boolean(id));
  }))];
  const sourceRows = chunkIds.length ? await db.select({
    chunkId: docChunks.id,
    documentId: documents.id,
    title: documents.title,
    version: documents.version,
    headingPath: docChunks.headingPath,
    text: docChunks.text,
    segments: docChunks.segments,
  }).from(docChunks).innerJoin(documents, eq(documents.id, docChunks.documentId))
    .where(inArray(docChunks.id, chunkIds)) : [];
  const sourceByChunk = new Map(sourceRows.map((source) => [source.chunkId, source]));
  return NextResponse.json({ messages: messages.map((message) => ({
    ...message,
    citations: readCitationPayload(message.citations).items.map((citation) => ({
      ...citation,
      ...sourceByChunk.get(citation.chunkId),
    })),
    bestMatch: readCitationPayload(message.citations).bestMatch
      ? {
        ...readCitationPayload(message.citations).bestMatch,
        ...sourceByChunk.get(readCitationPayload(message.citations).bestMatch!.chunkId),
        page: readCitationPayload(message.citations).bestMatch!.page,
      }
      : null,
  })) });
}

export async function POST(request: Request) {
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const defaults = await getSetting("ai.defaults");
  if (!defaults.chat) return NextResponse.json({ error: "Configure a chat model in Settings to use cited document chat." }, { status: 409 });
  const { db } = await getDb();
  const [provider] = await db.select().from(providers)
    .where(and(eq(providers.id, defaults.chat.providerId), isNull(providers.deletedAt))).limit(1);
  if (!provider) return NextResponse.json({ error: "The configured chat provider is unavailable." }, { status: 409 });
  if (parsed.data.model && provider.type !== "ollama") {
    return NextResponse.json({ error: "Per-request model selection is available for Ollama." }, { status: 400 });
  }
  const modelId = parsed.data.model ?? defaults.chat.model;

  let threadId = parsed.data.threadId;
  if (threadId) {
    const [existing] = await db.select().from(chatThreads)
      .where(and(eq(chatThreads.id, threadId), eq(chatThreads.scope, "cbl"), isNull(chatThreads.deletedAt))).limit(1);
    if (!existing) return NextResponse.json({ error: "Conversation not found." }, { status: 404 });
  } else {
    const [created] = await db.insert(chatThreads).values({
      scope: "cbl",
      scopeRef: parsed.data.docIds?.join(",") ?? null,
      title: parsed.data.message.slice(0, 100),
    }).returning();
    if (!created) return NextResponse.json({ error: "Could not start a conversation." }, { status: 500 });
    threadId = created.id;
  }

  const retrieved = await searchDocuments(await getDb(), parsed.data.message, { docIds: parsed.data.docIds, k: 6 });
  const sources = fitSourcesToBudget(retrieved, await contextLength(provider, modelId));
  const best = retrieved[0];
  const bestMatch = best ? {
    chunkId: best.chunkId,
    documentId: best.documentId,
    page: best.page,
  } : null;
  const modelKey = `${provider.type}:${modelId}`;
  const docIds = parsed.data.docIds ?? [...new Set(sources.map((source) => source.documentId))];
  await db.insert(chatMessages).values({
    threadId,
    role: "user",
    content: parsed.data.message,
    docIds,
    citations: [],
    modelKey,
  });
  const history = await db.select().from(chatMessages).where(eq(chatMessages.threadId, threadId)).orderBy(asc(chatMessages.createdAt));
  const previousMessages = history.slice(0, -1).slice(-22).map((message) => ({
    role: message.role === "assistant" ? "assistant" as const : "user" as const,
    content: message.content,
  }));
  const messages = [
    ...previousMessages,
    { role: "user" as const, content: buildDocumentPrompt(sources, parsed.data.message) },
  ];

  try {
    const model = await getLanguageModel(provider.id, modelId);
    const result = streamText({
      model,
      system: "Answer questions about the supplied CBL and RSO documents using supported information.",
      messages,
      maxRetries: 2,
    });
    const encoder = new TextEncoder();
    const responseStream = new ReadableStream<Uint8Array>({
      async start(controller) {
        let pending = "";
        let answer = "";
        let partial = false;
        controller.enqueue(encoder.encode(`${JSON.stringify({
          type: "thread",
          threadId,
          bestMatch: best ? { ...best, n: 1 } : null,
        })}\n`));
        const emit = (text: string) => {
          const clean = stripInvalidCitations(text, sources.length);
          if (!clean) return;
          answer += clean;
          controller.enqueue(encoder.encode(`${JSON.stringify({ type: "text", text: clean })}\n`));
        };
        try {
          for await (const token of result.textStream) {
            pending += token;
            const open = pending.lastIndexOf("[");
            if (open >= 0 && pending.indexOf("]", open) < 0 && /\[\d*$/.test(pending.slice(open))) {
              emit(pending.slice(0, open));
              pending = pending.slice(open);
            } else {
              emit(pending);
              pending = "";
            }
          }
          emit(pending);
        } catch (cause) {
          partial = true;
          controller.enqueue(encoder.encode(`${JSON.stringify({ type: "error", error: providerError(cause) })}\n`));
        }
        const attributed = autoCiteAnswer(answer, sources);
        if (attributed.text !== answer) {
          answer = attributed.text;
          controller.enqueue(encoder.encode(`${JSON.stringify({ type: "replace", text: answer })}\n`));
        }
        const autoNumbers = new Set(attributed.autoNumbers);
        const citations = citationNumbers(answer, sources.length).map((number) => {
          const source = sources[number - 1]!;
          return { n: number, chunkId: source.chunkId, documentId: source.documentId, page: source.page, auto: autoNumbers.has(number) };
        });
        await db.insert(chatMessages).values({
          threadId: threadId!,
          role: "assistant",
          content: answer,
          citations: { items: citations, bestMatch },
          docIds,
          modelKey,
          partial,
        });
        const used = citations.map((citation) => ({
          ...sources[citation.n - 1],
          n: citation.n,
          auto: citation.auto,
        }));
        controller.enqueue(encoder.encode(`${JSON.stringify({ type: "sources", sources: used, partial })}\n`));
        controller.close();
      },
    });
    return new Response(responseStream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-cache" } });
  } catch {
    return NextResponse.json({ error: "The configured chat provider could not start a response." }, { status: 502 });
  }
}
