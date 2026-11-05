import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { renderCitedMarkdown } from "./citation-markdown";

describe("citation markdown", () => {
  it("renders numbered clickable chips, mutes automatic matches, and leaves no empty citation chip", () => {
    const html = renderToStaticMarkup(renderCitedMarkdown(
      "Use the cited rules [1] [] and deadline [2].",
      [
        { n: 1, documentId: "doc-1", page: 3, auto: true },
        { n: 2, documentId: "doc-1", page: 5 },
      ],
      vi.fn(),
    ));
    expect(html.match(/<button/g)).toHaveLength(2);
    expect(html).toContain("Matched automatically");
    expect(html).toContain(">[1]</button>");
    expect(html).toContain(">[2]</button>");
    expect(html).not.toContain(">[]</button>");
  });
});
