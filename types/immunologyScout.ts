export type PaperSource = "pubmed" | "biorxiv" | "medrxiv" | "europe_pmc" | "other";

export interface PaperMetadata {
  pmid?: string;
  doi?: string;
  title: string;
  abstract?: string;
  abstractSnippet?: string;
  journal?: string;
  year?: number;
  phase?: string;
  condition?: string;
  isClinicalTrial?: boolean;
  tags?: string[];
  source: PaperSource;
  isOpenAccess?: boolean;
  url?: string;
}

export interface PatentMetadata {
  country: string;
  patentNumber: string;
  patentId: string;
  kind?: string;
  title: string;
  abstract?: string;
  abstractSnippet?: string;
  assignees?: string[];
  assignee?: string;
  publicationYear?: number;
  status?: string | null;
  tags?: string[];
  cpcClasses?: string[];
  url?: string;
  provenance?: {
    source: string;
    endpoint?: string;
    searchUrl?: string;
    expandedQuery?: string;
    assigneeSeed?: string;
    searchQuery?: string;
    retrievedAt?: string;
  };
}

export interface SearchQueryContext {
  originalPrompt: string;
  normalizedQuery: string;
  fromYear?: number;
  toYear?: number;
  maxResults?: number;
}

export interface SearchProvenance extends SearchQueryContext {
  query: string;
  filters?: {
    fromYear?: number;
    toYear?: number;
    maxResults?: number;
  };
  sourcesRequested?: PaperSource[];
  sourcesHit?: PaperSource[];
  retrievedAt: string;
  endpoints?: string[];
}
