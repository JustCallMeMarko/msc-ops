export const EVENT_TYPE_LABELS: Record<string, string> = {
  on_campus: "On-campus",
  off_campus: "Off-campus",
  online: "Online",
  booth: "Booth",
};

export const APPROVAL_STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  submitted: "Submitted",
  approved: "Approved",
  rejected: "Rejected",
  cancelled: "Cancelled",
};

export const ATTENDEE_SOURCE_LABELS: Record<string, string> = {
  luma_csv: "Luma import",
  manual: "Manual",
};

export const FILE_KIND_LABELS: Record<string, string> = {
  manual: "Manual",
  cbl: "CBL",
  template: "Template",
  generated: "Generated",
  receipt: "Receipt",
  creative: "Creative",
  event_photo: "Event photo",
  import: "Import",
  other: "Other",
};

export const FILE_SOURCE_LABELS: Record<string, string> = {
  sdao: "SDAO",
  scoa: "SCOA",
  org: "MSC",
  other: "Other",
};

export function fileKindLabel(kind: string, source?: string | null) {
  if (kind === "template" && source && source !== "other") {
    return `${FILE_SOURCE_LABELS[source] ?? enumLabel(source)} template`;
  }
  return FILE_KIND_LABELS[kind] ?? enumLabel(kind);
}

export function enumLabel(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export const POST_TYPE_LABELS: Record<string, string> = {
  poster: "Poster",
  save_the_date: "Save the date",
  registration_open: "Registration open",
  speaker_reveal: "Speaker reveal",
  countdown: "Countdown",
  day_of: "Day of",
  highlight: "Highlight",
  thank_you: "Thank you",
  reschedule_notice: "Reschedule notice",
  general: "General",
};

export const POST_STATUS_LABELS: Record<string, string> = {
  idea: "Idea",
  drafting: "Drafting",
  for_review: "For review",
  approved: "Approved",
  scheduled: "Scheduled",
  posted: "Posted",
  cancelled: "Cancelled",
};

export const POST_PLATFORM_LABELS: Record<string, string> = {
  facebook: "Facebook",
  instagram: "Instagram",
  linkedin: "LinkedIn",
  x: "X",
  tiktok: "TikTok",
};

export const CAPTION_STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  approved: "Approved",
};
