import { describe, expect, it, vi } from "vitest";
import ExcelJS from "exceljs";
import JSZip from "jszip";
import { PDFDocument } from "pdf-lib";
import { extractStructure, LEGACY_OFFICE_ERROR, MACRO_WARNING } from "./structure";
import { fillDocx } from "./fill-docx";
import { fillPdf } from "./fill-pdf";
import { fillXlsx, previewXlsx } from "./fill-xlsx";
import { buildMappingPrompt, heuristicMap } from "./mapper";
import { hashCanonicalData } from "./generate";
import { labelJaccard, remapByLabel } from "./version";
import type { TemplateStructure } from "./types";

function docxXml(body: string) {
  return `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}<w:sectPr/></w:body></w:document>`;
}

function paragraph(text: string) {
  return `<w:p><w:r><w:t>${text}</w:t></w:r></w:p>`;
}

function tableCell(text: string, props = "") {
  return `<w:tc><w:tcPr>${props}</w:tcPr><w:p><w:r><w:t>${text}</w:t></w:r></w:p></w:tc>`;
}

function tableRow(cells: string[]) {
  return `<w:tr>${cells.map((cell) => tableCell(cell)).join("")}</w:tr>`;
}

async function archive(xml: string) {
  const zip = new JSZip();
  zip.file("word/document.xml", xml);
  return zip.generateAsync({ type: "uint8array" });
}

describe("template structure and filling", () => {
  it("extracts label-only DOCX targets and rejects XML entities", async () => {
    const bytes = await archive(docxXml(`${paragraph("Activity Title:")}${paragraph("")}`));
    const structure = await extractStructure(bytes, "proposal.docx");
    expect(structure.targets).toContainEqual({ id: "p:1", label: "Activity Title:", kind: "paragraph" });
    await expect(extractStructure(await archive("<!DOCTYPE x [<!ENTITY y 'z'>]><w:document/>"), "bad.docx"))
      .rejects.toThrow(/DOCTYPE or ENTITY/);
  });

  it("merges split DOCX runs, preserves paragraph label, escapes values, and clones repeat-row properties", async () => {
    const xml = docxXml(
      `<w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Activity </w:t></w:r><w:r><w:t>Title</w:t></w:r><w:r><w:t>:</w:t></w:r></w:p>`
      + `<w:tbl>${tableRow(["Name", "Amount"])}<w:tr><w:tc><w:tcPr><w:shd w:fill="eeeeee"/></w:tcPr><w:p><w:r><w:t></w:t></w:r></w:p></w:tc><w:tc><w:tcPr><w:tcW w:w="200"/></w:tcPr><w:p><w:r><w:t></w:t></w:r></w:p></w:tc></w:tr></w:tbl>`,
    );
    const bytes = await archive(xml);
    const structure: TemplateStructure = {
      format: "docx", warnings: [], targets: [
        { id: "p:0", label: "Activity Title:", kind: "paragraph" },
        { id: "t:0:rows", label: "Name · Amount", kind: "rows", templateRow: 1, columns: [{ index: 0, label: "Name" }, { index: 1, label: "Amount" }] },
      ],
    };
    const filled = await fillDocx(bytes, structure, { "p:0": "<&>", "t:0:rows": Array.from({ length: 12 }, (_, index) => ({ name: `Person ${index}`, amount: index })) });
    const zip = await JSZip.loadAsync(filled);
    const result = await zip.file("word/document.xml")!.async("string");
    expect(result).toContain("Activity Title: &lt;&amp;&gt;");
    expect(result.match(/Person \d+/g)).toHaveLength(12);
    expect(result).toContain('<w:shd w:fill="eeeeee"/>');
    expect(result).not.toContain("Title</w:t>");
  });

  it("formats DOCX date values as ISO dates", async () => {
    const bytes = await archive(docxXml(paragraph("Event Date:")));
    const structure: TemplateStructure = {
      format: "docx",
      warnings: [],
      targets: [{ id: "p:0", label: "Event Date:", kind: "paragraph" }],
    };
    const filled = await fillDocx(bytes, structure, { "p:0": new Date("2026-11-01T00:00:00.000Z") });
    const zip = await JSZip.loadAsync(filled);
    const result = await zip.file("word/document.xml")!.async("string");
    expect(result).toContain("Event Date: 2026-11-01");
    expect(result).not.toContain("GMT");
  });

  it("fills twelve XLSX rows, expands SUM, and preserves template styles, merges, and recalculation", async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Report");
    sheet.addRow(["Name", "Amount"]);
    const templateRow = sheet.addRow([null, null]);
    templateRow.font = { bold: true };
    templateRow.getCell(2).numFmt = '"₱"#,##0.00';
    templateRow.getCell(2).border = { bottom: { style: "thin" } };
    sheet.addRow(["Total", { formula: "SUM(B2:B2)" }]);
    sheet.mergeCells("A1:B1");
    const source = new Uint8Array(await workbook.xlsx.writeBuffer());
    const structure: TemplateStructure = { format: "xlsx", warnings: [], targets: [{
      id: "s:Report!rows:1", label: "Name · Amount", kind: "rows", templateRow: 2, totalRow: 3, totalColumns: [1],
      columns: [{ index: 0, label: "Name" }, { index: 1, label: "Amount" }],
    }] };
    const output = await fillXlsx(source, structure, { "s:Report!rows:1": { value: Array.from({ length: 12 }, (_, index) => ({ name: `Expense ${index}`, amount: 250 })), type: "rows" } });
    const result = new ExcelJS.Workbook();
    await result.xlsx.load(Buffer.from(output) as unknown as Parameters<typeof result.xlsx.load>[0]);
    const filled = result.getWorksheet("Report")!;
    expect(filled.getCell("B14").value).toMatchObject({ formula: "SUM(B2:B13)" });
    expect(filled.getRow(2).font.bold).toBe(true);
    expect(filled.getCell("B2").numFmt).toBe('"₱"#,##0.00');
    expect(filled.model.merges).toContain("A1:B1");
    const outputZip = await JSZip.loadAsync(output);
    const workbookXml = await outputZip.file("xl/workbook.xml")!.async("string");
    expect(workbookXml).toMatch(/fullCalcOnLoad="1"/);
  });

  it("shows missing repeating XLSX fields in the preview grid", async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Guest List");
    sheet.addRow(["Name", "Email"]);
    sheet.addRow([null, null]);
    const structure: TemplateStructure = {
      format: "xlsx",
      warnings: [],
      targets: [{
        id: "s:Guest List!rows:1",
        label: "Name · Email",
        kind: "rows",
        templateRow: 2,
        columns: [{ index: 0, label: "Name" }, { index: 1, label: "Email" }],
      }],
    };
    const preview = await previewXlsx(
      new Uint8Array(await workbook.xlsx.writeBuffer()),
      structure,
      {},
      ["s:Guest List!rows:1"],
    );
    expect(preview.sheets[0]?.rows[1]).toEqual([
      expect.objectContaining({ missing: true }),
      expect.objectContaining({ missing: true }),
    ]);
  });

  it("rejects OLE files, warns on XLSM, maps Total Expenses, and never puts sample values in mapping prompts", async () => {
    const ole = Uint8Array.from([0xd0, 0xcf, 0x11, 0xe0]);
    await expect(extractStructure(ole, "legacy.xls")).rejects.toThrow(LEGACY_OFFICE_ERROR);
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Form");
    worksheet.addRow(["Total Expenses:", "", "sample-value-DO-NOT-SEND", "Occupied"]);
    worksheet.addRow(["", "", "Occupied", "Occupied"]);
    const xlsx = new Uint8Array(await workbook.xlsx.writeBuffer());
    const structure = await extractStructure(xlsx, "macro.xlsm");
    expect(structure.warnings).toContain(MACRO_WARNING);
    const prompt = buildMappingPrompt(structure);
    expect(prompt).not.toContain("sample-value-DO-NOT-SEND");
    const expense = { format: "xlsx", warnings: [], targets: [{ id: "s:Form!B1", label: "Total Expenses", kind: "cell" }] } as TemplateStructure;
    expect(heuristicMap(expense)["s:Form!B1"]?.field).toBe("ledger.total_expense");
  });

  it("extracts XLSX repeating rows without retaining merged titles or adjacent sample values", async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Form");
    sheet.addRow(["Fixture Organization"]);
    sheet.mergeCells("A1:C1");
    sheet.addRow(["Activity Title:", null]);
    sheet.addRow(["Event Date:", null]);
    sheet.addRow(["Date", "Category", "Amount"]);
    sheet.addRow([null, null, null]);
    sheet.addRow(["", "", "Total", { formula: "SUM(C5:C5)" }]);
    const samples = workbook.addWorksheet("Samples");
    samples.addRow(["Activity Title:", "Campus Welcome Night"]);
    samples.addRow(["Event Date:", new Date("2026-11-01T00:00:00.000Z")]);
    const structure = await extractStructure(new Uint8Array(await workbook.xlsx.writeBuffer()), "fixture.xlsx");
    expect(structure.targets).toContainEqual(expect.objectContaining({
      id: "s:Form!rows:4",
      kind: "rows",
      templateRow: 5,
      totalRow: 6,
    }));
    expect(structure.targets.map((target) => target.label)).toContain("Date · Category · Amount");
    expect(structure.targets.map((target) => target.label)).toContain("Activity Title");
    expect(structure.targets.map((target) => target.label)).toContain("Event Date");
    expect(JSON.stringify(structure)).not.toContain("Campus Welcome Night");
    expect(JSON.stringify(structure)).not.toContain("Fixture Organization");
  });

  it("extracts AcroForm fields and rejects a flat PDF template", async () => {
    const formPdf = await PDFDocument.create();
    const form = formPdf.getForm();
    form.createTextField("Activity.Title");
    const source = new Uint8Array(await formPdf.save());
    const structure = await extractStructure(source, "proposal.pdf");
    expect(structure.targets).toEqual([{ id: "f:Activity.Title", label: "Activity.Title", kind: "field" }]);
    const filled = await fillPdf(source, structure, { "f:Activity.Title": "Annual review" });
    const filledPdf = await PDFDocument.load(filled);
    expect(filledPdf.getForm().getTextField("Activity.Title").getText()).toBe("Annual review");
    const flat = await PDFDocument.create();
    const unsupported = await extractStructure(new Uint8Array(await flat.save()), "flat.pdf");
    expect(unsupported.unsupported).toBe("flat_pdf");
    await expect(fillPdf(new Uint8Array(await flat.save()), unsupported, {}))
      .rejects.toThrow("This PDF isn't a fillable form. Use the built-in DOCX version instead.");
  });

  it("rejects office archives over the uncompressed-size limit", async () => {
    const oversized = { files: { bomb: { _data: { uncompressedSize: 50 * 1024 * 1024 + 1 } } } } as unknown as JSZip;
    const load = vi.spyOn(JSZip, "loadAsync").mockResolvedValue(oversized);
    try {
      await expect(extractStructure(new Uint8Array([1]), "large.docx"))
        .rejects.toThrow("Office archive expands beyond the 50 MB safety limit.");
    } finally {
      load.mockRestore();
    }
  });

  it("hashes canonical dates and data deterministically", () => {
    expect(hashCanonicalData({ date: new Date("2026-05-10T00:00:00.000Z"), amount: 100 }))
      .toBe(hashCanonicalData({ amount: 100, date: new Date("2026-05-10T00:00:00.000Z") }));
    expect(hashCanonicalData({ date: new Date("2026-05-10T00:00:00.000Z") }))
      .not.toBe(hashCanonicalData({ date: new Date("2026-05-11T00:00:00.000Z") }));
  });

  it("matches a shifted replacement by labels and reports kept, added, and removed targets", () => {
    const oldStructure: TemplateStructure = { format: "xlsx", warnings: [], targets: [
      { id: "a", label: "Event Date:", kind: "cell" },
      { id: "b", label: "Total Expenses:", kind: "cell" },
      { id: "c", label: "Activity Title:", kind: "cell" },
      { id: "d", label: "Organization:", kind: "cell" },
      { id: "e", label: "Treasurer:", kind: "cell" },
    ] };
    const next: TemplateStructure = { format: "xlsx", warnings: [], targets: [
      { id: "shifted-a", label: "Event Date:", kind: "cell" },
      { id: "shifted-c", label: "Activity Title:", kind: "cell" },
      { id: "shifted-d", label: "Organization:", kind: "cell" },
      { id: "shifted-e", label: "Treasurer:", kind: "cell" },
      { id: "new", label: "Adviser contact number:", kind: "cell" },
    ] };
    expect(labelJaccard(oldStructure, next)).toBeGreaterThanOrEqual(0.6);
    const result = remapByLabel({ structure: oldStructure, mapping: { a: { field: "event.date" }, b: { field: "ledger.total_expense" }, c: { field: "event.title" }, d: { field: "org.name" }, e: { field: "org.president.name" } } }, next);
    expect(result.kept).toHaveLength(4);
    expect(result.added[0]?.label).toBe("Adviser contact number:");
    expect(result.removed.find((item) => item.label === "Total Expenses:")).toBeTruthy();
  });
});
