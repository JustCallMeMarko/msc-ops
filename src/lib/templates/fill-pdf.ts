import { PDFDocument } from "pdf-lib";
import type { TemplateStructure } from "./types";

export async function fillPdf(
  bytes: Uint8Array,
  structure: TemplateStructure,
  values: Record<string, unknown>,
): Promise<Uint8Array> {
  if (structure.unsupported === "flat_pdf") {
    throw new Error("This PDF isn't a fillable form. Use the built-in DOCX version instead.");
  }
  const document = await PDFDocument.load(bytes, { updateMetadata: false });
  const form = document.getForm();
  for (const target of structure.targets) {
    const value = values[target.id];
    if (value === undefined || value === null) continue;
    form.getTextField(target.id.slice(2)).setText(String(value));
  }
  form.updateFieldAppearances();
  return new Uint8Array(await document.save());
}
