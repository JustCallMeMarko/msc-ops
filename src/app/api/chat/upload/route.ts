import { and, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getDataDir } from "@/lib/data-dir";
import { getDb } from "@/lib/db/client";
import { files } from "@/lib/db/schema";
import { readFileBlob } from "@/lib/files/storage";
import { extractPdf } from "@/lib/docs/extract";
import { findReplacementCandidates } from "@/lib/templates/version";
import { extractStructure } from "@/lib/templates/structure";

export async function POST(request: Request) {
  const parsed = z.object({ fileId: z.string().uuid() }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const { db } = await getDb();
  const [file] = await db.select().from(files).where(and(eq(files.id, parsed.data.fileId), isNull(files.deletedAt))).limit(1);
  if (!file) return NextResponse.json({ error: "Uploaded file not found." }, { status: 404 });
  const bytes = await readFileBlob(await getDataDir(), file.sha256);
  const extension = file.originalName.toLowerCase().split(".").at(-1);
  if (["docx", "xlsx", "xlsm"].includes(extension ?? "")) {
    const structure = await extractStructure(bytes, file.originalName);
    const candidates = await findReplacementCandidates(structure);
    return NextResponse.json({
      type: "template",
      fileId: file.id,
      filename: file.originalName,
      structure,
      candidates: candidates.map(({ template, score }) => ({ id: template.id, lineageId: template.lineageId, name: template.name, kind: template.kind, source: template.source, version: template.version, score })),
      message: candidates.length ? "This looks like a template replacement. Review it before mapping." : "Add this as a new template, then map its fields.",
    });
  }
  if (file.mime === "application/pdf") {
    const extracted = await extractPdf(bytes);
    const firstPages = extracted.pages.slice(0, 3).flatMap((page) => page.items.map((item) => item.str)).join(" ");
    const normalized = firstPages.toLowerCase();
    const kind = /constitution|by[-\s]?laws/.test(normalized) ? "cbl"
      : /rso\s+manual/.test(normalized) ? "rso_manual"
        : "reference";
    return NextResponse.json({
      type: "pdf_document",
      fileId: file.id,
      filename: file.originalName,
      documentKind: kind,
      pageCount: extracted.pageCount,
      message: `Add this PDF to the ${kind === "cbl" ? "CBL" : kind === "rso_manual" ? "RSO Manual" : "Reference"} library?`,
    });
  }
  if (file.mime.startsWith("image/")) {
    return NextResponse.json({
      type: "receipt",
      fileId: file.id,
      filename: file.originalName,
      message: "This looks like a receipt. Review and confirm a draft ledger entry in Finance.",
    });
  }
  return NextResponse.json({ type: "unsupported", filename: file.originalName, message: "This file type cannot be added from chat." }, { status: 415 });
}
