import { describe, expect, it } from "vitest";
import { isReadableHeading, sectionSuggestionLabel, suggestionHeading } from "./headings";

describe("document heading filters", () => {
  it("rejects short OCR fragments and one-word titles from the outline", () => {
    expect(isReadableHeading("BB FE BE")).toBe(false);
    expect(isReadableHeading("HANDBOOK")).toBe(false);
    expect(isReadableHeading("A. BOOTH ACTIVATION")).toBe(true);
  });

  it("keeps real section suggestions compact and readable", () => {
    expect(suggestionHeading("C. BOOTH ACTIVATION")).toBe(true);
    expect(suggestionHeading("D. POST-ACTIVITY REPORT")).toBe(true);
    expect(suggestionHeading("E. FUNDRAISING")).toBe(true);
    expect(sectionSuggestionLabel("D. POST-ACTIVITY REPORT")).toBe("Post-activity report");
    expect(sectionSuggestionLabel("D. AUTHORITY OF SDAO")).toBe("Authority of SDAO");
    expect(sectionSuggestionLabel("A. RSO AND SCOA GUIDANCE FOR PAR CBL NU OSA"))
      .toBe("RSO and SCOA guidance for PAR CBL NU OSA");
  });
});
