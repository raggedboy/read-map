import { env } from "cloudflare:workers";
import { filename, indexes as validateIndexes, validateNode, version as validateVersion } from "../../map/validation";

export type ReadingNode = {
  title: string; type: string; author?: string | null; version?: string | null;
  description?: string | null; link?: string | null; progress?: number;
  notes?: string | null; children?: ReadingNode[];
};
export type InboxItem = {
  title: string; type: "collection" | "book" | "article" | "paper" | "repo";
  author?: string | null; link?: string | null; version?: string | null;
  description?: string | null; added?: string | null;
};
type Stored = { path: string; kind: string; content: string; version: number };

async function ensureSchema() {
  await env.DB.batch([
    env.DB.prepare("CREATE TABLE IF NOT EXISTS map_documents (path TEXT PRIMARY KEY, kind TEXT NOT NULL, content TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1, updated_at TEXT NOT NULL)"),
    env.DB.prepare("CREATE TABLE IF NOT EXISTS resources (path TEXT PRIMARY KEY, content_type TEXT NOT NULL, size INTEGER NOT NULL, updated_at TEXT NOT NULL)")
  ]);
}
function progressOf(node: ReadingNode): number {
  return node.children?.length ? node.children.reduce((sum, child) => sum + progressOf(child), 0) / node.children.length : node.progress ?? 0;
}
function flatten(nodes: ReadingNode[]): ReadingNode[] {
  return nodes.flatMap(node => node.children?.length ? flatten(node.children) : [node]);
}
function entryView(node: ReadingNode, path: number[]): any {
  const { children: source, ...fields } = node;
  const children = source?.map((child, index) => entryView(child, [...path, index]));
  return { ...fields, path, derivedProgress: Math.round(progressOf(node)), leaf: !children?.length, ...(children?.length ? { children } : {}) };
}
function readingView(doc: Stored) {
  const reading = JSON.parse(doc.content) as ReadingNode;
  const children = reading.children || [];
  const leaves = children.length ? flatten(children) : [reading];
  const progress = Math.round(progressOf(reading));
  return {
    ...reading, file: doc.path.replace(/^readings\//, ""), dataVersion: String(doc.version),
    progress, status: progress === 100 && leaves.length ? "completed" : progress > 0 ? "reading" : "unstarted",
    leafCount: leaves.length, completedCount: leaves.filter(node => node.progress === 100).length,
    children: children.map((node, index) => entryView(node, [index]))
  };
}
export async function state() {
  await ensureSchema();
  const docs = await env.DB.prepare("SELECT path, kind, content, version FROM map_documents ORDER BY path").all<Stored>();
  const inboxDoc = docs.results.find(doc => doc.path === "inbox.yaml");
  return {
    initialized: docs.results.length > 0, readOnly: false, errors: [],
    inbox: inboxDoc ? JSON.parse(inboxDoc.content) : [],
    inboxVersion: inboxDoc ? String(inboxDoc.version) : null,
    readings: docs.results.filter(doc => doc.kind === "reading").map(readingView)
  };
}
export async function getDocument(path: string) {
  await ensureSchema();
  return env.DB.prepare("SELECT path, kind, content, version FROM map_documents WHERE path = ?").bind(path).first<Stored>();
}
export function nodeAt(root: ReadingNode, path: number[]): ReadingNode {
  let node = root;
  for (const index of path) {
    if (!Number.isInteger(index) || index < 0 || !node.children?.[index]) throw new Error("找不到指定阅读单元");
    node = node.children[index];
  }
  return node;
}
export async function saveDocument(path: string, kind: string, value: unknown, expectedVersion?: string) {
  await ensureSchema();
  const now = new Date().toISOString();
  if (expectedVersion) {
    const result = await env.DB.prepare("UPDATE map_documents SET content = ?, version = version + 1, updated_at = ? WHERE path = ? AND version = ?")
      .bind(JSON.stringify(value), now, path, Number(expectedVersion)).run();
    if (!result.meta.changes) throw new Error("数据已被其他操作修改，请刷新后重试");
  } else {
    await env.DB.prepare("INSERT INTO map_documents(path, kind, content, version, updated_at) VALUES (?, ?, ?, 1, ?) ON CONFLICT(path) DO UPDATE SET kind=excluded.kind, content=excluded.content, version=map_documents.version+1, updated_at=excluded.updated_at")
      .bind(path, kind, JSON.stringify(value), now).run();
  }
}
export async function recordResource(path: string, contentType: string, size: number) {
  await ensureSchema();
  await env.DB.prepare("INSERT INTO resources(path, content_type, size, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(path) DO UPDATE SET content_type=excluded.content_type,size=excluded.size,updated_at=excluded.updated_at")
    .bind(path, contentType, size, new Date().toISOString()).run();
}

function canonicalLink(value?: string | null) {
  return value?.trim().replace(/\/$/, "").toLowerCase() || "";
}

export async function addInboxItem(item: InboxItem, expectedVersion?: string | null) {
  validateNode(item, true);
  const doc = await getDocument("inbox.yaml");
  if (!doc && expectedVersion != null) throw new Error("Inbox version is stale");
  if (doc && expectedVersion !== String(doc.version)) throw new Error("Inbox 已被其他操作修改，请刷新后重试");
  const items = doc ? JSON.parse(doc.content) as InboxItem[] : [];
  const link = canonicalLink(item.link);
  const duplicate = items.some(existing => link ? canonicalLink(existing.link) === link : existing.title.trim().toLowerCase() === item.title.trim().toLowerCase());
  if (duplicate) throw new Error("该来源已经存在于 Inbox");
  items.push({ ...item, title: item.title.trim(), added: item.added || new Date().toISOString().slice(0, 10) });
  if (doc) await saveDocument("inbox.yaml", "inbox", items, String(doc.version));
  else {
    const result = await env.DB.prepare("INSERT INTO map_documents(path, kind, content, version, updated_at) VALUES ('inbox.yaml', 'inbox', ?, 1, ?) ON CONFLICT(path) DO NOTHING")
      .bind(JSON.stringify(items), new Date().toISOString()).run();
    if (!result.meta.changes) throw new Error("Inbox 已被其他操作修改，请刷新后重试");
  }
}

// Canonical serialization makes retries insensitive to JSON object-key ordering.
function canonical(value: any): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}
export async function promoteInbox(readingFile: string, reading: ReadingNode, inboxIndexes: number[], inboxVersion: string) {
  filename(readingFile); validateNode(reading); validateIndexes(inboxIndexes); validateVersion(inboxVersion);
  await ensureSchema();
  const selected = [...inboxIndexes].sort((a, b) => a - b);
  const bytes = new TextEncoder().encode(canonical({ readingFile, reading, selected, inboxVersion }));
  const id = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), byte => byte.toString(16).padStart(2, "0")).join("");
  const receipt = () => env.DB.prepare("SELECT id FROM map_operations WHERE id = ?").bind(id).first();
  if (await receipt()) return; // An identical already-committed promotion is a safe no-op.
  const inboxDoc = await getDocument("inbox.yaml");
  if (!inboxDoc || String(inboxDoc.version) !== inboxVersion) {
    if (await receipt()) return;
    throw new Error("Inbox 已被其他操作修改，请刷新后重试");
  }
  const key = `readings/${readingFile}`;
  if (await getDocument(key)) {
    if (await receipt()) return;
    throw new Error("同名 Reading 已存在");
  }
  const items = JSON.parse(inboxDoc.content) as InboxItem[];
  if (selected.some(index => index >= items.length)) throw new Error("需要指定有效的 Inbox 条目");
  const remaining = items.filter((_, index) => !selected.includes(index));
  const now = new Date().toISOString();
  // D1 batch is one transaction: all three writes commit or all roll back.
  // The first statement claims this exact original version only if the target is new.
  // Concurrent retries cannot claim twice; every mutation is gated on that claim.
  await env.DB.batch([
    env.DB.prepare("INSERT INTO map_operations(id, created_at) SELECT ?, ? WHERE EXISTS (SELECT 1 FROM map_documents WHERE path = 'inbox.yaml' AND version = ?) AND NOT EXISTS (SELECT 1 FROM map_documents WHERE path = ?) ON CONFLICT(id) DO NOTHING")
      .bind(id, now, Number(inboxVersion), key),
    env.DB.prepare("INSERT INTO map_documents(path, kind, content, version, updated_at) SELECT ?, 'reading', ?, 1, ? WHERE changes() = 1")
      .bind(key, JSON.stringify(reading), now),
    env.DB.prepare("UPDATE map_documents SET content = ?, version = version + 1, updated_at = ? WHERE path = 'inbox.yaml' AND version = ? AND changes() = 1")
      .bind(JSON.stringify(remaining), now, Number(inboxVersion))
  ]);
  if (!await receipt()) throw new Error("Inbox 或 Reading 已被其他操作修改，请刷新后重试");
}

export type EntryChange = { path: number[]; progress?: number; notes?: string };

function validateEntryChange(change: EntryChange) {
  const { path, progress, notes } = change;
  // Repeated indexes are meaningful in nested node paths.
  if (!Array.isArray(path) || path.length > 20 || path.some(i => !Number.isSafeInteger(i) || i < 0)) throw new Error("Invalid node path");
  if (progress === undefined && notes === undefined) throw new Error("Provide progress or notes");
  if (progress !== undefined && (typeof progress !== "number" || !Number.isFinite(progress) || progress < 0 || progress > 100)) throw new Error("Progress must be between 0 and 100");
  if (notes !== undefined && (typeof notes !== "string" || notes.length > 50000)) throw new Error("Invalid notes");
}

export async function recordEntries(file: string, dataVersion: string, changes: EntryChange[]) {
  filename(file); validateVersion(dataVersion);
  if (!Array.isArray(changes) || !changes.length || changes.length > 1000) throw new Error("Provide between 1 and 1000 entry changes");
  for (const change of changes) validateEntryChange(change);
  const key = `readings/${file}`;
  const doc = await getDocument(key);
  if (!doc) throw new Error("Reading 不存在");
  if (String(doc.version) !== dataVersion) throw new Error("文件已被其他操作修改，请刷新后重试");
  const root = JSON.parse(doc.content) as ReadingNode;
  // Validate and mutate an in-memory copy first. A bad item rejects the whole
  // batch, so the document is saved once or not at all.
  for (const { path, progress, notes } of changes) {
    const node = nodeAt(root, path);
    if (progress !== undefined) {
      if (node.children?.length) throw new Error("父节点进度由子节点计算");
      node.progress = Math.round(progress);
    }
    if (notes !== undefined) node.notes = notes.trim() || null;
  }
  await saveDocument(key, "reading", root, dataVersion);
}

export async function recordEntry(file: string, path: number[], dataVersion: string, progress?: number, notes?: string) {
  await recordEntries(file, dataVersion, [{ path, progress, notes }]);
}

export async function editReading(file: string, dataVersion: string, append: { path: number[]; children: ReadingNode[] } | undefined, removePaths: number[][] = []) {
  filename(file); validateVersion(dataVersion);
  const validPath = (path: number[]) => {
    if (!Array.isArray(path) || path.length > 20 || path.some(i => !Number.isSafeInteger(i) || i < 0)) throw new Error("Invalid node path");
  };
  if (!Array.isArray(removePaths) || removePaths.length > 1000) throw new Error("Invalid removal paths");
  for (const path of removePaths) { validPath(path); if (!path.length) throw new Error("Cannot remove the Reading root"); }
  if (append) {
    validPath(append.path);
    if (!Array.isArray(append.children) || !append.children.length || append.children.length > 1000) throw new Error("Provide children to append");
    // Agent clients sometimes echo a derived progress value on a branch. It is
    // a view field, not stored state, so normalize it before validation.
    const normalize = (node: ReadingNode): ReadingNode => {
      const children = node.children?.map(normalize);
      const normalized = { ...node, ...(children ? { children } : {}) };
      if (children?.length) delete normalized.progress;
      return normalized;
    };
    append.children = append.children.map(normalize);
    for (const child of append.children) validateNode(child);
  }
  if (!append && !removePaths.length) throw new Error("Provide an append or removal");
  const prefix = (a: number[], b: number[]) => a.length <= b.length && a.every((value, i) => value === b[i]);
  for (let i = 0; i < removePaths.length; i++) {
    if (removePaths.some((path, j) => i !== j && prefix(path, removePaths[i]))) throw new Error("Removal paths overlap");
    if (append && prefix(removePaths[i], append.path)) throw new Error("Cannot append into a removed node");
  }
  const key = `readings/${file}`;
  const doc = await getDocument(key);
  if (!doc || String(doc.version) !== dataVersion) throw new Error("Reading 已被其他操作修改或不存在，请刷新后重试");
  const root = JSON.parse(doc.content) as ReadingNode;
  for (const path of removePaths) nodeAt(root, path);
  const parent = append ? nodeAt(root, append.path) : undefined;
  if (parent && !parent.children?.length && parent.progress) throw new Error("Cannot replace recorded leaf progress with derived parent progress");
  function prune(node: ReadingNode, path: number[]) {
    if (!node.children) return;
    node.children = node.children.filter((child, i) => {
      const childPath = [...path, i];
      if (removePaths.some(selected => selected.length === childPath.length && prefix(selected, childPath))) return false;
      prune(child, childPath); return true;
    });
  }
  prune(root, []);
  if (parent && append) { parent.children = [...(parent.children || []), ...append.children]; delete parent.progress; }
  validateNode(root);
  await saveDocument(key, "reading", root, dataVersion);
}

type InboxDeletion = {
  id: string; inbox_version: number; item_index: number; item: string;
  inbox_backup: string; created_at: string; restore_inbox_version: number | null; restored_at: string | null;
};
function deletionId(value: unknown): asserts value is string {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/.test(value)) throw new Error("Invalid Inbox deletion ID");
}
export async function deletedInbox() {
  const rows = await env.DB.prepare("SELECT id, inbox_version, item_index, item, created_at, restore_inbox_version, restored_at FROM map_inbox_deletions ORDER BY created_at, id").all<InboxDeletion>();
  return { deletions: rows.results.map((row: InboxDeletion) => ({ deletionId: row.id, inboxVersion: String(row.inbox_version), index: row.item_index, item: JSON.parse(row.item), deletedAt: row.created_at, restoredAt: row.restored_at })) };
}
export async function deleteInboxItem(index: number, expectedItem: InboxItem, inboxVersion: string) {
  validateVersion(inboxVersion); validateNode(expectedItem, true);
  if (!Number.isSafeInteger(index) || index < 0) throw new Error("Invalid Inbox index");
  const bytes = new TextEncoder().encode(canonical({ operation: "deleteInbox", index, expectedItem, inboxVersion }));
  const id = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), byte => byte.toString(16).padStart(2, "0")).join("");
  const receipt = () => env.DB.prepare("SELECT id FROM map_inbox_deletions WHERE id = ?").bind(id).first();
  if (await receipt()) return { deletionId: id };
  const doc = await getDocument("inbox.yaml");
  if (!doc || String(doc.version) !== inboxVersion) {
    if (await receipt()) return { deletionId: id };
    throw new Error("Inbox version is stale; reselect and confirm the item before deleting");
  }
  const items = JSON.parse(doc.content) as InboxItem[];
  if (index >= items.length || canonical(items[index]) !== canonical(expectedItem)) throw new Error("Selected Inbox item does not match expectedItem");
  const remaining = items.filter((_, i) => i !== index);
  const now = new Date().toISOString();
  // The backup, tombstone, and removal commit together. The content guard also
  // protects against a writer that incorrectly reused the same version.
  await env.DB.batch([
    env.DB.prepare("INSERT INTO map_inbox_deletions(id, inbox_version, item_index, item, inbox_backup, created_at) SELECT ?, ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM map_documents WHERE path = 'inbox.yaml' AND version = ? AND content = ?) ON CONFLICT(id) DO NOTHING")
      .bind(id, Number(inboxVersion), index, JSON.stringify(items[index]), doc.content, now, Number(inboxVersion), doc.content),
    env.DB.prepare("UPDATE map_documents SET content = ?, version = version + 1, updated_at = ? WHERE path = 'inbox.yaml' AND version = ? AND changes() = 1")
      .bind(JSON.stringify(remaining), now, Number(inboxVersion))
  ]);
  if (!await receipt()) throw new Error("Inbox version is stale; reselect and confirm the item before deleting");
  return { deletionId: id };
}
export async function restoreInboxItem(id: string, inboxVersion: string) {
  deletionId(id); validateVersion(inboxVersion);
  const receipt = () => env.DB.prepare("SELECT * FROM map_inbox_deletions WHERE id = ?").bind(id).first<InboxDeletion>();
  const prior = await receipt();
  if (!prior) throw new Error("Inbox deletion not found");
  // Retain the receipt forever so a delete retry after restore never deletes again.
  if (prior.restored_at) {
    if (String(prior.restore_inbox_version) === inboxVersion) return { deletionId: id };
    throw new Error("Inbox item was already restored");
  }
  const doc = await getDocument("inbox.yaml");
  if (!doc || String(doc.version) !== inboxVersion) {
    const concurrent = await receipt();
    if (concurrent?.restored_at && String(concurrent.restore_inbox_version) === inboxVersion) return { deletionId: id };
    throw new Error("Inbox version is stale; read current state before restoring");
  }
  const items = JSON.parse(doc.content) as InboxItem[];
  const item = JSON.parse(prior.item) as InboxItem;
  const link = canonicalLink(item.link);
  if (items.some(existing => link ? canonicalLink(existing.link) === link : existing.title.trim().toLowerCase() === item.title.trim().toLowerCase())) throw new Error("That source already exists in Inbox; nothing was restored");
  const now = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare("UPDATE map_inbox_deletions SET restore_inbox_version = ?, restored_at = ? WHERE id = ? AND restored_at IS NULL AND EXISTS (SELECT 1 FROM map_documents WHERE path = 'inbox.yaml' AND version = ? AND content = ?)")
      .bind(Number(inboxVersion), now, id, Number(inboxVersion), doc.content),
    env.DB.prepare("UPDATE map_documents SET content = ?, version = version + 1, updated_at = ? WHERE path = 'inbox.yaml' AND version = ? AND changes() = 1")
      .bind(JSON.stringify([...items, item]), now, Number(inboxVersion))
  ]);
  const restored = await receipt();
  if (!restored?.restored_at || String(restored.restore_inbox_version) !== inboxVersion) throw new Error("Inbox version is stale; read current state before restoring");
  return { deletionId: id };
}
