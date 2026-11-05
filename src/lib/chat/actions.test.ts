import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LanguageModel } from "ai";
import { generateText } from "ai";
import { chatActionSchema, parseChatAction, proposeChatAction } from "./actions";

vi.mock("ai", async (importOriginal) => ({
  ...(await importOriginal<typeof import("ai")>()),
  generateText: vi.fn(),
}));

describe("general chat actions", () => {
  beforeEach(() => vi.mocked(generateText).mockReset());

  it("validates a fenced action and removes it from the answer text", () => {
    const result = parseChatAction(`I can prepare that.\n\n\`\`\`action\n{"type":"generate_doc","templateKind":"liquidation","eventRef":"Tech Summit"}\n\`\`\``);
    expect(result.action).toEqual({ type: "generate_doc", templateKind: "liquidation", eventRef: "Tech Summit" });
    expect(result.text).toBe("I can prepare that.");
    expect(result.invalid).toBe(false);
  });

  it("marks malformed actions for one retry and rejects unknown action types", () => {
    expect(parseChatAction("```action\n{bad json}\n```").invalid).toBe(true);
    expect(chatActionSchema.safeParse({ type: "delete_everything" }).success).toBe(false);
  });

  it("keeps the draft ledger payload in the existing finance entry schema", () => {
    const result = chatActionSchema.safeParse({
      type: "draft_ledger_entry",
      entry: {
        kind: "expense",
        category: "printing",
        amountCentavos: 120000,
        occurredOn: "2026-05-10",
        description: "Event materials",
      },
    });
    expect(result.success).toBe(true);
  });

  it("retries a malformed action response once and returns the validated action", async () => {
    const action = { type: "generate_doc", templateKind: "liquidation", eventRef: "Past Career Forum" } as const;
    vi.mocked(generateText)
      .mockRejectedValueOnce(new Error("Invalid JSON"))
      .mockResolvedValueOnce({ output: { action } } as never);
    const result = await proposeChatAction(
      {} as LanguageModel,
      "Make the liquidation report for Past Career Forum",
      '{"events":["Past Career Forum"]}',
    );
    expect(generateText).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ action, invalid: false });
  });

  it("falls back after two malformed action responses", async () => {
    vi.mocked(generateText)
      .mockRejectedValueOnce(new Error("Invalid JSON"))
      .mockRejectedValueOnce(new Error("Invalid JSON"));
    const result = await proposeChatAction({} as LanguageModel, "Make a report", "{}");
    expect(generateText).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ action: null, invalid: true });
  });
});
