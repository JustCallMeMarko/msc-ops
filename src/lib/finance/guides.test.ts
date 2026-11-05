import { describe, expect, it } from "vitest";
import { FINANCE_GUIDES } from "./guides";

describe("Finance guide citations", () => {
  it("cites a real manual page or explicitly marks org practice", () => {
    expect(FINANCE_GUIDES).toHaveLength(9);
    for (const guide of FINANCE_GUIDES) {
      expect(guide.steps.length).toBeGreaterThan(0);
      for (const step of guide.steps) {
        if (step.citation) {
          expect(step.citation.doc).toBe("RSO Manual 26-27");
          expect(step.citation.page).toBeGreaterThanOrEqual(1);
          expect(step.citation.page).toBeLessThanOrEqual(39);
          expect(step.citation.section.trim()).not.toBe("");
        } else expect(step.why).toBe("Org practice");
      }
    }
  });
});
