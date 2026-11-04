import { describe, expect, it } from "vitest";
import {
  announcementGuard,
  checklistTemplate,
  computeDeadline,
  generateChecklist,
  lateParWarning,
  parseLumaCsv,
  renderAnnouncement,
  rescheduleChecklist,
  type DeadlineRule,
  type EventRecord,
} from "./logic";

const defaultEvent: EventRecord = {
  name: "MSC Summit",
  type: "on_campus",
  startsAt: new Date("2026-04-13T02:00:00.000Z"),
  endsAt: new Date("2026-04-13T08:00:00.000Z"),
  venue: "NU Dasmariñas",
  lumaUrl: "https://lu.ma/msc-summit",
  approvalStatus: "draft",
  hasFees: false,
  hasExternalGuests: false,
  isMajor: false,
};

const rules: DeadlineRule[] = [
  { key: "proposal", label: "Proposal", offsetDays: -30, dayType: "calendar", anchor: "event_start", source: "RSO Manual" },
  { key: "offcampus_docs", label: "CHED docs", offsetDays: -30, dayType: "calendar", anchor: "event_start", source: "CHED" },
  { key: "offcampus_notarized", label: "Notarized", offsetDays: -20, dayType: "calendar", anchor: "event_start", source: "CHED" },
  { key: "booth_security", label: "Booth", offsetDays: -2, dayType: "calendar", anchor: "event_start", source: "RSO" },
  { key: "guest_list", label: "Guests", offsetDays: -1, dayType: "calendar", anchor: "event_start", source: "Security" },
  { key: "after_hours_request", label: "After hours", offsetDays: -7, dayType: "calendar", anchor: "event_start", source: "RSO" },
  { key: "par", label: "PAR", offsetDays: 5, dayType: "calendar", anchor: "event_end", source: "RSO Manual" },
  { key: "liquidation", label: "Liquidation", offsetDays: 5, dayType: "calendar", anchor: "event_end", source: "SCOA" },
];

describe("computeDeadline", () => {
  it("applies calendar offsets at 17:00 Manila", () => {
    const result = computeDeadline(rules[0], { ...defaultEvent, startsAt: new Date("2026-04-20T02:00:00.000Z") }, [], new Date("2026-01-01"));
    expect(result.dueAt.toISOString()).toBe("2026-03-21T09:00:00.000Z");
    expect(result.late).toBe(false);
  });

  it("counts working days and skips weekends", () => {
    const rule = { ...rules[0], offsetDays: -1, dayType: "working" };
    const result = computeDeadline(rule, defaultEvent, [], new Date("2026-01-01"));
    expect(result.dueAt.toISOString()).toBe("2026-04-10T09:00:00.000Z");
  });

  it("skips configured holidays while counting working days", () => {
    const rule = { ...rules[0], offsetDays: -2, dayType: "working" };
    const result = computeDeadline(rule, defaultEvent, ["2026-04-09"], new Date("2026-01-01"));
    expect(result.dueAt.toISOString()).toBe("2026-04-08T09:00:00.000Z");
  });

  it("marks past deadlines late and uses the event end for post-event rules", () => {
    const past = computeDeadline(rules[0], defaultEvent, [], new Date("2026-04-13T00:00:00.000Z"));
    expect(past.late).toBe(true);
    const par = computeDeadline(rules[6], defaultEvent, [], new Date("2026-04-13T00:00:00.000Z"));
    expect(par.dueAt.toISOString()).toBe("2026-04-18T15:59:00.000Z");
  });
});

describe("event checklist generation and rescheduling", () => {
  it("includes each conditional checklist item only when applicable", () => {
    const event = {
      ...defaultEvent, type: "off_campus", hasFees: true, hasExternalGuests: true, isMajor: true,
      endsAt: new Date("2026-04-13T14:00:00.000Z"),
    };
    const titles = generateChecklist(event, rules, [], new Date("2026-01-01")).map((item) => item.title);
    for (const title of ["CHED checklist and Annex A/B", "Notarized Annex A/B", "External guest list to Security",
      "After-hours authorization", "Parental/guardian consent forms", "After-hours supervision plan",
      "Risk assessment and emergency plan", "Fee-breakdown approval"]) {
      expect(titles).toContain(title);
    }
    expect(titles).not.toContain("Booth Operator & Equipment Declaration");
    expect(checklistTemplate.length).toBeGreaterThan(10);
  });

  it("recomputes open items, retains overrides and completed items, reconciles conditions, and adds reschedule items", () => {
    const oldEvent = { ...defaultEvent, type: "off_campus", approvalStatus: "approved" };
    const newEvent = { ...defaultEvent, type: "on_campus", startsAt: new Date("2026-05-04T02:00:00.000Z") };
    const generated = generateChecklist(oldEvent, rules, [], new Date("2026-01-01"));
    const items = generated.map((item, index) => ({
      ...item, id: `item-${index}`, taskId: item.title === "Activity proposal to SDAO" ? "task-1" : null,
    }));
    const proposal = items.find((item) => item.title === "Activity proposal to SDAO")!;
    const oldProposalDue = proposal.dueAt;
    const branded = items.find((item) => item.title === "Marketing Office branding check")!;
    branded.status = "done";
    const docs = items.find((item) => item.title === "CHED checklist and Annex A/B")!;
    docs.dueOverridden = true;
    const notarized = items.find((item) => item.title === "Notarized Annex A/B")!;
    const result = rescheduleChecklist(items, oldEvent, newEvent, rules, [], new Date("2026-01-01"));
    const moved = result.items.find((item) => item.title === "Activity proposal to SDAO")!;
    expect(moved.dueAt).not.toEqual(oldProposalDue);
    expect(result.taskDueDates).toEqual([{ taskId: "task-1", dueAt: moved.dueAt }]);
    expect(result.items.find((item) => item.title === branded.title)?.status).toBe("done");
    expect(result.items.find((item) => item.title === docs.title)?.dueAt).toEqual(docs.dueAt);
    expect(result.removedIds).toContain(notarized.id);
    expect(result.items.some((item) => item.title === "Letter of Explanation to SDAO (reschedule)")).toBe(true);
    expect(result.items.some((item) => item.title === "Send reschedule announcement")).toBe(true);
  });

  it("does not add explanation items when the event was not submitted or approved", () => {
    const generated = generateChecklist(defaultEvent, rules);
    const result = rescheduleChecklist(generated, defaultEvent, { ...defaultEvent, startsAt: new Date("2026-04-20") }, rules);
    expect(result.items.some((item) => item.title.includes("Letter of Explanation"))).toBe(false);
  });
});

describe("Luma CSV parsing", () => {
  it("strips a BOM, reads split names and check-in variants, and skips declined rows", () => {
    const csv = "\uFEFFFIRST_NAME,LAST_NAME,EMAIL,CHECKED_IN,APPROVAL_STATUS,checked_in_at\nAri,Santos,ari@example.test,yes,approved,\nBo,Reyes,bo@example.test,,approved,2026-01-01\nCasey,Lee,casey@example.test,true,declined,\n";
    const result = parseLumaCsv(csv);
    expect(result.rows).toEqual([
      { name: "Ari Santos", email: "ari@example.test", checkedIn: true },
      { name: "Bo Reyes", email: "bo@example.test", checkedIn: true },
    ]);
    expect(result.skipped).toBe(1);
  });

  it("accepts the full-name column and warns about missing email", () => {
    const result = parseLumaCsv("name,email\nMina,");
    expect(result.rows[0].name).toBe("Mina");
    expect(result.warnings).toContain("Some attendees have no email; duplicate matching will use names only.");
  });
});

describe("announcements and late PAR warnings", () => {
  it("renders template variables and guards unapproved announcements except reschedule", () => {
    const rendered = renderAnnouncement({ key: "save_the_date", body: "{{event_name}} | {{date}} {{time}} | {{venue}} | {{luma_link}} | {{days_left}}" },
      defaultEvent, new Date("2026-04-01T00:00:00.000Z"));
    expect(rendered).toContain("MSC Summit");
    expect(rendered).toContain("NU Dasmariñas");
    expect(rendered).toContain("https://lu.ma/msc-summit");
    for (const status of ["draft", "submitted", "rejected", "cancelled"]) {
      expect(announcementGuard({ approvalStatus: status }, "save_the_date").warning).toBeTruthy();
    }
    expect(announcementGuard({ approvalStatus: "approved" }, "save_the_date").warning).toBeNull();
    expect(announcementGuard({ approvalStatus: "draft" }, "reschedule").warning).toBeNull();
  });

  it("finds past events with open past-due PAR items", () => {
    const event = { ...defaultEvent, endsAt: new Date("2026-01-01T00:00:00.000Z"), checklistItems: [
      { ruleKey: "par", status: "open", dueAt: new Date("2026-01-06T00:00:00.000Z") },
    ] };
    expect(lateParWarning([event], new Date("2026-02-01"))).toEqual([event]);
    expect(lateParWarning([{ ...event, checklistItems: [{ ...event.checklistItems[0], status: "done" }] }], new Date("2026-02-01"))).toHaveLength(0);
  });
});
