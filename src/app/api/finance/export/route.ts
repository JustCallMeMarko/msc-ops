import { extname } from "node:path";
import ExcelJS from "exceljs";
import JSZip from "jszip";
import { NextResponse } from "next/server";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { getDataDir } from "@/lib/data-dir";
import { getDb } from "@/lib/db/client";
import { files, ledgerReceipts } from "@/lib/db/schema";
import { readFileBlob } from "@/lib/files/storage";
import { FINANCE_CATEGORY_LABELS } from "@/lib/finance/constants";
import { getFinanceSnapshot } from "@/lib/finance/db-utils";
import { runningBalance } from "@/lib/finance/logic";

export const dynamic = "force-dynamic";

const csvCell = (value: unknown) => {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};

function amountInPesos(centavos: number): number {
  return Number((centavos / 100).toFixed(2));
}

function addLedgerSheet(workbook: ExcelJS.Workbook, rows: Array<Record<string, unknown>>) {
  const sheet = workbook.addWorksheet("Ledger");
  sheet.columns = [
    { header: "Seq", key: "seq", width: 10 },
    { header: "Date", key: "date", width: 14 },
    { header: "Kind", key: "kind", width: 18 },
    { header: "Category", key: "category", width: 22 },
    { header: "Event", key: "event", width: 28 },
    { header: "Counterparty", key: "counterparty", width: 24 },
    { header: "Description", key: "description", width: 40 },
    { header: "OR#", key: "or", width: 16 },
    { header: "Amount", key: "amount", width: 18, style: { numFmt: '₱#,##0.00;[Red]-₱#,##0.00' } },
    { header: "Running balance", key: "balance", width: 20, style: { numFmt: '₱#,##0.00;[Red]-₱#,##0.00' } },
    { header: "Receipt", key: "receipt", width: 12 },
  ];
  sheet.addRows(rows);
  sheet.getRow(1).font = { bold: true };
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const format = url.searchParams.get("format") ?? "xlsx";
  if (format !== "xlsx" && format !== "csv") return NextResponse.json({ error: "Use format=xlsx or format=csv." }, { status: 400 });
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const snapshot = await getFinanceSnapshot();
  const filtered = snapshot.entries.filter((entry) => (!from || entry.occurredOn >= from) && (!to || entry.occurredOn <= to));
  const runBalances = new Map(runningBalance(snapshot.entries).map(({ entry, balanceCentavos }) => [entry.id, balanceCentavos]));
  const eventById = new Map(snapshot.events.map((event) => [event.id, event.name]));
  const activeReceiptIds = new Set(snapshot.receipts.map((receipt) => receipt.entryId));
  const ledgerRows = filtered.map((entry) => ({
    seq: entry.seq,
    date: entry.occurredOn,
    kind: entry.kind,
    category: FINANCE_CATEGORY_LABELS[entry.category as keyof typeof FINANCE_CATEGORY_LABELS] ?? entry.category,
    event: entry.eventId ? eventById.get(entry.eventId) ?? "" : "",
    counterparty: entry.counterparty,
    description: entry.description,
    or: entry.orNumber,
    amount: amountInPesos(entry.amountCentavos),
    balance: amountInPesos(runBalances.get(entry.id) ?? 0),
    receipt: activeReceiptIds.has(entry.id) ? "Yes" : "No",
  }));
  if (format === "csv" && url.searchParams.get("receipts") !== "1") {
    const headers = ["Seq", "Date", "Kind", "Category", "Event", "Counterparty", "Description", "OR#", "Amount centavos", "Running balance centavos", "Receipt"];
    const lines = [headers, ...ledgerRows.map((row) => [
      row.seq, row.date, row.kind, row.category, row.event, row.counterparty, row.description, row.or,
      filtered.find((entry) => entry.seq === row.seq)?.amountCentavos ?? 0,
      runBalances.get(filtered.find((entry) => entry.seq === row.seq)?.id ?? "") ?? 0,
      row.receipt,
    ])];
    return new Response(lines.map((line) => line.map(csvCell).join(",")).join("\r\n"), {
      headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="scoa-ledger.csv"' },
    });
  }

  const workbook = new ExcelJS.Workbook();
  addLedgerSheet(workbook, ledgerRows);
  const eventSheet = workbook.addWorksheet("Per-event summary");
  eventSheet.columns = [
    { header: "Event", key: "event", width: 30 },
    { header: "Category", key: "category", width: 22 },
    { header: "Budget", key: "budget", width: 18, style: { numFmt: '₱#,##0.00;[Red]-₱#,##0.00' } },
    { header: "Actual", key: "actual", width: 18, style: { numFmt: '₱#,##0.00;[Red]-₱#,##0.00' } },
    { header: "Variance", key: "variance", width: 18, style: { numFmt: '₱#,##0.00;[Red]-₱#,##0.00' } },
    { header: "Liquidation", key: "liquidation", width: 18 },
  ];
  eventSheet.addRows(snapshot.budgets.map((row) => ({
    event: row.eventName,
    category: FINANCE_CATEGORY_LABELS[row.category],
    budget: amountInPesos(row.plannedCentavos),
    actual: amountInPesos(row.actualCentavos),
    variance: amountInPesos(row.varianceCentavos),
    liquidation: snapshot.liquidations.find((item) => item.eventId === row.eventId)?.status ?? "open",
  })));
  eventSheet.getRow(1).font = { bold: true };

  const missingSheet = workbook.addWorksheet("Missing receipts");
  missingSheet.columns = [
    { header: "Seq", key: "seq", width: 10 },
    { header: "Date", key: "date", width: 14 },
    { header: "Event", key: "event", width: 28 },
    { header: "Description", key: "description", width: 40 },
    { header: "OR#", key: "or", width: 16 },
    { header: "Amount", key: "amount", width: 18, style: { numFmt: '₱#,##0.00' } },
  ];
  missingSheet.addRows(snapshot.missingReceipts.map((entry) => ({
    seq: entry.seq, date: entry.occurredOn, event: entry.eventId ? eventById.get(entry.eventId) ?? "" : "",
    description: entry.description, or: entry.orNumber, amount: amountInPesos(entry.amountCentavos),
  })));
  missingSheet.getRow(1).font = { bold: true };

  const correctionSheet = workbook.addWorksheet("Voided & corrections");
  correctionSheet.columns = [
    { header: "Seq", key: "seq", width: 10 },
    { header: "Kind", key: "kind", width: 18 },
    { header: "Related seq", key: "related", width: 16 },
    { header: "Reason", key: "reason", width: 50 },
  ];
  correctionSheet.addRows(filtered.filter((entry) => entry.kind === "void" || entry.kind === "restore" || entry.replacesEntryId).map((entry) => ({
    seq: entry.seq,
    kind: entry.kind,
    related: snapshot.entries.find((candidate) => candidate.id === (entry.targetEntryId ?? entry.replacesEntryId))?.seq ?? "",
    reason: entry.reason,
  })));
  correctionSheet.getRow(1).font = { bold: true };

  const chainSheet = workbook.addWorksheet("Chain verification result");
  chainSheet.addRow(["Verified", snapshot.chain.ok ? "Yes" : "No"]);
  chainSheet.addRow(["Broken at seq", snapshot.chain.ok ? "" : snapshot.chain.brokenAtSeq]);

  const xlsx = await workbook.xlsx.writeBuffer();
  if (url.searchParams.get("receipts") === "1") {
    const zip = new JSZip();
    zip.file("scoa-export.xlsx", xlsx);
    const { db } = await getDb();
    const selectedIds = filtered.map((entry) => entry.id);
    const receiptRows = selectedIds.length
      ? await db.select({ receipt: ledgerReceipts, file: files }).from(ledgerReceipts)
        .innerJoin(files, eq(files.id, ledgerReceipts.fileId))
        .where(and(inArray(ledgerReceipts.entryId, selectedIds), isNull(ledgerReceipts.removedAt), isNull(files.deletedAt)))
      : [];
    const dataDir = await getDataDir();
    for (const { receipt, file } of receiptRows) {
      const entry = filtered.find((candidate) => candidate.id === receipt.entryId);
      if (!entry) continue;
      const extension = extname(file.originalName).toLowerCase().replace(/[^.a-z0-9]/g, "") || ".bin";
      const orName = (entry.orNumber || "receipt").replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 48);
      zip.file(`receipts/${String(entry.seq).padStart(6, "0")}-${orName}${extension}`, await readFileBlob(dataDir, file.sha256));
    }
    const zipBytes = await zip.generateAsync({ type: "uint8array" });
    const zipBuffer = new ArrayBuffer(zipBytes.byteLength);
    new Uint8Array(zipBuffer).set(zipBytes);
    return new Response(zipBuffer, {
      headers: { "Content-Type": "application/zip", "Content-Disposition": 'attachment; filename="scoa-export.zip"' },
    });
  }
  return new Response(xlsx, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="scoa-export.xlsx"',
    },
  });
}
