import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

process.env.MSC_DATA_DIR = "memory://";

let eventsApi: typeof import("./route");
let eventApi: typeof import("./[id]/route");
let checklistApi: typeof import("./[id]/checklist/route");
let assignApi: typeof import("./[id]/checklist/[itemId]/assign/route");
let attendeeImportApi: typeof import("./[id]/attendees/import/route");
let inboxApi: typeof import("../inbox/route");
let taskApi: typeof import("../tasks/[id]/route");
let getDb: typeof import("@/lib/db/client").getDb;
let closeDb: typeof import("@/lib/db/client").closeDb;
let setClockForTests: typeof import("@/lib/clock").setClockForTests;
let events: typeof import("@/lib/db/schema").events;
let checklistItems: typeof import("@/lib/db/schema").checklistItems;
let attendees: typeof import("@/lib/db/schema").attendees;
let tasks: typeof import("@/lib/db/schema").tasks;
let taskActivity: typeof import("@/lib/db/schema").taskActivity;
let committees: typeof import("@/lib/db/schema").committees;
let files: typeof import("@/lib/db/schema").files;
let fileLinks: typeof import("@/lib/db/schema").fileLinks;

const testNow = new Date("2026-11-04T00:00:00.000Z");
const jsonRequest = (url: string, method: string, value: unknown) => new Request(url, {
  method,
  headers: { "content-type": "application/json" },
  body: JSON.stringify(value),
});

async function createEvent(overrides: Record<string, unknown> = {}) {
  const response = await eventsApi.POST(jsonRequest("http://localhost/api/events", "POST", {
    name: "MSC Welcome Night",
    type: "on_campus",
    startsAt: "2027-01-15T10:00:00.000Z",
    endsAt: "2027-01-15T14:00:00.000Z",
    venue: "Activity Center",
    ...overrides,
  }));
  expect(response.status).toBe(201);
  return await response.json() as { id: string; slug: string; updatedAt: string };
}

beforeAll(async () => {
  [
    eventsApi, eventApi, checklistApi, assignApi, attendeeImportApi, inboxApi, taskApi,
  ] = await Promise.all([
    import("./route"),
    import("./[id]/route"),
    import("./[id]/checklist/route"),
    import("./[id]/checklist/[itemId]/assign/route"),
    import("./[id]/attendees/import/route"),
    import("../inbox/route"),
    import("../tasks/[id]/route"),
  ]);
  ({ getDb, closeDb } = await import("@/lib/db/client"));
  ({ setClockForTests } = await import("@/lib/clock"));
  ({ events, checklistItems, attendees, tasks, taskActivity, committees, files, fileLinks } = await import("@/lib/db/schema"));
});

beforeEach(async () => {
  setClockForTests(() => new Date(testNow));
  const { db } = await getDb();
  await db.delete(taskActivity);
  await db.delete(tasks);
  await db.delete(checklistItems);
  await db.delete(attendees);
  await db.delete(fileLinks);
  await db.delete(files);
  await db.delete(events);
  await db.delete(committees);
});

afterAll(async () => {
  setClockForTests();
  await closeDb();
});

describe("event API", () => {
  it("creates a rule-cited checklist and reschedules open items with stale-write protection", async () => {
    const event = await createEvent({ approvalStatus: "submitted" });
    const response = await checklistApi.GET(new Request("http://localhost"), { params: Promise.resolve({ id: event.slug }) });
    const initialItems = await response.json() as Array<{ id: string; title: string; dueAt: string; source: string }>;
    const proposal = initialItems.find((item) => item.title === "Activity proposal to SDAO");
    expect(initialItems.length).toBeGreaterThanOrEqual(8);
    expect(proposal?.source).toBe("RSO Manual: Activity Proposal");
    const originalDue = proposal?.dueAt;

    const stale = await eventApi.PATCH(jsonRequest("http://localhost", "PATCH", {
      expectedUpdatedAt: "2025-01-01T00:00:00.000Z",
      startsAt: "2027-02-15T10:00:00.000Z",
    }), { params: Promise.resolve({ id: event.slug }) });
    expect(stale.status).toBe(409);

    const updated = await eventApi.PATCH(jsonRequest("http://localhost", "PATCH", {
      expectedUpdatedAt: event.updatedAt,
      startsAt: "2027-02-15T10:00:00.000Z",
      endsAt: "2027-02-15T14:00:00.000Z",
    }), { params: Promise.resolve({ id: event.slug }) });
    expect(updated.status).toBe(200);
    const afterResponse = await checklistApi.GET(new Request("http://localhost"), { params: Promise.resolve({ id: event.slug }) });
    const afterItems = await afterResponse.json() as Array<{ title: string; dueAt: string }>;
    expect(afterItems.find((item) => item.title === "Activity proposal to SDAO")?.dueAt).not.toBe(originalDue);
    expect(afterItems.filter((item) => item.title === "Letter of Explanation to SDAO (reschedule)")).toHaveLength(1);
    expect(afterItems.filter((item) => item.title === "Send reschedule announcement")).toHaveLength(1);
  });

  it("assigns checklist items to event tasks and closes the item when the task is completed", async () => {
    const event = await createEvent();
    const { db } = await getDb();
    const [committee] = await db.insert(committees).values({
      name: "Logistics", slug: "logistics", color: "blue", description: "", defaultCheckinDays: 3,
    }).returning();
    const checklistResponse = await checklistApi.GET(new Request("http://localhost"), { params: Promise.resolve({ id: event.slug }) });
    const item = (await checklistResponse.json() as Array<{ id: string; title: string }>)[0];
    const assigned = await assignApi.POST(jsonRequest("http://localhost", "POST", { committeeId: committee.id }), {
      params: Promise.resolve({ id: event.slug, itemId: item.id }),
    });
    expect(assigned.status).toBe(201);
    const task = await assigned.json() as { id: string; eventId: string; dueAt: string; updatedAt: string };
    expect(task.eventId).toBe(event.id);
    expect(task.dueAt).toBeTruthy();

    const completed = await taskApi.PATCH(jsonRequest("http://localhost", "PATCH", {
      expectedUpdatedAt: task.updatedAt,
      status: "done",
    }), { params: Promise.resolve({ id: task.id }) });
    expect(completed.status).toBe(200);
    const { db: currentDb } = await getDb();
    const [linkedItem] = await currentDb.select().from(checklistItems).where((await import("drizzle-orm")).eq(checklistItems.id, item.id));
    expect(linkedItem.status).toBe("done");
  });

  it("previews and commits Luma CSV rows, skipping declined registrations", async () => {
    const event = await createEvent();
    const csv = "Name,Email,Checked In,Approval Status\nAvery Chen,avery@example.test,yes,approved\nJordan Lee,jordan@example.test,,approved\nDeclined Person,declined@example.test,,declined\n";
    const response = await attendeeImportApi.POST(new Request(`http://localhost/api/events/${event.slug}/attendees/import?commit=1`, {
      method: "POST", headers: { "content-type": "text/csv" }, body: csv,
    }), { params: Promise.resolve({ id: event.slug }) });
    const result = await response.json() as { rows: unknown[]; skipped: number; inserted: number; participantActual: number };
    expect(result.rows).toHaveLength(2);
    expect(result.skipped).toBe(1);
    expect(result.inserted).toBe(2);
    expect(result.participantActual).toBe(1);
    const { db } = await getDb();
    expect(await db.select().from(attendees)).toHaveLength(2);
  });

  it("adds event deadlines and late PAR items to the inbox", async () => {
    const event = await createEvent({
      name: "Past Event",
      startsAt: "2026-01-01T10:00:00.000Z",
      endsAt: "2026-01-01T14:00:00.000Z",
    });
    const response = await inboxApi.GET();
    const inbox = await response.json() as { event_deadlines: Array<{ event: { id: string } }>; late_par: Array<{ id: string }> };
    expect(inbox.event_deadlines.some((item) => item.event.id === event.id)).toBe(true);
    expect(inbox.late_par.some((item) => item.id === event.id)).toBe(true);
  });
});
