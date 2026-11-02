import { readLimitedJson, InputLimitError } from "@/lib/inputLimits";
import { z } from "zod";
import { runDemoScout } from "@/lib/scout/runDemoScout";

const requestSchema = z.object({
  query: z.string().trim().min(1, "Query is required.").max(500, "Query must be at most 500 characters."),
  includePatents: z.boolean().optional(),
  fromYear: z.number().int().min(1900).max(2100).optional(),
  toYear: z.number().int().min(1900).max(2100).optional(),
  maxResults: z.number().int().min(1).max(20).optional()
});

export async function POST(request: Request) {
  let json: unknown;

  try {
    json = await readLimitedJson(request);
  } catch (error) {
    return Response.json({ error: error instanceof InputLimitError ? error.message : "Invalid JSON body." }, { status: error instanceof InputLimitError ? error.status : 400 });
  }

  const parsed = requestSchema.safeParse(json);
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request." },
      { status: 400 }
    );
  }

  try {
    const result = await runDemoScout(parsed.data);
    return Response.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected failure while running the scout.";
    return Response.json({ error: message }, { status: 500 });
  }
}
