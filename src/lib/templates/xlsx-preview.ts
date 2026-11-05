import type ExcelJS from "exceljs";
import type { GridPreviewCell } from "./types";

type Coordinate = { row: number; column: number };

function coordinate(address: string): Coordinate | null {
  const match = /^([A-Z]+)(\d+)$/i.exec(address);
  if (!match) return null;
  let column = 0;
  for (const character of (match[1] ?? "").toUpperCase()) {
    column = column * 26 + character.charCodeAt(0) - 64;
  }
  return { row: Number(match[2]), column };
}

function previewValue(cell: ExcelJS.Cell): GridPreviewCell["v"] {
  const raw = cell.value;
  const value = raw && typeof raw === "object" && "result" in raw
    ? raw.result
    : raw && typeof raw === "object" && "formula" in raw
      ? `=${String(raw.formula)}`
      : raw && typeof raw === "object" && "text" in raw
        ? raw.text
        : raw;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "number") {
    const numFmt = cell.numFmt ?? "";
    const decimals = numFmt.match(/\.([0]+)/)?.[1]?.length ?? 0;
    const formatted = value.toLocaleString("en-US", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
    return numFmt.includes("₱") ? `₱${formatted}` : numFmt.includes("%") ? `${(value * 100).toFixed(decimals)}%` : decimals ? formatted : value;
  }
  if (typeof value === "string" || typeof value === "boolean" || value === null || value === undefined) {
    return value ?? null;
  }
  return String(value);
}

export function worksheetPreviewGrid(worksheet: ExcelJS.Worksheet): GridPreviewCell[][] {
  const merged = new Map<string, { colSpan?: number; rowSpan?: number; skip?: boolean }>();
  const merges = (worksheet.model.merges ?? []) as string[];
  for (const range of merges) {
    const [start, end] = range.split(":");
    const first = start ? coordinate(start) : null;
    const last = end ? coordinate(end) : null;
    if (!first || !last) continue;
    merged.set(`${first.row}:${first.column}`, {
      ...(last.column > first.column ? { colSpan: last.column - first.column + 1 } : {}),
      ...(last.row > first.row ? { rowSpan: last.row - first.row + 1 } : {}),
    });
    for (let row = first.row; row <= last.row; row += 1) {
      for (let column = first.column; column <= last.column; column += 1) {
        if (row !== first.row || column !== first.column) merged.set(`${row}:${column}`, { skip: true });
      }
    }
  }

  const rowCount = Math.max(worksheet.rowCount, ...merges.map((range) => coordinate(range.split(":")[1] ?? "")?.row ?? 0));
  const columnCount = Math.max(worksheet.columnCount, ...merges.map((range) => coordinate(range.split(":")[1] ?? "")?.column ?? 0));
  return Array.from({ length: rowCount }, (_, rowIndex) =>
    Array.from({ length: columnCount }, (_, columnIndex) => {
      const span = merged.get(`${rowIndex + 1}:${columnIndex + 1}`);
      return {
        v: span?.skip ? null : previewValue(worksheet.getCell(rowIndex + 1, columnIndex + 1)),
        missing: false,
        ...(span ?? {}),
      };
    }),
  );
}
