import { and, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { files, packets } from "@/lib/db/schema";
import { createPacket } from "@/lib/templates/packets";

export const dynamic = "force-dynamic";

const packetSchema = z.object({
  kind: z.enum(["pre_event", "post_event", "scoa_audit", "renewal"]),
  entityType: z.enum(["event", "term", "org"]),
  entityId: z.string().uuid(),
  title: z.string().trim().max(160).optional(),
  termStart: z.string().date().optional(),
  termEnd: z.string().date().optional(),
  askValues: z.record(z.string(), z.unknown()).optional(),
});

export async function GET(request: Request) {
  const entityId = new URL(request.url).searchParams.get("entityId");
  const { db } = await getDb();
  const rows = entityId
    ? await db.select({ packet: packets, file: files }).from(packets).innerJoin(files, eq(files.id, packets.fileId))
      .where(and(eq(packets.entityId, entityId), isNull(packets.deletedAt), isNull(files.deletedAt)))
    : await db.select({ packet: packets, file: files }).from(packets).innerJoin(files, eq(files.id, packets.fileId))
      .where(and(isNull(packets.deletedAt), isNull(files.deletedAt)));
  return NextResponse.json({ packets: rows });
}

export async function POST(request: Request) {
  const parsed = packetSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  try {
    const result = await createPacket(parsed.data);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not create the packet." }, { status: 422 });
  }
}
