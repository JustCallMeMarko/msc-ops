import { isDeepStrictEqual } from "node:util";
import { and, eq, isNull } from "drizzle-orm";
import ExcelJS from "exceljs";
import JSZip from "jszip";
import { uuidv7 } from "uuidv7";
import type { Database } from "@/lib/db/client";
import { files, templates } from "@/lib/db/schema";
import { getDataDir } from "@/lib/data-dir";
import { readFileBlob, storeFileBlob } from "@/lib/files/storage";
import { heuristicMap } from "./mapper";
import { askFieldForLabel } from "./dictionary";
import { dictionaryRegistry } from "./dictionary";
import { extractStructure } from "./structure";
import type { TemplateKind, TemplateStructure } from "./types";

type BuiltinSpec = { name: string; kind: TemplateKind; format: "docx" | "xlsx"; labels: string[] };

const specs: BuiltinSpec[] = [
  { name: "Letter of Explanation", kind: "letter_of_explanation", format: "docx", labels: ["Date:", "Activity title:", "Reason:", "Requested action:", "President name:", "Adviser contact number:"] },
  { name: "External Guest List", kind: "guest_list", format: "xlsx", labels: ["Name", "Organization", "Email", "Contact number"] },
  { name: "Liquidation Report", kind: "liquidation", format: "xlsx", labels: ["Date", "Category", "Description", "Payee", "OR number", "Amount"] },
  { name: "Financial Statement", kind: "financial_statement", format: "xlsx", labels: ["Account", "Account type", "Balance"] },
  { name: "Turnover Certificate", kind: "turnover_certificate", format: "docx", labels: ["Date:", "Outgoing president:", "Incoming president:", "Adviser:", "Turnover period:", "Items transferred:"] },
  { name: "Bank Signatory Resolution", kind: "resolution", format: "docx", labels: ["Date:", "Bank:", "Account name:", "Signatory 1:", "Signatory 2:", "Signatory 3:", "Resolution:"] },
];

function paragraph(value: string) {
  const text = value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return `<w:p><w:r><w:t xml:space="preserve">${text}</w:t></w:r></w:p>`;
}

function createDocx(labels: string[]) {
  const zip = new JSZip();
  zip.file("[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`);
  zip.file("_rels/.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`);
  const body = labels.map((label) => `${paragraph(label)}${paragraph("")}`).join("");
  zip.file("word/document.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}<w:sectPr/></w:body></w:document>`);
  return zip.generateAsync({ type: "uint8array" });
}

async function createXlsx(spec: BuiltinSpec) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Form");
  if (spec.kind === "liquidation") {
    sheet.addRow(["Liquidation Report"]);
    sheet.addRow(["Activity:", ""]);
    sheet.addRow(["Event date:", ""]);
    sheet.addRow([]);
    const header = sheet.addRow(spec.labels);
    header.font = { bold: true };
    header.eachCell((cell) => { cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEAF2F8" } }; });
    const row = sheet.addRow(Array(spec.labels.length).fill(null));
    row.eachCell((cell) => { cell.border = { bottom: { style: "thin", color: { argb: "FF8C959F" } } }; });
    sheet.addRow(["", "", "", "", "Total", { formula: "SUM(F6:F6)" }]);
    sheet.mergeCells("A1:F1");
    sheet.getColumn(6).numFmt = '"₱"#,##0.00';
  } else {
    sheet.addRow(spec.labels);
    const header = sheet.getRow(1);
    header.font = { bold: true };
    header.eachCell((cell) => { cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEAF2F8" } }; });
    sheet.addRow(Array(spec.labels.length).fill(null));
    sheet.getColumn(3).numFmt = '"₱"#,##0.00';
  }
  sheet.columns.forEach((column) => { column.width = 22; });
  workbook.calcProperties.fullCalcOnLoad = true;
  return new Uint8Array(await workbook.xlsx.writeBuffer());
}

function preconfirmMapping(structure: TemplateStructure, kind: TemplateKind) {
  const mapping = heuristicMap(structure);
  for (const target of structure.targets) {
    if (target.kind === "rows") {
      const repeatedField = kind === "liquidation" ? "ledger.expenses[]"
        : kind === "financial_statement" ? "ledger.balance_by_account[]"
          : kind === "guest_list" ? "ask.guest_list_rows"
            : undefined;
      if (repeatedField) {
        const columns = dictionaryRegistry[repeatedField as keyof typeof dictionaryRegistry]?.columns ?? [];
        mapping[target.id] = {
          field: repeatedField,
          confidence: 1,
          columns: Object.fromEntries((target.columns ?? []).flatMap((column) => {
            const label = column.label.toLowerCase().replace(/[^a-z0-9]/g, "");
            const matched = columns.find((entry) => [entry.label, ...(entry.synonyms ?? [])]
              .some((candidate) => candidate.toLowerCase().replace(/[^a-z0-9]/g, "") === label));
            return matched ? [[String(column.index), matched.key]] : [];
          })),
        };
        continue;
      }
    }
    if (mapping[target.id]?.field) continue;
    mapping[target.id] = { field: askFieldForLabel(target.label), confidence: 1 };
  }
  return mapping;
}

export async function seedBuiltinTemplates(database: Database) {
  const { db } = database;
  const dataDir = await getDataDir();
  for (const spec of specs) {
    const [existing] = await db.select({
      id: templates.id,
      fileId: templates.fileId,
      structure: templates.structure,
      mappingConfirmedAt: templates.mappingConfirmedAt,
    }).from(templates).where(and(
      eq(templates.kind, spec.kind),
      eq(templates.active, true),
      isNull(templates.deletedAt),
    )).limit(1);
    if (existing) {
      const [file] = await db.select().from(files).where(eq(files.id, existing.fileId)).limit(1);
      if (file) {
        const structure = await extractStructure(await readFileBlob(dataDir, file.sha256), file.originalName);
        if (!isDeepStrictEqual(existing.structure, structure)) {
          await db.update(templates).set({
            structure,
            mapping: preconfirmMapping(structure, spec.kind),
            mappingConfirmedAt: existing.mappingConfirmedAt ?? new Date(),
            warnings: structure.warnings,
            updatedAt: new Date(),
          }).where(eq(templates.id, existing.id));
        }
      }
      continue;
    }
    const bytes = spec.format === "docx" ? await createDocx(spec.labels) : await createXlsx(spec);
    const filename = `${spec.name}.${spec.format}`;
    const structure = await extractStructure(bytes, filename);
    const sha256 = await storeFileBlob(dataDir, bytes);
    const [file] = await db.insert(files).values({
      sha256,
      originalName: filename,
      mime: spec.format === "docx"
        ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      size: bytes.byteLength,
      kind: "template",
      source: "org",
      tags: ["built-in"],
    }).returning();
    if (!file) continue;
    await db.insert(templates).values({
      lineageId: uuidv7(),
      name: spec.name,
      kind: spec.kind,
      source: "builtin",
      format: spec.format,
      fileId: file.id,
      version: 1,
      active: true,
      structure,
      mapping: preconfirmMapping(structure, spec.kind),
      mappingConfirmedAt: new Date(),
      warnings: structure.warnings,
    });
  }
}
