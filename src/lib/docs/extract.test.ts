import { describe, expect, it } from "vitest";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { extractPdf, mapPdfExtractionError, PASSWORD_PDF_ERROR } from "./extract";

async function fixturePdf() {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const first = pdf.addPage([612, 792]);
  first.drawText("ARTICLE III\nSection 2", { x: 50, y: 720, font, size: 12, lineHeight: 16 });
  first.drawText("exam-", { x: 50, y: 680, font, size: 12 });
  first.drawText("ple with ligature fi", { x: 50, y: 664, font, size: 12 });
  pdf.addPage([612, 792]).drawText("Section spans page two", { x: 50, y: 720, font, size: 12 });
  pdf.addPage([612, 792]);
  return new Uint8Array(await pdf.save());
}

describe("PDF extraction", () => {
  it("extracts page text items and leaves image-only pages eligible for OCR", async () => {
    const extracted = await extractPdf(await fixturePdf());
    expect(extracted.pageCount).toBe(3);
    expect(extracted.pages[0]!.items.length).toBeGreaterThan(0);
    expect(extracted.pages[0]!.items[0]).toMatchObject({ str: expect.any(String), transform: expect.any(Array), width: expect.any(Number), height: expect.any(Number), hasEOL: expect.any(Boolean) });
    expect(extracted.needsOcr).toContain(3);
    expect(extracted.pages[2]!.charCount).toBe(0);
  });

  it("maps password exceptions to the user-facing upload error", () => {
    const error = Object.assign(new Error("password required"), { name: "PasswordException" });
    expect(mapPdfExtractionError(error).message).toBe(PASSWORD_PDF_ERROR);
  });
});
