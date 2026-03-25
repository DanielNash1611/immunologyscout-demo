"use client";

import type { CitationRef, SynthesisWidget } from "@/lib/synthesisWidget";
import { buildCanonicalPatentId, parsePatentIdentifierParts } from "@/lib/patentCanonical";
import type { PaperResult } from "./SearchPapersResult";

type PatentLike = {
  id?: string;
  patentId?: string;
  patentNumber?: string;
  title?: string;
  externalUrl?: string;
  url?: string;
};

type Props = {
  data: SynthesisWidget;
  papers?: PaperResult[];
  patents?: PatentLike[];
};

type ResolvedCitation = {
  key: string;
  label: string;
  href?: string;
};

function resolveCitation(
  citation: CitationRef,
  papers: PaperResult[],
  patents: PatentLike[]
): ResolvedCitation {
  if (citation.kind === "pubmed") {
    const pmid = citation.id;
    const matchedPaper = papers.find((paper) => paper.pmid === pmid);
    return {
      key: `pubmed:${pmid}`,
      label: `PMID: ${pmid}`,
      href: matchedPaper?.url || `https://pubmed.ncbi.nlm.nih.gov/${encodeURIComponent(pmid)}/`
    };
  }

  if (citation.kind === "patent") {
    const citationPatentId = citation.id;
    const matchedPatent = patents.find(
      (patent) =>
        patent.id === citationPatentId ||
        patent.patentId === citationPatentId ||
        patent.patentNumber === citationPatentId
    );
    const resolvedPatentId =
      matchedPatent?.patentId || matchedPatent?.patentNumber || matchedPatent?.id || citationPatentId;

    let href: string | undefined;
    try {
      const derived = buildCanonicalPatentId(parsePatentIdentifierParts(resolvedPatentId));
      href = `https://patents.google.com/patent/${encodeURIComponent(derived.canonicalId)}`;
    } catch {
      href = undefined;
    }

    return {
      key: `patent:${citationPatentId}`,
      label: `Patent: ${citationPatentId}`,
      href
    };
  }

  return {
    key: `url:${citation.url}`,
    label: "Link",
    href: citation.url
  };
}

function CitationChips(props: { citations?: CitationRef[]; papers: PaperResult[]; patents: PatentLike[] }) {
  const { citations, papers, patents } = props;
  if (!citations || citations.length === 0) return null;

  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {citations.map((citation) => {
        const resolved = resolveCitation(citation, papers, patents);
        if (resolved.href) {
          return (
            <a
              key={resolved.key}
              href={resolved.href}
              target="_blank"
              rel="noreferrer"
              className="rounded-full border border-slate-300 bg-white px-2 py-0.5 text-xs font-medium text-slate-700 transition hover:border-blue-300 hover:text-blue-700"
            >
              {resolved.label}
            </a>
          );
        }
        return (
          <span
            key={resolved.key}
            className="rounded-full border border-slate-300 bg-white px-2 py-0.5 text-xs font-medium text-slate-700"
          >
            {resolved.label}
          </span>
        );
      })}
    </div>
  );
}

function calloutToneClasses(tone: "note" | "warning" | "speculative"): string {
  if (tone === "warning") {
    return "border-amber-300 bg-amber-50 text-amber-900";
  }
  if (tone === "speculative") {
    return "border-indigo-300 bg-indigo-50 text-indigo-900";
  }
  return "border-sky-300 bg-sky-50 text-sky-900";
}

function collectUniqueCitations(data: SynthesisWidget, papers: PaperResult[], patents: PatentLike[]): ResolvedCitation[] {
  const unique = new Map<string, ResolvedCitation>();
  const add = (citations?: CitationRef[]) => {
    for (const citation of citations ?? []) {
      const resolved = resolveCitation(citation, papers, patents);
      if (!unique.has(resolved.key)) {
        unique.set(resolved.key, resolved);
      }
    }
  };

  for (const section of data.sections) {
    for (const block of section.blocks) {
      if (block.type === "paragraph" || block.type === "callout") {
        add(block.citations);
      } else if (block.type === "bullets" || block.type === "numbered") {
        for (const item of block.items) {
          add(item.citations);
        }
      }
    }
  }
  for (const step of data.nextSteps ?? []) {
    add(step.citations);
  }

  return Array.from(unique.values());
}

export function SynthesisWidgetRenderer(props: Props) {
  const { data } = props;
  const papers = props.papers ?? [];
  const patents = props.patents ?? [];
  const citations = collectUniqueCitations(data, papers, patents);

  return (
    <section className="space-y-4">
      <header className="rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
        <div className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan-900/60">Synthesis</div>
        <h3 className="mt-1 font-display text-3xl leading-tight text-slate-950">{data.title}</h3>
      </header>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr),260px]">
        <div className="space-y-4">
          {data.sections.map((section) => (
            <article
              key={section.id}
              className="rounded-[1.3rem] border border-slate-200 bg-white px-5 py-4 shadow-sm"
            >
              <h4 className="font-display text-2xl leading-tight text-slate-950">{section.heading}</h4>
              <div className="mt-3 space-y-3 text-sm leading-7 text-slate-800">
                {section.blocks.map((block, index) => {
                  if (block.type === "paragraph") {
                    return (
                      <div key={`${section.id}-paragraph-${index}`}>
                        <p>{block.text}</p>
                        <CitationChips citations={block.citations} papers={papers} patents={patents} />
                      </div>
                    );
                  }

                  if (block.type === "bullets") {
                    return (
                      <ul key={`${section.id}-bullets-${index}`} className="list-disc space-y-2 pl-6">
                        {block.items.map((item, itemIndex) => (
                          <li key={`${section.id}-bullet-${itemIndex}`}>
                            <div>{item.text}</div>
                            <CitationChips citations={item.citations} papers={papers} patents={patents} />
                          </li>
                        ))}
                      </ul>
                    );
                  }

                  if (block.type === "numbered") {
                    return (
                      <ol key={`${section.id}-numbered-${index}`} className="list-decimal space-y-2 pl-6">
                        {block.items.map((item, itemIndex) => (
                          <li key={`${section.id}-numbered-item-${itemIndex}`}>
                            {item.title ? <div className="font-medium text-slate-900">{item.title}</div> : null}
                            <div>{item.text}</div>
                            <CitationChips citations={item.citations} papers={papers} patents={patents} />
                          </li>
                        ))}
                      </ol>
                    );
                  }

                  return (
                    <div
                      key={`${section.id}-callout-${index}`}
                    className={`rounded-xl border px-4 py-3 ${calloutToneClasses(block.tone)}`}
                  >
                      {block.title ? <div className="font-semibold">{block.title}</div> : null}
                      <div className={block.title ? "mt-1" : undefined}>{block.text}</div>
                      <CitationChips citations={block.citations} papers={papers} patents={patents} />
                    </div>
                  );
                })}
              </div>
            </article>
          ))}

          {data.nextSteps && data.nextSteps.length > 0 ? (
            <article className="rounded-[1.3rem] border border-slate-200 bg-white px-5 py-4 shadow-sm">
              <h4 className="font-display text-2xl leading-tight text-slate-950">Next Steps</h4>
              <ol className="mt-3 list-decimal space-y-2 pl-6 text-sm leading-7 text-slate-800">
                {data.nextSteps.map((step, index) => (
                  <li key={`next-step-${index}`}>
                    <div>{step.text}</div>
                    <CitationChips citations={step.citations} papers={papers} patents={patents} />
                  </li>
                ))}
              </ol>
            </article>
          ) : null}
        </div>

        {citations.length > 0 ? (
          <aside className="h-fit rounded-[1.3rem] border border-slate-200 bg-white px-4 py-4 shadow-sm">
            <div className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan-900/60">Citations</div>
            <ul className="mt-3 space-y-2 text-sm text-slate-700">
              {citations.map((citation) => (
                <li key={`rail-${citation.key}`}>
                  {citation.href ? (
                    <a href={citation.href} target="_blank" rel="noreferrer" className="hover:text-blue-700 hover:underline">
                      {citation.label}
                    </a>
                  ) : (
                    <span>{citation.label}</span>
                  )}
                </li>
              ))}
            </ul>
          </aside>
        ) : null}
      </div>
    </section>
  );
}
