import { describe, expect, it } from "vitest";
import { dateQuickPicks, toManilaDueDate } from "./date-picker";

describe("DatePicker dates", () => {
  it("saves the picked Manila day at 23:59", () => {
    const picked = new Date(2025, 10, 13, 12);
    expect(toManilaDueDate(picked).toISOString()).toBe("2025-11-13T15:59:00.000Z");
  });

  it("offers the four quick picks in Manila calendar time", () => {
    const picks = dateQuickPicks(new Date("2025-11-10T20:00:00.000Z"));
    expect(picks.map(({ label, date }) => [label, date.getFullYear(), date.getMonth(), date.getDate()])).toEqual([
      ["Today", 2025, 10, 11],
      ["Tomorrow", 2025, 10, 12],
      ["Next Mon", 2025, 10, 17],
      ["+1 week", 2025, 10, 18],
    ]);
  });
});
