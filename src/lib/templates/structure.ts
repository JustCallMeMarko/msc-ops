import { extname } from "node:path";
import ExcelJS from "exceljs";
import JSZip from "jszip";
import { PDFDocument } from "pdf-lib";
import type { TemplateColumn, TemplateStructure, TemplateTarget } from "./types";

export const LEGACY_OFFICE_ERROR = "Save it as .docx/.xlsx in Word/Excel first, then upload again.";
export const MACRO_WARNING = "Macros can't be kept; output will be .xlsx";
const ZIP_ENTRY_LIMIT = 2_000;
const ZIP_EXPANSION_LIMIT = 50 * 1024 * 1024;
const OLE_SIGNATURE = [0xd0, 0xcf, 0x11, 0xe0];

type ZipEntry = JSZip.JSZipObject & { _data?: { uncompressedSize?: number } };

function isOle(bytes: Uint8Array) {
  return OLE_SIGNATURE.every((byte, index) => bytes[index] === byte);
}

async function loadOfficeArchive(bytes: Uint8Array): Promise<JSZip> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(bytes, { checkCRC32: false, createFolders: false });
  } catch {
    throw new Error("The Office file is invalid or could not be opened.");
  }
  const entries = Object.values(zip.files) as ZipEntry[];
  if (entries.length > ZIP_ENTRY_LIMIT) throw new Error("Office archive has too many entries (maximum 2,000).");
  const expanded = entries.reduce((total, entry) => total + (entry._data?.uncompressedSize ?? 0), 0);
  if (expanded > ZIP_EXPANSION_LIMIT) throw new Error("Office archive expands beyond the 50 MB safety limit.");
  return zip;
}

function decodeXml(value: string): string {
  return value.replace(/&#x([0-9a-f]+);/gi, (_match, code: string) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&#(\d+);/g, (_match, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'").replace(/&amp;/g, "&");
}

function xmlText(xml: string): string {
  return [...xml.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)]
    .map((match) => decodeXml(match[1] ?? ""))
    .join("");
}

function cellsFromRow(xml: string): string[] {
  return [...xml.matchAll(/<w:tc(?:\s[^>]*)?>([\s\S]*?)<\/w:tc>/g)]
    .map((match) => xmlText(match[1] ?? ""));
}

function extractDocxTargets(xml: string): TemplateTarget[] {
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error("DOCX XML must not contain a DOCTYPE or ENTITY declaration.");
  const paragraphs = [...xml.matchAll(/<w:p(?:\s[^>]*)?>([\s\S]*?)<\/w:p>/g)].map((match) => ({
    xml: match[0],
    text: xmlText(match[1] ?? ""),
  }));
  const targets: TemplateTarget[] = [];
  paragraphs.forEach((paragraph, index) => {
    const colon = paragraph.text.indexOf(":");
    if (colon >= 0) {
      const label = paragraph.text.slice(0, colon + 1).trim();
      const hasValue = paragraph.text.slice(colon + 1).trim().length > 0;
      if (label && (hasValue || index === paragraphs.length - 1)) {
        targets.push({ id: `p:${index}`, label, kind: "paragraph" });
      } else if (label && paragraphs[index + 1]) {
        targets.push({ id: `p:${index + 1}`, label, kind: "paragraph" });
      }
    }
  });

  const tables = [...xml.matchAll(/<w:tbl(?:\s[^>]*)?>([\s\S]*?)<\/w:tbl>/g)];
  tables.forEach((table, tableIndex) => {
    const rows = [...(table[1] ?? "").matchAll(/<w:tr(?:\s[^>]*)?>([\s\S]*?)<\/w:tr>/g)]
      .map((match) => ({ xml: match[0], cells: cellsFromRow(match[1] ?? "") }));
    const headers = rows[0]?.cells ?? [];
    const emptyTemplate = rows[1]?.cells ?? [];
    if (headers.length >= 2 && headers.every((label) => label.trim())
      && emptyTemplate.length >= headers.length
      && emptyTemplate.slice(0, headers.length).every((value) => !value.trim())) {
      targets.push({
        id: `t:${tableIndex}:rows`,
        label: headers.join(" · "),
        kind: "rows",
        templateRow: 1,
        columns: headers.map((label, index) => ({ index, label: label.trim() })),
      });
    }

    rows.forEach((row, rowIndex) => {
      row.cells.forEach((cell, cellIndex) => {
        if (cell.trim()) return;
        const label = row.cells[cellIndex - 1]?.trim()
          || rows[rowIndex - 1]?.cells[cellIndex]?.trim();
        if (!label) return;
        const rangeTarget = targets.some((target) => target.id === `t:${tableIndex}:rows`
          && rowIndex >= 1 && cellIndex < (target.columns?.length ?? 0));
        if (!rangeTarget) targets.push({
          id: `t:${tableIndex}:r:${rowIndex}:c:${cellIndex}`,
          label,
          kind: "cell",
        });
      });
    });
  });
  return targets;
}

function columnLabel(value: ExcelJS.CellValue): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function cellIsEmpty(cell: ExcelJS.Cell): boolean {
  return cell.value === null || cell.value === undefined || cell.value === "";
}

function address(sheetName: string, cell: ExcelJS.Cell) {
  return `s:${sheetName}!${cell.address}`;
}

function formulaTotalRow(worksheet: ExcelJS.Worksheet, startRow: number): { row?: number; columns: number[] } {
  for (let rowNumber = startRow + 1; rowNumber <= worksheet.rowCount; rowNumber += 1) {
    const row = worksheet.getRow(rowNumber);
    const columns: number[] = [];
    row.eachCell({ includeEmpty: false }, (cell, column) => {
      const formula = cell.value && typeof cell.value === "object" && "formula" in cell.value
        ? String(cell.value.formula)
        : "";
      if (/\bSUM\(\$?[A-Z]{1,3}\$?\d+\s*:\s*\$?[A-Z]{1,3}\$?\d+\)/i.test(formula)) columns.push(column - 1);
    });
    if (columns.length) return { row: rowNumber, columns };
  }
  return { columns: [] };
}

function extractXlsxTargets(workbook: ExcelJS.Workbook): TemplateTarget[] {
  const targets: TemplateTarget[] = [];
  workbook.worksheets.forEach((worksheet) => {
    const rowCount = worksheet.rowCount;
    const columnCount = worksheet.columnCount;
    const repeatingRows = new Set<number>();
    const formulaRows = new Set<number>();
    for (let rowNumber = 1; rowNumber < rowCount; rowNumber += 1) {
      const row = worksheet.getRow(rowNumber);
      const labels = Array.from({ length: columnCount }, (_, index) => {
        const cell = row.getCell(index + 1);
        return columnLabel(cell.value);
      });
      const nonEmpty = labels.filter((value): value is string => Boolean(value));
      const next = worksheet.getRow(rowNumber + 1);
      const emptyNext = Array.from({ length: Math.max(columnCount, next.cellCount) }, (_, index) => next.getCell(index + 1))
        .every(cellIsEmpty);
      if (nonEmpty.length < 2 || !emptyNext) continue;
      const total = formulaTotalRow(worksheet, rowNumber + 1);
      if (total.row) formulaRows.add(total.row);
      const columns: TemplateColumn[] = labels.flatMap((label, index) => label ? [{ index, label }] : []);
      targets.push({
        id: `s:${worksheet.name}!rows:${rowNumber}`,
        label: columns.map((column) => column.label).join(" · "),
        kind: "rows",
        templateRow: rowNumber + 1,
        columns,
        ...(total.row ? { totalRow: total.row, totalColumns: total.columns } : {}),
      });
      for (let current = rowNumber; current <= rowNumber + 1; current += 1) repeatingRows.add(current);
    }

    worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      if (repeatingRows.has(rowNumber) || formulaRows.has(rowNumber)) return;
      row.eachCell({ includeEmpty: false }, (cell, columnNumber) => {
        if (cell.isMerged) return;
        const label = columnLabel(cell.value);
        if (!label) return;
        const previous = columnNumber > 1 ? row.getCell(columnNumber - 1).value : null;
        if (!/:\s*$/.test(label) && typeof previous === "string" && /:\s*$/.test(previous)) return;
        const right = row.getCell(columnNumber + 1);
        const below = worksheet.getRow(rowNumber + 1).getCell(columnNumber);
        const looksLikeLabel = /:\s*$/.test(label) || cellIsEmpty(right) || cellIsEmpty(below);
        if (!looksLikeLabel) return;
        const target = cellIsEmpty(right) ? right : cellIsEmpty(below) ? below : null;
        if (target) targets.push({ id: address(worksheet.name, target), label: label.replace(/:\s*$/, "").trim(), kind: "cell" });
      });
    });
  });
  return targets;
}

export async function extractStructure(bytes: Uint8Array, filename: string): Promise<TemplateStructure> {
  const extension = extname(filename).toLowerCase();
  if ([".doc", ".xls"].includes(extension) || isOle(bytes)) throw new Error(LEGACY_OFFICE_ERROR);
  if ([".docx", ".xlsx", ".xlsm"].includes(extension)) {
    const zip = await loadOfficeArchive(bytes);
    if (extension === ".docx") {
      const document = zip.file("word/document.xml");
      if (!document) throw new Error("DOCX document.xml is missing.");
      const xml = await document.async("string");
      return { format: "docx", targets: extractDocxTargets(xml), warnings: [] };
    }
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(Buffer.from(bytes) as unknown as Parameters<typeof workbook.xlsx.load>[0]);
    return {
      format: "xlsx",
      targets: extractXlsxTargets(workbook),
      warnings: extension === ".xlsm" ? [MACRO_WARNING] : [],
    };
  }
  if (extension === ".pdf") {
    const pdf = await PDFDocument.load(bytes, { updateMetadata: false });
    const fields = pdf.getForm().getFields();
    if (!fields.length) return { format: "pdf_form", targets: [], warnings: [], unsupported: "flat_pdf" };
    return {
      format: "pdf_form",
      targets: fields.map((field) => {
        const label = field.getName();
        return { id: `f:${label}`, label, kind: "field" as const };
      }),
      warnings: [],
    };
  }
  throw new Error("Upload a DOCX, XLSX, XLSM, or PDF template.");
}

export async function validateOfficeArchive(bytes: Uint8Array) {
  return loadOfficeArchive(bytes);
}
