export type PageItem = {
  str: string;
  transform?: number[];
  width?: number;
  height?: number;
  hasEOL?: boolean;
};

export type PageItems = { page: number; items: PageItem[] };
export type ChunkSegment = {
  page: number;
  startItem: number;
  startOffset: number;
  endItem: number;
  endOffset: number;
};
export type DocumentChunk = { ord: number; headingPath: string; text: string; segments: ChunkSegment[] };
type Heading = { kind: "article" | "section" | "label"; value: string };

const LIGATURES: Record<string, string> = {
  "\uFB00": "ff", "\uFB01": "fi", "\uFB02": "fl", "\uFB03": "ffi", "\uFB04": "ffl", "\uFB05": "st", "\uFB06": "st",
};

export function normalizeChunkText(value: string): string {
  return value
    .replace(/[ﬀﬁﬂﬃﬄﬅﬆ]/g, (ligature) => LIGATURES[ligature] ?? ligature)
    .replace(/-\s*\n\s*/g, "")
    .replace(/[ \t]*\n[ \t]*/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function needsOcr(charCount: number): boolean {
  return charCount < 40;
}

function heading(line: string): Heading | null {
  const text = line.trim().replace(/\s+(?:\.{2,}|_{2,}|-{2,})\s*\d*\s*$/, "").trim();
  if (/^ARTICLE\s+[IVXLC]+\b/i.test(text)) return { kind: "article", value: text };
  if (/^Section\s+\d+\b/i.test(text)) return { kind: "section", value: text };
  if (/^[A-Z]\.\s+[A-Z ]{3,}$/.test(text)) return { kind: "label", value: text };
  if (text.length >= 4 && text === text.toLocaleUpperCase("en") && /[A-Z]/.test(text)) {
    return { kind: "label", value: text };
  }
  return null;
}

function headingsInPage(items: PageItem[]): { byStart: Map<number, Heading>; indexes: Set<number> } {
  const byStart = new Map<number, Heading>();
  const indexes = new Set<number>();
  let line: number[] = [];
  let lineY: number | undefined;

  const finishLine = () => {
    if (!line.length) return;
    const value = normalizeChunkText(line.map((index) => items[index]?.str ?? "").join(" "));
    const found = heading(value);
    if (found) {
      byStart.set(line[0]!, found);
      for (const index of line) indexes.add(index);
    }
    line = [];
    lineY = undefined;
  };

  items.forEach((item, index) => {
    const y = item.transform?.[5];
    const changedLine = line.length > 0 && (
      (y !== undefined && lineY !== undefined && Math.abs(y - lineY) > 1) ||
      (y === undefined) !== (lineY === undefined)
    );
    if (changedLine) finishLine();
    if (!line.length) lineY = y;
    line.push(index);
    if (item.hasEOL || y === undefined) finishLine();
  });
  finishLine();
  return { byStart, indexes };
}

function updateHeadingPath(path: string[], found: Heading): string[] {
  if (found.kind === "article") return [found.value];
  const ancestors = path.filter((part) => /^ARTICLE\b/i.test(part) || /^Section\b/i.test(part));
  if (found.kind === "section") return [...ancestors.filter((part) => /^ARTICLE\b/i.test(part)), found.value];
  return [...ancestors, found.value];
}

function splitLongItem(str: string, limit: number): Array<{ start: number; end: number }> {
  const ranges: Array<{ start: number; end: number }> = [];
  let start = 0;
  while (start < str.length) {
    const hardEnd = Math.min(start + limit, str.length);
    if (hardEnd === str.length) {
      ranges.push({ start, end: hardEnd });
      break;
    }
    const sentenceEnd = Math.max(str.lastIndexOf(". ", hardEnd), str.lastIndexOf("; ", hardEnd));
    const end = sentenceEnd > start ? sentenceEnd + 1 : hardEnd;
    ranges.push({ start, end });
    start = Math.max(start + 1, end - 80);
    while (str[start] === " ") start += 1;
  }
  return ranges;
}

export function chunkPages(pages: PageItems[], target = 2400, max = 3200): DocumentChunk[] {
  const output: DocumentChunk[] = [];
  let path: string[] = [];
  let pending: Array<{ page: number; item: number; start: number; end: number; text: string; isHeading: boolean }> = [];
  let pendingLength = 0;
  const flush = () => {
    if (!pending.length) return;
    const segments = pending.map(({ page, item, start, end }) => ({
      page, startItem: item, startOffset: start, endItem: item, endOffset: end,
    }));
    output.push({
      ord: output.length,
      headingPath: path.join(" › "),
      text: normalizeChunkText(pending.map((part) => part.text).join("\n")),
      segments,
    });
    pending = [];
    pendingLength = 0;
  };

  for (const page of pages) {
    const pageHeadings = headingsInPage(page.items);
    page.items.forEach((item, itemIndex) => {
      const str = item.str ?? "";
      const trimmed = str.trim();
      if (!trimmed) return;
      const foundHeading = pageHeadings.byStart.get(itemIndex);
      if (foundHeading) {
        if (pending.some((part) => !part.isHeading)) flush();
        path = updateHeadingPath(path, foundHeading);
      }

      const pieces = str.length > max
        ? splitLongItem(str, max).map((range) => ({ ...range, text: str.slice(range.start, range.end) }))
        : [{ start: 0, end: str.length, text: str }];
      for (const piece of pieces) {
        const nextLength = pendingLength + piece.text.length + (pending.length ? 1 : 0);
        if (pending.length && nextLength > target) flush();
        pending.push({ page: page.page, item: itemIndex, ...piece, isHeading: pageHeadings.indexes.has(itemIndex) });
        pendingLength += piece.text.length + (pendingLength ? 1 : 0);
        if (pendingLength >= max) flush();
      }
    });
  }
  flush();
  return output;
}

export function sliceChunkFromPages(chunk: DocumentChunk, pages: PageItems[]): string {
  const sliced = chunk.segments.map((segment) => {
    const page = pages.find((candidate) => candidate.page === segment.page);
    const item = page?.items[segment.startItem];
    return item?.str.slice(segment.startOffset, segment.endOffset) ?? "";
  });
  return normalizeChunkText(sliced.join("\n"));
}
