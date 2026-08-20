import { env } from "cloudflare:workers";

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
  const allowedTypes = new Set(["collection", "book", "article", "paper", "repo"]);
  if (!item?.title?.trim() || !allowedTypes.has(item.type)) throw new Error("Inbox 条目缺少有效的 title 或 type");
  const doc = await getDocument("inbox.yaml");
  if (doc && expectedVersion !== String(doc.version)) throw new Error("Inbox 已被其他操作修改，请刷新后重试");
  const items = doc ? JSON.parse(doc.content) as InboxItem[] : [];
  const link = canonicalLink(item.link);
  const duplicate = items.some(existing => link ? canonicalLink(existing.link) === link : existing.title.trim().toLowerCase() === item.title.trim().toLowerCase());
  if (duplicate) throw new Error("该来源已经存在于 Inbox");
  items.push({ ...item, title: item.title.trim(), added: item.added || new Date().toISOString().slice(0, 10) });
  await saveDocument("inbox.yaml", "inbox", items, doc ? String(doc.version) : undefined);
}

export async function promoteInbox(readingFile: string, reading: ReadingNode, inboxIndexes: number[], inboxVersion: string) {
  if (!/^[^/]+\.yaml$/.test(readingFile)) throw new Error("reading 文件名无效");
  if (!reading?.title?.trim() || !reading.type) throw new Error("Reading 缺少 title 或 type");
  const inboxDoc = await getDocument("inbox.yaml");
  if (!inboxDoc || String(inboxDoc.version) !== inboxVersion) throw new Error("Inbox 已被其他操作修改，请刷新后重试");
  const existing = await getDocument(`readings/${readingFile}`);
  if (existing) throw new Error("同名 Reading 已存在");
  const items = JSON.parse(inboxDoc.content) as InboxItem[];
  const indexes = [...new Set(inboxIndexes)].sort((a, b) => b - a);
  if (!indexes.length || indexes.some(index => !Number.isInteger(index) || index < 0 || index >= items.length)) throw new Error("需要指定有效的 Inbox 条目");
  for (const index of indexes) items.splice(index, 1);
  await saveDocument(`readings/${readingFile}`, "reading", reading);
  await saveDocument("inbox.yaml", "inbox", items, inboxVersion);
}
