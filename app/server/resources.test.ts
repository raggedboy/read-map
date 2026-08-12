import assert from "node:assert/strict";
import test from "node:test";
import { parseByteRange } from "./resources.ts";

test("parses byte ranges used by PDF viewers", () => {
  assert.deepEqual(parseByteRange("bytes=0-99", 1000), { start: 0, end: 99 });
  assert.deepEqual(parseByteRange("bytes=900-", 1000), { start: 900, end: 999 });
  assert.deepEqual(parseByteRange("bytes=-100", 1000), { start: 900, end: 999 });
  assert.deepEqual(parseByteRange("bytes=900-1200", 1000), { start: 900, end: 999 });
});

test("rejects malformed or out-of-bounds byte ranges", () => {
  assert.equal(parseByteRange("items=0-10", 1000), null);
  assert.equal(parseByteRange("bytes=1000-", 1000), null);
  assert.equal(parseByteRange("bytes=20-10", 1000), null);
});
