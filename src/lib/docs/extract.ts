import path from "node:path";
import { pathToFileURL } from "node:url";
import { getDocument, GlobalWorkerOptions } from "pdfjs-dist/legacy/build/pdf.mjs";
import { needsOcr, type PageItem, type PageItems } from "./chunker";

export const MAX_PDF_BYTES = 50 * 1024 * 1024;
export const PASSWORD_PDF_ERROR = "This PDF is password-protected. Remove the password first, then upload again.";
GlobalWorkerOptions.workerSrc = pathToFileURL(path.join(process.cwd(), "node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs")).href;

export type ExtractedPage = PageItems & {
  width: number;
  height: number;
  charCount: number;
  ocr: boolean;
};

export function mapPdfExtractionError(error: unknown): Error {
  if (error instanceof Error && (error.name === "PasswordException" || /password/i.test(error.message))) {
    return new Error(PASSWORD_PDF_ERROR, { cause: error });
  }
  return error instanceof Error ? error : new Error("PDF extraction failed.");
}

export async function extractPdf(
  bytes: Uint8Array,
  onPage?: (page: number, pageCount: number, extracted: ExtractedPage) => void | Promise<void>,
): Promise<{ pageCount: number; pages: ExtractedPage[]; needsOcr: number[] }> {
  if (bytes.byteLength > MAX_PDF_BYTES) throw new Error("PDF files must be 50 MB or smaller.");
  const options = Object.assign({ data: new Uint8Array(bytes), useSystemFonts: false }, { isEvalSupported: false }) as Parameters<typeof getDocument>[0];
  const loading = getDocument(options);
  try {
    const pdf = await loading.promise;
    const pages: ExtractedPage[] = [];
    const ocrPages: number[] = [];
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const viewport = page.getViewport({ scale: 1 });
      const content = await page.getTextContent();
      const items: PageItem[] = content.items.flatMap((item) => {
        if (!("str" in item)) return [];
        return [{
          str: item.str,
          transform: item.transform,
          width: item.width,
          height: item.height,
          hasEOL: item.hasEOL,
        }];
      });
      const charCount = items.reduce((count, item) => count + item.str.length, 0);
      const needsOcrPage = needsOcr(charCount);
      if (needsOcrPage) ocrPages.push(pageNumber);
      const extracted = { page: pageNumber, width: viewport.width, height: viewport.height, items, charCount, ocr: false };
      pages.push(extracted);
      await onPage?.(pageNumber, pdf.numPages, extracted);
    }
    return { pageCount: pdf.numPages, pages, needsOcr: ocrPages };
  } catch (error) {
    throw mapPdfExtractionError(error);
  } finally {
    await loading.destroy();
  }
}
