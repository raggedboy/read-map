"use client";
import { useEffect, useState } from "react";
import JSZip from "jszip";
import { parse, stringify } from "yaml";

type DocumentRow = { path: string; kind: string; content: string; version: number; updated_at: string };
type ResourceRow = { path: string; content_type: string; size: number; updated_at: string };
type ManagementState = { documents: DocumentRow[]; resources: ResourceRow[] };

function downloadBlob(blob: Blob, filename: string) {
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}
function formatSize(size: number) {
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

function resourceHref(path: string) {
  return `/resources/${path.split("/").map(encodeURIComponent).join("/")}`;
}

export default function ManagePage() {
  const [state, setState] = useState<ManagementState | null>(null);
  const [message, setMessage] = useState("数据与源文件分开管理、分开导出。");
  async function refresh() {
    const response = await fetch("/api/manage");
    if (!response.ok) throw new Error("无法读取资源清单");
    setState(await response.json());
  }
  useEffect(() => { void refresh(); }, []);
  async function exportData() {
    if (!state) return;
    const zip = new JSZip();
    for (const doc of state.documents) zip.file(`read-map-data/map/${doc.path}`, stringify(JSON.parse(doc.content), { lineWidth: 100 }));
    downloadBlob(await zip.generateAsync({ type: "blob", compression: "DEFLATE" }), "read-map-data.zip");
  }
  async function importData(file: File) {
    try {
      setMessage("正在导入结构化数据…");
      const zip = await JSZip.loadAsync(file);
      const documents: Array<{ path: string; data: unknown }> = [];
      for (const [name, entry] of Object.entries(zip.files)) {
        if (entry.dir || name.includes("__MACOSX/")) continue;
        const marker = "/map/";
        const offset = name.indexOf(marker);
        const relative = offset >= 0 ? name.slice(offset + marker.length) : name.replace(/^map\//, "");
        if (relative === "inbox.yaml" || /^readings\/[^/]+\.yaml$/.test(relative)) documents.push({ path: relative, data: parse(await entry.async("text")) });
      }
      const response = await fetch("/api/import", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ documents }) });
      if (!response.ok) throw new Error("结构化数据导入失败");
      await refresh();
      setMessage(`已导入 ${documents.length} 份数据文件`);
    } catch (error) { setMessage(error instanceof Error ? error.message : String(error)); }
  }
  async function uploadResources(files: FileList) {
    try {
      let done = 0;
      for (const file of Array.from(files)) {
        setMessage(`正在上传 ${++done}/${files.length}：${file.name}`);
        const response = await fetch(`/api/import/resource?path=${encodeURIComponent("resources/" + file.name)}`, { method: "PUT", headers: { "content-type": file.type || "application/octet-stream" }, body: file });
        if (!response.ok) throw new Error(`上传失败：${file.name}`);
      }
      await refresh();
      setMessage("资源上传完成");
    } catch (error) { setMessage(error instanceof Error ? error.message : String(error)); }
  }
  async function exportResources() {
    if (!state) return;
    const picker = (window as typeof window & { showDirectoryPicker?: () => Promise<any> }).showDirectoryPicker;
    if (!picker) { setMessage("当前浏览器不支持文件夹导出，请使用下方单个下载。"); return; }
    try {
      const directory = await picker();
      let done = 0;
      for (const resource of state.resources) {
        setMessage(`正在导出 ${++done}/${state.resources.length}：${resource.path}`);
        const response = await fetch(`/resources/${resource.path.split("/").map(encodeURIComponent).join("/")}`);
        if (!response.ok) throw new Error(`下载失败：${resource.path}`);
        const handle = await directory.getFileHandle(resource.path.split("/").at(-1), { create: true });
        const writable = await handle.createWritable();
        await response.body?.pipeTo(writable);
      }
      setMessage("全部资源已导出到所选文件夹");
    } catch (error) { if ((error as DOMException)?.name !== "AbortError") setMessage(error instanceof Error ? error.message : String(error)); }
  }
  return <main className="storage-shell">
    <aside className="storage-sidebar">
      <a className="storage-brand" href="/"><span>阅</span><div><strong>Read Map</strong><small>阅读地图</small></div></a>
      <nav><p>存储空间</p><a href="#d1"><i>DB</i><span>D1 数据</span><b>{state?.documents.length ?? 0}</b></a><a href="#r2"><i>R2</i><span>R2 资源</span><b>{state?.resources.length ?? 0}</b></a></nav>
      <a className="storage-back" href="/">← 返回阅读地图</a>
    </aside>
    <section className="storage-workspace">
      <header className="storage-header"><div><div className="eyebrow">Cloud Storage</div><h1>资源管理</h1><p>{message}</p></div></header>
      <section className="folder-panel" id="d1">
        <div className="folder-toolbar"><div><span className="folder-icon">D1</span><div><strong>结构化数据</strong><small>阅读目录、进度与笔记</small></div></div><div className="folder-actions"><button onClick={() => void exportData()}>下载全部</button><label>上传 ZIP<input hidden type="file" accept=".zip" onChange={event => { const file = event.target.files?.[0]; if (file) void importData(file); }} /></label></div></div>
        <div className="file-list"><div className="file-row file-head"><span>名称</span><span>类型</span><span>版本</span><span>更新时间</span></div>
          {state?.documents.map(doc => <div className="file-row" key={doc.path}><span className="file-name"><i>Y</i><strong>{doc.path}</strong></span><span>{doc.kind === "reading" ? "Reading YAML" : "Inbox YAML"}</span><span>v{doc.version}</span><time>{new Date(doc.updated_at).toLocaleDateString("zh-CN")}</time></div>)}
        </div>
      </section>
      <section className="folder-panel" id="r2">
        <div className="folder-toolbar"><div><span className="folder-icon">R2</span><div><strong>源文件</strong><small>PDF、Markdown 与附件</small></div></div><div className="folder-actions"><button onClick={() => void exportResources()}>导出全部</button><label>上传文件<input hidden type="file" multiple onChange={event => { if (event.target.files) void uploadResources(event.target.files); }} /></label></div></div>
        <div className="file-list"><div className="file-row resource-file file-head"><span>名称</span><span>类型</span><span>大小</span><span>操作</span></div>
          {state?.resources.map(resource => {
            const href = resourceHref(resource.path);
            const canPreview = /\.(pdf|md)$/i.test(resource.path);
            return <div className="file-row resource-file" key={resource.path}>
              <a className="file-name" href={href} target="_blank" rel="noreferrer"><i>{resource.path.toLowerCase().endsWith(".pdf") ? "P" : "M"}</i><strong>{resource.path}</strong></a>
              <span>{resource.path.split(".").at(-1)?.toUpperCase()}</span><span>{formatSize(resource.size)}</span>
              <span className="file-actions">{canPreview && <a href={href} target="_blank" rel="noreferrer">查看</a>}<a href={href} download>下载</a></span>
            </div>;
          })}
        </div>
      </section>
    </section>
  </main>;
}
