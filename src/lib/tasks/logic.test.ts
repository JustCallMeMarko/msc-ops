import { describe, expect, it } from "vitest";
import { buildDigest, buildNudge, nextCheckin, taskState, toTaskFilter } from "./logic";

const date = (value: string) => new Date(value);

describe("nextCheckin", () => {
  it("schedules at 09:00 Manila on a weekday", () => {
    const result = nextCheckin({
      from: date("2025-11-10T01:00:00.000Z"),
      everyDays: 3,
      dueAt: null,
      now: date("2025-11-10T01:00:00.000Z"),
    });
    expect(result.toISOString()).toBe("2025-11-13T01:00:00.000Z");
  });

  it("moves a Saturday check-in to Monday", () => {
    const result = nextCheckin({
      from: date("2025-11-13T01:00:00.000Z"),
      everyDays: 2,
      dueAt: null,
      now: date("2025-11-13T01:00:00.000Z"),
    });
    expect(result.toISOString()).toBe("2025-11-17T01:00:00.000Z");
  });

  it("clamps to the working day before a future deadline", () => {
    const result = nextCheckin({
      from: date("2025-11-10T01:00:00.000Z"),
      everyDays: 10,
      dueAt: date("2025-11-20T01:00:00.000Z"),
      now: date("2025-11-10T01:00:00.000Z"),
    });
    expect(result.toISOString()).toBe("2025-11-19T01:00:00.000Z");
  });

  it("does not clamp to an already-past deadline", () => {
    const result = nextCheckin({
      from: date("2025-11-10T01:00:00.000Z"),
      everyDays: 3,
      dueAt: date("2025-11-09T01:00:00.000Z"),
      now: date("2025-11-10T01:00:00.000Z"),
    });
    expect(result.toISOString()).toBe("2025-11-13T01:00:00.000Z");
  });

  it("never returns before the next 09:00 Manila time", () => {
    const now = date("2025-11-10T05:30:00.000Z");
    const result = nextCheckin({ from: now, everyDays: 1, dueAt: null, now });
    expect(result.toISOString()).toBe("2025-11-11T01:00:00.000Z");
  });

  it("handles a month boundary", () => {
    const result = nextCheckin({
      from: date("2025-11-29T01:00:00.000Z"),
      everyDays: 2,
      dueAt: null,
      now: date("2025-11-29T01:00:00.000Z"),
    });
    expect(result.toISOString()).toBe("2025-12-01T01:00:00.000Z");
  });
});

describe("taskState", () => {
  const now = date("2025-11-10T01:00:00.000Z");
  const base = { status: "todo", dueAt: null, nextCheckinAt: null, snoozedUntil: null };
  it.each([
    [{ ...base, status: "done" }, "done"],
    [{ ...base, snoozedUntil: date("2025-11-11T01:00:00.000Z") }, "snoozed"],
    [{ ...base, dueAt: date("2025-11-09T01:00:00.000Z"), nextCheckinAt: date("2025-11-09T01:00:00.000Z") }, "overdue"],
    [{ ...base, nextCheckinAt: date("2025-11-09T01:00:00.000Z") }, "checkin_due"],
    [{ ...base, dueAt: date("2025-11-12T01:00:00.000Z") }, "due_soon"],
    [base, "ok"],
  ] as const)("returns %s", (task, expected) => {
    expect(taskState(task, now)).toBe(expected);
  });
});

describe("nudge and digest messages", () => {
  const now = date("2025-11-10T01:00:00.000Z");
  it("substitutes nudge variables and falls back for a missing member", () => {
    expect(buildNudge({ number: 12, title: "Plan booth", dueAt: null }, null, null, "{first_name} {task_ref}: {title} ({due}) {days_left}", now))
      .toBe("there #12: Plan booth (no deadline) no deadline");
  });

  it("sorts digest tasks and marks overdue items", () => {
    const message = buildDigest({ name: "Finance" }, [
      { number: 2, title: "Submit budget", status: "todo", dueAt: date("2025-11-13T01:00:00.000Z"), assignee: { name: "Ari" } },
      { number: 1, title: "Collect receipts", status: "todo", dueAt: date("2025-11-09T01:00:00.000Z") },
    ], now);
    expect(message.indexOf("#1")).toBeLessThan(message.indexOf("#2"));
    expect(message).toContain("⚠ overdue");
  });

  it("has a festive empty digest", () => {
    expect(buildDigest({ name: "Finance" }, [], now)).toBe("No open tasks 🎉");
  });
});

describe("task filter grammar", () => {
  it.each([
    ["committee:finance", { committees: ["finance"] }],
    ['assignee:"Alex Cruz"', { assignees: ["Alex Cruz"] }],
    ["status:blocked", { statuses: ["blocked"] }],
    ["priority:urgent", { priorities: ["urgent"] }],
    ["label:budget", { labels: ["budget"] }],
    ["due:<7d", { due: [{ op: "<", value: "7d" }] }],
    ["due:>2025-01-01", { due: [{ op: ">", value: "2025-01-01" }] }],
    ["is:overdue", { states: ["overdue"] }],
    ["is:checkin", { states: ["checkin"] }],
    ["is:open", { states: ["open"] }],
    ["is:closed", { states: ["closed"] }],
    ["committee:finance report", { committees: ["finance"], text: "report" }],
  ])("maps %s", (query, expected) => {
    expect(toTaskFilter(query)).toMatchObject(expected);
  });

  it("maps combined qualifiers and free text", () => {
    expect(toTaskFilter('committee:finance assignee:"Alex Cruz" status:blocked priority:high label:budget due:<7d is:overdue report'))
      .toMatchObject({
        committees: ["finance"], assignees: ["Alex Cruz"], statuses: ["blocked"], priorities: ["high"],
        labels: ["budget"], due: [{ op: "<", value: "7d" }], states: ["overdue"], text: "report",
      });
  });
});
