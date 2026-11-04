import { TZDate } from "@date-fns/tz";
import { addDays, differenceInCalendarDays, format } from "date-fns";
import { nextCheckin, MANILA_TIME_ZONE } from "@/lib/tasks/logic";

export const POST_TYPES = [
  "poster", "save_the_date", "registration_open", "speaker_reveal", "countdown",
  "day_of", "highlight", "thank_you", "reschedule_notice", "general",
] as const;
export const POST_STATUSES = ["idea", "drafting", "for_review", "approved", "scheduled", "posted", "cancelled"] as const;
export const POST_PLATFORMS = ["facebook", "instagram", "linkedin", "x", "tiktok"] as const;
export type PostType = typeof POST_TYPES[number];
export type PostStatus = typeof POST_STATUSES[number];
export type PostPlatform = typeof POST_PLATFORMS[number];

export type PostingRule = {
  key: string;
  postType: PostType | string;
  label: string;
  offsetDays: number;
  anchor: "event_start" | "event_end" | string;
  enabled: boolean;
};

export type CreativeEvent = {
  id: string;
  name: string;
  startsAt: Date;
  endsAt: Date;
  venue: string;
  lumaUrl: string | null;
  approvalStatus: string;
  participantActual?: number;
  participantTarget?: number;
};

export type CreativeCommittee = { id: string; slug: string; defaultCheckinDays: number };

export type GeneratedPost = {
  eventId: string;
  title: string;
  type: PostType;
  status: "idea";
  scheduledAt: Date;
  platforms: PostPlatform[];
  artistMemberId: null;
  writerMemberId: null;
  reviewerMemberId: null;
  brandChecked: false;
  ruleKey: string;
  scheduleOverridden: false;
  artworkTask: GeneratedTask;
  captionTask: GeneratedTask;
};

export type GeneratedTask = {
  title: string;
  body: string;
  committeeId: string | null;
  dueAt: Date;
  status: "todo";
  priority: "normal";
  progress: 0;
  eventId: string;
  checkinEveryDays: number;
  nextCheckinAt: Date;
};

function atManilaHour(date: Date, hour: number): Date {
  const result = new TZDate(date, MANILA_TIME_ZONE);
  result.setHours(hour, 0, 0, 0);
  return new Date(result);
}

function scheduleDate(event: CreativeEvent, rule: PostingRule): Date {
  const anchor = rule.anchor === "event_end" ? event.endsAt : event.startsAt;
  const day = new TZDate(anchor, MANILA_TIME_ZONE);
  day.setDate(day.getDate() + rule.offsetDays);
  day.setHours(18, 0, 0, 0);
  return new Date(day);
}

function taskDueDate(scheduledAt: Date, daysBefore: number): Date {
  return atManilaHour(addDays(new TZDate(scheduledAt, MANILA_TIME_ZONE), -daysBefore), 17);
}

function makeTask(
  event: CreativeEvent,
  postTitle: string,
  scheduledAt: Date,
  kind: "artwork" | "caption",
  committeeId: string | null,
  cadence: number,
  currentTime: Date,
): GeneratedTask {
  const dueAt = taskDueDate(scheduledAt, kind === "artwork" ? 3 : 2);
  return {
    title: `${kind === "artwork" ? "Artwork" : "Caption"}: ${postTitle}`,
    body: `Prepare the ${kind} for "${postTitle}" scheduled ${format(new TZDate(scheduledAt, MANILA_TIME_ZONE), "EEE, MMM d")} for ${event.name}.`,
    committeeId,
    dueAt,
    status: "todo",
    priority: "normal",
    progress: 0,
    eventId: event.id,
    checkinEveryDays: cadence,
    nextCheckinAt: nextCheckin({ from: currentTime, everyDays: cadence, dueAt, now: currentTime }),
  };
}

export function generatePostSchedule(
  event: CreativeEvent,
  rules: PostingRule[],
  committees: CreativeCommittee[],
  currentTime = new Date(),
): GeneratedPost[] {
  const creativeCommittee = committees.find((committee) => committee.slug === "creatives");
  const cadence = creativeCommittee?.defaultCheckinDays ?? 3;
  const outputs: GeneratedPost[] = [];
  for (const rule of rules) {
    if (!rule.enabled) continue;
    const scheduledAt = scheduleDate(event, rule);
    const title = rule.label || `${rule.postType.replaceAll("_", " ")} · ${event.name}`;
    outputs.push({
      eventId: event.id,
      title,
      type: rule.postType as PostType,
      status: "idea",
      scheduledAt,
      platforms: ["facebook", "instagram"],
      artistMemberId: null,
      writerMemberId: null,
      reviewerMemberId: null,
      brandChecked: false,
      ruleKey: rule.key,
      scheduleOverridden: false,
      artworkTask: makeTask(event, title, scheduledAt, "artwork", creativeCommittee?.id ?? null, cadence, currentTime),
      captionTask: makeTask(event, title, scheduledAt, "caption", null, cadence, currentTime),
    });
  }
  return outputs;
}

export type ExistingPost = {
  id: string;
  eventId: string | null;
  title: string;
  type: string;
  status: string;
  scheduledAt: Date | null;
  postedAt: Date | null;
  ruleKey: string | null;
  scheduleOverridden: boolean;
  artworkTaskId: string | null;
  captionTaskId: string | null;
};

export function reschedulePosts(
  posts: ExistingPost[],
  _oldEvent: CreativeEvent,
  newEvent: CreativeEvent,
  rules: PostingRule[],
): {
  posts: ExistingPost[];
  taskDueDates: Array<{ taskId: string; dueAt: Date }>;
  cancelledTaskIds: string[];
  noticePost: Omit<ExistingPost, "id"> | null;
} {
  const cancelledTaskIds: string[] = [];
  const taskDueDates: Array<{ taskId: string; dueAt: Date }> = [];
  if (newEvent.approvalStatus === "cancelled") {
    const updated = posts.map((post) => {
      if (post.postedAt || post.status === "posted") return post;
      if (post.artworkTaskId) cancelledTaskIds.push(post.artworkTaskId);
      if (post.captionTaskId) cancelledTaskIds.push(post.captionTaskId);
      return { ...post, status: "cancelled" };
    });
    return {
      posts: updated,
      taskDueDates,
      cancelledTaskIds,
      noticePost: {
        eventId: newEvent.id,
        title: `Reschedule notice: ${newEvent.name}`,
        type: "reschedule_notice",
        status: "idea",
        scheduledAt: null,
        postedAt: null,
        ruleKey: "reschedule",
        scheduleOverridden: false,
        artworkTaskId: null,
        captionTaskId: null,
      },
    };
  }
  const ruleByKey = new Map(rules.map((rule) => [rule.key, rule]));
  const updated = posts.map((post) => {
    if (post.scheduleOverridden || post.postedAt || post.status === "posted" || post.status === "cancelled") return post;
    const rule = post.ruleKey ? ruleByKey.get(post.ruleKey) : undefined;
    if (!rule || !rule.enabled) return post;
    const scheduledAt = scheduleDate(newEvent, rule);
    if (post.artworkTaskId) taskDueDates.push({ taskId: post.artworkTaskId, dueAt: taskDueDate(scheduledAt, 3) });
    if (post.captionTaskId) taskDueDates.push({ taskId: post.captionTaskId, dueAt: taskDueDate(scheduledAt, 2) });
    return { ...post, eventId: newEvent.id, scheduledAt };
  });
  return { posts: updated, taskDueDates, cancelledTaskIds, noticePost: null };
}

function graphemeLength(text: string): number {
  return [...new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(text)].length;
}

const CAPTION_LIMITS: Record<PostPlatform, number> = {
  x: 280,
  instagram: 2200,
  linkedin: 3000,
  tiktok: 2200,
  facebook: 63206,
};

export function captionLength(text: string, platform: PostPlatform): {
  length: number;
  limit: number;
  over: boolean;
  hashtagCount: number;
  hashtagOver: boolean;
} {
  const length = platform === "x"
    ? graphemeLength(text.replace(/https?:\/\/[^\s]+/giu, ""))
      + (text.match(/https?:\/\/[^\s]+/giu)?.length ?? 0) * 23
    : graphemeLength(text);
  const hashtagCount = [...text.matchAll(/(?:^|\s)#\p{L}[\p{L}\p{N}_]*/gu)].length;
  const limit = CAPTION_LIMITS[platform];
  return { length, limit, over: length > limit, hashtagCount, hashtagOver: platform === "instagram" && hashtagCount > 30 };
}

export function unicodeStyledWarning(text: string): boolean {
  return /[\u{1d400}-\u{1d7ff}]/u.test(text);
}

export type CaptionContext = {
  eventName: string;
  startsAt: Date;
  scheduledAt: Date;
  venue: string;
  lumaLink: string | null;
  attendance?: number;
  speaker?: string;
};

export function renderCaption(template: string, context: CaptionContext): string {
  const values: Record<string, string> = {
    event_name: context.eventName,
    date: format(new TZDate(context.startsAt, MANILA_TIME_ZONE), "EEE, MMM d"),
    days_left: String(differenceInCalendarDays(
      new TZDate(context.startsAt, MANILA_TIME_ZONE),
      new TZDate(context.scheduledAt, MANILA_TIME_ZONE),
    )),
    venue: context.venue,
    luma_link: context.lumaLink ?? "",
    attendance: String(context.attendance ?? 0),
    speaker: context.speaker ?? "",
  };
  return template.replace(/\{\{(event_name|date|days_left|venue|luma_link|attendance|speaker)\}\}/g, (_match, key: string) => values[key]);
}

export function captionGuard(event: { approvalStatus: string }, text: string): string | null {
  if (event.approvalStatus === "approved") return null;
  return /\bconfirmed\b|\bsee you\b/i.test(text)
    ? "This event is not approved. The caption says it is confirmed or invites people to attend."
    : "This event is not approved. Review the caption before posting.";
}

const RATIOS: Record<string, number> = {
  feed: 4 / 5,
  square: 1,
  story: 9 / 16,
  reel: 9 / 16,
  link: 1200 / 630,
};

export function ratioWarning(width: number, height: number, platform: PostPlatform, placement: string): string | null {
  const target = RATIOS[placement];
  if (!target || width <= 0 || height <= 0 || Math.abs(width / height - target) < 0.015) return null;
  const platformName = platform === "x" ? "X" : platform[0].toUpperCase() + platform.slice(1);
  return `${width}×${height} on ${platformName} ${placement === "story" ? "Story" : placement} will be letterboxed`;
}

export type ApproveAsset = { isFinal: boolean };
export type ApproveCaption = { platform: string; status: string; body: string };

export function canApprove(
  post: { platforms: string[]; brandChecked: boolean },
  assets: ApproveAsset[],
  currentCaptions: ApproveCaption[],
): { ok: boolean; missing: string[] } {
  const missing: string[] = [];
  if (!assets.some((asset) => asset.isFinal)) missing.push("Final asset");
  if (!post.brandChecked) missing.push("Brand check");
  for (const platform of post.platforms) {
    const caption = currentCaptions.find((entry) => entry.platform === platform);
    if (!caption || caption.status !== "approved") {
      missing.push(`${platform} caption approval`);
      continue;
    }
    if (captionLength(caption.body, platform as PostPlatform).over) missing.push(`${platform} caption is over the limit`);
  }
  return { ok: missing.length === 0, missing };
}
