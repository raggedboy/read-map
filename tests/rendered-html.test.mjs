import assert from "node:assert/strict";
import test from "node:test";
import { register } from "node:module";

// The production bundle targets Workers. Adapt only its virtual env module for
// this Node render smoke test; no DB/R2 bindings or live services are available.
register(`data:text/javascript,${encodeURIComponent(`
export async function resolve(specifier, context, nextResolve) {
  if (specifier === "cloudflare:workers") return {
    url: "data:text/javascript,export const env = {};", shortCircuit: true
  };
  return nextResolve(specifier, context);
}
`)}`, import.meta.url);

const developmentPreviewMeta =
  /<meta(?=[^>]*\bname=["']codex-preview["'])(?=[^>]*\bcontent=["']development["'])[^>]*>/i;

test("renders production Read Map without development preview metadata", async () => {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  const response = await worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );

  assert.equal(response.status, 200);
  assert.match(
    response.headers.get("content-type") ?? "",
    /^text\/html\b/i,
  );
  const html = await response.text();
  assert.doesNotMatch(html, developmentPreviewMeta);
  assert.match(html, /Read Map/);
});

test("production Worker routes MCP discovery and rejects unauthenticated data access", async () => {
  const { default: worker } = await import(new URL("../dist/server/index.js", import.meta.url).href);
  const env = { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } };
  const ctx = { waitUntil() {}, passThroughOnException() {} };
  for (const [method, params, expected] of [
    ["initialize", { protocolVersion: "2025-06-18" }, 200],
    ["tools/list", {}, 200],
    ...["read_map_state", "read_map_delete_inbox", "read_map_deleted_inbox", "read_map_restore_inbox"].map(name => ["tools/call", { name, arguments: {} }, 401])
  ]) {
    const response = await worker.fetch(new Request("http://localhost/mcp", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params })
    }), env, ctx);
    assert.equal(response.status, expected);
    const body = await response.json();
    if (method === "tools/list") assert.deepEqual(body.result.tools.map(tool => tool.name).sort(), [
      "read_map_state", "read_map_add_inbox", "read_map_promote", "read_map_record", "read_map_edit_reading",
      "read_map_delete_inbox", "read_map_deleted_inbox", "read_map_restore_inbox"
    ].sort());
    if (method === "initialize") assert.equal(body.result.protocolVersion, "2025-06-18");
    if (expected === 401) assert.equal(body.error.code, -32001);
  }
});
