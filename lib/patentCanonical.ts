export type CanonicalPatentIdInput =
  | {
      source: "patentsview";
      patent_id?: string;
      kind?: string;
    }
  | {
      source?: "google_patents" | "manual" | string;
      country?: string;
      patent_number?: string;
      kind?: string;
    };

export type CanonicalPatentIdOutput = {
  country: string;
  patent_number: string;
  kind?: string;
  canonicalId: string;
};

function normalizeToken(value: string | undefined): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  return normalized || undefined;
}

export function buildCanonicalPatentId(input: CanonicalPatentIdInput): CanonicalPatentIdOutput {
  if (input.source === "patentsview") {
    const patentNumber = normalizeToken("patent_id" in input ? input.patent_id : undefined);
    if (!patentNumber) {
      throw new Error("PatentsView record missing patent_id");
    }
    const country = "US";
    const kind = normalizeToken(input.kind);
    return {
      country,
      patent_number: patentNumber,
      kind,
      canonicalId: `${country}${patentNumber}${kind ?? ""}`
    };
  }

  const country = normalizeToken("country" in input ? input.country : undefined);
  if (!country) {
    throw new Error("Patent record missing country code from API");
  }

  const patentNumber = normalizeToken("patent_number" in input ? input.patent_number : undefined);
  if (!patentNumber) {
    throw new Error("Patent record missing patent number from API");
  }

  const kind = normalizeToken(input.kind);
  return {
    country,
    patent_number: patentNumber,
    kind,
    canonicalId: `${country}${patentNumber}${kind ?? ""}`
  };
}

export function parsePatentIdentifierParts(identifier: string): CanonicalPatentIdInput {
  const normalized = normalizeToken(identifier);
  if (!normalized) {
    throw new Error("Patent record missing patent number from API");
  }

  const parsed = normalized.match(/^([A-Z]{2})([A-Z0-9]+?)([A-Z]\d{0,2})?$/);
  if (!parsed) {
    throw new Error("Patent record missing country code from API");
  }

  return {
    country: parsed[1],
    patent_number: parsed[2],
    kind: parsed[3]
  };
}
