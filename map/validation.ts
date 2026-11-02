import type { InboxItem, ReadingNode } from "../app/api/_data";
export const sourceTypes = ["collection", "book", "article", "paper", "repo"];
export function object(value: unknown, keys: string[]): Record<string, any> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Expected an object");
  if (Object.keys(value).some(key => !keys.includes(key))) throw new Error("Unknown argument");
  return value as Record<string, any>;
}
export function version(value: unknown): asserts value is string {
  if (typeof value !== "string" || !/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(Number(value))) throw new Error("A valid original document version is required");
}
export function filename(value: unknown): asserts value is string {
  if (typeof value !== "string" || !/^[^/\\\x00-\x1f]{1,200}\.yaml$/.test(value)) throw new Error("Invalid reading filename");
}
export function indexes(value: unknown, allowEmpty = false): asserts value is number[] {
  if (!Array.isArray(value) || value.length > 1000 || (!allowEmpty && !value.length) || value.some(i => !Number.isSafeInteger(i) || i < 0) || new Set(value).size !== value.length) throw new Error("Invalid node path or Inbox selection");
}
export function validateNode(value: unknown, inbox = false, depth = 0, budget = { count: 0 }): asserts value is ReadingNode & InboxItem {
  if (depth > 20 || ++budget.count > 1000) throw new Error("Reading is too large");
  const node = object(value, ["title", "type", "author", "link", "version", "description", ...(inbox ? ["added"] : ["progress", "notes", "children"])]);
  if (typeof node.title !== "string" || !node.title.trim() || node.title.length > 1000 || ![...sourceTypes, ...(inbox ? [] : ["section"])].includes(node.type)) throw new Error("Invalid title or type");
  for (const key of ["author", "link", "version", "description", "notes", "added"]) if (node[key] != null && (typeof node[key] !== "string" || node[key].length > 50000)) throw new Error(`Invalid ${key}`);
  if (node.progress !== undefined && (typeof node.progress !== "number" || !Number.isFinite(node.progress) || node.progress < 0 || node.progress > 100)) throw new Error("Progress must be between 0 and 100");
  if (node.children !== undefined) {
    if (!Array.isArray(node.children)) throw new Error("Invalid children");
    if (node.children.length && node.progress !== undefined) throw new Error("Parent progress is derived from its children");
    for (const child of node.children) validateNode(child, false, depth + 1, budget);
  }
}
