import assert from "node:assert/strict";
import { siteConfig } from "../lib/site";
import { searchPatentsImpl } from "../lib/tools/patents";
import { buildPubMedTerms } from "../lib/tools/pubmed";

export const name = "query-and-fallbacks";

export async function run() {
  const pubMedTerms = buildPubMedTerms("IL-2 muteins since 2021");
  assert.equal(pubMedTerms.derivedFromYear, 2021);
  assert.match(pubMedTerms.primaryTerm, /IL-2/i);
  assert.match(pubMedTerms.primaryTerm, /muteins/i);

  const previousPatentKey = process.env.PATENTSVIEW_API_KEY;
  delete process.env.PATENTSVIEW_API_KEY;

  try {
    const patentResult = await searchPatentsImpl({ query: "IL-2 mutein" });
    assert.equal(patentResult.status, "error");
    assert.match(patentResult.message ?? "", /PATENTSVIEW_API_KEY/);
  } finally {
    if (previousPatentKey) {
      process.env.PATENTSVIEW_API_KEY = previousPatentKey;
    } else {
      delete process.env.PATENTSVIEW_API_KEY;
    }
  }

  assert.equal(siteConfig.deploymentDomain, "immunologyscout.musicofdanielnash.com");
  assert.equal(siteConfig.name, "Immunology Scout");
}
