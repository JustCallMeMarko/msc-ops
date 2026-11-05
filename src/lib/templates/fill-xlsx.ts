import ExcelJS from "exceljs";
import { validateOfficeArchive } from "./structure";
import type { GridPreview, TemplateStructure, TemplateTarget } from "./types";

export type TypedTemplateValue = { value: unknown; type?: "text" | "date" | "peso" | "number" | "rows" };

function applyCellValue(cell: ExcelJS.Cell, input: unknown, type?: TypedTemplateValue["type"]) {
  const value = input && typeof input === "object" && "value" in input
    ? (input as TypedTemplateValue).value
    : input;
  const valueType = input && typeof input === "object" && "type" in input
    ? (input as TypedTemplateValue).type
    : type;
  if (value === undefined || value === null) return;
  if (valueType === "peso" && typeof value === "number") {
    cell.value = value / 100;
    cell.numFmt = '"₱"#,##0.00';
  } else if (valueType === "date" && (typeof value === "string" || value instanceof Date)) {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isFinite(date.getTime())) {
      cell.value = date;
      cell.numFmt = "yyyy-mm-dd";
    } else {
      cell.value = String(value);
    }
  } else {
    cell.value = value as ExcelJS.CellValue;
  }
}

function cellAddress(id: string): { sheetName: string; address: string } | null {
  if (!id.startsWith("s:")) return null;
  const separator = id.lastIndexOf("!");
  if (separator < 2) return null;
  return { sheetName: id.slice(2, separator), address: id.slice(separator + 1) };
}

function columnValues(row: unknown, target: TemplateTarget, columnMap?: Record<string, string>): unknown[] {
  return (target.columns ?? []).map((column) => {
    if (Array.isArray(row)) return row[column.index];
    if (!row || typeof row !== "object") return undefined;
    const record = row as Record<string, unknown>;
    const explicit = columnMap?.[String(column.index)];
    if (explicit && explicit in record) return record[explicit];
    const normalized = column.label.toLowerCase().replace(/[^a-z0-9]/g, "");
    const key = Object.keys(record).find((name) => name.toLowerCase().replace(/[^a-z0-9]/g, "") === normalized);
    return key ? record[key] : undefined;
  });
}

function copyRowStyle(source: ExcelJS.Row, target: ExcelJS.Row) {
  target.height = source.height;
  for (let column = 1; column <= Math.max(source.cellCount, target.cellCount); column += 1) {
    const from = source.getCell(column);
    const to = target.getCell(column);
    to.style = structuredClone(from.style);
    if (from.numFmt) to.numFmt = from.numFmt;
    if (from.dataValidation) to.dataValidation = structuredClone(from.dataValidation);
  }
}

function expandFormulaRanges(formula: string, startRow: number, inserted: number) {
  return formula.replace(/(\$?[A-Z]{1,3}\$?)(\d+):(\$?[A-Z]{1,3}\$?)(\d+)/gi, (match, firstCol: string, firstRow: string, lastCol: string, lastRow: string) => {
    const start = Number(firstRow.replace(/\$/g, ""));
    const end = Number(lastRow.replace(/\$/g, ""));
    if (start <= startRow && end >= startRow) return `${firstCol}${firstRow}:${lastCol}${end + inserted}`;
    return match;
  });
}

function fillRepeatingRows(
  worksheet: ExcelJS.Worksheet,
  target: TemplateTarget,
  rows: unknown[],
  columnMap?: Record<string, string>,
) {
  const templateRowIndex = target.templateRow ?? 1;
  const template = worksheet.getRow(templateRowIndex);
  const insertionCount = Math.max(0, rows.length - 1);
  const totalRowIndex = target.totalRow;
  const formulas: Array<{ row: number; column: number; formula: string }> = [];
  if (totalRowIndex) {
    for (let rowNumber = totalRowIndex; rowNumber <= worksheet.actualRowCount; rowNumber += 1) {
      const row = worksheet.getRow(rowNumber);
      row.eachCell({ includeEmpty: false }, (cell, column) => {
        if (cell.value && typeof cell.value === "object" && "formula" in cell.value) {
          formulas.push({ row: rowNumber, column, formula: String(cell.value.formula) });
        }
      });
    }
  }
  const rowValues = rows.map((item) => columnValues(item, target, columnMap));
  for (let offset = 0; offset < insertionCount; offset += 1) {
    worksheet.insertRow(templateRowIndex + offset + 1, []);
  }
  for (let index = 0; index < Math.max(rows.length, 1); index += 1) {
    const row = worksheet.getRow(templateRowIndex + index);
    copyRowStyle(template, row);
    if (index < rowValues.length) {
      for (let column = 0; column < rowValues[index]!.length; column += 1) {
        const columnIndex = target.columns?.[column]?.index ?? column;
        const field = columnMap?.[String(columnIndex)];
        const type = field?.toLowerCase().includes("centavos") ? "peso"
          : field?.toLowerCase().includes("date") ? "date"
            : undefined;
        applyCellValue(row.getCell(columnIndex + 1), rowValues[index]![column], type);
      }
    } else {
      for (const column of target.columns ?? []) row.getCell(column.index + 1).value = null;
    }
  }
  if (totalRowIndex && insertionCount) {
    for (const formula of formulas) {
      const nextCell = worksheet.getRow(formula.row + insertionCount).getCell(formula.column);
      nextCell.value = { formula: expandFormulaRanges(formula.formula, templateRowIndex, insertionCount) };
    }
    const shiftedTotalRow = worksheet.getRow(totalRowIndex + insertionCount);
    for (const column of target.totalColumns ?? []) {
      const cell = shiftedTotalRow.getCell(column + 1);
      if (cell.value && typeof cell.value === "object" && "formula" in cell.value) {
        cell.value = {
          ...cell.value,
          formula: expandFormulaRanges(String(cell.value.formula), templateRowIndex, insertionCount),
        };
      }
    }
  }
}

export async function fillXlsx(
  bytes: Uint8Array,
  structure: TemplateStructure,
  values: Record<string, unknown>,
  columnMaps: Record<string, Record<string, string>> = {},
): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook();
  await validateOfficeArchive(bytes);
  await workbook.xlsx.load(Buffer.from(bytes) as unknown as Parameters<typeof workbook.xlsx.load>[0]);
  for (const target of structure.targets) {
    const value = values[target.id];
    if (value === undefined) continue;
    const rawValue = value && typeof value === "object" && "value" in value
      ? (value as TypedTemplateValue).value
      : value;
    if (target.kind === "rows" && Array.isArray(rawValue)) {
      const sheetName = target.id.slice(2, target.id.indexOf("!"));
      const worksheet = workbook.getWorksheet(sheetName);
      if (worksheet) fillRepeatingRows(worksheet, target, rawValue, columnMaps[target.id]);
      continue;
    }
    const parsed = cellAddress(target.id);
    const worksheet = parsed ? workbook.getWorksheet(parsed.sheetName) : undefined;
    if (!parsed || !worksheet) continue;
    const typed = value && typeof value === "object" && "value" in value
      ? value as TypedTemplateValue
      : { value };
    applyCellValue(worksheet.getCell(parsed.address), typed.value, typed.type);
  }
  workbook.calcProperties.fullCalcOnLoad = true;
  return new Uint8Array(await workbook.xlsx.writeBuffer());
}

export async function previewXlsx(
  bytes: Uint8Array,
  structure: TemplateStructure,
  values: Record<string, unknown>,
  missing: string[] = [],
  columnMaps: Record<string, Record<string, string>> = {},
): Promise<GridPreview> {
  const filled = await fillXlsx(bytes, structure, values, columnMaps);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(Buffer.from(filled) as unknown as Parameters<typeof workbook.xlsx.load>[0]);
  const missingIds = new Set(missing);
  const targetByAddress = new Map(structure.targets.flatMap((target) => {
    const parsed = cellAddress(target.id);
    return parsed ? [[`${parsed.sheetName}!${parsed.address}`, target.id] as const] : [];
  }));
  return {
    sheets: workbook.worksheets.map((worksheet) => ({
      name: worksheet.name,
      rows: Array.from({ length: Math.max(
        worksheet.actualRowCount,
        ...structure.targets
          .filter((target) => target.kind === "rows" && target.id.startsWith(`s:${worksheet.name}!`))
          .map((target) => target.templateRow ?? 0),
      ) }, (_, rowIndex) => {
        const row = worksheet.getRow(rowIndex + 1);
        const repeatingTargets = structure.targets.filter((target) =>
          target.kind === "rows" && target.id.startsWith(`s:${worksheet.name}!`),
        );
        const columnCount = Math.max(
          worksheet.actualColumnCount,
          ...repeatingTargets.flatMap((target) => (target.columns ?? []).map((column) => column.index + 1)),
        );
        return Array.from({ length: columnCount }, (_, columnIndex) => {
          const cell = row.getCell(columnIndex + 1);
          const cellValue = cell.value;
          const value = cellValue && typeof cellValue === "object" && "result" in cellValue
            ? cellValue.result as string | number | boolean | null
            : cellValue && typeof cellValue === "object" && "formula" in cellValue
              ? `=${String(cellValue.formula)}`
              : cellValue instanceof Date ? cellValue.toISOString().slice(0, 10)
                : cellValue as string | number | boolean | null;
          const id = targetByAddress.get(`${worksheet.name}!${cell.address}`)
            ?? structure.targets.find((target) => {
              if (target.kind !== "rows" || !target.id.startsWith(`s:${worksheet.name}!`)) return false;
              const rowStart = target.templateRow ?? Number(target.id.split(":").at(-1)) + 1;
              return rowIndex + 1 >= rowStart && Boolean(target.columns?.some((column) => column.index + 1 === columnIndex + 1));
            })?.id;
          return { v: value ?? null, missing: Boolean(id && missingIds.has(id)), ...(id ? { targetId: id } : {}) };
        });
      }),
    })),
  };
}
