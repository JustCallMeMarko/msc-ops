import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LanguageModel } from "ai";

vi.mock("ai", async (importOriginal) => ({
  ...(await importOriginal<typeof import("ai")>()),
  generateText: vi.fn(),
}));

import { generateText } from "ai";
import { aiMap, buildMappingPrompt, heuristicMap } from "./mapper";
import type { TemplateStructure } from "./types";

const structure: TemplateStructure = {
  format: "xlsx",
  warnings: [],
  targets: [
    { id: "s:Report!B2", label: "Total Expenses:", kind: "cell" },
    { id: "s:Report!B3", label: "Event Date:", kind: "cell" },
  ],
};

describe("template AI mapping", () => {
  beforeEach(() => vi.mocked(generateText).mockReset());

  it("sends only target labels and dictionary keys, never sample cell values", () => {
    const prompt = buildMappingPrompt(structure);
    expect(prompt).toContain("Total Expenses:");
    expect(prompt).not.toContain("SAMPLE SECRET");
    expect(prompt).not.toContain("98765");
  });

  it("maps repeating targets from their columns without selecting scalar fields", () => {
    const rows: TemplateStructure = {
      format: "xlsx",
      warnings: [],
      targets: [{
        id: "s:Proposal!rows:4",
        label: "Expense · Estimated Amount",
        kind: "rows",
        columns: [{ index: 0, label: "Expense" }, { index: 1, label: "Estimated Amount" }],
      }],
    };
    expect(heuristicMap(rows)["s:Proposal!rows:4"]?.field).toBe("budget.lines[]");
  });

  it("drops unknown fields and lets valid AI mappings override the heuristic", async () => {
    vi.mocked(generateText).mockResolvedValue({
      output: { "s:Report!B2": "ledger.total_expense", "s:Report!B3": "not.a.field" },
    } as never);
    const result = await aiMap(structure, {} as LanguageModel);
    expect(result.usedAI).toBe(true);
    expect(result.mapping["s:Report!B2"]?.field).toBe("ledger.total_expense");
    expect(result.mapping["s:Report!B3"]?.field).toBe("event.date");
  });

  it("retries invalid JSON once then falls back to label matching", async () => {
    vi.mocked(generateText)
      .mockRejectedValueOnce(new Error("Invalid JSON"))
      .mockRejectedValueOnce(new Error("Invalid JSON"));
    const result = await aiMap(structure, {} as LanguageModel);
    expect(generateText).toHaveBeenCalledTimes(2);
    expect(result.usedAI).toBe(false);
    expect(result.mapping["s:Report!B2"]?.field).toBe("ledger.total_expense");
  });
});
