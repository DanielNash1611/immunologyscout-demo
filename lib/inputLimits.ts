// The demo accepts one short query and four scalar options.
export const INPUT_LIMITS = { bytes: 4096, elements: 32, string: 500, depth: 4 } as const;

export class InputLimitError extends Error {
  constructor(message: string, readonly status = 413) { super(message); }
}

// Run before recursive schema validation, including for unknown fields.
export function assertInputBudget(value: unknown): void {
  const pending: Array<{ value: unknown; depth: number }> = [{ value, depth: 0 }];
  let elements = 0;
  while (pending.length) {
    const { value: item, depth } = pending.pop()!;
    if (depth > INPUT_LIMITS.depth) throw new InputLimitError("JSON nesting exceeds the input limit.");
    if (typeof item === "string" && item.length > INPUT_LIMITS.string) throw new InputLimitError("JSON string exceeds the input limit.");
    if (item === null || typeof item !== "object") continue;
    const keys = Object.keys(item);
    elements += keys.length;
    if (elements > INPUT_LIMITS.elements) throw new InputLimitError("JSON elements exceed the input limit.");
    for (const key of keys) {
      if (key.length > INPUT_LIMITS.string) throw new InputLimitError("JSON key exceeds the input limit.");
      pending.push({ value: (item as Record<string, unknown>)[key], depth: depth + 1 });
    }
  }
}

export async function readLimitedJson(request: Request): Promise<unknown> {
  const encoding = request.headers.get("content-encoding");
  if (encoding && encoding.toLowerCase() !== "identity") throw new InputLimitError("Compressed request bodies are not supported.", 415);
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") throw new InputLimitError("Content-Type must be application/json.", 415);
  const length = request.headers.get("content-length");
  if (length !== null && !/^\d+$/.test(length)) throw new InputLimitError("Invalid Content-Length.", 400);
  if (length !== null && Number(length) > INPUT_LIMITS.bytes) throw new InputLimitError("Request body exceeds the input limit.");
  const reader = request.body?.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  if (reader) {
    try {
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        bytes += chunk.value.byteLength;
        if (bytes > INPUT_LIMITS.bytes) {
          await reader.cancel();
          throw new InputLimitError("Request body exceeds the input limit.");
        }
        chunks.push(chunk.value);
      }
    } finally { reader.releaseLock(); }
  }
  const body = new Uint8Array(bytes);
  let offset = 0;
  for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
  let parsed: unknown;
  try { parsed = JSON.parse(new TextDecoder().decode(body)); }
  catch { throw new InputLimitError("Invalid JSON body.", 400); }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) throw new InputLimitError("JSON body must be an object.", 400);
  assertInputBudget(parsed);
  return parsed;
}
