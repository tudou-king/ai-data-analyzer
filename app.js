// ==================== AI 数据分析助手 - 核心逻辑 ====================
(function () {
"use strict";

// ---------- 配置管理 ----------
const CFG = {
  _k: (k) => "ada_" + k,
  get(k)       { return localStorage.getItem(this._k(k)) || ""; },
  set(k, v)    { localStorage.setItem(this._k(k), v); },
  apiKey()     { return this.get("api_key"); },
  baseUrl()    { return this.get("base_url") || "https://api.openai.com/v1"; },
  model()      { return this.get("model") || "gpt-4o"; },
};

// ---------- 全局状态 ----------
let DATA_ROWS  = [];   // 原始行数据
let DATA_COLS  = [];   // 列名数组
let PROFILE    = null; // 分析结果
let CHARTS_META = [];  // 图表配置
let CHART_INSTANCES = [];
let SESSION_ID = "";

// ---------- DOM 引用 ----------
const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);

// ======================================================================
//  1. 文件解析
// ======================================================================
async function parseFile(file) {
  const ext = file.name.split(".").pop().toLowerCase();
  if (ext === "csv") {
    return new Promise((resolve, reject) => {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        dynamicTyping: false,
        complete(r) { resolve(r.data); },
        error(err)  { reject(err); },
      });
    });
  }
  if (ext === "xlsx" || ext === "xls") {
    const buf = await file.arrayBuffer();
    const wb  = XLSX.read(buf, { type: "array" });
    const ws  = wb.Sheets[wb.SheetNames[0]];
    return XLSX.utils.sheet_to_json(ws, { defval: "" });
  }
  throw new Error("不支持的文件格式，仅支持 CSV / XLSX / XLS");
}

// ======================================================================
//  2. 数据分析
// ======================================================================
function analyze(rows) {
  if (!rows || !rows.length) return null;
  const cols = Object.keys(rows[0]);
  const profile = { rowCount: rows.length, colCount: cols.length, columns: [] };

  for (const name of cols) {
    const vals = rows.map((r) => r[name]);
    const nonEmpty = vals.filter((v) => v !== null && v !== undefined && v !== "");
    const missing  = vals.length - nonEmpty.length;

    // 判断是否为数值列（>70% 可转数字）
    const nums = nonEmpty.map(Number).filter((n) => !isNaN(n));
    const isNum = nums.length > nonEmpty.length * 0.7 && nonEmpty.length > 0;

    const info = {
      name,
      type: isNum ? "numeric" : "categorical",
      total: vals.length,
      missing,
      missPct: vals.length ? ((missing / vals.length) * 100).toFixed(1) : "0.0",
      unique: new Set(nonEmpty.map(String)).size,
    };

    if (isNum && nums.length) {
      const sorted = [...nums].sort((a, b) => a - b);
      const sum = nums.reduce((a, b) => a + b, 0);
      const mean = sum / nums.length;
      const variance = nums.reduce((a, v) => a + (v - mean) ** 2, 0) / nums.length;
      info.stats = {
        min: +sorted[0].toFixed(4),
        max: +sorted[sorted.length - 1].toFixed(4),
        mean: +mean.toFixed(4),
        median: +median(sorted).toFixed(4),
        std: +Math.sqrt(variance).toFixed(4),
      };
    } else {
      const counts = {};
      nonEmpty.forEach((v) => { const s = String(v); counts[s] = (counts[s] || 0) + 1; });
      info.topValues = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 10);
    }
    profile.columns.push(info);
  }

  // 相关性矩阵
  const numCols = profile.columns.filter((c) => c.type === "numeric");
  if (numCols.length >= 2) {
    profile.corr = correlation(rows, numCols.map((c) => c.name));
  }
  return profile;
}

function median(sorted) {
  const m = sorted.length >> 1;
  return sorted.length & 1 ? sorted[m] : (sorted[m - 1] + sorted[m]) / 2;
}

function correlation(rows, cols) {
  const matrix = {};
  for (const c1 of cols) {
    matrix[c1] = {};
    for (const c2 of cols) {
      if (c1 === c2) { matrix[c1][c2] = 1; continue; }
      const pairs = rows.map((r) => [+r[c1], +r[c2]]).filter(([a, b]) => !isNaN(a) && !isNaN(b));
      if (pairs.length < 3) { matrix[c1][c2] = 0; continue; }
      const n = pairs.length;
      let sx = 0, sy = 0, sxy = 0, sx2 = 0, sy2 = 0;
      for (const [x, y] of pairs) { sx += x; sy += y; sxy += x * y; sx2 += x * x; sy2 += y * y; }
      const d = Math.sqrt((n * sx2 - sx * sx) * (n * sy2 - sy * sy));
      matrix[c1][c2] = d === 0 ? 0 : +((n * sxy - sx * sy) / d).toFixed(4);
    }
  }
  return matrix;
}

// ======================================================================
//  3. 图表生成
// ======================================================================
const PALETTE = ["#4f46e5","#10b981","#f59e0b","#ef4444","#8b5cf6","#06b6d4","#f97316","#ec4899","#14b8a6","#6366f1"];

function buildCharts(rows, profile) {
  const charts = [];
  const numCols = profile.columns.filter((c) => c.type === "numeric");
  const catCols = profile.columns.filter((c) => c.type === "categorical" && c.unique <= 25 && c.unique >= 2);

  // 直方图：数值列（最多 4 个）
  for (const col of numCols.slice(0, 4)) {
    const vals = rows.map((r) => +r[col.name]).filter((v) => !isNaN(v));
    charts.push({ title: col.name + " 分布", type: "histogram", data: histData(vals) });
  }

  // 柱状图：分类列（最多 4 个）
  for (const col of catCols.slice(0, 4)) {
    charts.push({
      title: col.name + " 计数",
      type: "bar",
      data: { labels: col.topValues.map((v) => v[0]), values: col.topValues.map((v) => v[1]) },
    });
  }

  // 散点图：前两个数值列
  if (numCols.length >= 2) {
    const xN = numCols[0].name, yN = numCols[1].name;
    const pts = rows.map((r) => ({ x: +r[xN], y: +r[yN] })).filter((p) => !isNaN(p.x) && !isNaN(p.y));
    charts.push({ title: xN + " vs " + yN, type: "scatter", data: { pts, xN, yN } });
  }

  // 相关性热力图
  if (profile.corr) {
    charts.push({ title: "相关性热力图", type: "heatmap", data: profile.corr });
  }
  return charts;
}

function histData(vals) {
  const mn = Math.min(...vals), mx = Math.max(...vals);
  const bins = Math.min(20, Math.max(5, Math.ceil(Math.sqrt(vals.length))));
  const w = (mx - mn) / bins || 1;
  const counts = new Array(bins).fill(0);
  const labels = [];
  for (let i = 0; i < bins; i++) labels.push((mn + i * w).toFixed(1));
  for (const v of vals) { let idx = Math.floor((v - mn) / w); if (idx >= bins) idx = bins - 1; counts[idx]++; }
  return { labels, values: counts };
}

function renderCharts(charts) {
  // 销毁旧图表
  CHART_INSTANCES.forEach((c) => c.destroy());
  CHART_INSTANCES = [];
  const grid = $("#chartsGrid");
  grid.innerHTML = "";

  for (const ch of charts) {
    const card = document.createElement("div");
    card.className = "chart-card";
    const h4 = document.createElement("h4");
    h4.textContent = ch.title;
    card.appendChild(h4);

    if (ch.type === "heatmap") {
      card.classList.add("heatmap-wrap");
      const canvas = document.createElement("canvas");
      card.appendChild(canvas);
      grid.appendChild(card);
      drawHeatmap(canvas, ch.data);
    } else {
      const canvas = document.createElement("canvas");
      card.appendChild(canvas);
      grid.appendChild(card);
      const cfg = chartConfig(ch);
      CHART_INSTANCES.push(new Chart(canvas, cfg));
    }
  }
}

function chartConfig(ch) {
  if (ch.type === "histogram") {
    return {
      type: "bar",
      data: {
        labels: ch.data.labels,
        datasets: [{ label: "频次", data: ch.data.values, backgroundColor: "#4f46e5aa", borderColor: "#4f46e5", borderWidth: 1, borderRadius: 3 }],
      },
      options: { responsive: true, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } },
    };
  }
  if (ch.type === "bar") {
    return {
      type: "bar",
      data: {
        labels: ch.data.labels,
        datasets: [{ label: "数量", data: ch.data.values, backgroundColor: ch.data.labels.map((_, i) => PALETTE[i % PALETTE.length] + "cc"), borderRadius: 4 }],
      },
      options: { indexAxis: "y", responsive: true, plugins: { legend: { display: false } }, scales: { x: { beginAtZero: true, ticks: { precision: 0 } } } },
    };
  }
  if (ch.type === "scatter") {
    return {
      type: "scatter",
      data: {
        datasets: [{ label: ch.data.xN + " vs " + ch.data.yN, data: ch.data.pts, backgroundColor: "#4f46e588", pointRadius: 5 }],
      },
      options: { responsive: true, plugins: { legend: { display: false } }, scales: { x: { title: { display: true, text: ch.data.xN } }, y: { title: { display: true, text: ch.data.yN } } } },
    };
  }
  return {};
}

// ---------- 热力图 (Canvas) ----------
function drawHeatmap(canvas, corr) {
  const keys = Object.keys(corr);
  const n = keys.length;
  const cell = 52;
  const pad = 80;
  const size = pad + n * cell + 10;
  canvas.width = size;
  canvas.height = size;
  canvas.style.width = size + "px";
  canvas.style.height = size + "px";
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, size, size);
  ctx.font = "12px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  for (let i = 0; i < n; i++) {
    // 行标签
    ctx.fillStyle = "#475569";
    ctx.textAlign = "right";
    ctx.fillText(trunc(keys[i], 8), pad - 6, pad + i * cell + cell / 2);
    // 列标签
    ctx.save();
    ctx.translate(pad + i * cell + cell / 2, pad - 8);
    ctx.rotate(-Math.PI / 4);
    ctx.textAlign = "left";
    ctx.fillText(trunc(keys[i], 8), 0, 0);
    ctx.restore();

    for (let j = 0; j < n; j++) {
      const v = corr[keys[i]][keys[j]];
      ctx.fillStyle = heatColor(v);
      ctx.fillRect(pad + j * cell, pad + i * cell, cell - 2, cell - 2);
      ctx.fillStyle = Math.abs(v) > 0.55 ? "#fff" : "#1e293b";
      ctx.font = "bold 12px sans-serif";
      ctx.fillText(v.toFixed(2), pad + j * cell + cell / 2 - 1, pad + i * cell + cell / 2);
    }
  }
}

function heatColor(v) {
  // 蓝 (-1) -> 白 (0) -> 红 (+1)
  const t = (v + 1) / 2; // 0..1
  if (t < 0.5) {
    const s = t / 0.5;
    const r = Math.round(79 + (255 - 79) * s);
    const g = Math.round(70 + (255 - 70) * s);
    const b = Math.round(229 + (255 - 229) * s);
    return "rgb(" + r + "," + g + "," + b + ")";
  }
  const s = (t - 0.5) / 0.5;
  const r = Math.round(255 - (255 - 239) * s);
  const g = Math.round(255 - (255 - 68) * s);
  const b = Math.round(255 - (255 - 68) * s);
  return "rgb(" + r + "," + g + "," + b + ")";
}

function trunc(s, n) { return s.length > n ? s.slice(0, n) + ".." : s; }

// ======================================================================
//  4. AI 集成
// ======================================================================
function buildPrompt(profile, sampleRows) {
  const sampleCsv = sampleRows.slice(0, 15).map((r) => JSON.stringify(r)).join("\n");
  const colsDesc = profile.columns.map((c) => {
    let s = "- " + c.name + " (" + c.type + "), 缺失 " + c.missPct + "%, 唯一值 " + c.unique;
    if (c.stats) s += ", 范围 [" + c.stats.min + ", " + c.stats.max + "], 均值 " + c.stats.mean;
    return s;
  }).join("\n");

  return "你是一位专业的数据分析师。请用中文分析以下数据集。\n\n" +
    "数据概览：共 " + profile.rowCount + " 行，" + profile.colCount + " 列\n\n" +
    "列信息：\n" + colsDesc + "\n\n" +
    "样本数据（前 15 行）：\n" + sampleCsv + "\n\n" +
    "请从以下维度分析：\n" +
    "1. **数据质量评估**（缺失值、异常值、数据类型问题）\n" +
    "2. **关键统计发现**（分布、集中趋势、离散程度）\n" +
    "3. **变量间的关联与模式**\n" +
    "4. **业务洞察**（3-5 条可操作的发现）\n" +
    "5. **建议的后续分析方向**\n\n" +
    "请使用 Markdown 格式，具体引用列名和数字。";
}

async function callLLM(messages) {
  const key = CFG.apiKey();
  if (!key) throw new Error("请先在 API 设置中配置 API Key");

  const base = CFG.baseUrl().replace(/\/+$/, "");
  const resp = await fetch(base + "/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + key },
    body: JSON.stringify({ model: CFG.model(), messages, temperature: 0.3, max_tokens: 2500 }),
  });
  if (!resp.ok) {
    const err = await resp.text();
    throw new Error("API 调用失败 (" + resp.status + "): " + err.slice(0, 200));
  }
  const data = await resp.json();
  return data.choices[0].message.content;
}

async function runAIAnalysis() {
  const el = $("#aiContent");
  el.innerHTML = '<div class="ai-spinner"><div class="spinner"></div><p>正在调用 AI 分析，请稍候...</p></div>';
  try {
    const prompt = buildPrompt(PROFILE, DATA_ROWS);
    const text = await callLLM([
      { role: "system", content: "你是一位资深数据分析师，用清晰的结构化 Markdown 回答。" },
      { role: "user",   content: prompt },
    ]);
    el.innerHTML = '<div class="ai-md">' + marked.parse(text) + "</div>";
  } catch (e) {
    el.innerHTML = '<div class="ai-placeholder"><p style="color:#ef4444">' + escHtml(e.message) + "</p>" +
      '<button class="btn btn-primary" id="btnRunAi">重试</button></div>';
    $("#btnRunAi").addEventListener("click", runAIAnalysis);
  }
}

async function sendChat() {
  const input = $("#chatInput");
  const q = input.value.trim();
  if (!q) return;
  input.value = "";
  appendMsg("user", q);

  const ctx = "数据集 " + SESSION_ID + "：共 " + PROFILE.rowCount + " 行，" + PROFILE.colCount + " 列。\n" +
    "列：" + DATA_COLS.join(", ") + "\n样本：\n" +
    DATA_ROWS.slice(0, 10).map((r) => JSON.stringify(r)).join("\n");

  appendMsg("ai", '<div class="ai-spinner"><div class="spinner"></div><p>思考中...</p></div>');
  try {
    const text = await callLLM([
      { role: "system", content: "你是一位数据分析师助手，用中文简洁回答，具体引用数据。" },
      { role: "user",   content: ctx + "\n\n用户提问：" + q },
    ]);
    const msgs = $("#chatMessages");
    msgs.lastElementChild.innerHTML = marked.parse(text);
    msgs.scrollTop = msgs.scrollHeight;
  } catch (e) {
    const msgs = $("#chatMessages");
    msgs.lastElementChild.innerHTML = "<p>错误：" + escHtml(e.message) + "</p>";
  }
}

function appendMsg(role, html) {
  const box = $("#chatMessages");
  const div = document.createElement("div");
  div.className = "chat-msg " + role;
  div.innerHTML = html;
  box.appendChild(div);
  box.scrollTop = box.scrollHeight;
}

// ======================================================================
//  5. UI 渲染
// ======================================================================
function showResults(rows, profile, fileName) {
  DATA_ROWS = rows;
  DATA_COLS = Object.keys(rows[0]);
  PROFILE = profile;
  SESSION_ID = fileName;

  // 信息条
  const missingTotal = profile.columns.reduce((s, c) => s + c.missing, 0);
  const numCols = profile.columns.filter((c) => c.type === "numeric").length;
  const catCols = profile.columns.filter((c) => c.type === "categorical").length;
  $("#infoBar").innerHTML =
    '<span class="badge">📄 ' + escHtml(fileName) + "</span>" +
    '<span class="badge">📏 ' + profile.rowCount + " 行 × " + profile.colCount + " 列</span>" +
    '<span class="badge">🔢 ' + numCols + " 数值列</span>" +
    '<span class="badge">🏷️ ' + catCols + " 分类列</span>" +
    '<span class="badge">⚠️ ' + missingTotal + " 缺失值</span>";

  // 统计卡片
  renderStats(profile);

  // 列详情表
  renderColTable(profile);

  // 数据预览表
  renderPreview(rows);

  // 图表
  CHARTS_META = buildCharts(rows, profile);
  renderCharts(CHARTS_META);

  // 切换可见性
  $("#uploadSection").hidden = true;
  $("#loadingSection").hidden = true;
  $("#resultsSection").hidden = false;

  // 重置聊天
  $("#chatMessages").innerHTML = '<div class="chat-empty">针对这份数据提问，AI 会结合数据上下文回答你</div>';
  $("#aiContent").innerHTML =
    '<div class="ai-placeholder"><p>点击下方按钮，AI 将自动分析数据并给出结论</p>' +
    '<button class="btn btn-primary" id="btnRunAi">开始 AI 分析</button></div>';
  $("#btnRunAi").addEventListener("click", runAIAnalysis);
}

function renderStats(profile) {
  const grid = $("#statsGrid");
  const numCols = profile.columns.filter((c) => c.type === "numeric");
  let html = "";
  // 总体
  html += statCard("总行数", profile.rowCount.toLocaleString());
  html += statCard("总列数", profile.colCount);
  // 每个数值列的关键指标
  for (const c of numCols.slice(0, 6)) {
    html += statCard(c.name + " 均值", c.stats.mean);
  }
  grid.innerHTML = html;
}

function statCard(label, value) {
  return '<div class="stat-card"><div class="stat-label">' + escHtml(label) +
    '</div><div class="stat-value">' + escHtml(String(value)) + "</div></div>";
}

function renderColTable(profile) {
  const tbody = $("#colTableBody");
  tbody.innerHTML = profile.columns.map((c) => {
    const typeCls = c.type === "numeric" ? "type-num" : "type-cat";
    const typeLabel = c.type === "numeric" ? "数值" : "分类";
    let summary = "";
    if (c.stats) {
      summary = "均值 " + c.stats.mean + " | 标准差 " + c.stats.std + " | 范围 [" + c.stats.min + ", " + c.stats.max + "]";
    } else if (c.topValues) {
      summary = "TOP: " + c.topValues.slice(0, 3).map((v) => v[0] + "(" + v[1] + ")").join(", ");
    }
    const missCls = c.missing > 0 ? "missing-warn" : "";
    return "<tr><td><b>" + escHtml(c.name) + "</b></td>" +
      '<td class="' + typeCls + '">' + typeLabel + "</td>" +
      "<td>" + (c.total - c.missing) + "</td>" +
      '<td class="' + missCls + '">' + c.missing + " (" + c.missPct + "%)</td>" +
      "<td>" + c.unique + "</td>" +
      "<td>" + escHtml(summary) + "</td></tr>";
  }).join("");
}

function renderPreview(rows) {
  const head = $("#previewHead");
  const body = $("#previewBody");
  const cols = Object.keys(rows[0]);
  head.innerHTML = "<tr>" + cols.map((c) => "<th>" + escHtml(c) + "</th>").join("") + "</tr>";
  body.innerHTML = rows.slice(0, 20).map((r) =>
    "<tr>" + cols.map((c) => "<td>" + escHtml(String(r[c] ?? "")) + "</td>").join("") + "</tr>"
  ).join("");
}

function escHtml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// ======================================================================
//  6. 事件绑定
// ======================================================================
function init() {
  // --- 设置弹窗 ---
  $("#btnSettings").addEventListener("click", () => {
    $("#inputApiKey").value  = CFG.apiKey();
    $("#inputBaseUrl").value = CFG.baseUrl();
    $("#inputModel").value   = CFG.model();
    $("#settingsModal").classList.add("open");
  });
  $("#btnCloseSettings").addEventListener("click", () => $("#settingsModal").classList.remove("open"));
  $("#settingsModal").addEventListener("click", (e) => { if (e.target === e.currentTarget) e.currentTarget.classList.remove("open"); });

  $("#btnSaveSettings").addEventListener("click", () => {
    CFG.set("api_key",  $("#inputApiKey").value.trim());
    CFG.set("base_url", $("#inputBaseUrl").value.trim());
    CFG.set("model",    $("#inputModel").value.trim());
    $("#settingsModal").classList.remove("open");
  });

  $("#btnTestApi").addEventListener("click", async () => {
    const btn = $("#btnTestApi");
    btn.textContent = "测试中...";
    btn.disabled = true;
    try {
      const base = ($("#inputBaseUrl").value || "https://api.openai.com/v1").replace(/\/+$/, "");
      const resp = await fetch(base + "/models", {
        headers: { Authorization: "Bearer " + ($("#inputApiKey").value || "test") },
      });
      if (resp.ok) { btn.textContent = "连接成功 ✓"; btn.style.color = "#10b981"; }
      else { btn.textContent = "失败 (" + resp.status + ")"; btn.style.color = "#ef4444"; }
    } catch (e) {
      btn.textContent = "网络错误"; btn.style.color = "#ef4444";
    }
    setTimeout(() => { btn.textContent = "测试连接"; btn.style.color = ""; btn.disabled = false; }, 2500);
  });

  // --- 文件上传 ---
  const dropzone  = $("#dropzone");
  const fileInput = $("#fileInput");

  dropzone.addEventListener("click", () => fileInput.click());
  dropzone.addEventListener("dragover", (e) => { e.preventDefault(); dropzone.classList.add("dragover"); });
  dropzone.addEventListener("dragleave", () => dropzone.classList.remove("dragover"));
  dropzone.addEventListener("drop", (e) => {
    e.preventDefault();
    dropzone.classList.remove("dragover");
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  });
  fileInput.addEventListener("change", () => { if (fileInput.files[0]) handleFile(fileInput.files[0]); });

  // --- 示例数据 ---
  $("#btnLoadDemo").addEventListener("click", loadDemo);

  // --- 标签切换 ---
  $$(".tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      $$(".tab").forEach((t) => t.classList.remove("active"));
      $$(".tab-panel").forEach((p) => p.classList.remove("active"));
      tab.classList.add("active");
      $("#panel" + capitalize(tab.dataset.tab)).classList.add("active");
    });
  });

  // --- AI 分析 ---
  $("#btnRunAi").addEventListener("click", runAIAnalysis);

  // --- 聊天 ---
  $("#btnSend").addEventListener("click", sendChat);
  $("#chatInput").addEventListener("keydown", (e) => { if (e.key === "Enter") sendChat(); });
}

function capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

async function handleFile(file) {
  $("#uploadSection").hidden = true;
  $("#resultsSection").hidden = true;
  $("#loadingSection").hidden = false;
  $("#loadingText").textContent = "正在解析 " + file.name + "...";
  try {
    const rows = await parseFile(file);
    $("#loadingText").textContent = "正在分析数据结构...";
    await new Promise((r) => setTimeout(r, 120));
    const profile = analyze(rows);
    if (!profile) throw new Error("数据为空，请检查文件内容");
    showResults(rows, profile, file.name);
  } catch (e) {
    $("#loadingSection").hidden = true;
    $("#uploadSection").hidden = false;
    alert("文件处理失败：" + e.message);
  }
}

async function loadDemo() {
  try {
    let text;
    if (window.electronAPI) {
      text = window.electronAPI.readFile("sample/demo.csv");
    } else {
      const resp = await fetch("sample/demo.csv");
      text = await resp.text();
    }
    const rows = Papa.parse(text, { header: true, skipEmptyLines: true }).data;
    const profile = analyze(rows);
    showResults(rows, profile, "demo.csv");
  } catch (e) {
    alert("加载示例数据失败：" + e.message);
  }
}

// ---------- 启动 ----------
document.addEventListener("DOMContentLoaded", init);
})();

