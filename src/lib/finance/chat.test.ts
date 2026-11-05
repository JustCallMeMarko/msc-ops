import { describe, expect, it } from "vitest";
import { stripInvalidGuideCitations, parseEntryDraft } from "./chat";

describe("Finance chat citations and entry drafts", () => {
  it("removes unknown citation ids and records valid sources", () => {
    expect(stripInvalidGuideCitations("Use [bank_account:prepare] [made_up:step].")).toEqual({
      text: "Use [bank_account:prepare] .",
      sourceIds: ["bank_account:prepare"],
    });
  });
  it("validates fenced entry JSON and leaves invalid blocks as plain text", () => {
    const good = parseEntryDraft('Entry:\n```entry\n{"accountId":"00000000-0000-4000-8000-000000000001","eventId":null,"kind":"expense","category":"food","amountCentavos":1200,"occurredOn":"2026-11-04","description":"Lunch","orNumber":"","counterparty":""}\n```');
    expect(good.draft?.amountCentavos).toBe(1200);
    expect(good.text).toBe("Entry:");
    const bad = parseEntryDraft("```entry\n{bad}\n```");
    expect(bad.draft).toBeNull();
    expect(bad.invalidBlock).toBe(true);
    expect(bad.text).toContain("{bad}");
  });
});
