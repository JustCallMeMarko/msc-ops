import { and, eq, isNull, notInArray } from "drizzle-orm";
import { NextResponse } from "next/server";
import { now } from "@/lib/clock";
import { getDb } from "@/lib/db/client";
import { committees, members, tasks } from "@/lib/db/schema";
import { buildDigest } from "@/lib/tasks/logic";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const slug = new URL(request.url).searchParams.get("committee");
  const { db } = await getDb();
  const rows = await db.select().from(committees).where(
    slug ? and(isNull(committees.deletedAt), eq(committees.slug, slug)) : isNull(committees.deletedAt),
  );
  if (slug && !rows.length) return NextResponse.json({ error: "Committee not found." }, { status: 404 });
  const currentTime = now();
  const digests = await Promise.all(rows.map(async (committee) => {
    const items = await db.select({ task: tasks, assignee: members })
      .from(tasks)
      .leftJoin(members, eq(tasks.assigneeMemberId, members.id))
      .where(and(eq(tasks.committeeId, committee.id), isNull(tasks.deletedAt), notInArray(tasks.status, ["done", "cancelled"])));
    return {
      committee,
      digest: buildDigest(committee, items.map(({ task, assignee }) => ({ ...task, assignee })), currentTime),
    };
  }));
  return NextResponse.json(slug ? digests[0] : digests);
}
