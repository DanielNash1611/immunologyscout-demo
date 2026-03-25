import { getDefaultSynthesisModel, getOpenAIClient, hasOpenAIApiKey } from "@/lib/openai";
import {
  synthesisEnvelopeSchema,
  type CitationRef,
  type SynthesisEnvelope,
  type SynthesisWidget
} from "@/lib/synthesisWidget";
import {
  searchPatentsImpl,
  type PatentSearchResult,
  type PatentSearchStatus
} from "@/lib/tools/patents";
import { searchPapersImpl } from "@/lib/tools/pubmed";
import type { ScoutNotice, ScoutResponse } from "@/types/demoScout";
import type { PaperMetadata, PatentMetadata, PaperSource } from "@/types/immunologyScout";

const DEFAULT_PAPER_SOURCES: PaperSource[] = ["pubmed", "biorxiv", "medrxiv"];

type RunDemoScoutInput = {
  query: string;
  includePatents?: boolean;
  fromYear?: number;
  toYear?: number;
  maxResults?: number;
};

type SynthesisResult = {
  envelope: SynthesisEnvelope;
  source: "openai" | "fallback";
};

export async function runDemoScout(input: RunDemoScoutInput): Promise<ScoutResponse> {
  const query = input.query.trim();
  const includePatents = input.includePatents ?? true;
  const maxResults = input.maxResults ?? 10;

  const [papers, patentsResult] = await Promise.all([
    searchPapersImpl({
      query,
      fromYear: input.fromYear,
      toYear: input.toYear,
      maxResults,
      sources: DEFAULT_PAPER_SOURCES
    }),
    includePatents
      ? searchPatentsImpl({
          query,
          fromYear: input.fromYear,
          toYear: input.toYear,
          maxResults: Math.min(maxResults, 8)
        })
      : Promise.resolve<PatentSearchResult>({
          items: [],
          status: "no_results",
          message: "Patent search was not requested.",
          provenance: {
            provider: "patentsview",
            query,
            fromYear: input.fromYear,
            toYear: input.toYear,
            maxResults: Math.min(maxResults, 8),
            endpoint: "disabled",
            retrievedAt: new Date().toISOString(),
            backendStatus: "disabled"
          }
        })
  ]);

  const patents = patentsResult.items;
  const notices = buildNotices({
    query,
    papers,
    patentsResult,
    includePatents
  });
  const synthesis = await buildSynthesis({
    query,
    papers,
    patents,
    notices
  });

  return {
    query,
    papers,
    patents,
    notices,
    synthesis_widget: synthesis.envelope.synthesis_widget,
    synthesis_markdown:
      synthesis.envelope.synthesis_markdown || fallbackMarkdown({ query, papers, patents, notices }),
    meta: {
      synthesisSource: synthesis.source,
      patentsStatus: patentsResult.status,
      patentsMessage: patentsResult.message,
      paperCount: papers.length,
      patentCount: patents.length
    }
  };
}

async function buildSynthesis(params: {
  query: string;
  papers: PaperMetadata[];
  patents: PatentMetadata[];
  notices: ScoutNotice[];
}): Promise<SynthesisResult> {
  const fallbackEnvelope = buildFallbackSynthesis(params);

  if (!hasOpenAIApiKey()) {
    return {
      envelope: fallbackEnvelope,
      source: "fallback"
    };
  }

  try {
    const client = getOpenAIClient();
    const response: any = await client.responses.create({
      model: getDefaultSynthesisModel(),
      input: [
        {
          role: "system",
          content: [
            {
              type: "input_text",
              text:
                "You are preparing a concise, public-facing immunology research brief. Use only the provided records. Avoid medical advice, clinical recommendations, and speculative claims. Return JSON only with keys synthesis_widget and synthesis_markdown."
            }
          ]
        },
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: JSON.stringify(
                {
                  instructions: {
                    title: "Create a short synthesis widget for an immunology research assistant demo.",
                    schema_notes: {
                      synthesis_widget: {
                        schema_version: "1.0",
                        title: "string",
                        sections: [
                          {
                            id: "string",
                            heading: "string",
                            blocks: [
                              {
                                type: "paragraph | bullets | callout | numbered"
                              }
                            ]
                          }
                        ],
                        nextSteps: [{ text: "string", citations: [{ kind: "pubmed | patent | url", id: "string" }] }]
                      },
                      synthesis_markdown:
                        "Short markdown summary with sections for literature, prior art, and caveats."
                    }
                  },
                  query: params.query,
                  notices: params.notices.map((notice) => ({
                    tone: notice.tone,
                    title: notice.title,
                    message: notice.message
                  })),
                  papers: params.papers.slice(0, 6).map(serializePaper),
                  patents: params.patents.slice(0, 4).map(serializePatent)
                },
                null,
                2
              )
            }
          ]
        }
      ]
    });

    const rawText = extractResponseText(response);
    const parsedJson = JSON.parse(stripCodeFences(rawText));
    const envelope = synthesisEnvelopeSchema.parse(parsedJson);

    if (!envelope.synthesis_widget && !envelope.synthesis_markdown) {
      return { envelope: fallbackEnvelope, source: "fallback" };
    }

    return {
      envelope: {
        synthesis_widget: envelope.synthesis_widget ?? fallbackEnvelope.synthesis_widget,
        synthesis_markdown: envelope.synthesis_markdown ?? fallbackEnvelope.synthesis_markdown
      },
      source: "openai"
    };
  } catch (error) {
    console.warn("[demo-scout] synthesis fallback", {
      message: error instanceof Error ? error.message : String(error)
    });
    return {
      envelope: fallbackEnvelope,
      source: "fallback"
    };
  }
}

function buildNotices(params: {
  query: string;
  papers: PaperMetadata[];
  patentsResult: PatentSearchResult;
  includePatents: boolean;
}): ScoutNotice[] {
  const notices: ScoutNotice[] = [];

  if (params.papers.length === 0) {
    notices.push({
      tone: "warning",
      title: "Limited literature retrieval",
      message:
        "No matching papers were retrieved for this query. Try a narrower mechanism, molecule, cell type, or pathway."
    });
  }

  if (!params.includePatents) {
    notices.push({
      tone: "info",
      title: "Patent search disabled",
      message: "This run was limited to literature and preprints."
    });
  } else if (params.patentsResult.status === "error") {
    notices.push({
      tone: "warning",
      title: "Patent coverage unavailable",
      message:
        params.patentsResult.message ||
        "Patent retrieval is temporarily unavailable, so the synthesis relies on literature only."
    });
  } else if (params.patentsResult.status === "no_results") {
    notices.push({
      tone: "info",
      title: "No patent matches",
      message:
        params.patentsResult.message ||
        "No closely matching patent records were retrieved for this search window."
    });
  }

  if (!hasOpenAIApiKey()) {
    notices.push({
      tone: "info",
      title: "Template synthesis mode",
      message:
        "No OpenAI API key is configured, so the narrative synthesis is generated from a deterministic demo template."
    });
  }

  return notices;
}

function buildFallbackSynthesis(params: {
  query: string;
  papers: PaperMetadata[];
  patents: PatentMetadata[];
  notices: ScoutNotice[];
}): SynthesisEnvelope {
  const papers = params.papers.slice(0, 4);
  const patents = params.patents.slice(0, 3);
  const sections: SynthesisWidget["sections"] = [];

  sections.push({
    id: "literature-landscape",
    heading: "Literature landscape",
    blocks:
      papers.length > 0
        ? [
            {
              type: "bullets",
              items: papers.map((paper) => ({
                text: summarizePaper(paper),
                citations: buildPaperCitation(paper)
              }))
            }
          ]
        : [
            {
              type: "callout",
              tone: "warning",
              title: "No papers retrieved",
              text:
                "The current search did not return literature hits, so a more specific mechanism or target may be needed.",
              citations: undefined
            }
          ]
  });

  sections.push({
    id: "prior-art",
    heading: "Prior-art signals",
    blocks:
      patents.length > 0
        ? [
            {
              type: "bullets",
              items: patents.map((patent) => ({
                text: summarizePatent(patent),
                citations: buildPatentCitation(patent)
              }))
            }
          ]
        : [
            {
              type: "callout",
              tone: "note",
              title: "Patent view",
              text:
                "No patent records are included in this run, either because no matches were found or patent retrieval was unavailable.",
              citations: undefined
            }
          ]
  });

  sections.push({
    id: "caveats",
    heading: "Interpretation notes",
    blocks: [
      {
        type: "paragraph",
        text:
          "This demo brief is intended for fast research framing. It surfaces representative evidence and prior-art signals, but it does not replace a full literature review, claim chart, or domain expert assessment.",
        citations: undefined
      },
      ...params.notices.slice(0, 2).map((notice) => {
        const tone: "note" | "warning" = notice.tone === "warning" ? "warning" : "note";
        return {
          type: "callout" as const,
          tone,
          title: notice.title,
          text: notice.message,
          citations: undefined
        };
      })
    ]
  });

  return {
    synthesis_widget: {
      schema_version: "1.0",
      title: `Research brief: ${params.query}`,
      sections,
      nextSteps: buildNextSteps(params.query, papers, patents)
    },
    synthesis_markdown: fallbackMarkdown(params)
  };
}

function fallbackMarkdown(params: {
  query: string;
  papers: PaperMetadata[];
  patents: PatentMetadata[];
  notices: ScoutNotice[];
}): string {
  const paperLines =
    params.papers.length > 0
      ? params.papers.slice(0, 4).map((paper) => `- ${summarizePaper(paper)}`).join("\n")
      : "- No papers were retrieved for this search.";
  const patentLines =
    params.patents.length > 0
      ? params.patents.slice(0, 3).map((patent) => `- ${summarizePatent(patent)}`).join("\n")
      : "- No patent records were included in this run.";
  const noticeLines =
    params.notices.length > 0
      ? params.notices.map((notice) => `- ${notice.title}: ${notice.message}`).join("\n")
      : "- Retrieval completed without additional caveats.";

  return [
    `## ${params.query}`,
    "",
    "### Literature",
    paperLines,
    "",
    "### Prior Art",
    patentLines,
    "",
    "### Caveats",
    noticeLines
  ].join("\n");
}

function buildNextSteps(
  query: string,
  papers: PaperMetadata[],
  patents: PatentMetadata[]
): Array<{ text: string; citations?: CitationRef[] }> {
  const steps: Array<{ text: string; citations?: CitationRef[] }> = [];

  steps.push({
    text: `Refine the search around one concrete mechanism, cell type, or cytokine emerging from "${query}".`,
    citations: papers[0] ? buildPaperCitation(papers[0]) : undefined
  });

  steps.push({
    text: "Review the strongest recent papers in full text to validate methods, models, and assay context.",
    citations: papers[1] ? buildPaperCitation(papers[1]) : buildPaperCitation(papers[0])
  });

  if (patents[0]) {
    steps.push({
      text: "Inspect the closest patent claims to separate platform language from truly differentiated findings.",
      citations: buildPatentCitation(patents[0])
    });
  }

  return steps.slice(0, 3);
}

function buildPaperCitation(paper?: PaperMetadata): CitationRef[] | undefined {
  if (!paper?.pmid) return undefined;
  return [{ kind: "pubmed", id: paper.pmid }];
}

function buildPatentCitation(patent?: PatentMetadata): CitationRef[] | undefined {
  if (!patent?.patentId) return undefined;
  return [{ kind: "patent", id: patent.patentId }];
}

function summarizePaper(paper: PaperMetadata): string {
  const meta = [paper.journal, paper.year].filter(Boolean).join(", ");
  const snippet = (paper.abstractSnippet || paper.abstract || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180);
  return [paper.title, meta ? `(${meta})` : "", snippet ? `- ${snippet}${snippet.endsWith(".") ? "" : "..."}` : ""]
    .filter(Boolean)
    .join(" ");
}

function summarizePatent(patent: PatentMetadata): string {
  const meta = [patent.patentId, patent.publicationYear, patent.assignee].filter(Boolean).join(", ");
  const snippet = (patent.abstractSnippet || patent.abstract || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 160);
  return [patent.title, meta ? `(${meta})` : "", snippet ? `- ${snippet}${snippet.endsWith(".") ? "" : "..."}` : ""]
    .filter(Boolean)
    .join(" ");
}

function serializePaper(paper: PaperMetadata) {
  return {
    pmid: paper.pmid,
    doi: paper.doi,
    title: paper.title,
    journal: paper.journal,
    year: paper.year,
    source: paper.source,
    abstractSnippet: paper.abstractSnippet || paper.abstract || ""
  };
}

function serializePatent(patent: PatentMetadata) {
  return {
    patentId: patent.patentId,
    title: patent.title,
    assignee: patent.assignee,
    publicationYear: patent.publicationYear,
    abstractSnippet: patent.abstractSnippet || patent.abstract || ""
  };
}

function stripCodeFences(text: string): string {
  const trimmed = text.trim();
  if (!trimmed.startsWith("```")) return trimmed;
  return trimmed.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
}

function extractResponseText(response: any): string {
  if (typeof response?.output_text === "string" && response.output_text.trim()) {
    return response.output_text;
  }

  const chunks: string[] = [];
  for (const output of response?.output ?? []) {
    for (const content of output?.content ?? []) {
      if (typeof content?.text === "string") {
        chunks.push(content.text);
      }
    }
  }

  return chunks.join("\n").trim();
}

export type { RunDemoScoutInput, PatentSearchStatus };
