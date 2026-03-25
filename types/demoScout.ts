import type { SynthesisWidget } from "@/lib/synthesisWidget";
import type { PaperMetadata, PatentMetadata } from "@/types/immunologyScout";

export interface ScoutNotice {
  tone: "info" | "warning";
  title: string;
  message: string;
}

export interface ScoutResponse {
  query: string;
  papers: PaperMetadata[];
  patents: PatentMetadata[];
  notices: ScoutNotice[];
  synthesis_widget?: SynthesisWidget;
  synthesis_markdown: string;
  meta: {
    synthesisSource: "openai" | "fallback";
    patentsStatus: "ok" | "no_results" | "error";
    patentsMessage?: string;
    paperCount: number;
    patentCount: number;
  };
}
