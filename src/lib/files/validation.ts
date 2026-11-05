import { extname } from "node:path";
import DOMPurify from "isomorphic-dompurify";
import { fileTypeFromBuffer } from "file-type";
import JSZip from "jszip";

export class FileValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FileValidationError";
  }
}

const EXTENSION_MIMES: Record<string, string> = {
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".mp4": "video/mp4",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".xlsm": "application/vnd.ms-excel.sheet.macroEnabled.12",
  ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
};

const OFFICE_MIMES = {
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  xlsm: "application/vnd.ms-excel.sheet.macroEnabled.12",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
} as const;

function decodeUtf8(bytes: Uint8Array): string {
  if (bytes.includes(0)) throw new FileValidationError("Text files cannot contain NUL bytes.");
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new FileValidationError("CSV and TXT files must be valid UTF-8.");
  }
}

function stripJpegMetadata(input: Uint8Array): Uint8Array {
  if (input.length < 4 || input[0] !== 0xff || input[1] !== 0xd8) return input;
  const parts: Uint8Array[] = [input.subarray(0, 2)];
  let offset = 2;
  while (offset < input.length) {
    if (input[offset] !== 0xff) {
      parts.push(input.subarray(offset));
      break;
    }
    const markerStart = offset;
    while (input[offset] === 0xff) offset += 1;
    const marker = input[offset];
    offset += 1;
    if (marker === 0xda) {
      parts.push(input.subarray(markerStart));
      break;
    }
    if (marker === 0xd9 || marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      parts.push(input.subarray(markerStart, offset));
      continue;
    }
    if (offset + 2 > input.length) throw new FileValidationError("Invalid JPEG segment.");
    const length = (input[offset] << 8) | input[offset + 1];
    const end = offset + length;
    if (length < 2 || end > input.length) throw new FileValidationError("Invalid JPEG segment length.");
    if (marker !== 0xe1 && marker !== 0xed) parts.push(input.subarray(markerStart, end));
    offset = end;
  }
  return Buffer.concat(parts);
}

function stripPngMetadata(input: Uint8Array): Uint8Array {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (input.length < 8 || !Buffer.from(input.subarray(0, 8)).equals(signature)) return input;
  const chunks: Uint8Array[] = [input.subarray(0, 8)];
  const remove = new Set(["eXIf", "tEXt", "iTXt", "zTXt"]);
  let offset = 8;
  while (offset + 12 <= input.length) {
    const length = Buffer.from(input.subarray(offset, offset + 4)).readUInt32BE(0);
    const end = offset + 12 + length;
    if (end > input.length) throw new FileValidationError("Invalid PNG chunk length.");
    const type = Buffer.from(input.subarray(offset + 4, offset + 8)).toString("ascii");
    if (!remove.has(type)) chunks.push(input.subarray(offset, end));
    offset = end;
    if (type === "IEND") break;
  }
  if (offset < input.length) chunks.push(input.subarray(offset));
  return Buffer.concat(chunks);
}

export function stripImageMetadata(bytes: Uint8Array, mime: string): Uint8Array {
  if (mime === "image/jpeg") return stripJpegMetadata(bytes);
  if (mime === "image/png") return stripPngMetadata(bytes);
  return bytes;
}

function expectedTypeError(extension: string): FileValidationError {
  const expected = extension.slice(1).toUpperCase();
  return new FileValidationError(`File content is not a ${expected}.`);
}

async function officeMime(bytes: Uint8Array, extension: string): Promise<string | null> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(bytes, { checkCRC32: false, createFolders: false });
  } catch {
    return null;
  }
  const entries = Object.values(zip.files) as Array<{ dir: boolean; _data?: { uncompressedSize?: number } }>;
  if (entries.length > 2_000) throw new FileValidationError("Office archive has too many entries (maximum 2,000).");
  const expanded = entries.reduce((total, entry) => total + (entry._data?.uncompressedSize ?? 0), 0);
  if (expanded > 100 * 1024 * 1024) throw new FileValidationError("Office archive expands beyond the 100 MB safety limit.");
  const contentTypes = zip.file("[Content_Types].xml");
  if (!contentTypes) return null;
  const xml = await contentTypes.async("string");
  if (xml.length > 1024 * 1024) throw new FileValidationError("Office content types file is too large.");
  const expected = extension.slice(1) as keyof typeof OFFICE_MIMES;
  const mime = OFFICE_MIMES[expected];
  const marker = expected === "xlsm" ? "macroEnabled.main+xml" : mime?.split(".").at(-1);
  if (!mime || !marker || !xml.includes(marker)) return null;
  return mime;
}

export async function validateFileContent(
  input: Uint8Array,
  originalName: string,
): Promise<{ bytes: Uint8Array; mime: string }> {
  const extension = extname(originalName).toLowerCase();
  if ((extension === ".doc" || extension === ".xls")
    && Buffer.from(input.subarray(0, 4)).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0]))) {
    throw new FileValidationError("Save it as .docx/.xlsx in Word/Excel first, then upload again.");
  }
  if (extension === ".ttf" || extension === ".otf") {
    const signature = Buffer.from(input.subarray(0, 4)).toString("ascii");
    const valid = extension === ".otf"
      ? signature === "OTTO"
      : signature === "\u0000\u0001\u0000\u0000" || signature === "true";
    if (!valid) throw expectedTypeError(extension);
    return { bytes: input, mime: extension === ".ttf" ? "font/ttf" : "font/otf" };
  }
  if (extension === ".svg") {
    const text = decodeUtf8(input);
    if (!/<svg(?:\s|>)/i.test(text)) throw new FileValidationError("File content is not an SVG.");
    const sanitized = DOMPurify.sanitize(text, { USE_PROFILES: { svg: true, svgFilters: true } });
    return { bytes: Buffer.from(sanitized, "utf8"), mime: "image/svg+xml" };
  }
  if (extension === ".csv" || extension === ".txt") {
    const text = decodeUtf8(input);
    return { bytes: Buffer.from(text, "utf8"), mime: extension === ".csv" ? "text/csv" : "text/plain" };
  }

  const detected = await fileTypeFromBuffer(input);
  if (!detected) throw new FileValidationError("Unsupported file content. Allowed: PDF, PNG, JPEG, WebP, GIF, MP4, Office documents, CSV, and TXT.");
  let mime = detected.mime;
  if ([".docx", ".xlsx", ".xlsm", ".pptx"].includes(extension)) {
    const office = await officeMime(input, extension);
    if (!office) throw expectedTypeError(extension);
    mime = office;
  }
  if (!Object.values(EXTENSION_MIMES).includes(mime)) {
    if (EXTENSION_MIMES[extension]) throw expectedTypeError(extension);
    throw new FileValidationError("Unsupported file content. Executables and archives are not allowed.");
  }
  const expected = EXTENSION_MIMES[extension];
  if (expected && expected !== mime) throw expectedTypeError(extension);
  return { bytes: stripImageMetadata(input, mime), mime };
}

export function dimensionsFromImageHeader(bytes: Uint8Array, mime: string): { width: number; height: number } | null {
  if (mime === "image/png" && bytes.length >= 24) {
    return { width: Buffer.from(bytes).readUInt32BE(16), height: Buffer.from(bytes).readUInt32BE(20) };
  }
  if (mime === "image/jpeg") {
    let offset = 2;
    while (offset + 4 < bytes.length) {
      if (bytes[offset] !== 0xff) break;
      const marker = bytes[offset + 1];
      const length = (bytes[offset + 2] << 8) | bytes[offset + 3];
      if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
        return { height: (bytes[offset + 5] << 8) | bytes[offset + 6], width: (bytes[offset + 7] << 8) | bytes[offset + 8] };
      }
      offset += 2 + length;
    }
  }
  return null;
}
