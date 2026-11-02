import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const temp = await mkdtemp(join(tmpdir(), "read-map-test-"));
for (const [source, dest] of [["map/validation.ts", "validation"], ["map/mcp.ts", "mcp"], ["app/api/_data.ts", "data"]]) {
  let code = await readFile(new URL(`../${source}`, import.meta.url), "utf8");
  code = code.replace('import { env } from "cloudflare:workers";', 'const env = globalThis.__readMapTestEnv;').replace('"../../map/validation"', '"./validation.mjs"').replace('"./validation"', '"./validation.mjs"');
  await writeFile(join(temp, `${dest}.mjs`), ts.transpileModule(code, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText);
}
const { handleMcp, tools } = await import(pathToFileURL(join(temp, "mcp.mjs")));
let serial = 0;
async function fixture() {
  const sqlite = new DatabaseSync(":memory:");
  let failAt = -1; let failWriteAt = -1;
  class Statement {
    constructor(sql, args = []) { this.sql = sql; this.args = args; }
    bind(...args) { return new Statement(this.sql, args); }
    run() { const result = sqlite.prepare(this.sql).run(...this.args); return { success: true, meta: { changes: Number(result.changes) } }; }
    first() { return sqlite.prepare(this.sql).get(...this.args) ?? null; }
    all() { return { results: sqlite.prepare(this.sql).all(...this.args) }; }
  }
  const db = { prepare: sql => new Statement(sql), batch: async statements => {
    sqlite.exec("BEGIN");
    try { const results = statements.map((statement, i) => { if (i === failAt || (i === failWriteAt && statements.some(s => /^(INSERT INTO|UPDATE) map_inbox_deletions/.test(s.sql)))) throw new Error("Injected failure"); return statement.run(); }); sqlite.exec("COMMIT"); return results; }
    catch (error) { sqlite.exec("ROLLBACK"); throw error; }
  } };
  globalThis.__readMapTestEnv = { DB: db };
  const data = await import(`${pathToFileURL(join(temp, "data.mjs"))}?fixture=${serial++}`);
  sqlite.exec(await readFile(new URL("../drizzle/0001_long_hulk.sql", import.meta.url), "utf8"));
  sqlite.exec(await readFile(new URL("../drizzle/0002_new_mesmero.sql", import.meta.url), "utf8"));
  await data.state();
  await data.addInboxItem({ title: "A", type: "book" }, null);
  await data.addInboxItem({ title: "B", type: "paper" }, "1");
  return { data, sqlite, fail: index => { failAt = index; }, failWrite: index => { failWriteAt = index; } };
}
function request(method, params, identity = "owner") {
  return new Request("https://read-map.example/mcp", { method: "POST", headers: { "content-type": "application/json", ...(identity ? { "oai-authenticated-user-id": identity } : {}) }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
}
const reading = { title: "A reading", type: "book", children: [{ title: "Chapter", type: "section" }] };

test("discovery has eight narrow tools and never accesses storage", async () => {
  const data = new Proxy({}, { get() { throw new Error("Storage touched"); } });
  for (const method of ["initialize", "tools/list"]) {
    const res = await handleMcp(request(method, {}, null), data);
    assert.equal(res.status, 200); const body = await res.json(); assert.ok(body.result);
  }
  assert.equal(tools.length, 8);
  for (const tool of tools) assert.equal(tool.inputSchema.additionalProperties, false);
});
test("data calls require trusted user ID; email and argument identity do not count", async () => {
  const data = new Proxy({}, { get() { throw new Error("Storage touched"); } });
  for (const tool of tools) {
    const req = request("tools/call", { name: tool.name, arguments: { userId: "owner" } }, null);
    req.headers.set("oai-authenticated-user-email", "owner@example.com");
    req.headers.set("OAI-Sites-Authorization", "Bearer fake");
    assert.equal((await handleMcp(req, data)).status, 401);
  }
});
test("protocol rejects malformed bodies and unknown methods/tools", async () => {
  const res = await handleMcp(new Request("https://example.com/mcp", { method: "POST", headers: { "content-type": "application/json" }, body: "[" }), {});
  assert.equal(res.status, 400);
  assert.equal((await (await handleMcp(request("missing"), {})).json()).error.code, -32601);
  assert.equal((await (await handleMcp(request("tools/call", { name: "delete_everything" }), {})).json()).error.code, -32602);
});
test("read state and strict validation prevent unintended writes", async () => {
  const { data, sqlite } = await fixture();
  const before = await data.state();
  const res = await handleMcp(request("tools/call", { name: "read_map_state", arguments: {} }), data);
  assert.deepEqual((await res.json()).result.structuredContent, before);
  for (const [name, args] of [
    ["read_map_add_inbox", { item: { title: "C", type: "book", progress: 100 }, inboxVersion: "2" }],
    ["read_map_add_inbox", { item: { title: "C", type: "book" } }],
    ["read_map_promote", { file: "../evil.yaml", reading, inboxIndexes: [0], inboxVersion: "2" }],
    ["read_map_promote", { file: "a.yaml", reading: { ...reading, progress: 20 }, inboxIndexes: [0], inboxVersion: "2" }],
    ["read_map_record", { file: "a.yaml", path: [], dataVersion: "1", progress: 101 }],
    ["read_map_state", { userId: "someone" }]
  ]) assert.equal((await (await handleMcp(request("tools/call", { name, arguments: args }), data)).json()).result.isError, true);
  assert.deepEqual(await data.state(), before); sqlite.close();
});
test("promotion atomically removes selected sources; identical retry is a no-op", async () => {
  const { data, sqlite } = await fixture();
  await data.promoteInbox("a.yaml", reading, [0], "2");
  const after = await data.state();
  assert.deepEqual(after.inbox.map(x => x.title), ["B"]); assert.equal(after.readings.length, 1); assert.equal(after.inboxVersion, "3");
  await data.addInboxItem({ title: "C", type: "book" }, "3");
  const later = await data.state();
  await data.promoteInbox("a.yaml", { children: reading.children, type: "book", title: "A reading" }, [0], "2");
  assert.deepEqual(await data.state(), later); sqlite.close();
});
test("stale operations and target collisions preserve all data", async () => {
  const { data, sqlite } = await fixture();
  await data.promoteInbox("a.yaml", reading, [0], "2");
  const before = await data.state();
  await assert.rejects(data.promoteInbox("b.yaml", reading, [0], "2"));
  await assert.rejects(data.promoteInbox("a.yaml", reading, [0], "3"));
  await assert.rejects(data.addInboxItem({ title: "C", type: "book" }, "2"));
  await assert.rejects(data.recordEntry("a.yaml", [0], "2", 20));
  await assert.rejects(data.recordEntry("a.yaml", [], "1", 20));
  assert.deepEqual(await data.state(), before); sqlite.close();
});
test("concurrent promotions of same snapshot create exactly one Reading", async () => {
  const { data, sqlite } = await fixture();
  const results = await Promise.allSettled([data.promoteInbox("a.yaml", reading, [0], "2"), data.promoteInbox("b.yaml", reading, [1], "2")]);
  assert.equal(results.filter(x => x.status === "fulfilled").length, 1);
  const after = await data.state(); assert.equal(after.readings.length, 1); assert.equal(after.inbox.length, 1); sqlite.close();
});
test("concurrent identical promotions are idempotent", async () => {
  const { data, sqlite } = await fixture();
  await Promise.all([data.promoteInbox("a.yaml", reading, [0], "2"), data.promoteInbox("a.yaml", reading, [0], "2")]);
  const after = await data.state(); assert.equal(after.readings.length, 1); assert.equal(after.inboxVersion, "3"); sqlite.close();
});
test("failed promotion transaction rolls back Reading and receipt", async () => {
  const { data, sqlite, fail } = await fixture();
  const before = await data.state(); fail(2);
  await assert.rejects(data.promoteInbox("a.yaml", reading, [0], "2"), /Injected/);
  fail(-1); assert.deepEqual(await data.state(), before);
  assert.equal(sqlite.prepare("SELECT count(*) AS n FROM map_operations").get().n, 0);
  await data.promoteInbox("a.yaml", reading, [0], "2"); assert.equal((await data.state()).readings.length, 1); sqlite.close();
});
test("record updates selected leaf only and preserves metadata", async () => {
  const { data, sqlite } = await fixture();
  await data.promoteInbox("a.yaml", reading, [0], "2");
  const res = await handleMcp(request("tools/call", { name: "read_map_record", arguments: { file: "a.yaml", path: [0], dataVersion: "1", progress: 50, notes: "Read half" } }), data);
  const result = (await res.json()).result; assert.equal(result.isError, false);
  const root = result.structuredContent.readings[0]; assert.equal(root.title, reading.title); assert.equal(root.children[0].progress, 50); assert.equal(root.children[0].notes, "Read half"); assert.equal(root.dataVersion, "2"); sqlite.close();
});
test("record batch applies multiple rapid changes with one version increment", async () => {
  const { data, sqlite } = await fixture();
  const multi = { title: "Multi", type: "book", children: [
    { title: "A", type: "section" }, { title: "B", type: "section" }, { title: "C", type: "section" }
  ] };
  await data.promoteInbox("a.yaml", multi, [0], "2");
  await data.recordEntries("a.yaml", "1", [
    { path: [0], progress: 100 }, { path: [1], progress: 100 }, { path: [2], progress: 100, notes: "done" }
  ]);
  const result = (await data.state()).readings[0];
  assert.equal(result.dataVersion, "2"); assert.equal(result.progress, 100); assert.equal(result.completedCount, 3);
  assert.equal(result.children[2].notes, "done");
  const before = await data.state();
  await assert.rejects(data.recordEntries("a.yaml", "1", [{ path: [0], progress: 0 }]));
  await assert.rejects(data.recordEntries("a.yaml", "2", [{ path: [], progress: 50 }, { path: [0], notes: "lost" }]));
  assert.deepEqual(await data.state(), before); sqlite.close();
});
test("existing Reading edit preserves unrelated nodes and uses original paths", async () => {
  const { data, sqlite } = await fixture();
  const original = { title: "Existing", type: "collection", notes: "root notes", children: [
    { title: "Remove", type: "section" },
    { title: "Keep", type: "section", progress: 60, notes: "valuable notes" },
    { title: "Parent", type: "section", notes: "parent notes", children: [{ title: "Old", type: "section", progress: 25 }] }
  ] };
  await data.promoteInbox("a.yaml", original, [0], "2");
  const res = await handleMcp(request("tools/call", { name: "read_map_edit_reading", arguments: { file: "a.yaml", dataVersion: "1", removePaths: [[0]], append: { path: [2], children: [{ title: "New", type: "section" }] } } }), data);
  assert.equal((await res.json()).result.isError, false);
  const doc = JSON.parse((await data.getDocument("readings/a.yaml")).content);
  assert.equal(doc.notes, original.notes); assert.deepEqual(doc.children[0], original.children[1]);
  assert.deepEqual(doc.children[1].children[0], original.children[2].children[0]);
  assert.equal(doc.children[1].children[1].title, "New");
  const before = await data.state();
  await assert.rejects(data.editReading("a.yaml", "1", { path: [], children: [{ title: "No", type: "section" }] }));
  await assert.rejects(data.editReading("a.yaml", "2", { path: [0], children: [{ title: "No", type: "section" }] }));
  await assert.rejects(data.editReading("a.yaml", "2", undefined, [[]]));
  await assert.rejects(data.editReading("a.yaml", "2", { path: [1], children: [{ title: "No", type: "section" }] }, [[1]]));
  assert.deepEqual(await data.state(), before); sqlite.close();
});

test("existing Reading edit ignores echoed derived progress on appended branches", async () => {
  const { data, sqlite } = await fixture();
  await data.promoteInbox("a.yaml", reading, [0], "2");
  const branch = { title: "New group", type: "section", progress: 0, children: [
    { title: "One", type: "article" }, { title: "Two", type: "article", progress: 100 }
  ] };
  await data.editReading("a.yaml", "1", { path: [], children: [branch] });
  const doc = JSON.parse((await data.getDocument("readings/a.yaml")).content);
  assert.equal(doc.children[1].title, "New group");
  assert.equal("progress" in doc.children[1], false);
  assert.equal(doc.children[1].children[1].progress, 100); sqlite.close();
});

test.after(async () => { delete globalThis.__readMapTestEnv; await rm(temp, { recursive: true, force: true }); });


test("Inbox delete rejects missing/malformed guards, stale versions and mismatched identity", async () => {
  const { data, sqlite } = await fixture(); const before = await data.state();
  const args = { inboxVersion: "2", index: 0, expectedItem: before.inbox[0] };
  for (const invalid of [
    {}, { ...args, inboxVersion: null }, { ...args, inboxVersion: "01" }, { ...args, inboxVersion: "9007199254740992" },
    { ...args, inboxVersion: "1" }, { ...args, index: -1 }, { ...args, index: 0.5 }, { ...args, index: "0" },
    { ...args, index: 2 }, { ...args, expectedItem: before.inbox[1] }, { ...args, expectedItem: { title: "A", type: "book" } },
    { ...args, extra: true }, { ...args, expectedItem: { ...args.expectedItem, progress: 0 } }
  ]) assert.equal((await (await handleMcp(request("tools/call", { name: "read_map_delete_inbox", arguments: invalid }), data)).json()).result.isError, true);
  assert.deepEqual(await data.state(), before); assert.deepEqual(await data.deletedInbox(), { deletions: [] }); sqlite.close();
});
test("delete backs up exact Inbox, preserves Reading and other items, and retries never remove shifted item", async () => {
  const { data, sqlite } = await fixture();
  await data.saveDocument("readings/untouched.yaml", "reading", reading);
  const before = await data.state(); const original = await data.getDocument("inbox.yaml");
  const args = { index: 0, expectedItem: before.inbox[0], inboxVersion: "2" };
  const result = (await (await handleMcp(request("tools/call", { name: "read_map_delete_inbox", arguments: args }), data)).json()).result;
  assert.equal(result.isError, false); assert.match(result.structuredContent.deletionId, /^[a-f0-9]{64}$/);
  const after = await data.state(); assert.deepEqual(after.inbox, [before.inbox[1]]); assert.deepEqual(after.readings, before.readings); assert.equal(after.inboxVersion, "3");
  assert.equal(sqlite.prepare("SELECT inbox_backup FROM map_inbox_deletions").get().inbox_backup, original.content);
  await data.addInboxItem({ title: "C", type: "repo" }, "3"); const later = await data.state();
  await data.deleteInboxItem(0, { ...args.expectedItem }, "2"); assert.deepEqual(await data.state(), later);
  const list = (await (await handleMcp(request("tools/call", { name: "read_map_deleted_inbox", arguments: {} }), data)).json()).result.structuredContent;
  assert.equal(list.deletions[0].deletionId, result.structuredContent.deletionId); assert.deepEqual(list.deletions[0].item, before.inbox[0]); sqlite.close();
});
test("delete races claim one version and identical concurrent retries succeed", async () => {
  const { data, sqlite } = await fixture(); const before = await data.state();
  const outcomes = await Promise.allSettled(before.inbox.map((item, i) => data.deleteInboxItem(i, item, "2")));
  assert.equal(outcomes.filter(x => x.status === "fulfilled").length, 1);
  assert.equal((await data.state()).inbox.length, 1); assert.equal((await data.deletedInbox()).deletions.length, 1); sqlite.close();
  const f = await fixture(); const initial = await f.data.state();
  await Promise.all([f.data.deleteInboxItem(0, initial.inbox[0], "2"), f.data.deleteInboxItem(0, initial.inbox[0], "2")]);
  assert.equal((await f.data.state()).inboxVersion, "3"); f.sqlite.close();
});
test("delete and restore roll back backups/receipts and data on failure", async () => {
  const { data, sqlite, failWrite } = await fixture(); const before = await data.state();
  for (const statement of [0, 1]) {
    failWrite(statement); await assert.rejects(data.deleteInboxItem(0, before.inbox[0], "2"), /Injected/);
    failWrite(-1); assert.deepEqual(await data.state(), before); assert.deepEqual(await data.deletedInbox(), { deletions: [] });
  }
  const { deletionId } = await data.deleteInboxItem(0, before.inbox[0], "2"); const deleted = await data.state(); const receipts = await data.deletedInbox();
  for (const statement of [0, 1]) {
    failWrite(statement); await assert.rejects(data.restoreInboxItem(deletionId, "3"), /Injected/);
    failWrite(-1); assert.deepEqual(await data.state(), deleted); assert.deepEqual(await data.deletedInbox(), receipts);
  }
  await data.restoreInboxItem(deletionId, "3"); assert.deepEqual((await data.state()).inbox, [before.inbox[1], before.inbox[0]]); sqlite.close();
});
test("restore preserves newer items and metadata; delete/restore retries after restore are safe", async () => {
  const { data, sqlite } = await fixture(); const before = await data.state();
  const { deletionId } = await data.deleteInboxItem(0, before.inbox[0], "2");
  await data.addInboxItem({ title: "C", type: "repo", description: "keep", link: "https://example.com/c" }, "3");
  const newer = await data.state();
  await assert.rejects(data.restoreInboxItem(deletionId, "3"));
  const res = await handleMcp(request("tools/call", { name: "read_map_restore_inbox", arguments: { deletionId, inboxVersion: "4" } }), data);
  assert.equal((await res.json()).result.isError, false);
  const restored = await data.state(); assert.deepEqual(restored.inbox, [...newer.inbox, before.inbox[0]]); assert.equal(restored.inboxVersion, "5");
  await data.deleteInboxItem(0, before.inbox[0], "2"); await data.restoreInboxItem(deletionId, "4");
  assert.deepEqual(await data.state(), restored); assert.ok((await data.deletedInbox()).deletions[0].restoredAt);
  await assert.rejects(data.restoreInboxItem(deletionId, "5")); sqlite.close();
});
test("restore rejects malformed inputs, missing receipt, and duplicate sources", async () => {
  const { data, sqlite } = await fixture(); const before = await data.state();
  const { deletionId } = await data.deleteInboxItem(0, before.inbox[0], "2");
  await data.addInboxItem(before.inbox[0], "3"); const after = await data.state();
  for (const args of [{}, { deletionId: "bad", inboxVersion: "4" }, { deletionId, inboxVersion: null }, { deletionId, inboxVersion: "4", extra: true }, { deletionId: "0".repeat(64), inboxVersion: "4" }, { deletionId, inboxVersion: "4" }]) {
    assert.equal((await (await handleMcp(request("tools/call", { name: "read_map_restore_inbox", arguments: args }), data)).json()).result.isError, true);
  }
  assert.deepEqual(await data.state(), after); assert.equal((await data.deletedInbox()).deletions[0].restoredAt, null); sqlite.close();
});

test("concurrent restores claim one current version and identical restores do not duplicate", async () => {
  const { data, sqlite } = await fixture(); const before = await data.state();
  const a = await data.deleteInboxItem(0, before.inbox[0], "2");
  const b = await data.deleteInboxItem(0, before.inbox[1], "3");
  const outcomes = await Promise.allSettled([data.restoreInboxItem(a.deletionId, "4"), data.restoreInboxItem(b.deletionId, "4")]);
  assert.equal(outcomes.filter(x => x.status === "fulfilled").length, 1);
  assert.equal((await data.state()).inbox.length, 1); assert.equal((await data.state()).inboxVersion, "5");
  const remaining = outcomes[0].status === "rejected" ? a : b;
  await Promise.all([data.restoreInboxItem(remaining.deletionId, "5"), data.restoreInboxItem(remaining.deletionId, "5")]);
  assert.equal((await data.state()).inbox.length, 2); assert.equal((await data.state()).inboxVersion, "6"); sqlite.close();
});
