"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Input } from "@/components/ui/input";

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

export function FilterBar({ placeholder = "Filter or search…", onQueryChange }: { placeholder?: string; onQueryChange?: (query: ParsedQuery) => void }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState(searchParams.get("q") ?? "");
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setQuery(searchParams.get("q") ?? ""), [searchParams]);
  function update(value: string) {
    setQuery(value);
    onQueryChange?.(parseQuery(value));
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set("q", value);
    else params.delete("q");
    router.replace(`${pathname}${params.size ? `?${params.toString()}` : ""}`);
  }
  return <Input aria-label="Filter query" value={query} onChange={(event) => update(event.target.value)} placeholder={placeholder} />;
}
