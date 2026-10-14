import assert from "node:assert/strict";
import { getDefaultSynthesisModel } from "../lib/openaiConfig";
import { getOpenAIClient } from "../lib/openai";
import { runDemoScout } from "../lib/scout/runDemoScout";

export const name = "luna-synthesis";

export async function run() {
  const envNames = ["OPENAI_MODEL", "SYNTHESIS_MODEL", "OPENAI_API_KEY", "IMMUNOLOGYSCOUT_OPENAI_API_KEY"];
  const previousEnv = envNames.map((name) => process.env[name]);
  const originalFetch = globalThis.fetch;
  const originalWarn = console.warn;
  const warnings: unknown[][] = [];
  let restoreClient = () => {};

  try {
    for (const variable of envNames) delete process.env[variable];
    assert.equal(getDefaultSynthesisModel(), "gpt-6-luna");
    process.env.SYNTHESIS_MODEL = "synthesis-override";
    assert.equal(getDefaultSynthesisModel(), "synthesis-override");
    process.env.OPENAI_MODEL = "primary-override";
    assert.equal(getDefaultSynthesisModel(), "primary-override");
    delete process.env.OPENAI_MODEL;
    delete process.env.SYNTHESIS_MODEL;

    // All retrieval and AI responses are synthetic; no requests reach a transport.
    globalThis.fetch = async (input) => {
      const url = new URL(String(input));
      if (url.hostname === "eutils.ncbi.nlm.nih.gov" && url.pathname.endsWith("/esearch.fcgi")) {
        return Response.json({ esearchresult: { idlist: [], count: "0" } });
      }
      if (url.hostname === "api.biorxiv.org" && url.pathname.startsWith("/details/")) {
        return Response.json({
          collection: url.pathname.includes("/biorxiv/") ? [{
            title: "Synthetic receptor study",
            abstract: "Synthetic receptor assay in synthetic cells. No clinical evidence.",
            doi: "10.0000/synthetic-receptor",
            date: "2026-01-01", version: "1", url: "https://example.invalid/synthetic-receptor"
          }] : [],
          messages: [{ total: 1 }]
        });
      }
      throw new Error(`Unexpected synthetic fixture URL: ${url.origin}${url.pathname}`);
    };
    console.warn = (...args) => { warnings.push(args); };
    process.env.OPENAI_API_KEY = "synthetic-test-key";
    const client = getOpenAIClient();
    const originalCreate = client.responses.create;
    restoreClient = () => { client.responses.create = originalCreate; };
    const requests: Record<string, unknown>[] = [];
    const envelope = {
      synthesis_widget: {
        schema_version: "1.0", title: "AI fixture brief",
        sections: [{
          id: "synthetic-evidence", heading: "Synthetic evidence",
          blocks: [{
            type: "paragraph", text: "Synthetic cell evidence; no clinical conclusion.",
            citations: [{ kind: "url", url: "https://example.invalid/synthetic-receptor" }]
          }]
        }]
      },
      synthesis_markdown: "AI fixture summary: synthetic cells only."
    };
    let payload: unknown = { output_text: JSON.stringify(envelope) };
    let rejectRequest = false;
    client.responses.create = (async (request: Record<string, unknown>) => {
      requests.push(request);
      if (rejectRequest) throw new Error("Synthetic parameter rejection");
      return payload;
    }) as typeof client.responses.create;

    const input = { query: "synthetic receptor", includePatents: false, fromYear: 2026, toYear: 2026 };
    for (const model of ["gpt-6-luna", "gpt-4.1-mini"]) {
      if (model === "gpt-6-luna") delete process.env.SYNTHESIS_MODEL;
      else process.env.SYNTHESIS_MODEL = model;
      const result = await runDemoScout(input);
      assert.equal(result.meta.synthesisSource, "openai", "A successful AI fixture must not pass via the template");
      assert.equal(result.meta.paperCount, 1);
      assert.equal(result.papers[0].title, "Synthetic receptor study");
      assert.deepEqual(result.synthesis_widget, envelope.synthesis_widget);
      assert.equal(result.synthesis_markdown, envelope.synthesis_markdown);
      const request = requests.at(-1)!;
      assert.equal(request.model, model);
      assert.equal("reasoning" in request, model === "gpt-6-luna");
      if (model === "gpt-6-luna") assert.deepEqual(request.reasoning, { effort: "none" });
      const sentRecords = JSON.parse((request.input as Array<{ content: Array<{ text: string }> }>)[1].content[0].text);
      assert.equal(sentRecords.papers[0].title, "Synthetic receptor study");
      assert.deepEqual(sentRecords.patents, []);
    }

    // Primary override still wins and Luna gets the same parameters when selected explicitly.
    process.env.OPENAI_MODEL = "gpt-6-luna";
    payload = { output: [{ content: [{ text: ["```json", JSON.stringify(envelope), "```"].join("\n") }] }] };
    const extracted = await runDemoScout(input);
    assert.equal(extracted.meta.synthesisSource, "openai");
    assert.equal(extracted.synthesis_markdown, envelope.synthesis_markdown);
    assert.equal(requests.at(-1)!.model, "gpt-6-luna");
    assert.deepEqual(requests.at(-1)!.reasoning, { effort: "none" });

    for (const outputText of ["not JSON", JSON.stringify({ synthesis_widget: { sections: [] } }), "{}", ""]) {
      payload = { output_text: outputText };
      const result = await runDemoScout(input);
      assert.equal(result.meta.synthesisSource, "fallback");
      assert.equal(result.synthesis_widget?.title, "Research brief: synthetic receptor");
      assert.notEqual(result.synthesis_markdown, envelope.synthesis_markdown);
    }

    rejectRequest = true;
    const rejected = await runDemoScout(input);
    assert.equal(rejected.meta.synthesisSource, "fallback", "API rejection must be visible as fallback");
    assert.equal(rejected.synthesis_widget?.title, "Research brief: synthetic receptor");
    assert.ok(warnings.some((args) => JSON.stringify(args).includes("Synthetic parameter rejection")));

    delete process.env.OPENAI_API_KEY;
    const callsBeforeMissingKey = requests.length;
    const missingKey = await runDemoScout(input);
    assert.equal(missingKey.meta.synthesisSource, "fallback");
    assert.equal(requests.length, callsBeforeMissingKey);
    assert.ok(missingKey.notices.some((notice) => notice.title === "Template synthesis mode"));
  } finally {
    restoreClient();
    globalThis.fetch = originalFetch;
    console.warn = originalWarn;
    envNames.forEach((variable, index) => {
      if (previousEnv[index] === undefined) delete process.env[variable];
      else process.env[variable] = previousEnv[index];
    });
  }
}
