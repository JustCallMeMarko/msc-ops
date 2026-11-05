export const TEMPLATE_KINDS = [
  "activity_proposal",
  "par",
  "liquidation",
  "budget_proposal",
  "financial_statement",
  "guest_list",
  "booth_declaration",
  "letter_of_explanation",
  "turnover_certificate",
  "resolution",
  "other",
] as const;

export const TEMPLATE_SOURCES = ["sdao", "scoa", "org", "builtin"] as const;
export const TEMPLATE_FORMATS = ["docx", "xlsx", "pdf_form"] as const;
export const ENTITY_TYPES = ["event", "term", "org"] as const;
export const PACKET_KINDS = ["pre_event", "post_event", "scoa_audit", "renewal"] as const;

export type TemplateKind = (typeof TEMPLATE_KINDS)[number];
export type TemplateSource = (typeof TEMPLATE_SOURCES)[number];
export type TemplateFormat = (typeof TEMPLATE_FORMATS)[number];
export type EntityType = (typeof ENTITY_TYPES)[number];
export type PacketKind = (typeof PACKET_KINDS)[number];
export type DictionaryType = "text" | "date" | "peso" | "number" | "rows";

export type TemplateColumn = {
  index: number;
  label: string;
  field?: string;
};

export type TemplateTarget = {
  id: string;
  label: string;
  kind: "paragraph" | "cell" | "rows" | "field";
  columns?: TemplateColumn[];
  templateRow?: number;
  totalRow?: number;
  totalColumns?: number[];
};

export type TemplateStructure = {
  format: TemplateFormat;
  targets: TemplateTarget[];
  warnings: string[];
  unsupported?: "flat_pdf";
};

export type TemplateMapping = Record<string, {
  field?: string;
  confidence?: number;
  skipped?: boolean;
  columns?: Record<string, string>;
}>;

export type TemplateRecord = {
  id: string;
  lineageId: string;
  name: string;
  kind: TemplateKind;
  source: TemplateSource;
  format: TemplateFormat;
  fileId: string;
  version: number;
  previousTemplateId: string | null;
  active: boolean;
  structure: TemplateStructure;
  mapping: TemplateMapping;
  mappingConfirmedAt: Date | null;
  warnings: string[];
};

export type GenerationEntity = {
  type: EntityType;
  id: string;
  title?: string;
  termStart?: string;
  termEnd?: string;
};

export type GridPreview = {
  sheets: Array<{
    name: string;
    rows: GridPreviewCell[][];
  }>;
};

export type GridPreviewCell = {
  v: string | number | boolean | null;
  missing: boolean;
  targetId?: string;
  colSpan?: number;
  rowSpan?: number;
  skip?: boolean;
};
