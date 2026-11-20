import type { InboxItem, ReadingNode } from "../app/api/_data";
export const sourceTypes = ["collection", "book", "article", "talk", "blog", "paper", "repo"];
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
export function validateOrganization(tags: unknown, related: unknown) {
  for (const list of [tags, related]) {
    if (!Array.isArray(list) || list.length > 100 || new Set(list).size !== list.length) throw new Error("无效或重复的标签或关联");
  }
  for (const tag of tags as unknown[]) {
    if (typeof tag !== "string" || !tag || tag !== tag.trim() || tag.length > 100) throw new Error("无效的标签");
  }
  for (const target of related as unknown[]) filename(target);
}
export function validatePresentation(value: unknown) {
  const meta = object(value, ["published", "image", "imageRole", "timelineAnchor", "link", "description"]);
  if (meta.imageRole != null && !["content", "identity"].includes(meta.imageRole)) throw new Error("Invalid image role");
  if (meta.description != null && (typeof meta.description !== "string" || meta.description.length > 50000)) throw new Error("Invalid description");
  if (meta.link != null && (typeof meta.link !== "string" || meta.link.length > 50000 || !/^(https?:\/\/|resources\/)\S+$/.test(meta.link))) throw new Error("Invalid source link");
  if (meta.timelineAnchor != null) {
    const anchor = object(meta.timelineAnchor, ["date", "label"]);
    if (typeof anchor.date !== "string" || typeof anchor.label !== "string" || !anchor.label.trim() || anchor.label.length > 80) throw new Error("Invalid timeline anchor");
  }
  for (const date of [meta.published, meta.timelineAnchor?.date]) {
    if (date == null) continue;
    if (typeof date !== "string" || !/^[1-9]\d{3}(?:-(?:0[1-9]|1[0-2])(?:-(?:0[1-9]|[12]\d|3[01]))?)?$/.test(date))
      throw new Error("Use YYYY, YYYY-MM or YYYY-MM-DD");
    if (date.length === 10 && new Date(date).toISOString().slice(0, 10) !== date) throw new Error("Invalid calendar date");
  }
  if (meta.image != null && (typeof meta.image !== "string" || meta.image.length > 2048 ||
      !(/^(?:https:\/\/[^/\s]+\/|resources\/)[^\s]+$/.test(meta.image)))) throw new Error("Use an HTTPS image or a resources/ path");
}
export function validateNode(value: unknown, inbox = false, depth = 0, budget = { count: 0 }): asserts value is ReadingNode & InboxItem {
  if (depth > 20 || ++budget.count > 1000) throw new Error("Reading is too large");
  const node = object(value, ["title", "type", "author", "link", "version", "description", ...(!depth ? ["published", "image", "imageRole", "timelineAnchor"] : []), ...(inbox ? ["added"] : ["progress", "notes", "children", ...(!depth ? ["tags", "related"] : [])])]);
  if (!depth) validatePresentation({ published: node.published, image: node.image, imageRole: node.imageRole, timelineAnchor: node.timelineAnchor });
  if (!inbox && !depth) validateOrganization(node.tags ?? [], node.related ?? []);
  if (typeof node.title !== "string" || !node.title.trim() || node.title.length > 1000 || ![...sourceTypes, ...(inbox ? [] : ["section"])].includes(node.type)) throw new Error("Invalid title or type");
  for (const key of ["author", "link", "version", "description", "notes", "added"]) if (node[key] != null && (typeof node[key] !== "string" || node[key].length > 50000)) throw new Error(`Invalid ${key}`);
  if (node.progress !== undefined && (typeof node.progress !== "number" || !Number.isFinite(node.progress) || node.progress < 0 || node.progress > 100)) throw new Error("Progress must be between 0 and 100");
  if (node.children !== undefined) {
    if (!Array.isArray(node.children)) throw new Error("Invalid children");
    if (node.children.length && node.progress !== undefined) throw new Error("Parent progress is derived from its children");
    for (const child of node.children) validateNode(child, false, depth + 1, budget);
  }
}
