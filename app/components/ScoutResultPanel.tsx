"use client";

import type { ScoutResponse } from "@/types/demoScout";
import { CombinedResults } from "./CombinedResults";
import { SearchPapersResult } from "./SearchPapersResult";
import { SynthesisWidgetRenderer } from "./SynthesisWidgetRenderer";

export function ScoutResultPanel(props: { result: ScoutResponse }) {
  const { result } = props;

  return (
    <div className="space-y-8">
      <section className="grid gap-3 lg:grid-cols-3">
        <div className="rounded-[1.2rem] border border-white/10 bg-white/5 p-4">
          <div className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan-100/60">Query</div>
          <div className="mt-3 text-base leading-7 text-white">{result.query}</div>
        </div>
        <div className="rounded-[1.2rem] border border-white/10 bg-white/5 p-4">
          <div className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan-100/60">Retrieval</div>
          <div className="mt-3 text-base text-white">
            {result.meta.paperCount} paper{result.meta.paperCount === 1 ? "" : "s"} · {result.meta.patentCount} patent
            {result.meta.patentCount === 1 ? "" : "s"}
          </div>
        </div>
        <div className="rounded-[1.2rem] border border-white/10 bg-white/5 p-4">
          <div className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan-100/60">Synthesis</div>
          <div className="mt-3 text-base text-white">
            {result.meta.synthesisSource === "openai" ? "Model-assisted brief" : "Deterministic demo brief"}
          </div>
        </div>
      </section>

      {result.notices.length > 0 ? (
        <section className="grid gap-3">
          {result.notices.map((notice) => (
            <article
              key={`${notice.title}-${notice.message}`}
              className={`rounded-[1.2rem] border p-4 text-sm leading-6 ${
                notice.tone === "warning"
                  ? "border-amber-300/20 bg-amber-300/10 text-amber-50"
                  : "border-white/10 bg-white/5 text-slate-200"
              }`}
            >
              <div className="text-xs font-semibold uppercase tracking-[0.18em]">
                {notice.title}
              </div>
              <p className="mt-2">{notice.message}</p>
            </article>
          ))}
        </section>
      ) : null}

      <section className="space-y-4">
        <SearchPapersResult query={result.query} papers={result.papers} />
      </section>

      <section className="space-y-4">
        <CombinedResults payload={{ query: result.query, patents: result.patents }} />
      </section>

      <section className="space-y-4">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan-100/60">
            Synthesis
          </div>
          <h3 className="mt-2 font-display text-3xl text-white">Interpretive brief</h3>
        </div>
        {result.synthesis_widget ? (
          <SynthesisWidgetRenderer
            data={result.synthesis_widget}
            papers={result.papers}
            patents={result.patents}
          />
        ) : (
          <div className="rounded-[1.3rem] border border-white/10 bg-white/5 px-5 py-4 text-sm leading-7 text-slate-200 whitespace-pre-wrap">
            {result.synthesis_markdown || "Synthesis unavailable."}
          </div>
        )}
      </section>
    </div>
  );
}
