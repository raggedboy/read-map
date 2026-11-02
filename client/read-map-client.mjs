#!/usr/bin/env node

const baseUrl = (process.env.READ_MAP_URL || "https://read-map.panhj2014.chatgpt.site").replace(/\/$/, "");
const authorization = process.env.READ_MAP_AUTHORIZATION;

async function request(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      "content-type": "application/json",
      ...(authorization ? { "OAI-Sites-Authorization": `Bearer ${authorization}` } : {}),
      ...options.headers,
    },
  });
  const text = await response.text();
  if (response.status === 401 || response.status === 403) {
    throw new Error("Read Map 授权无效。请通过 Sites connector 获取当前 Site 的短期授权；浏览器登录无法授权此客户端。");
  }
  let body;
  try { body = JSON.parse(text); }
  catch { throw new Error(`Read Map 返回了非 JSON 内容（${response.status}）。不要尝试浏览器登录；请检查 Sites connector 与 READ_MAP_AUTHORIZATION。`); }
  if (!response.ok) throw new Error(body.error || `Read Map 请求失败（${response.status}）`);
  return body;
}

function option(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function inputJson() {
  const file = option("input");
  if (file) return JSON.parse(await (await import("node:fs/promises")).readFile(file, "utf8"));
  const raw = option("json");
  if (raw) return JSON.parse(raw);
  throw new Error("缺少 --input <json-file> 或 --json '<json>'");
}

async function main() {
  const [command, action] = process.argv.slice(2);
  if (command === "state") return request("/api/state");
  if (command === "inbox" && action === "add") {
    const state = await request("/api/state");
    return request("/api/inbox", { method: "POST", body: JSON.stringify({ item: await inputJson(), inboxVersion: state.inboxVersion }) });
  }
  if (command === "record") {
    const state = await request("/api/state");
    const file = option("file");
    const reading = state.readings.find(item => item.file === file);
    if (!reading) throw new Error(`找不到 Reading：${file}`);
    const path = (option("path") || "").split(".").filter(Boolean).map(Number);
    const payload = { path, dataVersion: reading.dataVersion };
    if (option("progress") !== undefined) payload.progress = Number(option("progress"));
    if (option("notes") !== undefined) payload.notes = option("notes");
    return request(`/api/readings/${encodeURIComponent(file)}/entries`, { method: "PATCH", body: JSON.stringify(payload) });
  }
  if (command === "promote") {
    const inboxVersion = option("inbox-version");
    if (!inboxVersion || !/^[1-9]\d*$/.test(inboxVersion)) throw new Error("promote 需要原始选择的 --inbox-version；请重新读取并确认后再提交。");
    const reading = await inputJson();
    const indexes = (option("inbox") || "").split(",").filter(Boolean).map(Number);
    return request("/api/readings", { method: "POST", body: JSON.stringify({ file: option("file"), reading, inboxIndexes: indexes, inboxVersion }) });
  }
  throw new Error("用法：state | inbox add | record | promote");
}

main().then(result => process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)).catch(error => {
  process.stderr.write(`${error.message}\n`); process.exitCode = 1;
});
