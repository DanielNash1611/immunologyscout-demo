import type { PatentMetadata } from "../../types/immunologyScout";
import { buildCanonicalPatentId } from "../patentCanonical";

const PATENT_RESULT_LIMIT_DEFAULT = 8;
const PATENT_RESULT_LIMIT_MAX = 20;
const PATENT_FETCH_TIMEOUT_MS = 15000;

const PATENT_QUERY_STOPWORDS = new Set([
  "a",
  "an",
  "and",
  "for",
  "from",
  "in",
  "literature",
  "of",
  "on",
  "or",
  "patent",
  "patents",
  "prior",
  "research",
  "show",
  "the",
  "to",
  "with"
]);

export type PatentSearchStatus = "ok" | "no_results" | "error";

export interface PatentSearchProvenance {
  provider: "patentsview";
  query: string;
  fromYear?: number;
  toYear?: number;
  maxResults: number;
  endpoint: string;
  retrievedAt: string;
  backendStatus: "ok" | "no_results" | "error" | "disabled" | "unconfigured";
}

export interface PatentSearchResult {
  items: PatentMetadata[];
  status: PatentSearchStatus;
  message?: string;
  provenance: PatentSearchProvenance;
}

export async function searchPatentsImpl(params: {
  query: string;
  fromYear?: number;
  toYear?: number;
  maxResults?: number;
}): Promise<PatentSearchResult> {
  const query = params.query.trim();
  const maxResults = clampResults(params.maxResults ?? PATENT_RESULT_LIMIT_DEFAULT);
  const endpoint = buildPatentsViewEndpoint(getPatentsViewApiBase());
  const retrievedAt = new Date().toISOString();

  if (!query) {
    return {
      items: [],
      status: "no_results",
      message: "Patent query was empty.",
      provenance: {
        provider: "patentsview",
        query,
        fromYear: params.fromYear,
        toYear: params.toYear,
        maxResults,
        endpoint,
        retrievedAt,
        backendStatus: "no_results"
      }
    };
  }

  const apiKey = process.env.PATENTSVIEW_API_KEY?.trim();
  if (!apiKey) {
    return {
      items: [],
      status: "error",
      message: "PATENTSVIEW_API_KEY is not configured.",
      provenance: {
        provider: "patentsview",
        query,
        fromYear: params.fromYear,
        toYear: params.toYear,
        maxResults,
        endpoint,
        retrievedAt,
        backendStatus: "unconfigured"
      }
    };
  }

  const keywords = extractPatentKeywords(query);
  const queryObject = buildPatentsViewQuery({
    query,
    keywords,
    fromYear: params.fromYear,
    toYear: params.toYear
  });

  const payload = {
    q: queryObject,
    f: [
      "patent_id",
      "patent_title",
      "patent_abstract",
      "patent_year",
      "patent_date",
      "patent_kind",
      "assignees.assignee_organization",
      "cpc_at_issue.cpc_subgroup_id"
    ],
    o: { per_page: Math.max(maxResults, 10), page: 1 },
    s: [{ patent_date: "desc" }]
  };

  const response = await fetchWithTimeout(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Api-Key": apiKey
    },
    body: JSON.stringify(payload)
  });

  if (!response) {
    return {
      items: [],
      status: "error",
      message: "PatentsView request timed out.",
      provenance: {
        provider: "patentsview",
        query,
        fromYear: params.fromYear,
        toYear: params.toYear,
        maxResults,
        endpoint,
        retrievedAt,
        backendStatus: "error"
      }
    };
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    return {
      items: [],
      status: "error",
      message: `PatentsView returned ${response.status}. ${detail.slice(0, 160)}`.trim(),
      provenance: {
        provider: "patentsview",
        query,
        fromYear: params.fromYear,
        toYear: params.toYear,
        maxResults,
        endpoint,
        retrievedAt,
        backendStatus: "error"
      }
    };
  }

  const data = await response.json().catch(() => null);
  const rawItems = Array.isArray(data?.patents)
    ? data.patents
    : Array.isArray(data?.data)
      ? data.data
      : Array.isArray(data?.results)
        ? data.results
        : [];

  const items = rawItems
    .map((item: unknown) => mapPatent(item))
    .filter(Boolean) as PatentMetadata[];
  const ranked = rankPatents(items, keywords, query).slice(0, maxResults);

  if (ranked.length === 0) {
    return {
      items: [],
      status: "no_results",
      message: "No closely matching patent records were retrieved.",
      provenance: {
        provider: "patentsview",
        query,
        fromYear: params.fromYear,
        toYear: params.toYear,
        maxResults,
        endpoint,
        retrievedAt,
        backendStatus: "no_results"
      }
    };
  }

  return {
    items: ranked,
    status: "ok",
    provenance: {
      provider: "patentsview",
      query,
      fromYear: params.fromYear,
      toYear: params.toYear,
      maxResults,
      endpoint,
      retrievedAt,
      backendStatus: "ok"
    }
  };
}

function getPatentsViewApiBase(): string {
  return process.env.PATENTSVIEW_API_BASE || "https://search.patentsview.org";
}

function buildPatentsViewEndpoint(base: string): string {
  const trimmed = base.replace(/\/+$/, "");
  if (trimmed.endsWith("/api/v1/patent")) return `${trimmed}/`;
  if (trimmed.endsWith("/api/v1")) return `${trimmed}/patent/`;
  return `${trimmed}/api/v1/patent/`;
}

function buildPatentsViewQuery(params: {
  query: string;
  keywords: string[];
  fromYear?: number;
  toYear?: number;
}) {
  const keywordClauses =
    params.keywords.length > 0
      ? params.keywords.map((keyword) => keywordClause(keyword))
      : [keywordClause(params.query)];

  const clauses: any[] = [{ _and: keywordClauses }];

  if (params.fromYear) {
    clauses.push({ _gte: { patent_year: params.fromYear } });
  }
  if (params.toYear) {
    clauses.push({ _lte: { patent_year: params.toYear } });
  }

  return clauses.length === 1 ? clauses[0] : { _and: clauses };
}

function keywordClause(keyword: string) {
  const text = keyword.trim();
  const textAny = {
    _text_any: {
      patent_title: text,
      patent_abstract: text
    }
  };

  if (!text.includes(" ")) {
    return textAny;
  }

  return {
    _or: [
      {
        _text_all: {
          patent_title: text,
          patent_abstract: text
        }
      },
      textAny
    ]
  };
}

function extractPatentKeywords(query: string): string[] {
  const tokens = query
    .toLowerCase()
    .replace(/[^a-z0-9-\s]/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean)
    .filter((token) => token.length >= 3 || /\d/.test(token))
    .filter((token) => !PATENT_QUERY_STOPWORDS.has(token));

  const deduped: string[] = [];
  const seen = new Set<string>();
  for (const token of tokens) {
    if (seen.has(token)) continue;
    seen.add(token);
    deduped.push(token);
  }

  return deduped.slice(0, 6);
}

function rankPatents(items: PatentMetadata[], keywords: string[], query: string): PatentMetadata[] {
  const normalizedQuery = query.toLowerCase();
  return [...items].sort((left, right) => {
    const scoreLeft = scorePatent(left, keywords, normalizedQuery);
    const scoreRight = scorePatent(right, keywords, normalizedQuery);
    if (scoreRight !== scoreLeft) return scoreRight - scoreLeft;
    if ((right.publicationYear || 0) !== (left.publicationYear || 0)) {
      return (right.publicationYear || 0) - (left.publicationYear || 0);
    }
    return left.title.localeCompare(right.title);
  });
}

function scorePatent(patent: PatentMetadata, keywords: string[], query: string): number {
  const title = (patent.title || "").toLowerCase();
  const abstract = (patent.abstract || patent.abstractSnippet || "").toLowerCase();
  let score = 0;

  if (title.includes(query)) score += 10;
  if (abstract.includes(query)) score += 6;

  for (const keyword of keywords) {
    if (title.includes(keyword)) score += 4;
    if (abstract.includes(keyword)) score += 2;
  }

  if (patent.publicationYear) score += Math.max(0, patent.publicationYear - 2015) / 4;
  return score;
}

function mapPatent(item: any): PatentMetadata | null {
  const patentIdRaw =
    typeof item?.patent_id === "string"
      ? item.patent_id
      : typeof item?.patent_number === "string"
        ? item.patent_number
        : undefined;

  if (!patentIdRaw) return null;

  const derived = buildCanonicalPatentId({
    source: "patentsview",
    patent_id: patentIdRaw,
    kind: typeof item?.patent_kind === "string" ? item.patent_kind : undefined
  });

  const title =
    (typeof item?.patent_title === "string" && item.patent_title.trim()) || "Untitled patent";
  const abstract =
    typeof item?.patent_abstract === "string" && item.patent_abstract.trim()
      ? item.patent_abstract.trim()
      : undefined;
  const assignees = extractAssignees(item?.assignees);
  const cpcClasses = extractCpcClasses(item?.cpc_at_issue ?? item?.cpcs);

  return {
    country: derived.country,
    patentNumber: derived.patent_number,
    patentId: derived.canonicalId,
    kind: derived.kind,
    title,
    abstract,
    abstractSnippet: buildSnippet(abstract),
    assignees: assignees.length > 0 ? assignees : undefined,
    assignee: assignees[0],
    publicationYear: parseYear(item?.patent_year ?? item?.patent_date),
    cpcClasses: cpcClasses.length > 0 ? cpcClasses : undefined,
    url: buildGooglePatentsUrl(derived.canonicalId)
  };
}

function extractAssignees(assignees: any): string[] {
  if (!Array.isArray(assignees)) return [];
  const names = assignees
    .map((assignee) => {
      if (typeof assignee?.assignee_organization === "string") {
        return assignee.assignee_organization.trim();
      }
      return "";
    })
    .filter(Boolean);
  return Array.from(new Set(names));
}

function extractCpcClasses(cpcs: any): string[] {
  if (!Array.isArray(cpcs)) return [];
  const classes = cpcs
    .map((cpc) => {
      if (typeof cpc?.cpc_subgroup_id === "string") return cpc.cpc_subgroup_id.trim();
      const combined = [
        cpc?.cpc_section,
        cpc?.cpc_class,
        cpc?.cpc_subclass,
        cpc?.cpc_group
      ]
        .map((value) => (value == null ? "" : String(value).trim()))
        .filter(Boolean)
        .join("");
      return combined;
    })
    .filter(Boolean);
  return Array.from(new Set(classes));
}

function parseYear(value?: string | number): number | undefined {
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  const match = value?.match(/(\d{4})/);
  return match ? Number(match[1]) : undefined;
}

function buildSnippet(text?: string, max = 220): string | undefined {
  if (!text) return undefined;
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= max) return normalized;
  return `${normalized.slice(0, max).trimEnd()}...`;
}

function buildGooglePatentsUrl(canonicalId: string): string {
  return `https://patents.google.com/patent/${encodeURIComponent(canonicalId)}`;
}

function clampResults(value: number): number {
  return Math.min(PATENT_RESULT_LIMIT_MAX, Math.max(1, Math.floor(value)));
}

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response | undefined> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PATENT_FETCH_TIMEOUT_MS);

  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.toLowerCase().includes("abort")) {
      return undefined;
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
