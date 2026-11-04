import { and, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { now } from "@/lib/clock";
import { getDb } from "@/lib/db/client";
import { postAssets } from "@/lib/db/schema";

type Context = { params: Promise<{ id: string; assetId: string }> };

export async function PATCH(request: Request, context: Context) {
  const parsed = z.object({
    isFinal: z.boolean().optional(),
    slideIndex: z.number().int().min(0).optional(),
    note: z.string().max(1000).optional(),
  }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const { id, assetId } = await context.params;
  const { db } = await getDb();
  if (parsed.data.isFinal) {
    await db.update(postAssets).set({ isFinal: false, updatedAt: now() })
      .where(and(eq(postAssets.postId, id), isNull(postAssets.deletedAt)));
  }
  const [asset] = await db.update(postAssets).set({ ...parsed.data, updatedAt: now() })
    .where(and(eq(postAssets.postId, id), eq(postAssets.id, assetId), isNull(postAssets.deletedAt))).returning();
  return asset ? NextResponse.json(asset) : NextResponse.json({ error: "Asset not found." }, { status: 404 });
}

export async function DELETE(_request: Request, context: Context) {
  const { id, assetId } = await context.params;
  const { db } = await getDb();
  const [asset] = await db.update(postAssets).set({ deletedAt: now(), updatedAt: now() })
    .where(and(eq(postAssets.postId, id), eq(postAssets.id, assetId), isNull(postAssets.deletedAt))).returning();
  return asset ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "Asset not found." }, { status: 404 });
}
