import { and, eq, isNotNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/lib/db/client";
import { files } from "@/lib/db/schema";

type Context = { params: Promise<{ id: string }> };

export async function POST(_request: Request, context: Context) {
  const { id } = await context.params;
  const { db } = await getDb();
  const [row] = await db.update(files).set({ deletedAt: null, updatedAt: new Date() })
    .where(and(eq(files.id, id), isNotNull(files.deletedAt))).returning();
  if (!row) return NextResponse.json({ error: "Deleted file not found." }, { status: 404 });
  return NextResponse.json(row);
}
