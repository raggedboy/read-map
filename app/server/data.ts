import { createHash } from "node:crypto";
import { copyFile, mkdir, open, readFile, readdir, rename, rm, stat } from "node:fs/promises";
import path from "node:path";
import { parseDocument, type Document } from "yaml";

const READING_TYPES = new Set(["book", "article", "article-series", "repo", "paper"]);

export type Entry = {
  title: string;
  description?: string | null;
  link?: string | null;
  progress?: number;
  notes?: string | null;
  children?: Entry[];
};

type Reading = {
  title: string;
  type: string;
  author?: string | null;
  edition?: string | null;
  link?: string | null;
  description?: string | null;
  entries: Entry[];
};

type InboxItem = {
  title: string;
  type: string;
  author?: string | null;
  edition?: string | null;
  link?: string | null;
  description?: string | null;
  added?: string | null;
};

export type EntryView = Entry & {
  path: number[];
  derivedProgress: number;
  leaf: boolean;
  children?: EntryView[];
};

export type ReadingView = Omit<Reading, "entries"> & {
  file: string;
  version: string;
  progress: number;
  status: "unstarted" | "reading" | "completed";
  leafCount: number;
  completedCount: number;
  entries: EntryView[];
};

export type MapState = {
  initialized: boolean;
  readOnly: boolean;
  errors: string[];
  inbox: InboxItem[];
  inboxVersion: string | null;
  readings: ReadingView[];
};

export class DataError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function optionalText(value: unknown): boolean {
  return value === undefined || value === null || typeof value === "string";
}

function validateEntry(value: unknown, location: string): string[] {
  if (!isObject(value)) return [`${location} 必须是对象`];
  const errors: string[] = [];
  if (typeof value.title !== "string" || !value.title.trim()) errors.push(`${location}.title 必填`);
  for (const key of ["description", "link", "notes"]) {
    if (!optionalText(value[key])) errors.push(`${location}.${key} 必须是字符串或空值`);
  }

  const children = value.children;
  if (children !== undefined && !Array.isArray(children)) {
    errors.push(`${location}.children 必须是数组`);
    return errors;
  }
  if (Array.isArray(children) && children.length > 0) {
    if ("progress" in value) errors.push(`${location} 是父节点，不能保存 progress`);
    children.forEach((child, index) => errors.push(...validateEntry(child, `${location}.children[${index}]`)));
  } else if (typeof value.progress !== "number" || !Number.isFinite(value.progress) || value.progress < 0 || value.progress > 100) {
    errors.push(`${location} 是叶子节点，progress 必须在 0-100`);
  }
  return errors;
}

export function validateReading(value: unknown): string[] {
  if (!isObject(value)) return ["reading 必须是对象"];
  const errors: string[] = [];
  if (typeof value.title !== "string" || !value.title.trim()) errors.push("title 必填");
  if (typeof value.type !== "string" || !READING_TYPES.has(value.type)) errors.push("type 无效");
  for (const key of ["author", "edition", "link", "description"]) {
    if (!optionalText(value[key])) errors.push(`${key} 必须是字符串或空值`);
  }
  if (!Array.isArray(value.entries)) {
    errors.push("entries 必须是数组");
  } else {
    value.entries.forEach((entry, index) => errors.push(...validateEntry(entry, `entries[${index}]`)));
  }
  return errors;
}

export function validateInbox(value: unknown): string[] {
  if (!Array.isArray(value)) return ["inbox.yaml 顶层必须是数组"];
  const errors: string[] = [];
  value.forEach((item, index) => {
    if (!isObject(item)) {
      errors.push(`inbox[${index}] 必须是对象`);
      return;
    }
    if (typeof item.title !== "string" || !item.title.trim()) errors.push(`inbox[${index}].title 必填`);
    if (typeof item.type !== "string" || !READING_TYPES.has(item.type)) errors.push(`inbox[${index}].type 无效`);
    for (const key of ["author", "edition", "link", "description", "added"]) {
      if (!optionalText(item[key])) errors.push(`inbox[${index}].${key} 必须是字符串或空值`);
    }
  });
  return errors;
}

function digest(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

function parseYaml<T>(text: string, label: string): { doc: Document; value: T } {
  const doc = parseDocument(text, { keepSourceTokens: true });
  if (doc.errors.length) throw new DataError(`${label}: ${doc.errors.map(error => error.message).join("; ")}`);
  return { doc, value: doc.toJS() as T };
}

function progressOf(entry: Entry): number {
  if (entry.children?.length) {
    return entry.children.reduce((sum, child) => sum + progressOf(child), 0) / entry.children.length;
  }
  return entry.progress ?? 0;
}

function viewEntry(entry: Entry, indexPath: number[]): EntryView {
  const { children: sourceChildren, ...fields } = entry;
  const children = sourceChildren?.map((child, index) => viewEntry(child, [...indexPath, index]));
  return {
    ...fields,
    path: indexPath,
    leaf: !children?.length,
    derivedProgress: Math.round(progressOf(entry)),
    ...(children?.length ? { children } : {}),
  };
}

function flatten(entries: Entry[]): Entry[] {
  return entries.flatMap(entry => entry.children?.length ? flatten(entry.children) : [entry]);
}

function readingView(reading: Reading, file: string, version: string): ReadingView {
  const leaves = flatten(reading.entries);
  const progress = reading.entries.length
    ? Math.round(reading.entries.reduce((sum, entry) => sum + progressOf(entry), 0) / reading.entries.length)
    : 0;
  return {
    ...reading,
    file,
    version,
    progress,
    status: progress === 100 && leaves.length > 0 ? "completed" : progress > 0 ? "reading" : "unstarted",
    leafCount: leaves.length,
    completedCount: leaves.filter(entry => entry.progress === 100).length,
    entries: reading.entries.map((entry, index) => viewEntry(entry, [index])),
  };
}

async function exists(target: string): Promise<boolean> {
  try {
    await stat(target);
    return true;
  } catch {
    return false;
  }
}

function readingPath(mapDir: string, file: string): string {
  if (path.basename(file) !== file || !file.endsWith(".yaml")) throw new DataError("reading 文件名无效");
  return path.join(mapDir, "readings", file);
}

async function loadDocument<T>(file: string, label: string): Promise<{ doc: Document; value: T; text: string; version: string }> {
  const text = await readFile(file, "utf8");
  const parsed = parseYaml<T>(text, label);
  return { ...parsed, text, version: digest(text) };
}

export async function loadMapState(mapDir: string): Promise<MapState> {
  const inboxFile = path.join(mapDir, "inbox.yaml");
  const readingsDir = path.join(mapDir, "readings");
  const inboxExists = await exists(inboxFile);
  const readingsExist = await exists(readingsDir);
  if (!inboxExists && !readingsExist) {
    return { initialized: false, readOnly: false, errors: [], inbox: [], inboxVersion: null, readings: [] };
  }

  const errors: string[] = [];
  let inbox: InboxItem[] = [];
  let inboxVersion: string | null = null;
  if (!inboxExists || !readingsExist) errors.push("数据目录不完整：需要 inbox.yaml 和 readings/");

  if (inboxExists) {
    try {
      const loaded = await loadDocument<InboxItem[]>(inboxFile, "inbox.yaml");
      const validation = validateInbox(loaded.value);
      if (validation.length) errors.push(...validation);
      else inbox = loaded.value;
      inboxVersion = loaded.version;
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }

  const readings: ReadingView[] = [];
  if (readingsExist) {
    const files = (await readdir(readingsDir)).filter(file => file.endsWith(".yaml")).sort();
    for (const file of files) {
      try {
        const loaded = await loadDocument<Reading>(readingPath(mapDir, file), file);
        const validation = validateReading(loaded.value);
        if (validation.length) errors.push(...validation.map(message => `${file}: ${message}`));
        else readings.push(readingView(loaded.value, file, loaded.version));
      } catch (error) {
        errors.push(error instanceof Error ? error.message : String(error));
      }
    }
  }

  return { initialized: true, readOnly: errors.length > 0, errors, inbox, inboxVersion, readings };
}

async function atomicWrite(file: string, text: string): Promise<void> {
  const temporary = `${file}.tmp-${process.pid}-${Date.now()}`;
  try {
    const handle = await open(temporary, "wx", 0o600);
    await handle.writeFile(text, "utf8");
    await handle.sync();
    await handle.close();
    await rename(temporary, file);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
}

function yamlEntryPath(indexPath: number[]): Array<string | number> {
  if (!indexPath.length || indexPath.some(value => !Number.isInteger(value) || value < 0)) throw new DataError("entry path 无效");
  const result: Array<string | number> = ["entries", indexPath[0]];
  for (const index of indexPath.slice(1)) result.push("children", index);
  return result;
}

async function ensureWritable(mapDir: string): Promise<void> {
  const state = await loadMapState(mapDir);
  if (!state.initialized) throw new DataError("数据尚未初始化", 409);
  if (state.readOnly) throw new DataError(`数据处于只读状态：${state.errors.join("；")}`, 409);
}

export async function updateEntry(
  mapDir: string,
  file: string,
  indexPath: number[],
  change: { progress?: number; notes?: string },
  expectedVersion: string,
): Promise<MapState> {
  await ensureWritable(mapDir);
  const target = readingPath(mapDir, file);
  const loaded = await loadDocument<Reading>(target, file);
  if (loaded.version !== expectedVersion) throw new DataError("文件已被其他操作修改，请刷新后重试", 409);
  const nodePath = yamlEntryPath(indexPath);
  const entry = loaded.doc.getIn(nodePath) as { toJSON?: () => Entry } | undefined;
  const plainEntry = entry?.toJSON?.();
  if (!plainEntry) throw new DataError("找不到指定阅读单元", 404);

  if (change.progress !== undefined) {
    if (plainEntry.children?.length) throw new DataError("父节点进度由子节点计算，不能直接修改");
    if (!Number.isFinite(change.progress) || change.progress < 0 || change.progress > 100) throw new DataError("progress 必须在 0-100");
    loaded.doc.setIn([...nodePath, "progress"], Math.round(change.progress));
  }
  if (change.notes !== undefined) loaded.doc.setIn([...nodePath, "notes"], change.notes.trim() || null);

  const nextValue = loaded.doc.toJS();
  const validation = validateReading(nextValue);
  if (validation.length) throw new DataError(validation.join("；"));
  await atomicWrite(target, loaded.doc.toString());
  return loadMapState(mapDir);
}

export async function deleteInboxItem(mapDir: string, index: number, expectedVersion: string): Promise<MapState> {
  await ensureWritable(mapDir);
  const target = path.join(mapDir, "inbox.yaml");
  const loaded = await loadDocument<InboxItem[]>(target, "inbox.yaml");
  if (loaded.version !== expectedVersion) throw new DataError("Inbox 已被其他操作修改，请刷新后重试", 409);
  if (!Number.isInteger(index) || index < 0 || index >= loaded.value.length) throw new DataError("Inbox 条目不存在", 404);
  loaded.doc.deleteIn([index]);
  const nextValue = loaded.doc.toJS();
  const validation = validateInbox(nextValue);
  if (validation.length) throw new DataError(validation.join("；"));
  await atomicWrite(target, loaded.doc.toString());
  return loadMapState(mapDir);
}

export async function initializeMap(mapDir: string): Promise<MapState> {
  const inboxFile = path.join(mapDir, "inbox.yaml");
  const readingsDir = path.join(mapDir, "readings");
  if (await exists(inboxFile) || await exists(readingsDir)) throw new DataError("检测到部分或完整数据，拒绝覆盖初始化", 409);
  await mkdir(readingsDir, { recursive: true });
  await copyFile(path.join(mapDir, "example", "inbox.yaml"), inboxFile);
  return loadMapState(mapDir);
}
