import type { PaperMetadata } from "../../types/immunologyScout";

type PreprintServer = "biorxiv" | "medrxiv";

const BIOX_API_BASE =
  process.env.BIORXIV_API_BASE || process.env.BIORXIV_BASE_URL || "https://api.biorxiv.org";

const SERVER_META: Record<PreprintServer, { journal: string; webBase: string }> = {
  biorxiv: { journal: "bioRxiv", webBase: "https://www.biorxiv.org" },
  medrxiv: { journal: "medRxiv", webBase: "https://www.medrxiv.org" }
};

export async function searchPreprints(params: {
  query: string;
  server: PreprintServer;
  fromYear?: number;
  toYear?: number;
  maxResults?: number;
}): Promise<PaperMetadata[]> {
  const { query, server, fromYear, toYear, maxResults = 5 } = params;
  const normalizedQuery = query.trim();

  if (!normalizedQuery) return [];

  const { from, to } = buildDateRange({ fromYear, toYear });
  const tokens = tokenizeQuery(normalizedQuery);
  const { journal, webBase } = SERVER_META[server];

  const results: PaperMetadata[] = [];
  let cursor = 0;
  let total = Number.POSITIVE_INFINITY;
  let pages = 0;
  const maxPages = 6;

  while (results.length < maxResults && cursor < total && pages < maxPages) {
    const url = `${BIOX_API_BASE}/details/${server}/${from}/${to}/${cursor}`;
    let response: Response;
    try {
      response = await fetch(url);
    } catch (err) {
      console.warn("[preprints] request failed", { server, url, message: getErrorMessage(err) });
      return results;
    }

    if (!response.ok) {
      console.warn("[preprints] request failed", { server, url, status: response.status });
      return results;
    }

    const data = await response.json().catch(() => null);
    const collection = Array.isArray(data?.collection) ? data.collection : [];
    if (collection.length === 0) break;

    for (const item of collection) {
      if (!matchesQuery(item, tokens)) continue;
      results.push(mapPreprint(item, server, journal, webBase));
      if (results.length >= maxResults) break;
    }

    const message = Array.isArray(data?.messages) ? data.messages[0] : undefined;
    const totalRaw = message?.total;
    const totalNum = Number(totalRaw);
    if (Number.isFinite(totalNum)) total = totalNum;

    cursor += collection.length;
    pages += 1;
  }

  return results.slice(0, maxResults);
}

function buildDateRange(params: { fromYear?: number; toYear?: number }): { from: string; to: string } {
  const now = new Date();
  let toDate = params.toYear ? new Date(Date.UTC(params.toYear, 11, 31)) : now;

  let fromDate: Date;
  if (params.fromYear) {
    fromDate = new Date(Date.UTC(params.fromYear, 0, 1));
  } else if (params.toYear) {
    fromDate = new Date(Date.UTC(params.toYear, 0, 1));
  } else {
    fromDate = new Date(toDate.getTime() - 365 * 24 * 60 * 60 * 1000);
  }

  if (fromDate > toDate) {
    const tmp = fromDate;
    fromDate = toDate;
    toDate = tmp;
  }

  return {
    from: formatDate(fromDate),
    to: formatDate(toDate)
  };
}

function formatDate(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function tokenizeQuery(query: string): string[] {
  return query
    .toLowerCase()
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean);
}

function matchesQuery(item: any, tokens: string[]): boolean {
  if (tokens.length === 0) return true;
  const title = typeof item?.title === "string" ? item.title : "";
  const abstract = typeof item?.abstract === "string" ? item.abstract : "";
  const haystack = `${title} ${abstract}`.toLowerCase();
  return tokens.every((token) => haystack.includes(token));
}

function mapPreprint(item: any, server: PreprintServer, journal: string, webBase: string): PaperMetadata {
  const title =
    (typeof item?.title === "string" && item.title.trim()) ||
    (typeof item?.paper_title === "string" && item.paper_title.trim()) ||
    "Untitled preprint";
  const abstract =
    (typeof item?.abstract === "string" && item.abstract.trim()) ||
    (typeof item?.summary === "string" && item.summary.trim()) ||
    undefined;
  const doi = typeof item?.doi === "string" ? item.doi : undefined;
  const version = typeof item?.version === "string" ? item.version : undefined;
  const dateStr =
    (typeof item?.date === "string" && item.date) ||
    (typeof item?.posted === "string" && item.posted) ||
    (typeof item?.published === "string" && item.published) ||
    undefined;
  const year = parseYear(dateStr);
  const abstractSnippet = buildSnippet(abstract);

  const fallbackUrl =
    doi && version ? `${webBase}/content/${doi}v${version}` : doi ? `${webBase}/content/${doi}` : `${webBase}/`;
  const url = typeof item?.url === "string" ? item.url : typeof item?.link === "string" ? item.link : fallbackUrl;

  return {
    pmid: undefined,
    doi,
    title,
    abstract,
    abstractSnippet,
    journal,
    year,
    phase: undefined,
    condition: undefined,
    isClinicalTrial: undefined,
    tags: [],
    source: server,
    isOpenAccess: true,
    url
  };
}

function parseYear(dateStr?: string): number | undefined {
  const match = dateStr?.match(/(\d{4})/);
  return match ? Number(match[1]) : undefined;
}

function buildSnippet(text?: string, max = 240): string | undefined {
  if (!text) return undefined;
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= max) return normalized;
  return `${normalized.slice(0, max).trimEnd()}...`;
}

function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}
