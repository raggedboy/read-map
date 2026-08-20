"use client";

import { useEffect, useMemo, useState } from "react";

type InboxItem = {
  title: string;
  type: string;
  author?: string | null;
  version?: string | null;
  link?: string | null;
  description?: string | null;
  added?: string | null;
};

type MapState = { readOnly: boolean; inbox: InboxItem[]; errors?: string[] };

const TYPE_LABELS: Record<string, string> = {
  book: "书籍", article: "文章", collection: "集合", repo: "仓库", paper: "论文", section: "章节",
};

function sourceHref(link: string): string {
  if (/^[a-z][a-z\d+.-]*:/i.test(link) || link.startsWith("//")) return link;
  const normalized = link.replace(/^\.\//, "").replace(/^\/?map\/resources\/?/, "resources/");
  if (!normalized.startsWith("resources/")) return link;
  const encoded = normalized.slice("resources/".length).split("/").filter(Boolean).map(encodeURIComponent).join("/");
  return `/resources/${encoded}`;
}

export default function InboxPage() {
  const [state, setState] = useState<MapState | null>(null);
  const [query, setQuery] = useState("");
  const [type, setType] = useState("all");
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState("");

  useEffect(() => { void load(); }, []);
  async function load() {
    const response = await fetch("/api/state");
    if (!response.ok) { setError("Inbox 加载失败，请稍后重试"); return; }
    setState(await response.json() as MapState);
  }
  async function remove(index: number) {
    setBusy(index); setError("");
    const response = await fetch(`/api/inbox/${index}`, { method: "DELETE" });
    if (response.ok) setState(await response.json() as MapState);
    else setError("删除失败，请稍后重试");
    setBusy(null);
  }

  const types = useMemo(() => Array.from(new Set((state?.inbox || []).map(item => item.type))), [state]);
  const visible = useMemo(() => (state?.inbox || []).map((item, index) => ({ item, index })).filter(({ item }) => {
    const term = query.trim().toLowerCase();
    return (type === "all" || item.type === type) && (!term || `${item.title} ${item.author || ""} ${item.description || ""}`.toLowerCase().includes(term));
  }), [state, query, type]);

  return <div className="inbox-shell">
    <header className="inbox-nav">
      <a className="home-brand" href="/"><span>R</span><strong>Read Map</strong></a>
      <nav><a href="/">阅读首页</a><a href="/manage">资源管理</a></nav>
    </header>
    <main className="inbox-main">
      <div className="inbox-hero">
        <div><div className="eyebrow">Collection queue</div><h1>Inbox</h1><p>所有尚未整理的阅读线索，都暂存在这里。</p></div>
        <strong>{state?.inbox.length ?? "—"}<small> 条线索</small></strong>
      </div>
      <div className="inbox-toolbar">
        <label className="inbox-search"><span>⌕</span><input value={query} onChange={event => setQuery(event.target.value)} placeholder="搜索标题、作者或描述" /></label>
        <div className="inbox-types">
          <button className={type === "all" ? "active" : ""} onClick={() => setType("all")}>全部</button>
          {types.map(value => <button className={type === value ? "active" : ""} key={value} onClick={() => setType(value)}>{TYPE_LABELS[value] || value}</button>)}
        </div>
      </div>
      {error && <div className="inbox-error">{error}</div>}
      <section className="inbox-list">
        <div className="inbox-list-head"><span>阅读线索</span><span>类型</span><span>收集时间</span><span>操作</span></div>
        {visible.map(({ item, index }) => <article className="inbox-item" key={`${item.title}-${index}`}>
          <div className="inbox-item-main"><span className="inbox-item-index">{String(index + 1).padStart(2, "0")}</span><div><strong>{item.title}</strong>{item.author && <small>{item.author}</small>}{item.description && <p>{item.description}</p>}</div></div>
          <span className="pill">{TYPE_LABELS[item.type] || item.type}</span>
          <time>{item.added || "—"}</time>
          <div className="inbox-item-actions">{item.link && <a href={sourceHref(item.link)} target="_blank" rel="noreferrer">打开</a>}<button disabled={state?.readOnly || busy === index} onClick={() => void remove(index)}>删除</button></div>
        </article>)}
        {state && !visible.length && <div className="inbox-empty">没有符合条件的阅读线索</div>}
        {!state && !error && <div className="inbox-empty">正在读取 Inbox…</div>}
      </section>
    </main>
  </div>;
}
