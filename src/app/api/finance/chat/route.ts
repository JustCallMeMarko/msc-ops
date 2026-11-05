import { streamText } from "ai";
import { and, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getLanguageModel } from "@/lib/ai/providers";
import { getDb } from "@/lib/db/client";
import { providers } from "@/lib/db/schema";
import { getFinanceSnapshot } from "@/lib/finance/db-utils";
import { FINANCE_GUIDES } from "@/lib/finance/guides";
import { stripInvalidGuideCitations } from "@/lib/finance/chat";
import { getSetting } from "@/lib/settings";

export const dynamic = "force-dynamic";

const chatSchema = z.object({
  messages: z.array(z.object({
    role: z.enum(["user", "assistant"]),
    content: z.string().max(20_000),
  })).min(1).max(40),
});

export async function POST(request: Request) {
  const parsed = chatSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const defaults = await getSetting("ai.defaults");
  if (!defaults.chat) return NextResponse.json({ error: "Configure a chat model in Settings to use Finance chat." }, { status: 409 });
  const { db } = await getDb();
  const [provider] = await db.select().from(providers).where(and(eq(providers.id, defaults.chat.providerId), isNull(providers.deletedAt))).limit(1);
  if (!provider) return NextResponse.json({ error: "The configured chat provider is unavailable." }, { status: 409 });
  const localOnly = await getSetting("privacy.sensitiveLocalOnly");
  let isLocal = provider.type === "ollama";
  try {
    isLocal ||= ["localhost", "127.0.0.1", "::1", "[::1]"].includes(new URL(provider.baseUrl).hostname);
  } catch {
    isLocal = false;
  }
  if (localOnly && !isLocal) {
    return NextResponse.json({ error: "Finance chat is disabled for cloud providers while sensitive data is set to local-only." }, { status: 409 });
  }
  const snapshot = await getFinanceSnapshot();
  const guides = FINANCE_GUIDES.map((guide) => ({
    key: guide.key,
    title: guide.title,
    steps: guide.steps.map((step) => ({
      key: step.key,
      title: step.title,
      detail: step.detail,
      why: step.why,
      citation: step.citation,
    })),
  }));
  const context = {
    accountBalances: snapshot.accounts.map(({ id, name, kind, balanceCentavos }) => ({ id, name, kind, balanceCentavos })),
    unliquidated: snapshot.liquidations.map(({ eventId, eventName, unliquidatedCentavos, dueAt }) => ({ eventId, eventName, unliquidatedCentavos, dueAt })),
    missingReceiptCount: snapshot.missingReceipts.length,
    upcomingDues: snapshot.liquidations.filter((row) => row.dueAt && row.unliquidatedCentavos > 0).map(({ eventName, dueAt, unliquidatedCentavos }) => ({ eventName, dueAt, unliquidatedCentavos })),
    whatToDoNow: snapshot.whatToDoNow,
    guides,
  };
  const system = `You are the Finance guide for MSC Ops. Give clear, practical steps and explain why they matter. Use only the supplied finance context and RSO Manual guide steps. Cite manual steps exactly as [guide_key:step_key]; never invent citations. Do not include counterparty names. For a draft entry, you may provide a single fenced \`\`\`entry JSON block with the fields accepted by POST /api/finance/entries; do not claim it was saved. Context: ${JSON.stringify(context)}`;
  try {
    const model = await getLanguageModel(defaults.chat.providerId, defaults.chat.model);
    const result = streamText({
      model,
      system,
      messages: parsed.data.messages,
    });
    const encoder = new TextEncoder();
    const responseStream = new ReadableStream<Uint8Array>({
      async start(controller) {
        let pending = "";
        const sourceIds = new Set<string>();
        const emitText = (text: string) => {
          const cleaned = stripInvalidGuideCitations(text);
          for (const id of cleaned.sourceIds) sourceIds.add(id);
          if (cleaned.text) controller.enqueue(encoder.encode(`${JSON.stringify({ type: "text", text: cleaned.text })}\n`));
        };
        try {
          for await (const token of result.textStream) {
            pending += token;
            const open = pending.lastIndexOf("[");
            if (open >= 0 && pending.indexOf("]", open) < 0 && /\[[a-z0-9_:]*$/i.test(pending)) {
              emitText(pending.slice(0, open));
              pending = pending.slice(open);
            } else {
              emitText(pending);
              pending = "";
            }
          }
          emitText(pending);
          const sources = [...sourceIds].map((id) => {
            const [guideKey, stepKey] = id.split(":");
            const guide = guides.find((item) => item.key === guideKey);
            const step = guide?.steps.find((item) => item.key === stepKey);
            return { id, guide: guide?.title ?? guideKey, step: step?.title ?? stepKey, citation: step?.citation ?? null };
          });
          controller.enqueue(encoder.encode(`${JSON.stringify({ type: "sources", sources })}\n`));
          controller.close();
        } catch {
          controller.enqueue(encoder.encode(`${JSON.stringify({ type: "error", error: "Finance chat could not reach the configured provider." })}\n`));
          controller.close();
        }
      },
    });
    return new Response(responseStream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-cache" } });
  } catch {
    return NextResponse.json({ error: "Finance chat could not start with the configured provider." }, { status: 502 });
  }
}
