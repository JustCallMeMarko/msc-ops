import { validateOfficeArchive } from "./structure";
import { formatPeso } from "@/lib/finance/logic";
import type { TemplateStructure, TemplateTarget } from "./types";

export function escapeXml(value: unknown): string {
  const text = value instanceof Date ? value.toISOString().slice(0, 10) : String(value ?? "");
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

function decodeXml(value: string) {
  return value.replace(/&#x([0-9a-f]+);/gi, (_match, code: string) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&#(\d+);/g, (_match, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'").replace(/&amp;/g, "&");
}

function textOf(xml: string) {
  return [...xml.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)].map((match) => decodeXml(match[1] ?? "")).join("");
}

function replaceNth(source: string, expression: RegExp, index: number, replacement: (value: string) => string): string {
  let current = -1;
  return source.replace(expression, (match) => {
    current += 1;
    return current === index ? replacement(match) : match;
  });
}

function replaceRunText(xml: string, value: string): string {
  const runs = [...xml.matchAll(/<w:r(?:\s[^>]*)?>[\s\S]*?<\/w:r>/g)];
  const content = runs[0]?.[0];
  const escaped = escapeXml(value);
  const firstRun = content
    ? content.replace(/<w:t(?:\s[^>]*)?>[\s\S]*?<\/w:t>/, `<w:t xml:space="preserve">${escaped}</w:t>`)
    : `<w:r><w:t xml:space="preserve">${escaped}</w:t></w:r>`;
  const styled = content && !/<w:t(?:\s[^>]*)?>/.test(content)
    ? content.replace(/(<w:rPr(?:\s[^>]*)?>[\s\S]*?<\/w:rPr>)/, `$1<w:t xml:space="preserve">${escaped}</w:t>`)
    : firstRun;
  if (!runs.length) return xml.replace("</w:p>", `${styled}</w:p>`);
  let first = true;
  return xml.replace(/<w:r(?:\s[^>]*)?>[\s\S]*?<\/w:r>/g, () => {
    if (first) {
      first = false;
      return styled;
    }
    return "";
  });
}

function valueText(value: unknown): string {
  return value instanceof Date ? value.toISOString().slice(0, 10) : String(value ?? "");
}

function fillParagraph(xml: string, value: unknown) {
  const text = textOf(xml);
  const colon = text.indexOf(":");
  const prefix = colon >= 0
    ? `${text.slice(0, colon + 1)}${text.slice(colon + 1).match(/^\s*/)?.[0] || " "}`
    : "";
  return replaceRunText(xml, prefix ? `${prefix}${valueText(value)}` : valueText(value));
}

function fillCell(xml: string, value: unknown) {
  const paragraph = /<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>/.exec(xml)?.[0];
  if (!paragraph) return xml.replace("</w:tc>", `<w:p><w:r><w:t>${escapeXml(value)}</w:t></w:r></w:p></w:tc>`);
  return xml.replace(paragraph, fillParagraph(paragraph, value));
}

function fillTableCell(tableXml: string, rowIndex: number, cellIndex: number, value: unknown) {
  return replaceNth(tableXml, /<w:tr(?:\s[^>]*)?>[\s\S]*?<\/w:tr>/g, rowIndex, (row) =>
    replaceNth(row, /<w:tc(?:\s[^>]*)?>[\s\S]*?<\/w:tc>/g, cellIndex, (cell) => fillCell(cell, value)));
}

function mapRowValues(row: unknown, target: TemplateTarget, columnMap: Record<string, string> | undefined): unknown[] {
  return (target.columns ?? []).map((column) => {
    const field = columnMap?.[String(column.index)];
    if (Array.isArray(row)) return row[column.index];
    if (!row || typeof row !== "object") return undefined;
    const record = row as Record<string, unknown>;
    if (field && field in record) {
      const value = record[field];
      return field.toLowerCase().includes("centavos") && typeof value === "number" ? formatPeso(value) : value;
    }
    const normalizedLabel = column.label.toLowerCase().replace(/[^a-z0-9]/g, "");
    const key = Object.keys(record).find((name) => name.toLowerCase().replace(/[^a-z0-9]/g, "") === normalizedLabel);
    return key ? record[key] : undefined;
  });
}

function fillRepeatingTable(tableXml: string, target: TemplateTarget, rows: unknown[], columnMap?: Record<string, string>) {
  const templateRowIndex = target.templateRow ?? 1;
  const originalRows = [...tableXml.matchAll(/<w:tr(?:\s[^>]*)?>[\s\S]*?<\/w:tr>/g)].map((match) => match[0]);
  const templateRow = originalRows[templateRowIndex];
  if (!templateRow) return tableXml;
  const filledRows = rows.map((item) => {
    const values = mapRowValues(item, target, columnMap);
    let row = templateRow;
    for (let index = 0; index < (target.columns?.length ?? 0); index += 1) {
      row = replaceNth(row, /<w:tc(?:\s[^>]*)?>[\s\S]*?<\/w:tc>/g, index, (cell) => fillCell(cell, values[index]));
    }
    return row;
  });
  let rowIndex = -1;
  return tableXml.replace(/<w:tr(?:\s[^>]*)?>[\s\S]*?<\/w:tr>/g, (original) => {
    rowIndex += 1;
    return rowIndex === templateRowIndex ? filledRows.join("") : original;
  });
}

export async function fillDocx(
  bytes: Uint8Array,
  structure: TemplateStructure,
  values: Record<string, unknown>,
  columnMaps: Record<string, Record<string, string>> = {},
): Promise<Uint8Array> {
  const zip = await validateOfficeArchive(bytes);
  const document = zip.file("word/document.xml");
  if (!document) throw new Error("DOCX document.xml is missing.");
  let xml = await document.async("string");
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error("DOCX XML must not contain a DOCTYPE or ENTITY declaration.");
  const paragraphTargets = structure.targets.filter((target) => target.kind === "paragraph" && values[target.id] !== undefined);
  let paragraphIndex = -1;
  xml = xml.replace(/<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>/g, (paragraph) => {
    paragraphIndex += 1;
    const target = paragraphTargets.find((entry) => entry.id === `p:${paragraphIndex}`);
    return target ? fillParagraph(paragraph, values[target.id]) : paragraph;
  });

  const tableTargets = structure.targets.filter((target) => target.id.startsWith("t:"));
  let tableIndex = -1;
  xml = xml.replace(/<w:tbl(?:\s[^>]*)?>[\s\S]*?<\/w:tbl>/g, (table) => {
    tableIndex += 1;
    const repeat = tableTargets.find((target) => target.id === `t:${tableIndex}:rows` && Array.isArray(values[target.id]));
    if (repeat) return fillRepeatingTable(table, repeat, values[repeat.id] as unknown[], columnMaps[repeat.id]);
    let updated = table;
    for (const target of tableTargets) {
      const match = new RegExp(`^t:${tableIndex}:r:(\\d+):c:(\\d+)$`).exec(target.id);
      if (!match || values[target.id] === undefined) continue;
      updated = fillTableCell(updated, Number(match[1]), Number(match[2]), values[target.id]);
    }
    return updated;
  });

  zip.file("word/document.xml", xml);
  return new Uint8Array(await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" }));
}
