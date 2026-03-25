"use client";

import { FormEvent, useEffect, useState } from "react";
import { siteConfig, sampleQueries } from "@/lib/site";
import type { ScoutResponse } from "@/types/demoScout";
import { ScoutResultPanel } from "./components/ScoutResultPanel";

const loadingStages = [
  "Searching PubMed and preprint sources",
  "Checking public patent coverage",
  "Drafting a concise synthesis brief"
];

export default function HomePage() {
  const [query, setQuery] = useState("");
  const [includePatents, setIncludePatents] = useState(true);
  const [result, setResult] = useState<ScoutResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [activeStage, setActiveStage] = useState(loadingStages[0]);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  useEffect(() => {
    if (!isLoading) {
      setActiveStage(loadingStages[0]);
      setElapsedSeconds(0);
      return;
    }

    let stageIndex = 0;
    const stageTimer = setInterval(() => {
      stageIndex = (stageIndex + 1) % loadingStages.length;
      setActiveStage(loadingStages[stageIndex]);
    }, 1600);

    const elapsedTimer = setInterval(() => {
      setElapsedSeconds((current) => current + 1);
    }, 1000);

    return () => {
      clearInterval(stageTimer);
      clearInterval(elapsedTimer);
    };
  }, [isLoading]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedQuery = query.trim();
    if (!trimmedQuery || isLoading) return;

    setIsLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch("/api/scout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          query: trimmedQuery,
          includePatents
        })
      });

      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        setError(payload?.error || "Unable to complete this search right now.");
        return;
      }

      setResult(payload as ScoutResponse);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to complete this search right now."
      );
    } finally {
      setIsLoading(false);
    }
  }

  function applySampleQuery(nextQuery: string) {
    setQuery(nextQuery);
    setError(null);
  }

  return (
    <main className="min-h-screen px-4 pb-16 pt-6 sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <section className="surface hero-panel relative overflow-hidden px-6 py-8 sm:px-8 sm:py-10">
          <div className="grid gap-8 lg:grid-cols-[minmax(0,1.4fr),340px]">
            <div className="space-y-6">
              <div className="flex flex-wrap items-center gap-3 text-xs uppercase tracking-[0.24em] text-cyan-100/70">
                <span className="rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1 text-[11px] font-semibold">
                  Portfolio Demo
                </span>
                <span>Search</span>
                <span className="h-1 w-1 rounded-full bg-cyan-200/60" />
                <span>Results</span>
                <span className="h-1 w-1 rounded-full bg-cyan-200/60" />
                <span>Synthesis</span>
              </div>

              <div className="space-y-4">
                <h1 className="max-w-3xl font-display text-4xl leading-tight text-white sm:text-5xl lg:text-6xl">
                  Search the immunology landscape and turn raw retrieval into a usable brief.
                </h1>
                <p className="max-w-2xl text-base leading-7 text-slate-200 sm:text-lg">
                  {siteConfig.name} is a public-safe research assistant demo for literature scouting,
                  public patent review, and fast synthesis. It is designed to feel like a polished
                  workbench rather than a stripped-down internal prototype.
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="rounded-[1.7rem] border border-white/10 bg-slate-950/50 p-3 shadow-[0_18px_60px_rgba(3,8,20,0.45)]">
                  <label htmlFor="scout-query" className="sr-only">
                    Search query
                  </label>
                  <textarea
                    id="scout-query"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder='Try "Treg stability in inflamed tissue" or "Complement inhibition in renal inflammation".'
                    className="min-h-[150px] w-full resize-none rounded-[1.2rem] border border-white/10 bg-transparent px-4 py-4 text-base leading-7 text-white placeholder:text-slate-400 focus:border-cyan-300/50 focus:outline-none focus:ring-2 focus:ring-cyan-300/20"
                  />

                  <div className="mt-3 flex flex-col gap-3 border-t border-white/10 px-2 pt-4 sm:flex-row sm:items-center sm:justify-between">
                    <label className="inline-flex items-center gap-3 text-sm text-slate-200">
                      <input
                        type="checkbox"
                        checked={includePatents}
                        onChange={(event) => setIncludePatents(event.target.checked)}
                        className="h-4 w-4 rounded border-white/20 bg-slate-900 text-cyan-300 focus:ring-cyan-300/30"
                      />
                      Include public patent retrieval
                    </label>

                    <button
                      type="submit"
                      disabled={isLoading}
                      className="inline-flex items-center justify-center gap-3 rounded-full bg-cyan-300 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:bg-cyan-500/60"
                    >
                      <span className={`status-dot ${isLoading ? "is-active" : ""}`} />
                      {isLoading ? "Scouting in progress" : "Run scout"}
                    </button>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  {sampleQueries.map((sample) => (
                    <button
                      key={sample}
                      type="button"
                      onClick={() => applySampleQuery(sample)}
                      className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-200 transition hover:border-cyan-300/40 hover:bg-cyan-300/10 hover:text-white"
                    >
                      {sample}
                    </button>
                  ))}
                </div>
              </form>
            </div>

            <aside className="space-y-4">
              <div className="rounded-[1.6rem] border border-white/10 bg-white/5 p-5 backdrop-blur">
                <div className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan-100/60">
                  Retrieval Surface
                </div>
                <div className="mt-4 space-y-3 text-sm leading-6 text-slate-200">
                  <p>PubMed summaries and abstracts</p>
                  <p>bioRxiv and medRxiv preprints</p>
                  <p>PatentsView with graceful fallback when unavailable</p>
                  <p>Structured synthesis widget with citation links</p>
                </div>
              </div>

              <div className="rounded-[1.6rem] border border-white/10 bg-slate-950/50 p-5">
                <div className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan-100/60">
                  Demo Positioning
                </div>
                <p className="mt-4 text-sm leading-6 text-slate-200">
                  This repo is intentionally limited to search, retrieval, and synthesis. It omits
                  private workflow logic, unpublished research direction, and internal evaluation
                  assets.
                </p>
              </div>
            </aside>
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-[minmax(0,1.4fr),320px]">
          <div className="surface min-h-[420px] px-5 py-5 sm:px-6 sm:py-6">
            <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan-100/60">
                  Research Workbench
                </div>
                <h2 className="mt-2 font-display text-3xl text-white">Search results and synthesis</h2>
              </div>
              {isLoading ? (
                <div
                  aria-live="polite"
                  className="rounded-full border border-cyan-300/20 bg-cyan-300/10 px-4 py-2 text-sm text-cyan-50"
                >
                  <span className="mr-2 inline-flex h-2 w-2 rounded-full bg-cyan-300 animate-pulse" />
                  {activeStage} · {elapsedSeconds}s
                </div>
              ) : null}
            </div>

            {error ? (
              <div className="rounded-[1.4rem] border border-rose-300/20 bg-rose-300/10 p-4 text-sm leading-6 text-rose-100">
                {error}
              </div>
            ) : null}

            {result ? (
              <ScoutResultPanel result={result} />
            ) : isLoading ? (
              <LoadingPreview stage={activeStage} />
            ) : (
              <EmptyState />
            )}
          </div>

          <aside className="space-y-4">
            <div className="surface px-5 py-5">
              <div className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan-100/60">
                Experience
              </div>
              <div className="mt-4 space-y-4 text-sm leading-6 text-slate-200">
                <p>Ask one focused immunology question.</p>
                <p>Review representative papers and public prior-art signals.</p>
                <p>Use the synthesis panel as a fast starting brief for deeper work.</p>
              </div>
            </div>

            <div className="surface px-5 py-5">
              <div className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan-100/60">
                Guardrails
              </div>
              <div className="mt-4 space-y-3 text-sm leading-6 text-slate-200">
                <p>No disease-program hardcoding.</p>
                <p>No private prompts, evals, or internal notes.</p>
                <p>No medical advice or scientific validation claims.</p>
              </div>
            </div>
          </aside>
        </section>
      </div>
    </main>
  );
}

function EmptyState() {
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="rounded-[1.4rem] border border-white/10 bg-white/5 p-5">
        <div className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan-100/60">
          1. Retrieve
        </div>
        <h3 className="mt-3 font-display text-2xl text-white">Literature first</h3>
        <p className="mt-3 text-sm leading-6 text-slate-200">
          The demo pulls recent literature and preprints, normalizes metadata, and presents them as
          structured result cards.
        </p>
      </div>

      <div className="rounded-[1.4rem] border border-white/10 bg-white/5 p-5">
        <div className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan-100/60">
          2. Compare
        </div>
        <h3 className="mt-3 font-display text-2xl text-white">Prior-art view</h3>
        <p className="mt-3 text-sm leading-6 text-slate-200">
          When public patent coverage is available, the workbench adds a compact prior-art view
          without exposing private workflow logic.
        </p>
      </div>

      <div className="rounded-[1.4rem] border border-white/10 bg-white/5 p-5">
        <div className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan-100/60">
          3. Synthesize
        </div>
        <h3 className="mt-3 font-display text-2xl text-white">Brief, not black box</h3>
        <p className="mt-3 text-sm leading-6 text-slate-200">
          The final synthesis stays citation-linked and easy to inspect, so the output feels like a
          credible research brief rather than opaque magic.
        </p>
      </div>
    </div>
  );
}

function LoadingPreview(props: { stage: string }) {
  return (
    <div className="space-y-4">
      <div className="rounded-[1.4rem] border border-white/10 bg-white/5 p-5">
        <div className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan-100/60">
          In Progress
        </div>
        <h3 className="mt-3 font-display text-2xl text-white">{props.stage}</h3>
        <p className="mt-3 text-sm leading-6 text-slate-200">
          The demo is assembling literature, optional patent context, and a synthesis widget.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {[0, 1].map((index) => (
          <div
            key={index}
            className="rounded-[1.4rem] border border-white/10 bg-white/5 p-5 animate-pulse"
          >
            <div className="h-3 w-24 rounded-full bg-white/10" />
            <div className="mt-4 h-6 w-5/6 rounded-full bg-white/10" />
            <div className="mt-4 space-y-2">
              <div className="h-3 rounded-full bg-white/10" />
              <div className="h-3 w-11/12 rounded-full bg-white/10" />
              <div className="h-3 w-4/5 rounded-full bg-white/10" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
