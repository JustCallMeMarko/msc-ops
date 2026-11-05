import { TZDate } from "@date-fns/tz";
import { addDays, differenceInCalendarDays, format, getDay } from "date-fns";
import Papa from "papaparse";
import { now } from "@/lib/clock";

export const MANILA_TIME_ZONE = "Asia/Manila";

export type EventRecord = {
  id?: string;
  name: string;
  slug?: string;
  type: "on_campus" | "off_campus" | "online" | "booth" | string;
  startsAt: Date;
  endsAt: Date;
  venue?: string;
  description?: string;
  lumaUrl?: string | null;
  approvalStatus?: string;
  hasFees: boolean;
  hasExternalGuests: boolean;
  isMajor: boolean;
};

export type DeadlineRule = {
  key: string;
  label: string;
  offsetDays: number;
  dayType: "calendar" | "working" | string;
  anchor: "event_start" | "event_end" | string;
  source: string;
};

export type Holiday = string | { date: string };

function manilaDate(date: Date): TZDate {
  return new TZDate(date, MANILA_TIME_ZONE);
}

function dateKey(date: Date): string {
  return format(manilaDate(date), "yyyy-MM-dd");
}

function dayAtManila(date: Date, hour: number, minute: number): Date {
  const zoned = manilaDate(date);
  const result = new TZDate(zoned.getFullYear(), zoned.getMonth(), zoned.getDate(), MANILA_TIME_ZONE);
  result.setHours(hour, minute, 0, 0);
  return new Date(result.getTime());
}

function isWorkingDay(date: Date, holidayKeys: Set<string>): boolean {
  const day = getDay(manilaDate(date));
  return day !== 0 && day !== 6 && !holidayKeys.has(dateKey(date));
}

export function computeDeadline(
  rule: DeadlineRule,
  event: Pick<EventRecord, "startsAt" | "endsAt">,
  holidays: Holiday[] = [],
  currentTime = now(),
): { dueAt: Date; late: boolean } {
  const anchor = rule.anchor === "event_end" ? event.endsAt : event.startsAt;
  let dueDay = dayAtManila(anchor, 12, 0);
  if (rule.dayType === "working") {
    const direction = Math.sign(rule.offsetDays);
    let remaining = Math.abs(rule.offsetDays);
    while (remaining > 0) {
      dueDay = addDays(dueDay, direction);
      if (isWorkingDay(dueDay, new Set(holidays.map((holiday) => typeof holiday === "string" ? holiday : holiday.date)))) {
        remaining -= 1;
      }
    }
  } else {
    dueDay = addDays(dueDay, rule.offsetDays);
  }
  const dueAt = dayAtManila(dueDay, rule.anchor === "event_end" ? 23 : 17, rule.anchor === "event_end" ? 59 : 0);
  return { dueAt, late: dueAt < currentTime };
}

export type ChecklistTemplateItem = {
  phase: "pre" | "during" | "post";
  title: string;
  detail: string;
  ruleKey?: string;
  source: string;
  when: (event: EventRecord) => boolean;
};

const always = () => true;
const isOffCampus = (event: EventRecord) => event.type === "off_campus";
const isBooth = (event: EventRecord) => event.type === "booth";
const hasGuests = (event: EventRecord) => event.hasExternalGuests;
const isMajor = (event: EventRecord) => event.isMajor;
const hasFees = (event: EventRecord) => event.hasFees;
const isAfterHours = (event: EventRecord) => manilaDate(event.endsAt).getHours() > 21
  || (manilaDate(event.endsAt).getHours() === 21 && manilaDate(event.endsAt).getMinutes() > 0);

export const checklistTemplate: ChecklistTemplateItem[] = [
  { phase: "pre", title: "Activity proposal to SDAO", detail: "Submit the activity proposal and secure approval.", ruleKey: "proposal", source: "RSO Manual: Activity Proposal", when: always },
  { phase: "pre", title: "Marketing Office branding check", detail: "Check event branding against the University Brandbook with the Marketing Office.", source: "University Brandbook", when: always },
  { phase: "pre", title: "CHED checklist and Annex A/B", detail: "Complete the CHED checklist and Annex A/B for an off-campus activity.", ruleKey: "offcampus_docs", source: "CHED Student Organization Activity Guidelines", when: isOffCampus },
  { phase: "pre", title: "Notarized Annex A/B", detail: "Submit notarized copies of Annex A/B.", ruleKey: "offcampus_notarized", source: "CHED Student Organization Activity Guidelines", when: isOffCampus },
  { phase: "pre", title: "Booth Operator & Equipment Declaration", detail: "Submit the booth operator and equipment declaration with Security endorsement.", ruleKey: "booth_security", source: "RSO Manual: Booth Operations", when: isBooth },
  { phase: "pre", title: "External guest list to Security", detail: "Send the external guest list to Campus Security.", ruleKey: "guest_list", source: "Campus Security guest-list procedure", when: hasGuests },
  { phase: "pre", title: "After-hours authorization", detail: "Request authorization for activity hours after 21:00 Manila.", ruleKey: "after_hours_request", source: "RSO Manual: After-hours Activities", when: isAfterHours },
  { phase: "pre", title: "Parental/guardian consent forms", detail: "Collect consent forms for participants staying after 21:00.", ruleKey: "after_hours_request", source: "RSO Manual: After-hours Activities", when: isAfterHours },
  { phase: "pre", title: "After-hours supervision plan", detail: "Document the supervision plan for the after-hours activity.", ruleKey: "after_hours_request", source: "RSO Manual: After-hours Activities", when: isAfterHours },
  { phase: "pre", title: "Risk assessment and emergency plan", detail: "Prepare a risk assessment and emergency response plan.", source: "MSC event safety checklist", when: isMajor },
  { phase: "pre", title: "Fee-breakdown approval", detail: "Prepare and secure approval for the event fee breakdown.", source: "MSC finance procedures", when: hasFees },
  { phase: "during", title: "Attendance with age and gender", detail: "Record attendance with age and gender breakdown.", source: "RSO Manual: Activity Documentation", when: always },
  { phase: "during", title: "At least 10 captioned photos", detail: "Capture at least 10 event photos and add a caption to each.", source: "RSO Manual: Activity Documentation", when: always },
  { phase: "during", title: "Incident log", detail: "Record incidents and actions taken during the activity.", source: "RSO Manual: Activity Documentation", when: always },
  { phase: "during", title: "Evaluation form", detail: "Collect participant evaluation forms.", source: "RSO Manual: Activity Documentation", when: always },
  { phase: "post", title: "Post-Activity Report", detail: "Include summary, challenges, actions taken, at least 10 captioned photos, evaluation summary, and attendance.", ruleKey: "par", source: "RSO Manual: Post-Activity Report", when: always },
  { phase: "post", title: "SCOA liquidation", detail: "Submit receipts and liquidate approved event expenses.", ruleKey: "liquidation", source: "SCOA Financial Procedures", when: always },
];

export type GeneratedChecklistItem = {
  phase: ChecklistTemplateItem["phase"];
  title: string;
  detail: string;
  ruleKey: string | null;
  dueAt: Date;
  dueOverridden: boolean;
  late: boolean;
  status: "open" | "done" | "na";
  source: string;
  sort: number;
};

export function generateChecklist(
  event: EventRecord,
  rules: DeadlineRule[],
  holidays: Holiday[] = [],
  currentTime = now(),
): GeneratedChecklistItem[] {
  const ruleMap = new Map(rules.map((rule) => [rule.key, rule]));
  return checklistTemplate.filter((item) => item.when(event)).map((item, sort) => {
    const rule = item.ruleKey ? ruleMap.get(item.ruleKey) : undefined;
    let dueAt: Date;
    let late = false;
    if (rule) {
      ({ dueAt, late } = computeDeadline(rule, event, holidays, currentTime));
    } else if (item.phase === "post" && ruleMap.has("par")) {
      ({ dueAt, late } = computeDeadline(ruleMap.get("par")!, event, holidays, currentTime));
    } else {
      dueAt = item.phase === "post" ? event.endsAt : event.startsAt;
      late = dueAt < currentTime;
    }
    return {
      phase: item.phase, title: item.title, detail: item.detail, ruleKey: item.ruleKey ?? null,
      dueAt, dueOverridden: false, late, status: "open", source: item.source, sort,
    };
  });
}

export type ExistingChecklistItem = Omit<GeneratedChecklistItem, "status"> & {
  id?: string;
  taskId?: string | null;
  status: "open" | "done" | "na";
};

export function rescheduleChecklist(
  items: ExistingChecklistItem[],
  oldEvent: EventRecord,
  newEvent: EventRecord,
  rules: DeadlineRule[],
  holidays: Holiday[] = [],
  currentTime = now(),
): { items: ExistingChecklistItem[]; removedIds: string[]; taskDueDates: Array<{ taskId: string; dueAt: Date }> } {
  const candidates = generateChecklist(newEvent, rules, holidays, currentTime);
  const available = [...candidates];
  const removedIds: string[] = [];
  const taskDueDates: Array<{ taskId: string; dueAt: Date }> = [];
  const result = items.flatMap((item) => {
    const index = available.findIndex((candidate) => candidate.phase === item.phase && candidate.title === item.title);
    if (index >= 0) {
      const [candidate] = available.splice(index, 1);
      const updated = item.status === "open" && !item.dueOverridden
        ? { ...item, dueAt: candidate.dueAt, late: candidate.late, ruleKey: candidate.ruleKey, detail: candidate.detail, source: candidate.source, sort: candidate.sort }
        : item;
      if (updated.taskId && updated.dueAt.getTime() !== item.dueAt.getTime()) taskDueDates.push({ taskId: updated.taskId, dueAt: updated.dueAt });
      return [updated];
    }
    const isTemplateItem = checklistTemplate.some((template) => template.phase === item.phase && template.title === item.title);
    if (isTemplateItem && item.status !== "done") {
      if (item.dueOverridden) return [item];
      if (item.id) removedIds.push(item.id);
      return [];
    }
    return [item];
  });
  result.push(...available);

  if (oldEvent.approvalStatus === "submitted" || oldEvent.approvalStatus === "approved") {
    if (!result.some((item) => item.title === "Letter of Explanation to SDAO (reschedule)")) {
      const dueAt = dayAtManila(addDays(manilaDate(currentTime), 3), 17, 0);
      result.push({
        phase: "post", title: "Letter of Explanation to SDAO (reschedule)",
        detail: "Explain the reason for rescheduling and submit it to SDAO.", ruleKey: null,
        dueAt, dueOverridden: false, late: dueAt < currentTime, status: "open",
        source: "RSO Manual: Rescheduled Activities", sort: result.length,
      });
    }
    if (!result.some((item) => item.title === "Send reschedule announcement")) {
      result.push({
        phase: "pre", title: "Send reschedule announcement",
        detail: "Notify registered participants of the updated event details.", ruleKey: null,
        dueAt: newEvent.startsAt, dueOverridden: false, late: newEvent.startsAt < currentTime, status: "open",
        source: "MSC event communications", sort: result.length,
      });
    }
  }
  return { items: result, removedIds, taskDueDates };
}

export type LumaRow = { name: string; email: string; checkedIn: boolean };
export function parseLumaCsv(text: string): { rows: LumaRow[]; skipped: number; warnings: string[] } {
  const warnings: string[] = [];
  const parsed = Papa.parse<Record<string, string>>(text.replace(/^\uFEFF/, ""), {
    header: true, skipEmptyLines: true, transformHeader: (header) => header.trim().toLowerCase().replace(/[\s-]+/g, "_"),
  });
  for (const error of parsed.errors) warnings.push(`Row ${(error.row ?? 0) + 1}: ${error.message}`);
  let skipped = 0;
  const rows: LumaRow[] = [];
  for (const row of parsed.data) {
    const approval = (row.approval_status ?? "").trim().toLowerCase();
    if (approval === "declined" || approval === "rejected") {
      skipped += 1;
      continue;
    }
    const name = (row.name ?? `${row.first_name ?? ""} ${row.last_name ?? ""}`).trim();
    const email = (row.email ?? "").trim();
    if (!name && !email) {
      skipped += 1;
      continue;
    }
    const checked = (row.checked_in ?? "").trim().toLowerCase();
    rows.push({
      name, email,
      checkedIn: Boolean((row.checked_in_at ?? "").trim()) || ["true", "1", "yes", "checked", "checked_in"].includes(checked),
    });
  }
  if (rows.some((row) => !row.email)) warnings.push("Some attendees have no email; duplicate matching will use names only.");
  return { rows, skipped, warnings };
}

export type AnnouncementTemplate = { key: string; body: string };
export function renderAnnouncement(template: AnnouncementTemplate, event: EventRecord, currentTime = now()): string {
  const starts = manilaDate(event.startsAt);
  const values: Record<string, string> = {
    event_name: event.name,
    date: format(starts, "EEEE, MMMM d, yyyy"),
    time: format(starts, "h:mm a"),
    venue: event.venue ?? "",
    luma_link: event.lumaUrl ?? "",
    days_left: String(differenceInCalendarDays(starts, manilaDate(currentTime))),
  };
  return template.body.replace(/\{\{(event_name|date|time|venue|luma_link|days_left)\}\}/g, (_match, key: string) => values[key]);
}

export function announcementGuard(event: Pick<EventRecord, "approvalStatus">, templateKey: string): { warning: string | null } {
  return event.approvalStatus === "approved" || templateKey === "reschedule"
    ? { warning: null }
    : { warning: "This event has not been approved. Confirm with SDAO before sending." };
}

export type LateParEvent = EventRecord & { checklistItems: Array<{ ruleKey: string | null; status: string; dueAt: Date }> };
export function lateParWarning(events: LateParEvent[], currentTime = now()): LateParEvent[] {
  return events.filter((event) => event.endsAt < currentTime && event.checklistItems.some((item) =>
    item.ruleKey === "par" && item.status === "open" && item.dueAt < currentTime));
}
