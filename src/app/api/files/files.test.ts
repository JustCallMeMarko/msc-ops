import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import JSZip from "jszip";

process.env.MSC_DATA_DIR = "memory://";

const pdfBytes = Buffer.from("%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n");
let filesApi: typeof import("./route");
let contentApi: typeof import("./[id]/content/route");
let fileApi: typeof import("./[id]/route");
let restoreApi: typeof import("./[id]/restore/route");
let getDb: typeof import("@/lib/db/client").getDb;
let files: typeof import("@/lib/db/schema").files;
let fileLinks: typeof import("@/lib/db/schema").fileLinks;

beforeAll(async () => {
  [filesApi, contentApi, fileApi, restoreApi] = await Promise.all([
    import("./route"),
    import("./[id]/content/route"),
    import("./[id]/route"),
    import("./[id]/restore/route"),
  ]);
  ({ getDb } = await import("@/lib/db/client"));
  ({ files, fileLinks } = await import("@/lib/db/schema"));
});

beforeEach(async () => {
  const { db } = await getDb();
  await db.delete(fileLinks);
  await db.delete(files);
});

afterAll(async () => {
  const { closeDb } = await import("@/lib/db/client");
  await closeDb();
});

function uploadRequest(
  name = "policy.pdf",
  entity?: { entityType: string; entityId: string },
  bytes: Uint8Array = pdfBytes,
) {
  const form = new FormData();
  const safeBytes = new Uint8Array(bytes.byteLength);
  safeBytes.set(bytes);
  form.append("file", new File([safeBytes.buffer as ArrayBuffer], name, { type: "application/octet-stream" }));
  form.append("kind", "manual");
  if (entity) {
    form.append("entityType", entity.entityType);
    form.append("entityId", entity.entityId);
    form.append("role", "attachment");
  }
  return new Request("http://localhost/api/files", { method: "POST", body: form });
}

describe("file API", () => {
  it("deduplicates active content and reuses the existing file id", async () => {
    const firstResponse = await filesApi.POST(uploadRequest());
    const first = await firstResponse.json() as { id: string; reused: boolean };
    expect(firstResponse.status).toBe(201);
    expect(first.reused).toBe(false);
    const secondResponse = await filesApi.POST(uploadRequest("renamed.pdf"));
    const second = await secondResponse.json() as { id: string; reused: boolean };
    expect(secondResponse.status).toBe(200);
    expect(second.id).toBe(first.id);
    expect(second.reused).toBe(true);
  });

  it("serves PDF inline with sandbox, nosniff, and RFC 5987 filename headers", async () => {
    const response = await filesApi.POST(uploadRequest("policy résumé.pdf"));
    const row = await response.json() as { id: string };
    const content = await contentApi.GET(new Request("http://localhost"), { params: Promise.resolve({ id: row.id }) });
    expect(content.headers.get("Content-Type")).toBe("application/pdf");
    expect(content.headers.get("Content-Disposition")).toContain("inline;");
    expect(content.headers.get("Content-Disposition")).toContain("filename*=UTF-8''policy%20r%C3%A9sum%C3%A9.pdf");
    expect(content.headers.get("Content-Security-Policy")).toContain("sandbox; default-src 'none'");
    expect(content.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect((await content.arrayBuffer()).byteLength).toBe(pdfBytes.byteLength);
  });

  it("forces SVG and Office documents to attachment disposition", async () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><text>Safe</text></svg>');
    const svgResponse = await filesApi.POST(uploadRequest("logo.svg", undefined, svg));
    const svgFile = await svgResponse.json() as { id: string };
    const svgContent = await contentApi.GET(new Request("http://localhost"), { params: Promise.resolve({ id: svgFile.id }) });
    expect(svgContent.headers.get("Content-Disposition")).toMatch(/^attachment;/);

    const archive = new JSZip();
    archive.file("[Content_Types].xml", '<Types><Override ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml" /></Types>');
    archive.file("word/document.xml", "<document/>");
    const docx = await archive.generateAsync({ type: "uint8array" });
    const docxResponse = await filesApi.POST(uploadRequest("minutes.docx", undefined, docx));
    const docxFile = await docxResponse.json() as { id: string };
    const docxContent = await contentApi.GET(new Request("http://localhost"), { params: Promise.resolve({ id: docxFile.id }) });
    expect(docxContent.headers.get("Content-Disposition")).toMatch(/^attachment;/);
  });

  it("soft-deletes and restores files", async () => {
    const response = await filesApi.POST(uploadRequest());
    const row = await response.json() as { id: string };
    const deleted = await fileApi.DELETE(new Request("http://localhost", { method: "DELETE" }), { params: Promise.resolve({ id: row.id }) });
    expect(deleted.status).toBe(200);
    const restored = await restoreApi.POST(new Request("http://localhost", { method: "POST" }), { params: Promise.resolve({ id: row.id }) });
    expect(restored.status).toBe(200);
  });
});
