import { describe, expect, it } from "vitest";
import { formatQuery, parseQuery } from "./filter-bar";

describe("parseQuery", () => {
  it("parses status, key/value, quoted, date, assignee, and free-text filters", () => {
    expect(parseQuery('is:open owner:"Jane Doe" due:<7d assignee:@me launch checklist')).toEqual({
      filters: [
        { key: "is", op: "=", value: "open" },
        { key: "owner", op: "=", value: "Jane Doe" },
        { key: "due", op: "<", value: "7d" },
        { key: "assignee", op: "=", value: "@me" },
      ],
      text: "launch checklist",
    });
    expect(parseQuery("due:>2026-11-20").filters).toEqual([{ key: "due", op: ">", value: "2026-11-20" }]);
  });

  it("round-trips through a serialized query", () => {
    const parsed = parseQuery('is:closed owner:"Jane Doe" due:<7d budget:high event plan');
    expect(parseQuery(formatQuery(parsed))).toEqual(parsed);
  });
});
