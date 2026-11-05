import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

process.env.MSC_DATA_DIR = "memory://";

let eventsApi: typeof import("../events/route");
let eventApi: typeof import("../events/[id]/route");
let postsApi: typeof import("./route");
let postApi: typeof import("./[id]/route");
let captionsApi: typeof import("./[id]/captions/route");
let approveCaptionApi: typeof import("./[id]/captions/approve/route");
let inboxApi: typeof import("../inbox/route");
let getDb: typeof import("@/lib/db/client").getDb;
let closeDb: typeof import("@/lib/db/client").closeDb;
let setClockForTests: typeof import("@/lib/clock").setClockForTests;
let events: typeof import("@/lib/db/schema").events;
let posts: typeof import("@/lib/db/schema").posts;
let captions: typeof import("@/lib/db/schema").captions;
let postAssets: typeof import("@/lib/db/schema").postAssets;
let postActivity: typeof import("@/lib/db/schema").postActivity;
let tasks: typeof import("@/lib/db/schema").tasks;
let taskActivity: typeof import("@/lib/db/schema").taskActivity;
let checklistItems: typeof import("@/lib/db/schema").checklistItems;
let files: typeof import("@/lib/db/schema").files;
let fileLinks: typeof import("@/lib/db/schema").fileLinks;

const testNow = new Date("2026-11-04T00:00:00.000Z");
const jsonRequest = (url: string, method: string, value: unknown) => new Request(url, {
  method,
  headers: { "content-type": "application/json" },
  body: JSON.stringify(value),
});

beforeAll(async () => {
  [eventsApi, eventApi, postsApi, postApi, captionsApi, approveCaptionApi, inboxApi] = await Promise.all([
    import("../events/route"),
    import("../events/[id]/route"),
    import("./route"),
    import("./[id]/route"),
    import("./[id]/captions/route"),
    import("./[id]/captions/approve/route"),
    import("../inbox/route"),
  ]);
  ({ getDb, closeDb } = await import("@/lib/db/client"));
  ({ setClockForTests } = await import("@/lib/clock"));
  ({ events, posts, captions, postAssets, postActivity, tasks, taskActivity, checklistItems, files, fileLinks } = await import("@/lib/db/schema"));
});

beforeEach(async () => {
  setClockForTests(() => new Date(testNow));
  const { db } = await getDb();
  await db.delete(postActivity);
  await db.delete(captions);
  await db.delete(postAssets);
  await db.delete(posts);
  await db.delete(taskActivity);
  await db.delete(tasks);
  await db.delete(checklistItems);
  await db.delete(fileLinks);
  await db.delete(files);
  await db.delete(events);
});

afterAll(async () => {
  setClockForTests();
  await closeDb();
});

async function createEvent() {
  const response = await eventsApi.POST(jsonRequest("http://localhost/api/events", "POST", {
    name: "MSC Welcome Night",
    type: "on_campus",
    startsAt: "2027-01-15T10:00:00.000Z",
    endsAt: "2027-01-15T14:00:00.000Z",
    venue: "Activity Center",
  }));
  expect(response.status).toBe(201);
  return await response.json() as { id: string; slug: string; updatedAt: string };
}

describe("creative posting API", () => {
  it("auto-generates nine posts and eighteen event tasks, then reschedules them with the event", async () => {
    const event = await createEvent();
    const { db } = await getDb();
    const generated = await db.select().from(posts);
    expect(generated).toHaveLength(9);
    expect(await db.select().from(tasks)).toHaveLength(18);
    const original = generated.find((post) => post.ruleKey === "poster")!;

    const response = await eventApi.PATCH(jsonRequest("http://localhost/api/events", "PATCH", {
      expectedUpdatedAt: event.updatedAt,
      startsAt: "2027-01-22T10:00:00.000Z",
      endsAt: "2027-01-22T14:00:00.000Z",
    }), { params: Promise.resolve({ id: event.slug }) });
    expect(response.status).toBe(200);
    const moved = await db.select().from(posts);
    expect(moved.find((post) => post.ruleKey === "poster")!.scheduledAt!.getTime()).toBeGreaterThan(original.scheduledAt!.getTime());
    expect(await db.select().from(tasks)).toHaveLength(18);
  });

  it("rejects stale post updates and over-limit caption approval", async () => {
    const response = await postsApi.POST(jsonRequest("http://localhost/api/posts", "POST", {
      title: "General update", type: "general", platforms: ["x"],
    }));
    expect(response.status).toBe(201);
    const post = await response.json() as { id: string; updatedAt: string };
    const stale = await postApi.PATCH(jsonRequest("http://localhost/api/posts", "PATCH", {
      title: "Stale title", expectedUpdatedAt: "2025-01-01T00:00:00.000Z",
    }), { params: Promise.resolve({ id: post.id }) });
    expect(stale.status).toBe(409);

    const captionResponse = await captionsApi.POST(jsonRequest("http://localhost/api/captions", "POST", {
      platform: "x", body: "🎉".repeat(281),
    }), { params: Promise.resolve({ id: post.id }) });
    expect(captionResponse.status).toBe(201);
    const approval = await approveCaptionApi.POST(jsonRequest("http://localhost/api/captions/approve", "POST", {
      platform: "x",
    }), { params: Promise.resolve({ id: post.id }) });
    expect(approval.status).toBe(422);
  });

  it("applies creative qualifiers from the shared q query", async () => {
    const event = await createEvent();
    const created = await postsApi.POST(jsonRequest("http://localhost/api/posts", "POST", {
      eventId: event.id, title: "Qualifier test", type: "general", status: "idea",
      platforms: ["x"], scheduledAt: "2027-01-10T10:00:00.000Z",
    }));
    expect(created.status).toBe(201);
    const response = await postsApi.GET(new Request(
      `http://localhost/api/posts?q=${encodeURIComponent(`type:general platform:x status:idea event:${event.slug} from:2027-01-01 to:2027-01-20 Qualifier test`)}`,
    ));
    const rows = await response.json() as Array<{ title: string }>;
    expect(rows.map((post) => post.title)).toEqual(["Qualifier test"]);
  });

  it("lists scheduled-today posts in the posts_due inbox group", async () => {
    const response = await postsApi.POST(jsonRequest("http://localhost/api/posts", "POST", {
      title: "Today's post", type: "general", status: "scheduled", scheduledAt: testNow.toISOString(),
    }));
    const post = await response.json() as { id: string };
    const inboxResponse = await inboxApi.GET();
    const inbox = await inboxResponse.json() as { posts_due: Array<{ id: string }> };
    expect(inbox.posts_due.map((entry) => entry.id)).toContain(post.id);
  });
});
