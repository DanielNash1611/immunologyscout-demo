"use client";

import type { PaperMetadata } from "@/types/immunologyScout";

function decodeHtmlEntities(text: string): string {
  if (!text) return "";
  if (typeof window === "undefined") return text;
  const div = document.createElement("div");
  div.innerHTML = text;
  return div.textContent || div.innerText || text;
}

function formatAbstract(abstract?: string, max = 400): string {
  if (!abstract) return "No abstract available.";
  const decoded = decodeHtmlEntities(abstract).trim();
  if (decoded.length <= max) return decoded;
  return `${decoded.slice(0, max)}…`;
}

function formatMeta(paper: PaperMetadata): string {
  const parts = [];
  if (paper.journal) parts.push(paper.journal);
  if (paper.year) parts.push(String(paper.year));
  if (paper.source) parts.push(paper.source);
  return parts.join(" • ");
}

export type PaperResult = PaperMetadata;

export function SearchPapersResult(props: { query: string; papers: PaperMetadata[] }) {
  const { query, papers } = props;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan-100/60">
            Papers
          </div>
          <div className="mt-2 text-sm text-slate-300">
            {papers.length} literature hit{papers.length === 1 ? "" : "s"} for “{decodeHtmlEntities(query)}”
          </div>
        </div>
        <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300">
          PubMed + preprints
        </div>
      </div>

      {papers.length === 0 ? (
        <div className="rounded-[1.2rem] border border-dashed border-white/10 bg-white/5 p-5 text-sm text-slate-300">
          No papers were retrieved for this search.
        </div>
      ) : (
        <div className="space-y-4">
          {papers.map((paper, index) => (
            <article
              key={paper.pmid || paper.doi || `${paper.title}-${index}`}
              className="rounded-[1.3rem] border border-white/10 bg-white/5 p-5 transition hover:border-cyan-300/25 hover:bg-white/[0.07]"
            >
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="space-y-2">
                  {paper.url ? (
                    <a
                      href={paper.url}
                      target="_blank"
                      rel="noreferrer"
                      className="font-display text-2xl leading-tight text-white transition hover:text-cyan-200"
                    >
                      {decodeHtmlEntities(paper.title)}
                    </a>
                  ) : (
                    <h3 className="font-display text-2xl leading-tight text-white">
                      {decodeHtmlEntities(paper.title)}
                    </h3>
                  )}
                  <div className="text-sm text-slate-400">{formatMeta(paper)}</div>
                </div>

                <div className="flex flex-wrap gap-2">
                  {paper.source ? (
                    <span className="rounded-full border border-white/10 bg-slate-950/40 px-3 py-1 text-xs uppercase tracking-[0.18em] text-slate-300">
                      {paper.source}
                    </span>
                  ) : null}
                  {paper.isOpenAccess ? (
                    <span className="rounded-full border border-emerald-300/20 bg-emerald-300/10 px-3 py-1 text-xs uppercase tracking-[0.18em] text-emerald-100">
                      Open access
                    </span>
                  ) : null}
                </div>
              </div>

              <p className="mt-4 text-sm leading-7 text-slate-200">
                {formatAbstract(paper.abstractSnippet || paper.abstract)}
              </p>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
