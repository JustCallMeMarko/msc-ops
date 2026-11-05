export type QueryFilter = { key: string; op: string; value: string };
export type ParsedQuery = { filters: QueryFilter[]; text: string };

const filterPattern = /(^|\s)([\w.-]+):(?:"([^"]*)"|(\S+))/g;

export function parseQuery(query: string): ParsedQuery {
  const filters: QueryFilter[] = [];
  const remainder = query.replace(filterPattern, (_match, prefix: string, key: string, quoted: string | undefined, plain: string | undefined) => {
    let value = quoted ?? plain ?? "";
    let op = "=";
    if (key === "due" && /^[<>]/.test(value)) {
      op = value[0];
      value = value.slice(1);
    }
    filters.push({ key, op, value });
    return prefix;
  });
  return { filters, text: remainder.trim().replace(/\s+/g, " ") };
}

export function formatQuery(query: ParsedQuery): string {
  const filters = query.filters.map(({ key, op, value }) => {
    const encoded = op === "=" ? value : `${op}${value}`;
    return `${key}:${/\s/.test(encoded) ? `"${encoded}"` : encoded}`;
  });
  return [...filters, query.text.trim()].filter(Boolean).join(" ");
}
