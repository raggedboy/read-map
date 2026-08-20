"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import JSZip from "jszip";
import { parse } from "yaml";

type InboxItem = {
  title: string;
  type: string;
  author?: string | null;
  version?: string | null;
  link?: string | null;
  description?: string | null;
  added?: string | null;
};

type Entry = {
  title: string;
  type: string;
  author?: string | null;
  version?: string | null;
  description?: string | null;
  link?: string | null;
  progress?: number;
  notes?: string | null;
  path: number[];
  derivedProgress: number;
  leaf: boolean;
  children?: Entry[];
};

type Reading = {
  title: string;
  type: string;
  author?: string | null;
  version?: string | null;
  link?: string | null;
  description?: string | null;
  notes?: string | null;
  file: string;
  dataVersion: string;
  progress: number;
  status: "unstarted" | "reading" | "completed";
  leafCount: number;
  completedCount: number;
  children: Entry[];
};

type MapState = {
  initialized: boolean;
  readOnly: boolean;
  errors: string[];
  inbox: InboxItem[];
  inboxVersion: string | null;
  readings: Reading[];
};

function DataImporter({ onImported, compact = false }: { onImported: (state: MapState) => void; compact?: boolean }) {
  const [status, setStatus] = useState(compact ? "重复选择原 ZIP，只补传缺失文件。" : "选择 read-map-data.zip，一次性迁移目录与源文件。");
  const [busy, setBusy] = useState(false);
  async function importZip(file: File) {
    setBusy(true);
    try {
      setStatus("正在读取压缩包…");
      const zip = await JSZip.loadAsync(file);
      const documents: Array<{ path: string; data: unknown }> = [];
      const resources: Array<{ path: string; entry: JSZip.JSZipObject }> = [];
      for (const [name, entry] of Object.entries(zip.files)) {
        if (entry.dir || name.includes("__MACOSX/") || name.endsWith(".DS_Store")) continue;
        const marker = "/map/";
        const offset = name.indexOf(marker);
        if (offset < 0) continue;
        const relative = name.slice(offset + marker.length);
        if (relative === "inbox.yaml" || /^readings\/[^/]+\.yaml$/.test(relative)) {
          documents.push({ path: relative, data: parse(await entry.async("text")) });
        } else if (relative.startsWith("resources/")) {
          resources.push({ path: relative, entry });
        }
      }
      setStatus(`正在导入 ${documents.length} 份阅读数据…`);
      const imported = await api("/api/import", { method: "POST", body: JSON.stringify({ documents }) });
      const statusResponse = await fetch("/api/import/status");
      const uploaded = statusResponse.ok ? new Set((await statusResponse.json() as { resources: string[] }).resources) : new Set<string>();
      const pending = resources.filter(resource => !uploaded.has(resource.path.replace(/^resources\//, "")));
      let completed = 0;
      for (const resource of pending) {
        setStatus(`正在补传源文件 ${++completed}/${pending.length}…`);
        const blob = await resource.entry.async("blob");
        const response = await fetch(`/api/import/resource?path=${encodeURIComponent(resource.path)}`, {
          method: "PUT", headers: { "content-type": blob.type || "application/octet-stream" }, body: blob
        });
        if (!response.ok) throw new Error(`源文件上传失败：${resource.path}`);
      }
      setStatus(pending.length ? "迁移完成" : "数据已经完整，无需重复上传");
      onImported(imported);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally { setBusy(false); }
  }
  const picker = <label className="button primary">
    {busy ? "正在迁移…" : compact ? "补传源文件" : "选择数据压缩包"}
    <input hidden disabled={busy} type="file" accept=".zip,application/zip" onChange={event => {
      const file = event.target.files?.[0]; if (file) void importZip(file);
    }} />
  </label>;
  if (compact) return <div className="import-card"><div><strong>数据迁移</strong><p>{status}</p></div>{picker}</div>;
  return <div className="center-state">
    <div className="eyebrow">Cloud Migration</div>
    <h1>导入 Read Map</h1>
    <p>{status}</p>
    {picker}
  </div>;
}

const TYPE_LABELS: Record<string, string> = {
  book: "书籍",
  article: "文章",
  collection: "集合",
  repo: "仓库",
  paper: "论文",
  section: "章节",
};

function sourceHref(link: string): string {
  if (/^[a-z][a-z\d+.-]*:/i.test(link) || link.startsWith("//")) return link;
  const normalized = link.replace(/^\.\//, "").replace(/^\/?map\/resources\/?/, "resources/");
  if (!normalized.startsWith("resources/")) return link;
  const trailingSlash = normalized.endsWith("/");
  const encoded = normalized.slice("resources/".length).split("/").filter(Boolean).map(encodeURIComponent).join("/");
  return `/resources/${encoded}${trailingSlash ? "/" : ""}`;
}

async function api(path: string, options?: RequestInit): Promise<MapState> {
  const response = await fetch(path, {
    ...options,
    headers: { "content-type": "application/json", ...options?.headers },
  });
  const text = await response.text();
  let payload: MapState & { error?: string };
  try { payload = JSON.parse(text) as MapState & { error?: string }; }
  catch { throw new Error(response.ok ? "服务器返回了无法识别的内容" : `请求失败（${response.status}），请稍后重试`); }
  if (!response.ok) throw new Error(payload.error || "操作失败");
  return payload;
}

function ProgressBar({ value }: { value: number }) {
  return <div className="progress-bar" aria-label={`进度 ${value}%`}><i style={{ width: `${value}%` }} /></div>;
}

function EmptyCard({ children }: { children: React.ReactNode }) {
  return <div className="empty-card">{children}</div>;
}

function InboxCard({ item, onDelete, disabled }: { item: InboxItem; onDelete: () => void; disabled: boolean }) {
  return (
    <article className="ticket">
      <div className="ticket-meta"><span className="pill">{TYPE_LABELS[item.type] || item.type}</span>{item.added && <time>{item.added}</time>}</div>
      <h3>{item.title}</h3>
      {item.author && <div className="muted">{item.author}</div>}
      {item.description && <p>{item.description}</p>}
      <div className="actions">
        {item.link && <a className="button" href={sourceHref(item.link)} target="_blank" rel="noreferrer">打开来源</a>}
        <button className="button danger" disabled={disabled} onClick={onDelete}>删除</button>
      </div>
    </article>
  );
}

function ReadingCard({ reading, onOpen }: { reading: Reading; onOpen: () => void }) {
  return (
    <button className="reading-ticket" onClick={onOpen}>
      <div className="ticket-meta"><span className="pill">{TYPE_LABELS[reading.type] || reading.type}</span><span>{reading.completedCount}/{reading.leafCount}</span></div>
      <h3>{reading.title}</h3>
      {reading.author && <div className="muted">{reading.author}</div>}
      {reading.description && <p>{reading.description}</p>}
      <div className="reading-progress"><ProgressBar value={reading.progress} /><strong>{reading.progress}%</strong></div>
    </button>
  );
}

function Overview({ state, onOpen, onDelete }: { state: MapState; onOpen: (file: string) => void; onDelete: (index: number) => void }) {
  const [filter, setFilter] = useState<"all" | Reading["status"]>("all");
  const [query, setQuery] = useState("");
  const active = state.readings.filter(item => item.status === "reading");
  const unstarted = state.readings.filter(item => item.status === "unstarted");
  const completed = state.readings.filter(item => item.status === "completed");
  const totalUnits = state.readings.reduce((sum, item) => sum + item.leafCount, 0);
  const completedUnits = state.readings.reduce((sum, item) => sum + item.completedCount, 0);
  const overallProgress = totalUnits ? Math.round(completedUnits / totalUnits * 100) : 0;
  const visible = state.readings.filter(item => {
    const matchesFilter = filter === "all" || item.status === filter;
    const term = query.trim().toLowerCase();
    return matchesFilter && (!term || `${item.title} ${item.author || ""} ${item.description || ""}`.toLowerCase().includes(term));
  });
  const tabs: Array<{ key: "all" | Reading["status"]; label: string; count: number }> = [
    { key: "all", label: "全部", count: state.readings.length },
    { key: "reading", label: "进行中", count: active.length },
    { key: "unstarted", label: "未开始", count: unstarted.length },
    { key: "completed", label: "已完成", count: completed.length },
  ];
  return (
    <div className="home-shell">
      <header className="home-nav">
        <a className="home-brand" href="/" aria-label="Read Map 首页"><span>R</span><strong>Read Map</strong></a>
        <div className="home-nav-actions">
          <label className="home-search"><span aria-hidden="true">⌕</span><input value={query} onChange={event => setQuery(event.target.value)} placeholder="搜索阅读项目" aria-label="搜索阅读项目" /></label>
          <a href="/manage">资源管理 <span aria-hidden="true">↗</span></a>
        </div>
      </header>

      <main className="home-main">
        <section className="home-intro">
          <div className="eyebrow">Your reading desk</div>
          <h1>把注意力留给<br />正在读的内容。</h1>
          <p>整理线索，推进阅读，并让每一次完成都有迹可循。</p>
        </section>

        <section className="focus-grid">
          <article className="reading-summary">
            <div className="section-heading"><div><span>阅读汇总</span><h2>当前进度</h2></div><strong>{overallProgress}<small>%</small></strong></div>
            <ProgressBar value={overallProgress} />
            <div className="summary-metrics">
              <div><strong>{active.length}</strong><span>正在阅读</span></div>
              <div><strong>{completed.length}</strong><span>已经完成</span></div>
              <div><strong>{completedUnits}<small> / {totalUnits}</small></strong><span>完成单元</span></div>
            </div>
            <div className="active-list">
              <div className="subheading"><strong>继续阅读</strong><span>{active.length ? "选择一个项目继续" : "还没有进行中的项目"}</span></div>
              {active.slice(0, 3).map(reading => (
                <button className="active-row" key={reading.file} onClick={() => onOpen(reading.file)}>
                  <span className="active-index">{String(active.indexOf(reading) + 1).padStart(2, "0")}</span>
                  <span className="active-copy"><strong>{reading.title}</strong><small>{reading.author || TYPE_LABELS[reading.type] || reading.type}</small></span>
                  <span className="active-progress"><i><b style={{ width: `${reading.progress}%` }} /></i><strong>{reading.progress}%</strong></span>
                  <span className="active-arrow">→</span>
                </button>
              ))}
            </div>
          </article>

          <aside className="reading-queue">
            <div className="section-heading compact"><div><span>Up next</span><h2>待阅读</h2></div><b>{state.inbox.length + unstarted.length}</b></div>
            <p className="queue-note">先处理刚收集的线索，再选择下一项阅读。</p>
            <div className="queue-list">
              {state.inbox.slice(0, 3).map((item, index) => (
                <article className="queue-row" key={`${item.title}-${index}`}>
                  <div><span>Inbox</span><strong>{item.title}</strong><small>{item.author || item.description || "刚刚收集"}</small></div>
                  <button disabled={state.readOnly} onClick={() => onDelete(index)} aria-label={`移除 ${item.title}`}>×</button>
                </article>
              ))}
              {unstarted.slice(0, Math.max(0, 4 - Math.min(state.inbox.length, 3))).map(reading => (
                <button className="queue-row queue-reading" key={reading.file} onClick={() => onOpen(reading.file)}>
                  <div><span>Ready</span><strong>{reading.title}</strong><small>{reading.author || `${reading.leafCount} 个阅读单元`}</small></div><b>→</b>
                </button>
              ))}
              {!state.inbox.length && !unstarted.length && <EmptyCard>待读清单已经清空</EmptyCard>}
            </div>
            <a className="queue-all" href="/inbox">查看全部 Inbox <span>→</span></a>
          </aside>
        </section>

        <section className="library-section">
          <div className="library-header">
            <div><div className="eyebrow">Library</div><h2>全部阅读项目</h2></div>
            <div className="filter-tabs" role="tablist" aria-label="阅读状态筛选">
              {tabs.map(tab => <button className={filter === tab.key ? "active" : ""} key={tab.key} onClick={() => setFilter(tab.key)}>{tab.label}<span>{tab.count}</span></button>)}
            </div>
          </div>
          <div className="reading-grid">
            {visible.map(reading => <ReadingCard key={reading.file} reading={reading} onOpen={() => onOpen(reading.file)} />)}
            {!visible.length && <EmptyCard>没有符合条件的阅读项目</EmptyCard>}
          </div>
        </section>
      </main>
    </div>
  );
}

function entryId(entry: Entry): string {
  return `entry-${entry.path.join("-")}`;
}

function countLeaves(entry: Entry): number {
  return entry.children?.length ? entry.children.reduce((total, child) => total + countLeaves(child), 0) : 1;
}

function StructureOverview({ entries }: { entries: Entry[] }) {
  if (!entries.length) return null;
  return (
    <section className="structure-overview" aria-labelledby="structure-title">
      <div className="structure-heading">
        <div><div className="eyebrow">Structure</div><h2 id="structure-title">内容结构</h2></div>
        <p>点击分区，定位到详细目录</p>
      </div>
      <div className="structure-map">
        {entries.map((entry, index) => (
          <a className="structure-section" href={`#${entryId(entry)}`} key={entry.path.join("-")}>
            <div className="structure-section-head">
              <span className="structure-index">{String(index + 1).padStart(2, "0")}</span>
              <span className="structure-count">{countLeaves(entry)} 个单元</span>
            </div>
            <strong>{entry.title}</strong>
            {entry.description && <p>{entry.description}</p>}
            <div className="structure-nodes">
              {(entry.children || [entry]).slice(0, 5).map(child => <span key={child.path.join("-")}>{child.title}</span>)}
              {(entry.children?.length || 0) > 5 && <span className="more-node">+{entry.children!.length - 5}</span>}
            </div>
            <div className="structure-progress"><ProgressBar value={entry.derivedProgress} /><b>{entry.derivedProgress}%</b></div>
          </a>
        ))}
      </div>
    </section>
  );
}

const PencilIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
  </svg>
);

const ChevronDown = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="m6 9 6 6 6-6" /></svg>
);

const ChevronRight = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="m9 18 6-6-6-6" /></svg>
);

const ExternalIcon = () => (
  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" />
  </svg>
);

function ReadingStatus({ value, disabled, onChange }: { value: number; disabled: boolean; onChange: (value: number) => Promise<void> }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const isLongPress = useRef(false);
  const [showSlider, setShowSlider] = useState(false);
  const [exact, setExact] = useState(value);
  const status = value === 0 ? "unread" : value === 100 ? "completed" : "reading";
  const labels = { unread: "未阅读", reading: "阅读中", completed: "已完成" };

  useEffect(() => setExact(value), [value]);

  const save = async (next: number) => {
    setShowSlider(false);
    if (next !== value) await onChange(next);
  };

  useEffect(() => {
    if (!showSlider) return;
    const close = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) void save(exact);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [showSlider, exact, value]);

  const nextInCycle = () => {
    if (value === 0) return 50;
    if (value === 100) return 0;
    return 100;
  };

  const handlePointerDown = () => {
    if (disabled) return;
    isLongPress.current = false;
    longPressTimer.current = setTimeout(() => {
      isLongPress.current = true;
      setShowSlider(true);
    }, 500);
  };

  const handlePointerUp = () => clearTimeout(longPressTimer.current);
  const handlePointerLeave = () => clearTimeout(longPressTimer.current);

  const handleClick = () => {
    if (disabled || isLongPress.current) return;
    void save(showSlider ? exact : nextInCycle());
  };

  return (
    <div className="reading-status" ref={containerRef}>
      <button
        className={`status-button ${status}`}
        disabled={disabled}
        aria-label={`阅读状态：${labels[status]}，点击切换，长按调整进度`}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerLeave}
        onClick={handleClick}
      >
        <span className={`status-dot ${status}`} aria-hidden="true" />
        {labels[status]}
      </button>
      {showSlider && (
        <div className="status-slider">
          <div className="slider-header">
            <span>精确进度</span>
            <output>{exact}%</output>
          </div>
          <input
            type="range"
            min="0"
            max="100"
            step="1"
            value={exact}
            onChange={event => setExact(Number(event.target.value))}
            onMouseUp={() => void save(exact)}
            onTouchEnd={() => void save(exact)}
          />
        </div>
      )}
    </div>
  );
}

function EntryRow({ entry, reading, depth, disabled, onUpdate }: {
  entry: Entry;
  reading: Reading;
  depth: number;
  disabled: boolean;
  onUpdate: (path: number[], change: { progress?: number; notes?: string }) => Promise<void>;
}) {
  const [expanded, setExpanded] = useState(depth < 2);
  const [editingNotes, setEditingNotes] = useState(false);
  const [notes, setNotes] = useState(entry.notes || "");
  const [progress, setProgress] = useState(entry.progress ?? entry.derivedProgress);

  useEffect(() => setNotes(entry.notes || ""), [entry.notes]);
  useEffect(() => setProgress(entry.progress ?? entry.derivedProgress), [entry.progress, entry.derivedProgress]);

  const saveProgress = async (value: number) => {
    const bounded = Math.min(100, Math.max(0, Math.round(value)));
    setProgress(bounded);
    await onUpdate(entry.path, { progress: bounded });
  };

  return (
    <section id={entryId(entry)} className={`entry depth-${depth} ${entry.leaf ? "leaf" : "branch"}`}>
      <div className="entry-main" style={{ paddingLeft: `${12 + depth * 20}px` }}>
        <button className="entry-toggle" onClick={() => setExpanded(value => !value)} aria-label={expanded ? "收起" : "展开"}>{entry.children?.length ? (expanded ? <ChevronDown /> : <ChevronRight />) : <span className="entry-dot">·</span>}</button>
        <div className="entry-copy">
          {entry.link
            ? <a className="entry-title entry-link" href={sourceHref(entry.link)} target="_blank" rel="noreferrer" title="打开阅读内容">{entry.title}<span aria-hidden="true"><ExternalIcon /></span></a>
            : <div className="entry-title">{entry.title}</div>}
          {entry.description && <div className="entry-description">{entry.description}</div>}
        </div>
        {entry.leaf
          ? <ReadingStatus value={progress} disabled={disabled} onChange={saveProgress} />
          : <><div className="entry-progress"><ProgressBar value={entry.derivedProgress} /><span>{entry.derivedProgress}%</span></div><div className="derived-label">自动计算</div></>}
        <div className="entry-actions">
          <button className={`notes-button ${entry.notes ? "has-notes" : ""}`} title={entry.notes ? "查看笔记" : "添加笔记"} aria-label={entry.notes ? "查看笔记" : "添加笔记"} onClick={() => setEditingNotes(value => !value)}><PencilIcon /></button>
        </div>
      </div>
      {editingNotes && (
        <div className="notes-editor" style={{ marginLeft: `${44 + depth * 20}px` }}>
          <textarea disabled={disabled} value={notes} onChange={event => setNotes(event.target.value)} placeholder="记录一句重点、疑问或补充链接…" />
          <div className="actions"><button className="button primary" disabled={disabled} onClick={() => void onUpdate(entry.path, { notes })}>保存笔记</button><button className="button" onClick={() => setEditingNotes(false)}>收起</button></div>
        </div>
      )}
      {expanded && entry.children?.map(child => <EntryRow key={child.path.join("-")} entry={child} reading={reading} depth={depth + 1} disabled={disabled} onUpdate={onUpdate} />)}
    </section>
  );
}

function Detail({ reading, disabled, onBack, onUpdate }: {
  reading: Reading;
  disabled: boolean;
  onBack: () => void;
  onUpdate: (path: number[], change: { progress?: number; notes?: string }) => Promise<void>;
}) {
  const [editingRootNotes, setEditingRootNotes] = useState(false);
  const [rootNotes, setRootNotes] = useState(reading.notes || "");
  const rootLeaf = reading.children.length === 0;

  useEffect(() => setRootNotes(reading.notes || ""), [reading.notes]);

  return (
    <div className="detail-shell">
      <button className="button back" onClick={onBack}>← 返回概览</button>
      <header className="detail-header">
        <div>
          <div className="eyebrow">Reading Detail · {TYPE_LABELS[reading.type] || reading.type}</div>
          <h1>{reading.title}</h1>
          <p>{[reading.author, reading.version].filter(Boolean).join(" · ")}</p>
        </div>
        <div className="stats">
          <div><strong>{reading.leafCount}</strong><span>阅读单元</span></div>
          <div><strong>{reading.completedCount}</strong><span>已完成</span></div>
          <div><strong>{reading.progress}%</strong><span>总进度</span></div>
        </div>
      </header>
      <StructureOverview entries={reading.children} />
      <section className="detail-grid">
        <main className="reading-panel">
          <div className="panel-header"><div><h2>阅读目录</h2><p>父级进度由直接子节点递归计算。</p></div>{reading.link && <a className="button primary" href={sourceHref(reading.link)} target="_blank" rel="noreferrer">打开来源</a>}</div>
          {reading.children.length ? reading.children.map(entry => <EntryRow key={entry.path.join("-")} entry={entry} reading={reading} depth={0} disabled={disabled} onUpdate={onUpdate} />) : <EmptyCard>目录尚未核验。请通过 Agent 整理阅读结构。</EmptyCard>}
        </main>
        <aside className="reading-aside">
          <div className="eyebrow">Overview</div>
          <h2>{reading.progress}%</h2>
          <ProgressBar value={reading.progress} />
          {reading.description && <p>{reading.description}</p>}
          {rootLeaf && <ReadingStatus value={reading.progress} disabled={disabled} onChange={value => onUpdate([], { progress: value })} />}
          <button className="button" onClick={() => setEditingRootNotes(value => !value)}>整体笔记</button>
          {editingRootNotes && <div className="root-notes"><textarea disabled={disabled} value={rootNotes} onChange={event => setRootNotes(event.target.value)} placeholder="记录这份 reading 的整体笔记…" /><button className="button primary" disabled={disabled} onClick={() => void onUpdate([], { notes: rootNotes })}>保存笔记</button></div>}
          <dl><div><dt>类型</dt><dd>{TYPE_LABELS[reading.type] || reading.type}</dd></div><div><dt>文件</dt><dd>{reading.file}</dd></div><div><dt>状态</dt><dd>{reading.status === "unstarted" ? "未开始" : reading.status === "reading" ? "进行中" : "已完成"}</dd></div></dl>
        </aside>
      </section>
    </div>
  );
}

function App() {
  const [state, setState] = useState<MapState | null>(null);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const next = await api("/api/state");
      setState(next);
      setSelectedFile(current => current && next.readings.some(reading => reading.file === current) ? current : null);
      setMessage(null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      if (!quiet) setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
    const onFocus = () => void refresh(true);
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  const selected = useMemo(() => state?.readings.find(reading => reading.file === selectedFile) || null, [state, selectedFile]);

  const perform = async (operation: () => Promise<MapState>, success: string) => {
    try {
      const next = await operation();
      setState(next);
      setMessage(success);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
      await refresh(true);
    }
  };

  const update = async (reading: Reading, path: number[], change: { progress?: number; notes?: string }) => {
    await perform(() => api(`/api/readings/${encodeURIComponent(reading.file)}/entries`, { method: "PATCH", body: JSON.stringify({ path, dataVersion: reading.dataVersion, ...change }) }), "已保存");
  };

  const removeInbox = async (index: number) => {
    if (!state?.inboxVersion) return;
    const item = state.inbox[index];
    if (!window.confirm(`确认从 Inbox 删除「${item.title}」？`)) return;
    await perform(() => api(`/api/inbox/${index}`, { method: "DELETE", body: JSON.stringify({ version: state.inboxVersion }) }), "已从 Inbox 删除");
  };

  if (loading && !state) return <div className="center-state">正在读取 Read Map…</div>;
  if (!state) return <div className="center-state error">{message || "无法读取数据"}<button className="button" onClick={() => void refresh()}>重试</button></div>;
  if (!state.initialized) return <DataImporter onImported={setState} />;

  return (
    <>
      {state.readOnly && <div className="system-banner error"><strong>只读模式</strong>{state.errors.join("；")}</div>}
      {!state.readOnly && message && <div className="system-banner success">{message}</div>}
      {selected ? <Detail reading={selected} disabled={state.readOnly} onBack={() => setSelectedFile(null)} onUpdate={(path, change) => update(selected, path, change)} /> : <Overview state={state} onOpen={setSelectedFile} onDelete={index => void removeInbox(index)} />}
    </>
  );
}

export default App;
