import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { DataError, deleteInboxItem, loadMapState, updateEntry } from "./data.ts";

async function fixture(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "read-map-test-"));
  await mkdir(path.join(root, "readings"));
  await writeFile(path.join(root, "inbox.yaml"), "- title: Candidate\n  type: article\n  link: https://example.com\n", "utf8");
  await writeFile(path.join(root, "readings", "sample.yaml"), `# preserved comment
title: Sample
type: book
entries:
  - title: Parent
    children:
      - title: Leaf A
        progress: 0
        notes:
      - title: Leaf B
        progress: 100
`, "utf8");
  return root;
}

test("loads recursive progress and categorizes a reading", async () => {
  const root = await fixture();
  try {
    const state = await loadMapState(root);
    assert.equal(state.readOnly, false);
    assert.equal(state.readings[0].progress, 50);
    assert.equal(state.readings[0].status, "reading");
    assert.equal(state.readings[0].leafCount, 2);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("updates one leaf atomically, preserves comments, and rejects stale versions", async () => {
  const root = await fixture();
  try {
    const before = await loadMapState(root);
    const reading = before.readings[0];
    const after = await updateEntry(root, reading.file, [0, 0], { progress: 30, notes: "useful" }, reading.version);
    assert.equal(after.readings[0].entries[0].children?.[0].progress, 30);
    assert.equal(after.readings[0].entries[0].children?.[0].notes, "useful");
    assert.match(await readFile(path.join(root, "readings", "sample.yaml"), "utf8"), /# preserved comment/);
    await assert.rejects(() => updateEntry(root, reading.file, [0, 0], { progress: 40 }, reading.version), (error: unknown) => error instanceof DataError && error.status === 409);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("deletes only the selected inbox item", async () => {
  const root = await fixture();
  try {
    const before = await loadMapState(root);
    const after = await deleteInboxItem(root, 0, before.inboxVersion!);
    assert.deepEqual(after.inbox, []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
