import type { PatentMetadata } from "../../types/immunologyScout";
import { buildCanonicalPatentId } from "../patentCanonical";

const PATENT_RESULT_LIMIT_DEFAULT = 8;
const PATENT_RESULT_LIMIT_MAX = 20;
const PATENT_FETCH_TIMEOUT_MS = 15000;
const PATENT_FETCH_SIZE_MULTIPLIER = 3;

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

const PATENT_LOW_SIGNAL_TERMS = new Set([
  "approach",
  "context",
  "environment",
  "mechanism",
  "mechanisms",
  "stability",
  "study",
  "tissue",
  "tissues"
]);

const PATENT_SYNONYM_GROUPS: Array<{
  id: string;
  test: RegExp;
  terms: string[];
  weight: number;
}> = [
  {
    id: "treg",
    test: /\btregs?\b|\bregulatory t[- ]cells?\b|\bfoxp3\b/i,
    terms: ["treg", "regulatory t cell", "regulatory t cells", "foxp3"],
    weight: 10
  },
  {
    id: "il2",
    test: /\bil-?2\b|\binterleukin[- ]?2\b/i,
    terms: ["il-2", "interleukin-2", "interleukin 2"],
    weight: 10
  },
  {
    id: "mutein",
    test: /\bmuteins?\b|\bengineered il-?2\b|\binterleukin[- ]?2 variant\b/i,
    terms: ["mutein", "muteins", "engineered il-2", "interleukin-2 variant", "interleukin 2 variant"],
    weight: 8
  },
  {
    id: "autoimmunity",
    test: /\bautoimmun\w*\b/i,
    terms: ["autoimmune", "autoimmunity", "auto-immune"],
    weight: 8
  },
  {
    id: "inflammation",
    test: /\binflam\w*\b/i,
    terms: ["inflamed", "inflammation", "inflammatory"],
    weight: 7
  },
  {
    id: "tolerance",
    test: /\btoler\w*\b/i,
    terms: ["tolerance", "immune tolerance"],
    weight: 6
  }
];

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

type PatentConceptGroup = {
  id: string;
  terms: string[];
  weight: number;
};

type PatentQueryPlan = {
  label: string;
  queryObject: Record<string, unknown>;
  size: number;
};

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
  const conceptGroups = buildPatentConceptGroups(query, keywords);
  const queryPlans = buildPatentQueryPlans({
    query,
    keywords,
    conceptGroups,
    fromYear: params.fromYear,
    toYear: params.toYear,
    maxResults
  });
  const merged = new Map<string, PatentMetadata>();
  let lastErrorMessage: string | undefined;

  for (const plan of queryPlans) {
    const fetchResult = await fetchPatentsViewPlan({
      endpoint,
      apiKey,
      queryObject: plan.queryObject,
      size: plan.size
    });

    if (fetchResult.status === "error") {
      lastErrorMessage = fetchResult.message;
      continue;
    }

    for (const item of fetchResult.items) {
      merged.set(item.patentId, item);
    }

    if (merged.size >= maxResults) {
      break;
    }
  }

  if (merged.size === 0 && lastErrorMessage) {
    return {
      items: [],
      status: "error",
      message: lastErrorMessage,
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

  const ranked = rankPatents(Array.from(merged.values()), keywords, conceptGroups, query).slice(0, maxResults);

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
  conceptGroups: PatentConceptGroup[];
  fromYear?: number;
  toYear?: number;
}) {
  const keywordClauses =
    params.conceptGroups.length > 0
      ? params.conceptGroups.map((group) => conceptGroupClause(group))
      : params.keywords.length > 0
        ? params.keywords.map((keyword) => keywordClause(keyword))
        : [keywordClause(params.query)];

  const clauses: any[] = keywordClauses.length === 1 ? [keywordClauses[0]] : [{ _and: keywordClauses }];

  if (params.fromYear) {
    clauses.push({ _gte: { patent_date: `${params.fromYear}-01-01` } });
  }
  if (params.toYear) {
    clauses.push({ _lte: { patent_date: `${params.toYear}-12-31` } });
  }

  return clauses.length === 1 ? clauses[0] : { _and: clauses };
}

function keywordClause(keyword: string) {
  const text = keyword.trim();
  if (!text.includes(" ")) {
    return {
      _or: [
        { _text_any: { patent_title: text } },
        { _text_any: { patent_abstract: text } }
      ]
    };
  }

  return {
    _or: [
      { _text_all: { patent_title: text } },
      { _text_all: { patent_abstract: text } },
      { _text_any: { patent_title: text } },
      { _text_any: { patent_abstract: text } }
    ]
  };
}

function conceptGroupClause(group: PatentConceptGroup) {
  return {
    _or: group.terms.map((term) => keywordClause(term))
  };
}

export function extractPatentKeywords(query: string): string[] {
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

export function buildPatentConceptGroups(query: string, keywords = extractPatentKeywords(query)): PatentConceptGroup[] {
  const normalizedQuery = query.toLowerCase();
  const groups: PatentConceptGroup[] = [];
  const usedTerms = new Set<string>();

  for (const group of PATENT_SYNONYM_GROUPS) {
    if (!group.test.test(normalizedQuery)) continue;
    groups.push({
      id: group.id,
      terms: group.terms,
      weight: group.weight
    });
    for (const term of group.terms) {
      usedTerms.add(term.toLowerCase());
    }
  }

  for (const keyword of keywords) {
    const normalized = keyword.toLowerCase();
    if (usedTerms.has(normalized)) continue;
    groups.push({
      id: normalized,
      terms: [keyword],
      weight: PATENT_LOW_SIGNAL_TERMS.has(normalized) ? 1 : 4 + Math.min(keyword.length, 6)
    });
  }

  return groups
    .sort((left, right) => right.weight - left.weight || left.id.localeCompare(right.id))
    .slice(0, 4);
}

export function buildPatentQueryPlans(params: {
  query: string;
  keywords: string[];
  conceptGroups: PatentConceptGroup[];
  fromYear?: number;
  toYear?: number;
  maxResults: number;
}): PatentQueryPlan[] {
  const { query, keywords, conceptGroups, fromYear, toYear, maxResults } = params;
  const plans: PatentQueryPlan[] = [];
  const seen = new Set<string>();
  const addPlan = (label: string, queryObject: Record<string, unknown>, size = Math.max(12, maxResults * PATENT_FETCH_SIZE_MULTIPLIER)) => {
    const key = JSON.stringify(queryObject);
    if (seen.has(key)) return;
    seen.add(key);
    plans.push({ label, queryObject, size });
  };

  if (conceptGroups.length >= 2) {
    const [primary, ...rest] = conceptGroups;
    for (const secondary of rest) {
      addPlan(
        `${primary.id}+${secondary.id}`,
        buildPatentsViewQuery({
          query,
          keywords,
          conceptGroups: [primary, secondary],
          fromYear,
          toYear
        })
      );
    }
  }

  if (conceptGroups.length > 0) {
    addPlan(
      "concept-and",
      buildPatentsViewQuery({
        query,
        keywords,
        conceptGroups: conceptGroups.slice(0, Math.min(3, conceptGroups.length)),
        fromYear,
        toYear
      })
    );

    addPlan(
      "concept-or",
      buildPatentsViewBroadQuery({
        query,
        keywords,
        conceptGroups,
        fromYear,
        toYear
      }),
      Math.max(18, maxResults * PATENT_FETCH_SIZE_MULTIPLIER)
    );
  } else {
    addPlan(
      "keyword-fallback",
      buildPatentsViewQuery({
        query,
        keywords,
        conceptGroups: [],
        fromYear,
        toYear
      })
    );
  }

  addPlan(
    "query-fallback",
    buildPatentsViewBroadQuery({
      query,
      keywords,
      conceptGroups,
      fromYear,
      toYear
    }),
    Math.max(18, maxResults * PATENT_FETCH_SIZE_MULTIPLIER)
  );

  return plans;
}

function buildPatentsViewBroadQuery(params: {
  query: string;
  keywords: string[];
  conceptGroups: PatentConceptGroup[];
  fromYear?: number;
  toYear?: number;
}) {
  const clauses: any[] = [];
  const signalClauses =
    params.conceptGroups.length > 0
      ? params.conceptGroups.map((group) => conceptGroupClause(group))
      : params.keywords.length > 0
        ? params.keywords.map((keyword) => keywordClause(keyword))
        : [keywordClause(params.query)];

  clauses.push(signalClauses.length === 1 ? signalClauses[0] : { _or: signalClauses });

  if (params.fromYear) {
    clauses.push({ _gte: { patent_date: `${params.fromYear}-01-01` } });
  }
  if (params.toYear) {
    clauses.push({ _lte: { patent_date: `${params.toYear}-12-31` } });
  }

  return clauses.length === 1 ? clauses[0] : { _and: clauses };
}

function rankPatents(items: PatentMetadata[], keywords: string[], conceptGroups: PatentConceptGroup[], query: string): PatentMetadata[] {
  const normalizedQuery = query.toLowerCase();
  return [...items].sort((left, right) => {
    const scoreLeft = scorePatent(left, keywords, conceptGroups, normalizedQuery);
    const scoreRight = scorePatent(right, keywords, conceptGroups, normalizedQuery);
    if (scoreRight !== scoreLeft) return scoreRight - scoreLeft;
    if ((right.publicationYear || 0) !== (left.publicationYear || 0)) {
      return (right.publicationYear || 0) - (left.publicationYear || 0);
    }
    return left.title.localeCompare(right.title);
  });
}

function scorePatent(
  patent: PatentMetadata,
  keywords: string[],
  conceptGroups: PatentConceptGroup[],
  query: string
): number {
  const title = (patent.title || "").toLowerCase();
  const abstract = (patent.abstract || patent.abstractSnippet || "").toLowerCase();
  let score = 0;

  if (title.includes(query)) score += 10;
  if (abstract.includes(query)) score += 6;

  for (const group of conceptGroups) {
    const matchedTitle = group.terms.some((term) => title.includes(term.toLowerCase()));
    const matchedAbstract = group.terms.some((term) => abstract.includes(term.toLowerCase()));
    if (matchedTitle) score += group.weight + 4;
    if (matchedAbstract) score += group.weight;
  }

  for (const keyword of keywords) {
    if (title.includes(keyword)) score += 4;
    if (abstract.includes(keyword)) score += 2;
  }

  if (patent.publicationYear) score += Math.max(0, patent.publicationYear - 2015) / 4;
  return score;
}

async function fetchPatentsViewPlan(params: {
  endpoint: string;
  apiKey: string;
  queryObject: Record<string, unknown>;
  size: number;
}): Promise<{ status: "ok"; items: PatentMetadata[] } | { status: "error"; message: string }> {
  const payload = {
    q: params.queryObject,
    f: [
      "patent_id",
      "patent_title",
      "patent_abstract",
      "patent_date",
      "patent_year",
      "patent_type",
      "assignees.assignee_organization",
      "cpc_current.cpc_section",
      "cpc_current.cpc_class",
      "cpc_current.cpc_subclass",
      "cpc_current.cpc_group"
    ],
    o: { size: params.size },
    s: [{ patent_date: "desc" }]
  };

  const response = await fetchWithTimeout(params.endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Api-Key": params.apiKey
    },
    body: JSON.stringify(payload)
  });

  if (!response) {
    return {
      status: "error",
      message: "PatentsView request timed out."
    };
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    const reason = response.headers.get("X-Status-Reason");
    const reasonCode = response.headers.get("X-Status-Reason-Code");
    const details = [reasonCode, reason, detail.slice(0, 160)].filter(Boolean).join(" | ");
    return {
      status: "error",
      message: `PatentsView returned ${response.status}. ${details}`.trim()
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

  return {
    status: "ok",
    items: rawItems.map((item: unknown) => mapPatent(item)).filter(Boolean) as PatentMetadata[]
  };
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
    kind: undefined
  });

  const title =
    (typeof item?.patent_title === "string" && item.patent_title.trim()) || "Untitled patent";
  const abstract =
    typeof item?.patent_abstract === "string" && item.patent_abstract.trim()
      ? item.patent_abstract.trim()
      : undefined;
  const assignees = extractAssignees(item?.assignees);
  const cpcClasses = extractCpcClasses(item?.cpc_current ?? item?.cpcs);

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
