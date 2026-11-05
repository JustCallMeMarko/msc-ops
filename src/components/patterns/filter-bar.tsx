"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Input } from "@/components/ui/input";
import { parseQuery, type ParsedQuery } from "@/lib/query";

export { formatQuery, parseQuery } from "@/lib/query";
export type { ParsedQuery, QueryFilter } from "@/lib/query";

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
