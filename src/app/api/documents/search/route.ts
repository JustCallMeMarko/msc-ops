import { NextResponse } from "next/server";
import { getDb } from "@/lib/db/client";
import { searchDocuments } from "@/lib/docs/retrieval";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const query = url.searchParams.get("q")?.trim() ?? "";
  const docId = url.searchParams.get("docId");
  if (!query) return NextResponse.json({ results: [] });
  const results = await searchDocuments(await getDb(), query, {
    docIds: docId ? [docId] : undefined,
    k: 20,
  });
  return NextResponse.json({ results });
}
