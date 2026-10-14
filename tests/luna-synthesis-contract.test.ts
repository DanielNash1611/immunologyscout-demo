import assert from "node:assert/strict";
import { getOpenAIClient } from "../lib/openai";
import { runDemoScout } from "../lib/scout/runDemoScout";

export const name = "luna-synthesis-contract";

export async function run() {
  const envNames = ["OPENAI_MODEL", "SYNTHESIS_MODEL", "OPENAI_API_KEY", "IMMUNOLOGYSCOUT_OPENAI_API_KEY"];
  const previous = envNames.map((key) => process.env[key]);
  const fetch = globalThis.fetch;
  const warn = console.warn;
  let restoreClient = () => {};
  try {
    for (const key of envNames) delete process.env[key];
    process.env.OPENAI_API_KEY = "synthetic-contract-test-key";
    console.warn = () => {};
    globalThis.fetch = async (input) => {
      const url = new URL(String(input));
      if (url.hostname === "eutils.ncbi.nlm.nih.gov" && url.pathname.endsWith("/esearch.fcgi")) {
        return Response.json({ esearchresult: { idlist: [], count: "0" } });
      }
      if (url.hostname === "api.biorxiv.org" && url.pathname.startsWith("/details/")) {
        return Response.json({ collection: url.pathname.includes("/biorxiv/") ? [{
          title: "Synthetic receptor evidence", abstract: "Fictional cells only; no clinical evidence.",
          doi: "10.0000/synthetic-contract", date: "2026-01-01", version: "1"
        }] : [], messages: [{ total: 1 }] });
      }
      throw new Error("Unexpected network attempt in contract fixture");
    };
    const complete = {
      synthesis_widget: {
        schema_version: "1.0", title: "Fictional AI synthesis",
        sections: [{ id: "evidence", heading: "Fictional evidence", blocks: [
          { type: "paragraph", text: "Fictional assay only.", citations: [{ kind: "url", url: "https://example.invalid/fictional" }] },
          { type: "bullets", items: [{ text: "No clinical outcome supplied.", citations: [] }] },
          { type: "numbered", items: [{ text: "Methods are missing.", citations: [{ kind: "pubmed", id: "synthetic-pmid" }] }] },
          { type: "callout", tone: "warning", text: "No translational conclusion.", citations: [{ kind: "patent", id: "synthetic-patent" }] }
        ] }],
        nextSteps: [{ text: "Review the supplied record and its limitations.", citations: [] }]
      },
      synthesis_markdown: "Fictional AI narrative; no clinical conclusion."
    };
    let output: unknown = complete;
    let reject = false;
    let calls = 0;
    const requests: any[] = [];
    const client = getOpenAIClient();
    const original = client.responses.create;
    restoreClient = () => { client.responses.create = original; };
    client.responses.create = (async (request: unknown) => {
      calls++; requests.push(request);
      if (reject) throw new Error("Synthetic request rejection");
      return { output_text: JSON.stringify(output) };
    }) as typeof client.responses.create;
    const input = { query: "synthetic receptor", includePatents: false, fromYear: 2026, toYear: 2026 };
    const success = await runDemoScout(input);
    assert.equal(success.meta.synthesisSource, "openai");
    assert.deepEqual(success.synthesis_widget, complete.synthesis_widget);
    assert.equal(success.synthesis_markdown, complete.synthesis_markdown);
    const format = requests.at(-1).text.format;
    assert.equal(format.type, "json_schema");
    assert.equal(format.strict, true);
    assert.deepEqual(format.schema.required, ["synthesis_widget", "synthesis_markdown"]);
    assert.ok(format.schema.properties.synthesis_widget.required.includes("nextSteps"));
    assert.equal(format.schema.properties.synthesis_widget.properties.nextSteps.minItems, 1);
    assert.deepEqual(format.schema.properties.synthesis_widget.properties.nextSteps.items.required, ["text", "citations"]);

    const invalid: Array<[string, (envelope: any) => void]> = [
      ["observed strings and empty nextSteps", e => { e.synthesis_widget.sections[0].blocks[1].items = ["one", "two", "three"]; e.synthesis_widget.nextSteps = []; }],
      ["missing widget", e => { delete e.synthesis_widget; }],
      ["missing markdown", e => { delete e.synthesis_markdown; }],
      ["empty markdown", e => { e.synthesis_markdown = "  "; }],
      ["missing nextSteps", e => { delete e.synthesis_widget.nextSteps; }],
      ["empty nextSteps", e => { e.synthesis_widget.nextSteps = []; }],
      ["string next step", e => { e.synthesis_widget.nextSteps = ["review"]; }],
      ["missing next step text", e => { delete e.synthesis_widget.nextSteps[0].text; }],
      ["missing next step citations", e => { delete e.synthesis_widget.nextSteps[0].citations; }],
      ["missing section heading", e => { delete e.synthesis_widget.sections[0].heading; }],
      ["missing section id", e => { delete e.synthesis_widget.sections[0].id; }],
      ["empty blocks", e => { e.synthesis_widget.sections[0].blocks = []; }],
      ["wrong paragraph text type", e => { e.synthesis_widget.sections[0].blocks[0].text = 1; }],
      ["missing paragraph citations", e => { delete e.synthesis_widget.sections[0].blocks[0].citations; }],
      ["wrong bullet item type", e => { e.synthesis_widget.sections[0].blocks[1].items = ["string"]; }],
      ["empty list", e => { e.synthesis_widget.sections[0].blocks[1].items = []; }],
      ["missing list text", e => { delete e.synthesis_widget.sections[0].blocks[1].items[0].text; }],
      ["missing list citations", e => { delete e.synthesis_widget.sections[0].blocks[2].items[0].citations; }],
      ["missing callout tone", e => { delete e.synthesis_widget.sections[0].blocks[3].tone; }],
      ["invalid callout tone", e => { e.synthesis_widget.sections[0].blocks[3].tone = "other"; }],
      ["URL citation using id", e => { e.synthesis_widget.sections[0].blocks[0].citations = [{ kind: "url", id: "wrong" }]; }],
      ["invalid URL", e => { e.synthesis_widget.sections[0].blocks[0].citations[0].url = "https://%"; }],
      ["missing citation id", e => { delete e.synthesis_widget.sections[0].blocks[2].items[0].citations[0].id; }],
      ["unknown block", e => { e.synthesis_widget.sections[0].blocks[0].type = "unknown"; }]
    ];
    for (const [label, mutate] of invalid) {
      output = structuredClone(complete); mutate(output);
      const before = calls;
      const result = await runDemoScout(input);
      assert.equal(calls, before + 1, "No model retry on invalid output");
      assert.equal(result.meta.synthesisSource, "fallback", label);
      assert.equal(result.synthesis_widget?.title, "Research brief: synthetic receptor", label);
      assert.notEqual(result.synthesis_markdown, complete.synthesis_markdown, label);
    }
    // Preserve the existing other-model request and partial-envelope behavior.
    process.env.OPENAI_MODEL = "gpt-4.1-mini";
    output = { synthesis_markdown: "Legacy partial AI fixture." };
    const legacy = await runDemoScout(input);
    assert.equal(legacy.meta.synthesisSource, "openai");
    assert.equal(legacy.synthesis_markdown, "Legacy partial AI fixture.");
    assert.equal("text" in requests.at(-1), false);
    assert.equal("reasoning" in requests.at(-1), false);
    const legacyPrompt = JSON.parse(requests.at(-1).input[1].content[0].text);
    assert.equal(legacyPrompt.instructions.schema_notes.synthesis_widget.nextSteps[0].citations[0].id, "string");
    process.env.OPENAI_MODEL = "gpt-6-luna";
    reject = true;
    const rejected = await runDemoScout(input);
    assert.equal(rejected.meta.synthesisSource, "fallback");
  } finally {
    restoreClient(); globalThis.fetch = fetch; console.warn = warn;
    envNames.forEach((key, index) => { if (previous[index] === undefined) delete process.env[key]; else process.env[key] = previous[index]; });
  }
}
