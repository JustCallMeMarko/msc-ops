import { describe, expect, it } from "vitest";
import {
  canApprove,
  captionGuard,
  captionLength,
  generatePostSchedule,
  ratioWarning,
  renderCaption,
  reschedulePosts,
  unicodeStyledWarning,
  type CreativeEvent,
} from "./logic";

const event: CreativeEvent = {
  id: "event-1", name: "Dasmariñas Week", startsAt: new Date("2026-11-14T01:00:00Z"),
  endsAt: new Date("2026-11-14T09:00:00Z"), venue: "Activity Center",
  lumaUrl: "https://lu.ma/week", approvalStatus: "approved",
};
const rules = [
  { key: "poster", postType: "poster", label: "Poster", offsetDays: -21, anchor: "event_start", enabled: true },
  { key: "countdown_3", postType: "countdown", label: "3 days to go", offsetDays: -3, anchor: "event_start", enabled: true },
];

describe("creative posting logic", () => {
  it("generates Manila-time posts and artwork/caption tasks with the creatives committee", () => {
    const result = generatePostSchedule(event, rules, [{ id: "committee", slug: "creatives", defaultCheckinDays: 4 }], new Date("2026-10-01T00:00:00Z"));
    expect(result).toHaveLength(2);
    expect(result[0].scheduledAt.toISOString()).toBe("2026-10-24T10:00:00.000Z");
    expect(result[0].artworkTask).toMatchObject({ committeeId: "committee", checkinEveryDays: 4, eventId: event.id });
    expect(result[0].artworkTask.dueAt.getTime()).toBeLessThan(result[0].scheduledAt.getTime());
    expect(result[0].captionTask.committeeId).toBeNull();
  });

  it("falls back to no creatives committee while retaining the default cadence", () => {
    const [post] = generatePostSchedule(event, rules.slice(0, 1), [], new Date("2026-10-01T00:00:00Z"));
    expect(post.artworkTask.committeeId).toBeNull();
    expect(post.artworkTask.checkinEveryDays).toBe(3);
  });

  it("reschedules open posts and their tasks but preserves overridden and posted posts", () => {
    const generated = generatePostSchedule(event, rules, [], new Date("2026-10-01T00:00:00Z"));
    const posts = generated.map((post, index) => ({
      id: String(index), eventId: event.id, title: post.title, type: post.type, status: "idea",
      scheduledAt: post.scheduledAt, postedAt: null, ruleKey: post.ruleKey,
      scheduleOverridden: index === 1, artworkTaskId: `art-${index}`, captionTaskId: `cap-${index}`,
    }));
    const moved = { ...event, startsAt: new Date("2026-11-21T01:00:00Z") };
    const result = reschedulePosts(posts, event, moved, rules);
    expect(result.posts[0].scheduledAt?.getTime()).toBeGreaterThan(posts[0].scheduledAt!.getTime());
    expect(result.posts[1].scheduledAt).toEqual(posts[1].scheduledAt);
    expect(result.taskDueDates).toHaveLength(2);
  });

  it("cancels unposted posts and requests a reschedule notice without touching posted items", () => {
    const posts = [
      { id: "open", eventId: event.id, title: "Poster", type: "poster", status: "scheduled", scheduledAt: new Date(), postedAt: null, ruleKey: "poster", scheduleOverridden: false, artworkTaskId: "a", captionTaskId: "c" },
      { id: "posted", eventId: event.id, title: "Posted", type: "poster", status: "posted", scheduledAt: new Date(), postedAt: new Date(), ruleKey: "poster", scheduleOverridden: false, artworkTaskId: null, captionTaskId: null },
    ];
    const result = reschedulePosts(posts, event, { ...event, approvalStatus: "cancelled" }, rules);
    expect(result.posts.map((post) => post.status)).toEqual(["cancelled", "posted"]);
    expect(result.cancelledTaskIds).toEqual(["a", "c"]);
    expect(result.noticePost?.type).toBe("reschedule_notice");
  });

  it("counts graphemes and treats X URLs as 23 characters", () => {
    expect(captionLength("🎉ñ", "x").length).toBe(2);
    expect(captionLength("See https://example.com/a", "x").length).toBe(27);
    expect(captionLength(`${"#org ".repeat(31)}`, "instagram").hashtagOver).toBe(true);
  });

  it("flags fancy unicode, renders post-relative countdowns, and guards unapproved copy", () => {
    expect(unicodeStyledWarning("𝓗ello")).toBe(true);
    expect(unicodeStyledWarning("Hola ñ")).toBe(false);
    expect(renderCaption("{{event_name}} {{days_left}} {{date}}", {
      eventName: event.name, startsAt: event.startsAt, scheduledAt: new Date("2026-11-11T10:00:00Z"),
      venue: event.venue, lumaLink: event.lumaUrl,
    })).toBe("Dasmariñas Week 3 Sat, Nov 14");
    expect(captionGuard({ approvalStatus: "draft" }, "See you soon")).toMatch(/not approved/i);
    expect(captionGuard({ approvalStatus: "draft" }, "The event is confirmed")).toMatch(/confirmed/i);
    expect(captionGuard({ approvalStatus: "approved" }, "See you soon")).toBeNull();
  });

  it("warns on a mismatched asset ratio and gates approval on all requirements", () => {
    expect(ratioWarning(1080, 1080, "instagram", "story")).toMatch(/letterboxed/);
    expect(ratioWarning(1080, 1920, "instagram", "story")).toBeNull();
    expect(canApprove({ platforms: ["x"], brandChecked: false }, [], []).missing).toEqual([
      "Final asset", "Brand check", "X caption approval",
    ]);
    expect(canApprove({ platforms: ["x"], brandChecked: true }, [{ isFinal: true }], [
      { platform: "x", status: "approved", body: "ready" },
    ]).ok).toBe(true);
  });
});
