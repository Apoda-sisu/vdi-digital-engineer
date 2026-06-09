#!/usr/bin/env node
/**
 * VDI Knowledge HTTP Gateway
 * ===========================
 * 将 MCP stdio 服务包装为 HTTP REST API，供 Docker 部署使用。
 *
 * 端点:
 *   GET  /health                    - 健康检查
 *   POST /api/search                - 知识库搜索
 *   POST /api/citation              - 精确条文获取
 *   POST /api/entity-lookup         - 实体查找
 *   POST /api/cross-refs            - 跨引用解析
 *   POST /api/list-standards        - 列出规范
 *   POST /api/formulas/search       - 公式搜索
 *   POST /api/formulas/get          - 获取公式
 *   POST /api/formulas/calculate    - 执行计算
 *   POST /api/formulas/composite    - 组合计算
 */

import express from "express";
import cors from "cors";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;

// ============================================================
// 内联核心逻辑（复用 server-v2.mjs 的关键函数）
// ============================================================
const DEFAULT_INDEX = path.resolve(__dirname, "../../data/knowledge-clauses-v2.json");
const ENTITY_INDEX = path.resolve(__dirname, "../../data/indices/entity-index.json");
const CROSS_REFS = path.resolve(__dirname, "../../data/indices/cross-refs.json");
const DOMAIN_DICT = path.resolve(__dirname, "../../data/domain-dictionary.yaml");
const FORMULAS_DIR = path.resolve(__dirname, "../../data/formulas");
const FORMULA_INDEX = path.resolve(__dirname, "../../data/formulas/index.json");
const FORMULA_KW_INDEX = path.resolve(__dirname, "../../data/formulas-indices/formula-keyword-index.json");
const FORMULA_PARAM_INDEX = path.resolve(__dirname, "../../data/formulas-indices/formula-param-index.json");

let clauses = [];
let entityIndex = {};
let crossRefGraph = { outgoing: {}, incoming: {} };
let domainDict = {};
let formulaIndex = null;
let formulaCache = {};
let formulaKeywordIndex = {};
let formulaParamIndex = {};
let formulaTables = null;
let formulaFileMap = {};

function loadAllIndices() {
  // 知识库
  if (fs.existsSync(DEFAULT_INDEX)) {
    const data = JSON.parse(fs.readFileSync(DEFAULT_INDEX, "utf8"));
    clauses = data.clauses || [];
    if (data.domain_dictionary) domainDict = data.domain_dictionary;
  }
  if (fs.existsSync(ENTITY_INDEX)) {
    entityIndex = JSON.parse(fs.readFileSync(ENTITY_INDEX, "utf8")).index || {};
  }
  if (fs.existsSync(CROSS_REFS)) {
    crossRefGraph = JSON.parse(fs.readFileSync(CROSS_REFS, "utf8")).graph || { outgoing: {}, incoming: {} };
  }
  console.error(`[http-gateway] 已加载 ${clauses.length} 条条款`);

  // 公式库
  if (fs.existsSync(FORMULA_INDEX)) {
    formulaIndex = JSON.parse(fs.readFileSync(FORMULA_INDEX, "utf8"));
  }
  if (fs.existsSync(FORMULA_KW_INDEX)) {
    formulaKeywordIndex = JSON.parse(fs.readFileSync(FORMULA_KW_INDEX, "utf8")).index || {};
  }
  if (fs.existsSync(FORMULA_PARAM_INDEX)) {
    formulaParamIndex = JSON.parse(fs.readFileSync(FORMULA_PARAM_INDEX, "utf8")).index || {};
  }
  const tablesPath = path.join(FORMULAS_DIR, "tables.json");
  if (fs.existsSync(tablesPath)) {
    formulaTables = JSON.parse(fs.readFileSync(tablesPath, "utf8"));
  }
  buildFormulaFileMap();
  console.error(`[http-gateway] 已加载 ${formulaIndex?.formulas?.length || 0} 条公式`);
}

function buildFormulaFileMap() {
  const disciplines = ["electrical", "hse", "instrument", "piping", "process", "water"];
  for (const disc of disciplines) {
    const discDir = path.join(FORMULAS_DIR, disc);
    if (!fs.existsSync(discDir)) continue;
    for (const file of fs.readdirSync(discDir).filter(f => f.endsWith(".json"))) {
      try {
        const data = JSON.parse(fs.readFileSync(path.join(discDir, file), "utf8"));
        const formulas = Array.isArray(data) ? data : (data.formulas || []);
        for (const f of formulas) {
          const fid = f.formula_id || f.id;
          if (fid) formulaFileMap[fid] = `${disc}/${file}`;
        }
      } catch { /* skip */ }
    }
  }
}

function loadFormulaDetail(formulaId) {
  if (formulaCache[formulaId]) return formulaCache[formulaId];
  const relPath = formulaFileMap[formulaId];
  if (!relPath) return null;
  const filePath = path.join(FORMULAS_DIR, relPath);
  if (!fs.existsSync(filePath)) return null;
  const fileData = JSON.parse(fs.readFileSync(filePath, "utf8"));
  const formulas = Array.isArray(fileData) ? fileData : (fileData.formulas || []);
  const formula = formulas.find(f => (f.formula_id || f.id) === formulaId);
  if (formula) formulaCache[formulaId] = formula;
  return formula || null;
}

function tokenize(text) {
  return [...new Set(text.replace(/[，。、；：！？《》""''（）\s]+/g, " ").split(/\s+/).filter(t => t.length > 0))];
}

function searchClauses(query, discipline, limit = 5) {
  const terms = new Set(tokenize(query).map(t => t.toLowerCase()));
  const scored = [];
  for (const c of clauses) {
    if (discipline && c.discipline && c.discipline !== discipline) continue;
    const tokens = (c.tokens || []).join(" ").toLowerCase();
    const content = (c.content || "").toLowerCase();
    const keywords = (c.keywords || []).join(" ").toLowerCase();
    let score = 0;
    for (const t of terms) {
      if (tokens.includes(t)) score += 1;
      if (content.includes(t)) score += 0.5;
      if (keywords.includes(t)) score += 2;
    }
    if (score > 0) scored.push({ ...c, score });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map(r => ({
    source_id: r.source_id, clause: r.clause, content: r.content,
    mandatory: r.mandatory, discipline: r.discipline,
    evidence_tag: `[${r.source_id} §${r.clause}]`,
  }));
}

// ============================================================
// Express 应用
// ============================================================
const app = express();
app.use(cors());
app.use(express.json({ limit: "10mb" }));

// 根路径 - API 文档
app.get("/", (req, res) => {
  res.json({
    service: "vdi-knowledge",
    version: "2.0.0",
    description: "VDI 知识库服务",
    endpoints: {
      "GET  /health": "健康检查",
      "POST /api/search": "知识库搜索 (body: {query, discipline?, limit?})",
      "POST /api/citation": "精确条文获取 (body: {source_id, clause})",
      "POST /api/formulas/search": "公式搜索 (body: {query, discipline?, limit?})",
      "POST /api/formulas/get": "获取公式详情 (body: {formula_id})",
      "POST /api/formulas/calculate": "执行计算 (body: {formula_id, inputs})",
      "POST /api/list-standards": "列出规范 (body: {discipline?})",
    },
  });
});

// 健康检查
app.get("/health", (req, res) => {
  res.json({
    status: "healthy",
    service: "vdi-knowledge",
    version: "2.0.0",
    clauses: clauses.length,
    formulas: formulaIndex?.formulas?.length || 0,
    timestamp: new Date().toISOString(),
  });
});

// 知识库搜索
app.post("/api/search", (req, res) => {
  const { query, discipline, limit } = req.body;
  if (!query) return res.status(400).json({ error: "query is required" });
  const results = searchClauses(query, discipline, limit);
  res.json({ query, count: results.length, results });
});

// 精确条文获取
app.post("/api/citation", (req, res) => {
  const { source_id, clause } = req.body;
  if (!source_id || !clause) return res.status(400).json({ error: "source_id and clause required" });
  const hit = clauses.find(c => c.source_id === source_id && c.clause === clause);
  if (!hit) return res.status(404).json({ error: "not_found" });
  res.json(hit);
});

// 公式搜索
app.post("/api/formulas/search", (req, res) => {
  const { query, discipline, limit } = req.body;
  if (!query) return res.status(400).json({ error: "query is required" });
  const q = query.trim().toLowerCase();
  const kwHits = new Set();
  const tokens = q.split(/[\s,，、]+/).filter(t => t.length > 0);
  for (const token of tokens) {
    if (formulaKeywordIndex[token]) formulaKeywordIndex[token].forEach(id => kwHits.add(id));
    for (const [kw, ids] of Object.entries(formulaKeywordIndex)) {
      if (kw.includes(token) || token.includes(kw)) ids.forEach(id => kwHits.add(id));
    }
  }
  let candidates = formulaIndex?.formulas || [];
  if (kwHits.size > 0) candidates = candidates.filter(f => kwHits.has(f.formula_id));
  if (discipline) candidates = candidates.filter(f => f.discipline === discipline);
  const results = candidates.slice(0, limit || 5).map(f => ({
    formula_id: f.formula_id, name: f.name, discipline: f.discipline,
    category: f.category, type: f.type,
  }));
  res.json({ query, count: results.length, results });
});

// 获取公式详情
app.post("/api/formulas/get", (req, res) => {
  const { formula_id } = req.body;
  if (!formula_id) return res.status(400).json({ error: "formula_id required" });
  const formula = loadFormulaDetail(formula_id);
  if (!formula) return res.status(404).json({ error: "not_found", formula_id });
  res.json(formula);
});

// 执行计算
app.post("/api/formulas/calculate", (req, res) => {
  const { formula_id, inputs, input_units } = req.body;
  if (!formula_id || !inputs) return res.status(400).json({ error: "formula_id and inputs required" });
  try {
    const formula = loadFormulaDetail(formula_id);
    if (!formula) return res.status(404).json({ error: "not_found", formula_id });
    if (!formula.equation_ast) return res.status(400).json({ error: "formula has no AST" });
    // 简单 AST 求值
    const result = evaluateAST(formula.equation_ast, inputs);
    res.json({ formula_id, inputs, result, equation: formula.equation_text });
  } catch (err) {
    res.status(400).json({ error: "calculation_failed", message: err.message });
  }
});

function evaluateAST(node, vars) {
  if (!node || typeof node !== "object") throw new Error("Invalid AST");
  if (node.var !== undefined) { const v = vars[node.var]; if (v === undefined) throw new Error(`Missing: ${node.var}`); return v; }
  if (node.const !== undefined) return node.const;
  if (node.op === "div" && node.num !== undefined && node.den !== undefined) {
    const d = evaluateAST(node.den, vars); if (d === 0) throw new Error("Div/0"); return evaluateAST(node.num, vars) / d;
  }
  if (node.op && node.lhs !== undefined && node.rhs !== undefined) {
    const l = evaluateAST(node.lhs, vars), r = evaluateAST(node.rhs, vars);
    switch (node.op) { case "add": return l + r; case "sub": return l - r; case "mul": return l * r; case "div": if (r === 0) throw new Error("Div/0"); return l / r; case "pow": return Math.pow(l, r); default: throw new Error(`Unknown op: ${node.op}`); }
  }
  if (node.op && node.args) {
    const ev = node.args.map(a => evaluateAST(a, vars));
    switch (node.op) { case "add": case "+": return ev.reduce((s, v) => s + v, 0); case "mul": case "*": return ev.reduce((p, v) => p * v, 1); case "div": case "/": if (ev[1] === 0) throw new Error("Div/0"); return ev[0] / ev[1]; case "pow": case "^": return Math.pow(ev[0], ev[1]); default: throw new Error(`Unknown op: ${node.op}`); }
  }
  if (node.arg !== undefined && node.op) {
    const a = evaluateAST(node.arg, vars);
    switch (node.op) { case "log10": return Math.log10(a); case "log": case "ln": return Math.log(a); case "sqrt": return Math.sqrt(a); default: throw new Error(`Unknown unary: ${node.op}`); }
  }
  if (node.base !== undefined) {
    const b = evaluateAST(node.base, vars);
    if (node.exp !== undefined) return Math.pow(b, node.exp);
    switch (node.op) { case "sqrt": return Math.sqrt(b); case "log": return Math.log(b); default: throw new Error(`Unknown base op: ${node.op}`); }
  }
  throw new Error(`Unrecognized AST: ${JSON.stringify(Object.keys(node))}`);
}

// 列出规范
app.post("/api/list-standards", (req, res) => {
  const { discipline } = req.body || {};
  const map = {};
  for (const c of clauses) {
    if (discipline && c.discipline !== discipline) continue;
    if (!map[c.source_id]) map[c.source_id] = { source_id: c.source_id, discipline: c.discipline, count: 0 };
    map[c.source_id].count++;
  }
  res.json({ standards: Object.values(map).sort((a, b) => b.count - a.count) });
});

// 启动
loadAllIndices();
app.listen(PORT, () => {
  console.log(`[http-gateway] VDI Knowledge 服务已启动: http://localhost:${PORT}`);
});
