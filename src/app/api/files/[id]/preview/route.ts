import { and, eq, isNull } from "drizzle-orm";
import DOMPurify from "isomorphic-dompurify";
import ExcelJS from "exceljs";
import mammoth from "mammoth";
import { NextResponse } from "next/server";
import { getDataDir } from "@/lib/data-dir";
import { getDb } from "@/lib/db/client";
import { files } from "@/lib/db/schema";
import { readFileBlob } from "@/lib/files/storage";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context) {
  const { id } = await context.params;
  const { db } = await getDb();
  const [file] = await db.select().from(files).where(and(eq(files.id, id), isNull(files.deletedAt))).limit(1);
  if (!file) return NextResponse.json({ error: "File not found." }, { status: 404 });
  let bytes: Uint8Array;
  try {
    bytes = await readFileBlob(await getDataDir(), file.sha256);
  } catch {
    return NextResponse.json({ error: "File content is unavailable." }, { status: 404 });
  }
  if (file.mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
    const converted = await mammoth.convertToHtml({ buffer: Buffer.from(bytes) as unknown as Buffer });
    return NextResponse.json({
      type: "docx",
      html: DOMPurify.sanitize(converted.value, { USE_PROFILES: { html: true } }),
      warnings: converted.messages.map((message) => message.message),
    });
  }
  if (file.mime === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet") {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(Buffer.from(bytes) as unknown as Parameters<typeof workbook.xlsx.load>[0]);
    return NextResponse.json({
      type: "xlsx",
      sheets: workbook.worksheets.map((worksheet) => ({
        name: worksheet.name,
        rows: Array.from({ length: worksheet.actualRowCount }, (_, rowIndex) => {
          const row = worksheet.getRow(rowIndex + 1);
          return Array.from({ length: worksheet.actualColumnCount }, (_, columnIndex) => {
            const value = row.getCell(columnIndex + 1).value;
            if (value instanceof Date) return value.toISOString().slice(0, 10);
            if (value && typeof value === "object" && "result" in value) return value.result ?? null;
            if (value && typeof value === "object" && "formula" in value) return `=${String(value.formula)}`;
            return value ?? null;
          });
        }),
      })),
    });
  }
  return NextResponse.json({ error: "This file type does not have an in-app preview." }, { status: 415 });
}
