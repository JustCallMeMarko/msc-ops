import JSZip from "jszip";
import { fileTypeFromBuffer } from "file-type";
import { describe, expect, it } from "vitest";
import {
  dimensionsFromImageHeader,
  FileValidationError,
  stripImageMetadata,
  validateFileContent,
} from "./validation";

const onePixelPng = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/VxkAAAAASUVORK5CYII=", "base64");
const onePixelJpeg = Buffer.from([
  0xff, 0xd8, 0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x01, 0x00, 0x01, 0x01, 0x01, 0x11, 0x00, 0xff, 0xd9,
]);

function pngChunk(type: string, data: Uint8Array): Buffer {
  const chunk = Buffer.alloc(data.byteLength + 12);
  chunk.writeUInt32BE(data.byteLength, 0);
  chunk.write(type, 4, "ascii");
  Buffer.from(data).copy(chunk, 8);
  return chunk;
}

function jpegSegment(marker: number, payload: Uint8Array): Buffer {
  const segment = Buffer.alloc(payload.byteLength + 4);
  segment[0] = 0xff;
  segment[1] = marker;
  segment.writeUInt16BE(payload.byteLength + 2, 2);
  Buffer.from(payload).copy(segment, 4);
  return segment;
}

describe("file content validation and metadata stripping", () => {
  it("removes JPEG EXIF/GPS and APP13 metadata while preserving image type and dimensions", async () => {
    const exif = jpegSegment(0xe1, Buffer.from("Exif\0\0GPS DATA"));
    const app13 = jpegSegment(0xed, Buffer.from("Photoshop metadata"));
    const withMetadata = Buffer.concat([onePixelJpeg.subarray(0, 2), exif, app13, onePixelJpeg.subarray(2)]);
    const stripped = stripImageMetadata(withMetadata, "image/jpeg");
    expect(Buffer.from(stripped).includes(Buffer.from("Exif"))).toBe(false);
    expect((await fileTypeFromBuffer(stripped))?.mime).toBe("image/jpeg");
    expect(dimensionsFromImageHeader(stripped, "image/jpeg")).toEqual({ width: 1, height: 1 });
  });

  it("removes PNG EXIF and text chunks while preserving image type and dimensions", async () => {
    const exif = pngChunk("eXIf", Buffer.from("GPS coordinates"));
    const text = pngChunk("tEXt", Buffer.from("Location\0Somewhere"));
    const iend = onePixelPng.indexOf(Buffer.from("IEND")) - 4;
    const withMetadata = Buffer.concat([onePixelPng.subarray(0, iend), exif, text, onePixelPng.subarray(iend)]);
    const stripped = stripImageMetadata(withMetadata, "image/png");
    expect(Buffer.from(stripped).includes(Buffer.from("GPS coordinates"))).toBe(false);
    expect((await fileTypeFromBuffer(stripped))?.mime).toBe("image/png");
    expect(dimensionsFromImageHeader(stripped, "image/png")).toEqual({ width: 1, height: 1 });
  });

  it("rejects content that does not match its extension", async () => {
    await expect(validateFileContent(onePixelPng, "renamed.pdf")).rejects.toThrow("File content is not a PDF.");
    const executable = Buffer.alloc(80);
    executable.write("MZ", 0, "ascii");
    executable.writeUInt32LE(64, 60);
    executable.write("PE\0\0", 64, "binary");
    await expect(validateFileContent(executable, "invoice.pdf")).rejects.toThrow("File content is not a PDF.");
  });

  it("sanitizes SVG and requires UTF-8 text without NUL bytes", async () => {
    const sanitized = await validateFileContent(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script><text>ok</text></svg>'), "art.svg");
    expect(sanitized.mime).toBe("image/svg+xml");
    expect(Buffer.from(sanitized.bytes).toString()).not.toContain("<script");
    await expect(validateFileContent(Buffer.from([0x41, 0x00, 0x42]), "notes.txt")).rejects.toThrow("NUL");
  });

  it("accepts Office documents only when the ZIP contains the expected content type", async () => {
    const archive = new JSZip();
    archive.file("[Content_Types].xml", '<Types><Override ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml" /></Types>');
    archive.file("word/document.xml", "<document/>");
    const bytes = await archive.generateAsync({ type: "uint8array" });
    const validated = await validateFileContent(bytes, "minutes.docx");
    expect(validated.mime).toBe("application/vnd.openxmlformats-officedocument.wordprocessingml.document");
  });

  it("rejects a ZIP with an oversized declared uncompressed entry", async () => {
    const archive = new JSZip();
    archive.file("[Content_Types].xml", '<Types><Override ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml" /></Types>');
    archive.file("word/document.xml", "<document/>");
    const bytes = Buffer.from(await archive.generateAsync({ type: "uint8array" }));
    const central = bytes.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
    expect(central).toBeGreaterThanOrEqual(0);
    const local = bytes.readUInt32LE(central + 42);
    const expandedBytes = 101 * 1024 * 1024;
    bytes.writeUInt32LE(expandedBytes, central + 24);
    bytes.writeUInt32LE(expandedBytes, local + 22);
    await expect(validateFileContent(bytes, "bomb.docx")).rejects.toBeInstanceOf(FileValidationError);
  });
});
