import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { setClockForTests } from "@/lib/clock";

process.env.MSC_DATA_DIR = "memory://";

let taskApi: typeof import("./route");
let taskDetail: typeof import("./[id]/route");
let inboxApi: typeof import("../inbox/route");
let replyApi: typeof import("./[id]/reply/route");
let nudgeApi: typeof import("./[id]/nudge-copied/route");
let snoozeApi: typeof import("./[id]/snooze/route");
let restoreApi: typeof import("./[id]/restore/route");
let getDb: typeof import("@/lib/db/client").getDb;
let tasks: typeof import("@/lib/db/schema").tasks;
let committees: typeof import("@/lib/db/schema").committees;
let taskActivity: typeof import("@/lib/db/schema").taskActivity;
let clockTime = new Date("2025-11-10T05:30:00.000Z");

beforeAll(async () => {
  [taskApi, taskDetail, inboxApi, replyApi, nudgeApi, snoozeApi, restoreApi] = await Promise.all([
    import("./route"),
    import("./[id]/route"),
    import("../inbox/route"),
    import("./[id]/reply/route"),
    import("./[id]/nudge-copied/route"),
    import("./[id]/snooze/route"),
    import("./[id]/restore/route"),
  ]);
  ({ getDb } = await import("@/lib/db/client"));
  ({ tasks, committees, taskActivity } = await import("@/lib/db/schema"));
  setClockForTests(() => new Date(clockTime));
});

beforeEach(async () => {
  clockTime = new Date("2025-11-10T05:30:00.000Z");
  setClockForTests(() => new Date(clockTime));
  const { db } = await getDb();
  await db.delete(taskActivity);
  await db.delete(tasks);
  await db.delete(committees);
});

afterAll(() => setClockForTests());

async function createTask(title = "Prepare report") {
  const response = await taskApi.POST(new Request("http://localhost/api/tasks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title }),
  }));
  expect(response.status).toBe(201);
  return response.json() as Promise<{ id: string; number: number; nextCheckinAt: string; updatedAt: string }>;
}

async function inbox() {
  const response = await inboxApi.GET();
  return response.json() as Promise<Record<string, Array<{ id: string }>>>;
}

function post(id: string, path: string, body: unknown): Request {
  return new Request(`http://localhost/api/tasks/${id}/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("task API check-ins", () => {
  it("creates the next check-in in the future and lists it when the fake clock advances", async () => {
    const task = await createTask();
    expect(new Date(task.nextCheckinAt).getTime()).toBeGreaterThan(clockTime.getTime());
    expect((await inbox()).checkin_due).toHaveLength(0);
    clockTime = new Date(new Date(task.nextCheckinAt).getTime() + 1_000);
    expect((await inbox()).checkin_due.map((item) => item.id)).toContain(task.id);
  });

  it("logs a reply and advances the check-in", async () => {
    const task = await createTask();
    clockTime = new Date(new Date(task.nextCheckinAt).getTime() + 1_000);
    const response = await replyApi.POST(post(task.id, "reply", { text: "Working on it" }), { params: Promise.resolve({ id: task.id }) });
    expect(response.status).toBe(200);
    expect((await inbox()).checkin_due).toHaveLength(0);
    const { db } = await getDb();
    const [updated] = await db.select().from(tasks);
    expect(updated.nextCheckinAt?.getTime()).toBeGreaterThan(clockTime.getTime());
    const entries = await db.select().from(taskActivity);
    expect(entries.some((entry) => entry.kind === "checkin_reply" && entry.body === "Working on it")).toBe(true);
  });

  it("clears check-ins when completed and recomputes them when reopened", async () => {
    const task = await createTask();
    const doneResponse = await taskDetail.PATCH(new Request(`http://localhost/api/tasks/${task.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "done", expectedUpdatedAt: task.updatedAt }),
    }), { params: Promise.resolve({ id: task.id }) });
    expect(doneResponse.status).toBe(200);
    const done = await doneResponse.json() as { status: string; nextCheckinAt: string | null; updatedAt: string };
    expect(done.status).toBe("done");
    expect(done.nextCheckinAt).toBeNull();

    const reopenResponse = await taskDetail.PATCH(new Request(`http://localhost/api/tasks/${task.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "todo", expectedUpdatedAt: done.updatedAt }),
    }), { params: Promise.resolve({ id: task.id }) });
    expect(reopenResponse.status).toBe(200);
    const reopened = await reopenResponse.json() as { status: string; nextCheckinAt: string | null };
    expect(reopened.status).toBe("todo");
    expect(new Date(reopened.nextCheckinAt!).getTime()).toBeGreaterThan(clockTime.getTime());
  });

  it("keeps a task check-in due after logging that its nudge was copied", async () => {
    const task = await createTask();
    clockTime = new Date(new Date(task.nextCheckinAt).getTime() + 1_000);
    const response = await nudgeApi.POST(post(task.id, "nudge-copied", {}), { params: Promise.resolve({ id: task.id }) });
    expect(response.status).toBe(200);
    expect((await inbox()).checkin_due.map((item) => item.id)).toContain(task.id);
  });

  it("hides a snoozed task until its snooze expires", async () => {
    const task = await createTask();
    clockTime = new Date(new Date(task.nextCheckinAt).getTime() + 1_000);
    const until = new Date(clockTime.getTime() + 2 * 86_400_000);
    const response = await snoozeApi.POST(post(task.id, "snooze", { until }), { params: Promise.resolve({ id: task.id }) });
    expect(response.status).toBe(200);
    expect((await inbox()).checkin_due).toHaveLength(0);
    clockTime = new Date(until.getTime() + 1_000);
    expect((await inbox()).checkin_due.map((item) => item.id)).toContain(task.id);
  });

  it("returns 409 for a stale expectedUpdatedAt and supports soft delete/restore", async () => {
    const task = await createTask();
    const stale = await taskDetail.PATCH(new Request(`http://localhost/api/tasks/${task.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ expectedUpdatedAt: "2020-01-01T00:00:00.000Z", title: "Changed" }),
    }), { params: Promise.resolve({ id: task.id }) });
    expect(stale.status).toBe(409);
    expect(await stale.json()).toHaveProperty("current");

    const deleted = await taskDetail.DELETE(new Request("http://localhost"), { params: Promise.resolve({ id: task.id }) });
    expect(deleted.status).toBe(200);
    const restored = await restoreApi.POST(new Request("http://localhost", { method: "POST" }), { params: Promise.resolve({ id: task.id }) });
    expect(restored.status).toBe(200);
  });
});
