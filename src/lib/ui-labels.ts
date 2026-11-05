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
