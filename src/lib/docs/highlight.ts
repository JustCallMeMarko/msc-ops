export function escapeDocumentText(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

export function renderDocumentHighlight(value: string, start: number, end: number): string {
  const from = Math.max(0, Math.min(value.length, start));
  const to = Math.max(from, Math.min(value.length, end));
  if (to === from) return escapeDocumentText(value);
  return `${escapeDocumentText(value.slice(0, from))}<mark class="cite-hl">${escapeDocumentText(value.slice(from, to))}</mark>${escapeDocumentText(value.slice(to))}`;
}
