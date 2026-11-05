import { cp, mkdir, readdir, copyFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const publicDir = path.join(root, "public");
const pdfjs = path.join(root, "node_modules", "pdfjs-dist");
const require = createRequire(import.meta.url);
const reactPdfRequire = createRequire(require.resolve("react-pdf"));
const reactPdfWorker = reactPdfRequire.resolve("pdfjs-dist/build/pdf.worker.min.mjs");
const reactPdfPdfjs = path.dirname(path.dirname(reactPdfWorker));
const tesseract = path.join(root, "node_modules", "tesseract.js");
const core = path.join(root, "node_modules", "tesseract.js-core");
const targetPdf = path.join(publicDir, "pdfjs");
const targetReactPdf = path.join(targetPdf, "react-pdf");
const targetTess = path.join(publicDir, "tesseract");

await mkdir(targetPdf, { recursive: true });
await mkdir(targetReactPdf, { recursive: true });
await mkdir(path.join(targetTess, "core"), { recursive: true });
await mkdir(path.join(targetTess, "lang"), { recursive: true });
await copyFile(path.join(pdfjs, "build", "pdf.worker.min.mjs"), path.join(targetPdf, "pdf.worker.min.mjs"));
await cp(path.join(pdfjs, "cmaps"), path.join(targetPdf, "cmaps"), { recursive: true });
await cp(path.join(pdfjs, "standard_fonts"), path.join(targetPdf, "standard_fonts"), { recursive: true });
await copyFile(reactPdfWorker, path.join(targetReactPdf, "pdf.worker.min.mjs"));
await cp(path.join(reactPdfPdfjs, "cmaps"), path.join(targetReactPdf, "cmaps"), { recursive: true });
await cp(path.join(reactPdfPdfjs, "standard_fonts"), path.join(targetReactPdf, "standard_fonts"), { recursive: true });
await copyFile(path.join(tesseract, "dist", "worker.min.js"), path.join(targetTess, "worker.min.js"));

for (const file of await readdir(core)) {
  if (/\.(?:js|wasm)$/.test(file)) {
    await copyFile(path.join(core, file), path.join(targetTess, "core", file));
  }
}
for (const language of ["eng", "fil"]) {
  await copyFile(
    path.join(root, "node_modules", "@tesseract.js-data", language, "4.0.0", `${language}.traineddata.gz`),
    path.join(targetTess, "lang", `${language}.traineddata.gz`),
  );
}
