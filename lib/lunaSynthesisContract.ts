import { z } from "zod";
import { zodTextFormat } from "openai/helpers/zod";
import { citationRefSchema, synthesisEnvelopeSchema } from "@/lib/synthesisWidget";

const text = z.string().trim().min(1);
const citation = z.discriminatedUnion("kind", [
  citationRefSchema.options[0],
  citationRefSchema.options[1],
  // Use a supported JSON Schema pattern; the existing parser also checks URL validity.
  z.strictObject({ kind: z.literal("url"), url: text.regex(/^https?:\/\/\S+$/) })
]);
const citations = z.array(citation).max(12);
const item = z.strictObject({ text, citations });
const block = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("paragraph"), text, citations }),
  z.strictObject({ type: z.literal("bullets"), items: z.array(item).min(1) }),
  z.strictObject({ type: z.literal("numbered"), items: z.array(item).min(1) }),
  z.strictObject({ type: z.literal("callout"), tone: z.enum(["note", "warning", "speculative"]), text, citations })
]);

// Luna emits a complete envelope. Optional decorative titles are omitted from
// this wire contract; empty citation arrays express that no source was supplied.
export const lunaSynthesisEnvelopeSchema = z.strictObject({
  synthesis_widget: z.strictObject({
    schema_version: z.literal("1.0"),
    title: text,
    sections: z.array(z.strictObject({ id: text, heading: text, blocks: z.array(block).min(1) })).min(1),
    nextSteps: z.array(item).min(1)
  }),
  synthesis_markdown: text
});

export const lunaSynthesisFormat = zodTextFormat(lunaSynthesisEnvelopeSchema, "demo_synthesis");

export function parseLunaSynthesisEnvelope(value: unknown) {
  return synthesisEnvelopeSchema.parse(lunaSynthesisEnvelopeSchema.parse(value));
}
