import { z } from "zod";

const schemaVersionLiteral = z.literal("1.0");

export const citationRefSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("pubmed"),
    id: z.string().trim().min(1)
  }),
  z.object({
    kind: z.literal("patent"),
    id: z.string().trim().min(1)
  }),
  z.object({
    kind: z.literal("url"),
    url: z.string().url()
  })
]);

const citationRefsSchema = z.array(citationRefSchema).max(12).optional();

const bulletBlockSchema = z.object({
  type: z.literal("bullets"),
  items: z
    .array(
      z.object({
        text: z.string().trim().min(1),
        citations: citationRefsSchema
      })
    )
    .min(1)
});

const paragraphBlockSchema = z.object({
  type: z.literal("paragraph"),
  text: z.string().trim().min(1),
  citations: citationRefsSchema
});

const calloutBlockSchema = z.object({
  type: z.literal("callout"),
  tone: z.enum(["note", "warning", "speculative"]),
  title: z.string().trim().min(1).optional(),
  text: z.string().trim().min(1),
  citations: citationRefsSchema
});

const numberedBlockSchema = z.object({
  type: z.literal("numbered"),
  items: z
    .array(
      z.object({
        title: z.string().trim().min(1).optional(),
        text: z.string().trim().min(1),
        citations: citationRefsSchema
      })
    )
    .min(1)
});

export const synthesisBlockSchema = z.discriminatedUnion("type", [
  bulletBlockSchema,
  paragraphBlockSchema,
  calloutBlockSchema,
  numberedBlockSchema
]);

export const synthesisSectionSchema = z.object({
  id: z.string().trim().min(1),
  heading: z.string().trim().min(1),
  blocks: z.array(synthesisBlockSchema).min(1)
});

export const synthesisWidgetSchema = z.object({
  schema_version: schemaVersionLiteral,
  title: z.string().trim().min(1),
  sections: z.array(synthesisSectionSchema).min(1),
  nextSteps: z
    .array(
      z.object({
        text: z.string().trim().min(1),
        citations: citationRefsSchema
      })
    )
    .min(1)
    .optional()
});

export const synthesisEnvelopeSchema = z.object({
  synthesis_widget: synthesisWidgetSchema.optional(),
  synthesis_markdown: z.string().trim().min(1).optional()
});

export type CitationRef = z.infer<typeof citationRefSchema>;
export type SynthesisBlock = z.infer<typeof synthesisBlockSchema>;
export type SynthesisSection = z.infer<typeof synthesisSectionSchema>;
export type SynthesisWidget = z.infer<typeof synthesisWidgetSchema>;
export type SynthesisEnvelope = z.infer<typeof synthesisEnvelopeSchema>;

export function serializeSynthesisWidget(widget: SynthesisWidget): SynthesisWidget {
  return synthesisWidgetSchema.parse(widget);
}
