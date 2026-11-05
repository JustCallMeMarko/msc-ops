import { describe, expect, it } from "vitest";
import { chunkPages, needsOcr, normalizeChunkText, sliceChunkFromPages } from "./chunker";

describe("document chunking", () => {
  it("tracks headings and preserves normalized text through source segments", () => {
    const pages = [
      { page: 1, items: [{ str: "ARTICLE III" }, { str: "Section 2" }, { str: "exam-" }, { str: "ple of ﬁnance" }] },
      { page: 2, items: [{ str: "A. BANK PROVIDER" }, { str: "China Bank shared and savings account." }] },
      { page: 3, items: [{ str: "Three signatories are required." }] },
    ];
    const chunks = chunkPages(pages, 2400, 3200);
    expect(chunks.map((chunk) => chunk.headingPath)).toEqual([
      "ARTICLE III › Section 2",
      "ARTICLE III › Section 2 › A. BANK PROVIDER",
    ]);
    expect(chunks[0]?.text).toContain("example of finance");
    expect(chunks[1]?.segments.map((segment) => segment.page)).toContain(3);
    for (const chunk of chunks) expect(sliceChunkFromPages(chunk, pages)).toBe(chunk.text);
  });

  it("normalizes ligatures and detects pages that need OCR", () => {
    expect(normalizeChunkText("office ﬁle-\nname")).toBe("office filename");
    expect(needsOcr(39)).toBe(true);
    expect(needsOcr(40)).toBe(false);
  });

  it("groups heading items by line and replaces prior labels in the heading path", () => {
    const line = (y: number, values: string[]) => values.map((str, index) => ({
      str,
      transform: [1, 0, 0, 1, 0, y],
      hasEOL: index === values.length - 1,
    }));
    const pages = [{
      page: 1,
      items: [
        ...line(700, ["ARTICLE", "III"]),
        ...line(680, ["Section", "2"]),
        ...line(660, ["Overview"]),
        ...line(640, ["A.", "BANK PROVIDER"]),
        ...line(620, ["China Bank"]),
        ...line(600, ["GENERAL", "POLICIES"]),
        ...line(580, ["Details"]),
        ...line(560, ["RECORDS"]),
        ...line(540, ["Keep receipts"]),
      ],
    }];
    const chunks = chunkPages(pages);

    expect(chunks.map((chunk) => chunk.headingPath)).toEqual([
      "ARTICLE III › Section 2",
      "ARTICLE III › Section 2 › A. BANK PROVIDER",
      "ARTICLE III › Section 2 › GENERAL POLICIES",
      "ARTICLE III › Section 2 › RECORDS",
    ]);
    for (const chunk of chunks) expect(sliceChunkFromPages(chunk, pages)).toBe(chunk.text);
  });

  it("trims dotted page leaders from OCR heading paths", () => {
    const items = ["B.", "MISSION", "......................................................................................................", "4"]
      .map((str, index, line) => ({
        str,
        transform: [1, 0, 0, 1, 0, 700],
        hasEOL: index === line.length - 1,
      }));

    expect(chunkPages([{ page: 1, items }])[0]?.headingPath).toBe("B. MISSION");
  });
});
