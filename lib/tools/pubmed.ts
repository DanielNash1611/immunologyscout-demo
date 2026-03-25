import type { PaperMetadata, PaperSource } from "../../types/immunologyScout";
import { searchPreprints } from "./preprints";

const PUBMED_BACKOFF_MS = [250, 750, 1500, 3000];
const PUBMED_MAX_RETRIES = PUBMED_BACKOFF_MS.length;
const PUBMED_EFETCH_BATCH_SIZE = 8;
const PUBMED_FETCH_TIMEOUT_MS = 15000;

const SUPPORTED_SOURCES: PaperSource[] = ["pubmed", "biorxiv", "medrxiv"];

const STOPWORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "by",
  "for",
  "from",
  "in",
  "into",
  "is",
  "literature",
  "me",
  "of",
  "on",
  "or",
  "paper",
  "papers",
  "prior",
  "research",
  "show",
  "studies",
  "study",
  "the",
  "to",
  "with"
]);

type ParsedToken = {
  value: string;
  quoted: boolean;
};

let hasLoggedPubmedEnv = false;

function getPubMedBaseUrl(): string {
  return process.env.PUBMED_BASE_URL || "https://eutils.ncbi.nlm.nih.gov/entrez/eutils";
}

function getPubMedApiKey(): string | undefined {
  const apiKey = process.env.PUBMED_API_KEY ?? process.env.NCBI_API_KEY;
  const trimmed = apiKey?.trim();
  return trimmed ? trimmed : undefined;
}

function hasPubMedApiKey(): boolean {
  return Boolean(getPubMedApiKey());
}

function isPubmedDebugEnabled(): boolean {
  return process.env.NODE_ENV !== "production" || Boolean(process.env.DEBUG);
}

export async function searchPapersImpl(params: {
  query: string;
  fromYear?: number;
  toYear?: number;
  maxResults?: number;
  sources?: PaperSource[];
}): Promise<PaperMetadata[]> {
  const { query, fromYear, toYear, maxResults = 12, sources } = params;
  const normalizedQuery = query.trim();
  if (!normalizedQuery) return [];

  logPubmedEnvOnce();

  const requestedSources = normalizeSources(sources);
  const includePubmed = requestedSources.includes("pubmed");
  const preprintSources = requestedSources.filter(
    (source): source is "biorxiv" | "medrxiv" => source === "biorxiv" || source === "medrxiv"
  );

  const pubmedPromise = includePubmed
    ? searchPubMed({ query: normalizedQuery, fromYear, toYear, maxResults }).catch((error) => {
        console.warn("[pubmed] search failed", { message: getErrorMessage(error) });
        return [];
      })
    : Promise.resolve<PaperMetadata[]>([]);

  const preprintPromises = preprintSources.map((server) =>
    searchPreprints({
      query: normalizedQuery,
      server,
      fromYear,
      toYear,
      maxResults: Math.max(3, Math.ceil(maxResults / Math.max(1, preprintSources.length)))
    }).catch((error) => {
      console.warn("[preprints] search failed", { server, message: getErrorMessage(error) });
      return [];
    })
  );

  const [pubmedResults, ...preprintResults] = await Promise.all([pubmedPromise, ...preprintPromises]);
  return dedupeAndRank([...pubmedResults, ...preprintResults.flat()]).slice(0, maxResults);
}

export function buildPubMedTerms(query: string): {
  strippedQuery: string;
  derivedFromYear?: number;
  primaryTerm: string;
  fallbackTerm: string;
  keywords: string[];
} {
  const { strippedQuery, derivedFromYear } = stripDateFromQuery(query);
  const cleanedQuery = strippedQuery.replace(/\s+/g, " ").trim();
  const tokens = dropStopwords(tokenizeQuery(cleanedQuery));
  const keywords = limitKeywords(tokens.map((token) => token.value));

  if (keywords.length === 0) {
    return {
      strippedQuery: cleanedQuery,
      derivedFromYear,
      primaryTerm: cleanedQuery,
      fallbackTerm: cleanedQuery,
      keywords: []
    };
  }

  const primaryTerm = keywords.map(buildQueryTerm).join(" AND ");
  const fallbackTerm = keywords.slice(0, Math.min(2, keywords.length)).map(removeQuotes).join(" AND ");

  return {
    strippedQuery: cleanedQuery,
    derivedFromYear,
    primaryTerm,
    fallbackTerm: fallbackTerm || cleanedQuery,
    keywords: keywords.map(removeQuotes)
  };
}

async function searchPubMed(params: {
  query: string;
  fromYear?: number;
  toYear?: number;
  maxResults?: number;
}): Promise<PaperMetadata[]> {
  const { query, fromYear, toYear, maxResults = 12 } = params;
  const { strippedQuery, derivedFromYear, primaryTerm, fallbackTerm, keywords } = buildPubMedTerms(query);
  const effectiveFromYear = fromYear ?? derivedFromYear;

  if (!primaryTerm.trim()) return [];

  const primarySearch = await runPubMedSearch({
    term: primaryTerm,
    fromYear: effectiveFromYear,
    toYear,
    maxResults
  });

  let idList = primarySearch.idList;
  if (idList.length === 0 && fallbackTerm && fallbackTerm !== primaryTerm) {
    const fallbackSearch = await runPubMedSearch({
      term: fallbackTerm,
      fromYear: effectiveFromYear,
      toYear,
      maxResults
    });
    idList = fallbackSearch.idList;
  }

  if (idList.length === 0) return [];

  const summaryUrl = new URL(`${getPubMedBaseUrl()}/esummary.fcgi`);
  const summaryParams = new URLSearchParams({
    db: "pubmed",
    id: idList.join(","),
    retmode: "json"
  });
  const pubMedApiKey = getPubMedApiKey();
  if (pubMedApiKey) summaryParams.set("api_key", pubMedApiKey);
  summaryUrl.search = summaryParams.toString();

  const [summaryResponse, enrichment] = await Promise.all([
    fetchPubMedWithRetry({ url: summaryUrl.toString(), label: "summary" }),
    fetchPubMedEnrichment(idList)
  ]);

  if (!summaryResponse) {
    throw new Error("PubMed summary request failed");
  }

  await expectOk(summaryResponse, "summary", summaryUrl.toString());
  const summaryJson = await parseJsonResponse(summaryResponse, "summary", summaryUrl.toString());
  const summaries = summaryJson?.result?.uids
    ? summaryJson.result.uids.map((uid: string) => summaryJson.result[uid])
    : [];

  const papers = summaries.map((item: any) => mapSummary(item, enrichment.abstracts)).filter(Boolean) as PaperMetadata[];
  return rankPubMedPapers(papers, strippedQuery, keywords, idList).slice(0, maxResults);
}

function mapSummary(
  item: any,
  abstracts: Record<string, string>
): PaperMetadata | null {
  const pmid: string | undefined = item?.uid;
  const title = decodeHtml(item?.title || "Untitled");
  if (!title) return null;

  const articleIds: any[] = item?.articleids || [];
  const doi = articleIds.find((entry) => entry.idtype === "doi")?.value;
  const journal: string | undefined = item?.fulljournalname || item?.source;
  const pubDate: string = item?.pubdate || item?.sortpubdate || "";
  const year = parseYear(pubDate);
  const abstract = pmid ? abstracts[pmid] : undefined;
  const isOpenAccess = Boolean(articleIds.find((entry) => entry.idtype === "pmcid"));

  return {
    pmid,
    doi,
    title,
    abstract,
    abstractSnippet: buildSnippet(abstract),
    journal,
    year,
    source: "pubmed",
    isOpenAccess,
    url: pmid ? `https://pubmed.ncbi.nlm.nih.gov/${pmid}/` : undefined
  };
}

function rankPubMedPapers(
  papers: PaperMetadata[],
  query: string,
  keywords: string[],
  idList: string[]
): PaperMetadata[] {
  const originalOrder = new Map(idList.map((pmid, index) => [pmid, index]));
  const normalizedQuery = query.toLowerCase();

  return [...papers].sort((left, right) => {
    const scoreLeft = scorePaper(left, normalizedQuery, keywords);
    const scoreRight = scorePaper(right, normalizedQuery, keywords);
    if (scoreRight !== scoreLeft) return scoreRight - scoreLeft;

    const rankLeft = originalOrder.get(left.pmid || "") ?? Number.MAX_SAFE_INTEGER;
    const rankRight = originalOrder.get(right.pmid || "") ?? Number.MAX_SAFE_INTEGER;
    if (rankLeft !== rankRight) return rankLeft - rankRight;

    if ((right.year || 0) !== (left.year || 0)) {
      return (right.year || 0) - (left.year || 0);
    }

    return left.title.localeCompare(right.title);
  });
}

function scorePaper(paper: PaperMetadata, normalizedQuery: string, keywords: string[]): number {
  const title = (paper.title || "").toLowerCase();
  const abstract = (paper.abstract || paper.abstractSnippet || "").toLowerCase();
  let score = 0;

  if (title.includes(normalizedQuery)) score += 10;
  if (abstract.includes(normalizedQuery)) score += 6;

  for (const keyword of keywords) {
    const normalizedKeyword = keyword.toLowerCase();
    if (title.includes(normalizedKeyword)) score += 4;
    if (abstract.includes(normalizedKeyword)) score += 2;
  }

  if (paper.isOpenAccess) score += 1;
  if (paper.year) score += Math.max(0, paper.year - 2018) / 4;

  return score;
}

async function runPubMedSearch(params: {
  term: string;
  fromYear?: number;
  toYear?: number;
  maxResults: number;
}): Promise<{ idList: string[]; count: number }> {
  const searchUrl = new URL(`${getPubMedBaseUrl()}/esearch.fcgi`);
  const searchParams = new URLSearchParams({
    db: "pubmed",
    term: params.term,
    retmode: "json",
    retmax: `${params.maxResults}`,
    sort: "relevance",
    datetype: "pdat"
  });

  if (params.fromYear) searchParams.set("mindate", `${params.fromYear}/01/01`);
  if (params.toYear) searchParams.set("maxdate", `${params.toYear}/12/31`);

  const pubMedApiKey = getPubMedApiKey();
  if (pubMedApiKey) searchParams.set("api_key", pubMedApiKey);
  searchUrl.search = searchParams.toString();

  const response = await fetchPubMedWithRetry({
    url: searchUrl.toString(),
    label: "search"
  });

  if (!response) {
    throw new Error("PubMed search request failed");
  }

  await expectOk(response, "search", searchUrl.toString());
  const json = await parseJsonResponse(response, "search", searchUrl.toString());
  const idList: string[] = json?.esearchresult?.idlist ?? [];
  const count = Number(json?.esearchresult?.count ?? idList.length);
  return { idList, count };
}

async function fetchPubMedEnrichment(pmids: string[]): Promise<{
  abstracts: Record<string, string>;
}> {
  if (pmids.length === 0) return { abstracts: {} };

  const allAbstracts: Record<string, string> = {};
  const uniquePmids = Array.from(new Set(pmids));

  for (const batch of chunkArray(uniquePmids, PUBMED_EFETCH_BATCH_SIZE)) {
    try {
      const result = await fetchPubMedEnrichmentBatch(batch);
      Object.assign(allAbstracts, result.abstracts);
    } catch (error) {
      console.warn("[pubmed] enrichment batch failed", {
        firstPmid: batch[0],
        message: getErrorMessage(error)
      });
    }
  }

  return { abstracts: allAbstracts };
}

async function fetchPubMedEnrichmentBatch(pmids: string[]): Promise<{
  abstracts: Record<string, string>;
}> {
  const fetchUrl = new URL(`${getPubMedBaseUrl()}/efetch.fcgi`);
  const fetchParams = new URLSearchParams({
    db: "pubmed",
    id: pmids.join(","),
    retmode: "xml",
    rettype: "abstract"
  });

  const pubMedApiKey = getPubMedApiKey();
  if (pubMedApiKey) fetchParams.set("api_key", pubMedApiKey);
  fetchUrl.search = fetchParams.toString();

  const response = await fetchPubMedWithRetry({
    url: fetchUrl.toString(),
    label: "abstracts"
  });

  if (!response) {
    return { abstracts: {} };
  }

  await expectOk(response, "abstracts", fetchUrl.toString());
  const xml = await response.text();
  return parsePubMedEnrichmentXml(xml);
}

function parsePubMedEnrichmentXml(xml: string): {
  abstracts: Record<string, string>;
} {
  const abstracts: Record<string, string> = {};
  const articleRegex = /<PubmedArticle>([\s\S]*?)<\/PubmedArticle>/g;
  let articleMatch: RegExpExecArray | null;

  while ((articleMatch = articleRegex.exec(xml)) !== null) {
    const block = articleMatch[1];
    const pmidMatch = block.match(/<PMID[^>]*>(\d+)<\/PMID>/);
    const pmid = pmidMatch?.[1];
    if (!pmid) continue;

    const abstractPieces: string[] = [];
    const abstractRegex = /<AbstractText[^>]*>([\s\S]*?)<\/AbstractText>/g;
    let abstractMatch: RegExpExecArray | null;
    while ((abstractMatch = abstractRegex.exec(block)) !== null) {
      const raw = abstractMatch[1];
      const cleaned = decodeHtml(raw.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
      if (cleaned) abstractPieces.push(cleaned);
    }

    if (abstractPieces.length > 0) {
      abstracts[pmid] = abstractPieces.join(" ");
    }
  }

  return { abstracts };
}

function chunkArray<T>(items: T[], size: number): T[][] {
  const chunkSize = Math.max(1, size);
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += chunkSize) {
    chunks.push(items.slice(index, index + chunkSize));
  }
  return chunks;
}

function normalizeSources(sources?: PaperSource[]): PaperSource[] {
  if (!Array.isArray(sources) || sources.length === 0) return ["pubmed"];
  const filtered = sources.filter((source) => SUPPORTED_SOURCES.includes(source));
  return filtered.length > 0 ? filtered : ["pubmed"];
}

function tokenizeQuery(text: string): ParsedToken[] {
  const tokens: ParsedToken[] = [];
  const quoteRegex = /"([^"]+)"|'([^']+)'/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = quoteRegex.exec(text)) !== null) {
    const before = text.slice(lastIndex, match.index);
    tokens.push(...extractWordTokens(before));
    const phrase = (match[1] ?? match[2] ?? "").trim();
    if (phrase) {
      tokens.push({ value: `"${phrase}"`, quoted: true });
    }
    lastIndex = match.index + match[0].length;
  }

  tokens.push(...extractWordTokens(text.slice(lastIndex)));
  return tokens;
}

function extractWordTokens(text: string): ParsedToken[] {
  return Array.from(text.matchAll(/[A-Za-z0-9][A-Za-z0-9-]*/g)).map((match) => ({
    value: match[0],
    quoted: false
  }));
}

function dropStopwords(tokens: ParsedToken[]): ParsedToken[] {
  return tokens.filter((token) => {
    if (token.quoted) return true;
    return !STOPWORDS.has(token.value.toLowerCase());
  });
}

function limitKeywords(tokens: string[]): string[] {
  const seen = new Set<string>();
  const deduped: string[] = [];

  for (const token of tokens) {
    const normalized = removeQuotes(token).toLowerCase();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    deduped.push(token);
  }

  const scored = deduped.map((token, index) => ({
    token,
    index,
    score: token.length + (/\d/.test(token) ? 2 : 0) + (/-/.test(token) ? 1 : 0)
  }));

  scored.sort((left, right) => right.score - left.score || left.index - right.index);
  return scored.slice(0, 5).map((entry) => entry.token);
}

function buildQueryTerm(token: string): string {
  const cleaned = removeQuotes(token);
  if (!cleaned) return "";
  if (token.startsWith('"') && token.endsWith('"')) return token;
  if (cleaned.includes("-")) {
    const spaced = cleaned.replace(/-/g, " ");
    return `("${cleaned}" OR "${spaced}")`;
  }
  if (/\s/.test(cleaned)) {
    return `"${cleaned}"`;
  }
  return cleaned;
}

function stripDateFromQuery(query: string): { strippedQuery: string; derivedFromYear?: number } {
  let derivedFromYear: number | undefined;
  const strippedQuery = query.replace(/\b(?:since|from)\s+(19\d{2}|20\d{2})\b/gi, (_match, year: string) => {
    if (!derivedFromYear) {
      derivedFromYear = Number(year);
    }
    return "";
  });

  return {
    strippedQuery: strippedQuery.replace(/\s+/g, " ").trim(),
    derivedFromYear
  };
}

function removeQuotes(text: string): string {
  return text.replace(/^["']|["']$/g, "").trim();
}

function dedupeAndRank(papers: PaperMetadata[]): PaperMetadata[] {
  const seen = new Map<string, PaperMetadata>();
  for (const paper of papers) {
    const key =
      paper.doi?.toLowerCase() ||
      paper.pmid ||
      `${paper.title.toLowerCase()}::${paper.year ?? ""}::${paper.source}`;
    if (!seen.has(key)) {
      seen.set(key, paper);
    }
  }

  return Array.from(seen.values()).sort((left, right) => {
    if ((right.year || 0) !== (left.year || 0)) return (right.year || 0) - (left.year || 0);
    if (Number(right.isOpenAccess) !== Number(left.isOpenAccess)) {
      return Number(right.isOpenAccess) - Number(left.isOpenAccess);
    }
    return left.title.localeCompare(right.title);
  });
}

function parseYear(value?: string): number | undefined {
  const match = value?.match(/(\d{4})/);
  return match ? Number(match[1]) : undefined;
}

function buildSnippet(text?: string, max = 260): string | undefined {
  if (!text) return undefined;
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= max) return normalized;
  return `${normalized.slice(0, max).trimEnd()}...`;
}

function decodeHtml(str: string): string {
  return str
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function logPubmedEnvOnce() {
  if (hasLoggedPubmedEnv || !isPubmedDebugEnabled()) return;
  hasLoggedPubmedEnv = true;
  console.log("[pubmed] env", { hasPubMedApiKey: hasPubMedApiKey() });
}

function redactApiKey(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.searchParams.has("api_key")) {
      parsed.searchParams.set("api_key", "REDACTED");
    }
    return parsed.toString();
  } catch {
    return url.replace(/api_key=[^&]+/i, "api_key=REDACTED");
  }
}

async function parseJsonResponse(response: Response, label: string, url: string): Promise<any> {
  const bodyText = await response.text();
  try {
    return JSON.parse(bodyText);
  } catch (error) {
    console.error(`[pubmed] ${label} parse failed`, {
      url: redactApiKey(url),
      message: getErrorMessage(error),
      bodySnippet: bodyText.slice(0, 300)
    });
    throw new Error(`PubMed ${label} response parse error`);
  }
}

function isRetryableStatus(status: number): boolean {
  return [408, 425, 429, 500, 502, 503, 504].includes(status);
}

function randomJitter(maxMs: number): number {
  return Math.floor(Math.random() * Math.max(1, maxMs));
}

async function delay(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchPubMedWithRetry(params: {
  url: string;
  label: string;
}): Promise<Response | undefined> {
  for (let attempt = 0; attempt <= PUBMED_MAX_RETRIES; attempt += 1) {
    let response: Response | undefined;

    try {
      response = await fetchWithTimeout(params.url);
    } catch (error) {
      if (attempt >= PUBMED_MAX_RETRIES || !isTransientFetchError(error)) {
        throw error;
      }
      const backoffMs = PUBMED_BACKOFF_MS[attempt] + randomJitter(250);
      await delay(backoffMs);
      continue;
    }

    if (!response) {
      if (attempt >= PUBMED_MAX_RETRIES) return undefined;
      await delay(PUBMED_BACKOFF_MS[attempt] + randomJitter(250));
      continue;
    }

    if (isRetryableStatus(response.status) && attempt < PUBMED_MAX_RETRIES) {
      await delay(PUBMED_BACKOFF_MS[attempt] + randomJitter(250));
      continue;
    }

    return response;
  }

  return undefined;
}

async function fetchWithTimeout(url: string): Promise<Response | undefined> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PUBMED_FETCH_TIMEOUT_MS);

  try {
    return await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "ImmunologyScoutDemo/1.0"
      }
    });
  } catch (error) {
    if (isTransientFetchError(error)) return undefined;
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function isTransientFetchError(error: unknown): boolean {
  const message = getErrorMessage(error).toLowerCase();
  return (
    message.includes("aborterror") ||
    message.includes("econnreset") ||
    message.includes("etimedout") ||
    message.includes("fetch failed") ||
    message.includes("networkerror") ||
    message.includes("timeout")
  );
}

async function expectOk(response: Response, label: string, url: string) {
  if (response.ok) return;
  const body = await response.text().catch(() => "");
  throw new Error(`PubMed ${label} failed with status ${response.status}: ${body.slice(0, 200)} @ ${redactApiKey(url)}`);
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}
