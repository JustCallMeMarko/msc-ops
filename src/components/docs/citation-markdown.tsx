"use client";

import ReactMarkdown from "react-markdown";

export type CitationSource = {
  n: number;
  documentId: string;
  page: number;
  title?: string;
  text?: string;
  auto?: boolean;
};

export function renderCitedMarkdown(
  content: string,
  sources: CitationSource[],
  onCitation: (source?: CitationSource) => void,
) {
  const markdown = content.replace(/\[(\d+)\](?!\s*\()/g, (_, number: string) => `[${number}](https://msc-citation.invalid/${number})`);
  return <div className="prose prose-sm max-w-none dark:prose-invert">
    <ReactMarkdown components={{
      a: ({ href, children }) => {
        const citation = /^https:\/\/msc-citation\.invalid\/(\d+)$/.exec(href ?? "");
        if (citation) {
          const number = Number(citation[1]);
          const source = sources.find((item) => item.n === number);
          return <button type="button" title={source?.auto ? "Matched automatically" : undefined} onClick={() => onCitation(source)} disabled={!source} className={`mx-0.5 inline-flex rounded px-1.5 py-0.5 text-xs font-semibold align-baseline ${source?.auto ? "bg-secondary text-muted-foreground" : "bg-primary/10 text-primary"}`}>[{number}]</button>;
        }
        return href && /^https?:\/\//i.test(href)
          ? <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>
          : <>{children}</>;
      },
    }}>{markdown}</ReactMarkdown>
  </div>;
}
