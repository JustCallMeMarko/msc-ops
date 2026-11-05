import { and, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/lib/db/client";
import { guideProgress } from "@/lib/db/schema";
import { FINANCE_GUIDES_BY_KEY } from "@/lib/finance/guides";
import { guideProgressSchema } from "@/lib/finance/schemas";
import { now } from "@/lib/clock";

export const dynamic = "force-dynamic";

export async function GET() {
  const { db } = await getDb();
  return NextResponse.json(await db.select().from(guideProgress).where(isNull(guideProgress.deletedAt)));
}

export async function PUT(request: Request) {
  const parsed = guideProgressSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const guide = FINANCE_GUIDES_BY_KEY[parsed.data.guideKey];
  if (!guide?.steps.some((step) => step.key === parsed.data.stepKey)) {
    return NextResponse.json({ error: "Unknown guide step." }, { status: 400 });
  }
  const { db } = await getDb();
  const [row] = await db.insert(guideProgress).values({
    guideKey: parsed.data.guideKey,
    stepKey: parsed.data.stepKey,
    doneAt: parsed.data.done ? now() : null,
    note: parsed.data.note,
  }).onConflictDoUpdate({
    target: [guideProgress.guideKey, guideProgress.stepKey],
    set: { doneAt: parsed.data.done ? now() : null, note: parsed.data.note, updatedAt: now(), deletedAt: null },
  }).returning();
  return NextResponse.json(row);
}

export async function DELETE(request: Request) {
  const parsed = guideProgressSchema.pick({ guideKey: true, stepKey: true }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const { db } = await getDb();
  const [row] = await db.update(guideProgress).set({ doneAt: null, note: "", updatedAt: now() }).where(and(
    eq(guideProgress.guideKey, parsed.data.guideKey),
    eq(guideProgress.stepKey, parsed.data.stepKey),
    isNull(guideProgress.deletedAt),
  )).returning();
  return row ? NextResponse.json(row) : NextResponse.json({ error: "Guide progress not found." }, { status: 404 });
}
