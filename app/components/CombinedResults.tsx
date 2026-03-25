"use client";

import type { PatentMetadata } from "@/types/immunologyScout";

type CombinedResultsPayload = {
  query?: string;
  patents?: PatentMetadata[];
};

function formatAssignees(patent: PatentMetadata): string | undefined {
  if (Array.isArray(patent.assignees) && patent.assignees.length > 0) {
    return patent.assignees.filter(Boolean).join("; ");
  }
  return patent.assignee;
}

function formatPatentId(patent: PatentMetadata): string | undefined {
  return patent.patentNumber || patent.patentId;
}

function formatYear(patent: PatentMetadata): number | undefined {
  return patent.publicationYear;
}

function formatCpc(patent: PatentMetadata): string | undefined {
  return Array.isArray(patent.cpcClasses) && patent.cpcClasses.length > 0
    ? patent.cpcClasses.join(", ")
    : undefined;
}

function formatSummary(patent: PatentMetadata): string | undefined {
  return patent.abstractSnippet || patent.abstract;
}

export function CombinedResults(props: { payload: CombinedResultsPayload }) {
  const { payload } = props;
  const patents = Array.isArray(payload.patents) ? payload.patents : [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan-100/60">
            Patent Signals
          </div>
          <div className="mt-2 text-sm text-slate-300">
            {payload.query ? `Public prior-art retrieval for “${payload.query}”` : "Public prior-art retrieval"}
          </div>
        </div>
        <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300">
          PatentsView
        </div>
      </div>

      {patents.length === 0 ? (
        <div className="rounded-[1.2rem] border border-dashed border-white/10 bg-white/5 p-5 text-sm text-slate-300">
          No patent records are included in this run.
        </div>
      ) : (
        <div className="space-y-4">
          {patents.map((patent, index) => {
            const title = patent.title || "Untitled patent";
            const patentId = formatPatentId(patent);
            const year = formatYear(patent);
            const assignees = formatAssignees(patent);
            const cpc = formatCpc(patent);
            const summary = formatSummary(patent);
            const url = patent.url;

            return (
              <article
                key={patentId || `${title}-${index}`}
                className="rounded-[1.3rem] border border-white/10 bg-white/5 p-5 transition hover:border-cyan-300/25 hover:bg-white/[0.07]"
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="space-y-2">
                    {url ? (
                      <a
                        href={url}
                        target="_blank"
                        rel="noreferrer"
                        className="font-display text-2xl leading-tight text-white transition hover:text-cyan-200"
                      >
                        {title}
                      </a>
                    ) : (
                      <h3 className="font-display text-2xl leading-tight text-white">{title}</h3>
                    )}
                    <div className="text-sm text-slate-400">
                      {[patentId, year ? String(year) : undefined, assignees].filter(Boolean).join(" • ")}
                    </div>
                  </div>

                  {cpc ? (
                    <span className="rounded-full border border-white/10 bg-slate-950/40 px-3 py-1 text-xs uppercase tracking-[0.18em] text-slate-300">
                      {cpc}
                    </span>
                  ) : null}
                </div>

                {summary ? (
                  <p className="mt-4 text-sm leading-7 text-slate-200">{summary}</p>
                ) : null}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
