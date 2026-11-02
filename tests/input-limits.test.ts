import assert from "node:assert/strict";
import { INPUT_LIMITS, assertInputBudget, readLimitedJson, InputLimitError } from "../lib/inputLimits";

export async function run() {
  await testRouteRejections();
  assertInputBudget({ query: "IL-2 muteins", options: [true, 2021] });
  assertInputBudget(Array(INPUT_LIMITS.elements).fill(0));
  assert.throws(() => assertInputBudget(Array(INPUT_LIMITS.elements + 1).fill(0)), InputLimitError);
  assertInputBudget("x".repeat(INPUT_LIMITS.string));
  assert.throws(() => assertInputBudget("x".repeat(INPUT_LIMITS.string + 1)), InputLimitError);
  assert.throws(() => assertInputBudget({ ["x".repeat(INPUT_LIMITS.string + 1)]: 0 }), InputLimitError);
  let deep: unknown = 0;
  for (let i = 0; i < INPUT_LIMITS.depth; i++) deep = { x: deep };
  assertInputBudget(deep);
  assert.throws(() => assertInputBudget({ x: deep }), InputLimitError);
  const request = (body: string, headers: Record<string, string> = {}) => new Request("http://localhost", { method: "POST", headers: { "content-type": "application/json", ...headers }, body });
  assert.deepEqual(await readLimitedJson(request('{"query":"IL-2"}')), { query: "IL-2" });
  assert.deepEqual(await readLimitedJson(request('{}' + ' '.repeat(INPUT_LIMITS.bytes - 2))), {});
  await assert.rejects(readLimitedJson(request('{}' + ' '.repeat(INPUT_LIMITS.bytes - 1), { "content-length": "1" })), InputLimitError);
  await assert.rejects(readLimitedJson(request('{')), (error: unknown) => error instanceof InputLimitError && error.status === 400);
  await assert.rejects(readLimitedJson(request('{}', { "content-type": "text/plain" })), (error: unknown) => error instanceof InputLimitError && error.status === 415);
  await assert.rejects(readLimitedJson(request('{}', { "content-encoding": "gzip" })), (error: unknown) => error instanceof InputLimitError && error.status === 415);
  await assert.rejects(readLimitedJson(request('{"unknown":' + JSON.stringify("é".repeat(INPUT_LIMITS.string + 1)) + '}')), InputLimitError);
  let cancelled = false;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) { controller.enqueue(new Uint8Array(INPUT_LIMITS.bytes)); controller.enqueue(new Uint8Array(1)); },
    cancel() { cancelled = true; }
  });
  await assert.rejects(readLimitedJson(new Request("http://localhost", { method: "POST", headers: { "content-type": "application/json" }, body: stream, duplex: "half" } as RequestInit)), InputLimitError);
  assert.equal(cancelled, true);
}

export const name = "input-limits";

import { POST } from "../app/api/scout/route";
export async function testRouteRejections() {
  for (const payload of [{ query: "x".repeat(501) }, { query: "IL-2", ignored: Array(33).fill(0) }]) {
    const response = await POST(new Request("http://localhost/api/scout", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) }));
    assert.equal(response.status, 413);
  }
}
