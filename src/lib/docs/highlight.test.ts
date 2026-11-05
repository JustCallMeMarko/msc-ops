import { describe, expect, it } from "vitest";
import { escapeDocumentText, renderDocumentHighlight } from "./highlight";

describe("safe document highlighting", () => {
  it("escapes untrusted markup before adding a highlight", () => {
    const text = "<img src=x onerror=alert(1)>";
    expect(escapeDocumentText(text)).toBe("&lt;img src=x onerror=alert(1)&gt;");
    expect(renderDocumentHighlight(text, 0, 4)).toBe('<mark class="cite-hl">&lt;img</mark> src=x onerror=alert(1)&gt;');
  });
});
