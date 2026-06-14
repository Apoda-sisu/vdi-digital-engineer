#!/usr/bin/env node
/**
 * VDI 知识库 MCP V2 — 四层漏斗检索架构
 * ==========================================
 * 架构升级内容：
 *   1. 查询解析+路由（规范号精确匹配 / 概念查询 / 数值查询）
 *   2. 结构过滤（实体索引精确匹配 + 专业+强制性别过滤）
 *   3. 混合检索（BM25关键词 + 领域词典扩展 + 评分加权）
 *   4. 精排+跨引用解析（强制性别加权 + 跨引用二跳检索）
 *
 * 工具：
 *   - vdi_search_knowledge   (升级版混合检索)
 *   - vdi_get_citation       (精确条文获取)
 *   - vdi_search_by_entity   (新增：规范号+条款号精确查找)
 *   - vdi_resolve_cross_refs (新增：跨引用解析)
 *   - vdi_list_standards     (新增：列出知识库中的规范清单)
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { resolveKnowledgeDiscipline } from "../../config/cfihos-discipline-resolve.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ============================================================
// 配置
// ============================================================
const DEFAULT_INDEX = path.resolve(__dirname, "../../data/knowledge-clauses-v2.json");
const ENTITY_INDEX = path.resolve(__dirname, "../../data/indices/entity-index.json");
const CROSS_REFS = path.resolve(__dirname, "../../data/indices/cross-refs.json");
const DOMAIN_DICT = path.resolve(__dirname, "../../data/domain-dictionary.yaml");
const FORMULAS_DIR = path.resolve(__dirname, "../../data/formulas");
const FORMULA_INDEX = path.resolve(__dirname, "../../data/formulas/index.json");
const FORMULA_KW_INDEX = path.resolve(__dirname, "../../data/formulas-indices/formula-keyword-index.json");
const FORMULA_PARAM_INDEX = path.resolve(__dirname, "../../data/formulas-indices/formula-param-index.json");

// ============================================================
// 索引加载（启动时一次性加载到内存）
// ============================================================
let clauses = [];
let entityIndex = {};
let crossRefGraph = { outgoing: {}, incoming: {} };
let domainDict = {};

// 公式库数据
let formulaIndex = null;
let formulaCache = {};       // formula_id → full formula object
let formulaKeywordIndex = {};
let formulaParamIndex = {};
let formulaTables = null;
let formulaFileMap = {};     // formula_id → 文件相对路径

function loadAllIndices() {
  const indexPath = process.env.VDI_KNOWLEDGE_INDEX || DEFAULT_INDEX;

  // 加载 V2 增强索引
  if (fs.existsSync(indexPath)) {
    const raw = fs.readFileSync(indexPath, "utf8");
    const data = JSON.parse(raw);
    clauses = data.clauses || [];
    if (data.domain_dictionary) {
      domainDict = data.domain_dictionary;
    }
  } else {
    // 回退到 V1 索引
    const v1Path = path.resolve(__dirname, "../../data/knowledge-clauses.json");
    if (fs.existsSync(v1Path)) {
      const raw = fs.readFileSync(v1Path, "utf8");
      const data = JSON.parse(raw);
      clauses = data.clauses || [];
      console.error("[vdi-knowledge] 使用 V1 索引（建议运行 build_enhanced_index.py 升级到 V2）");
    }
  }

  // 加载实体索引
  if (fs.existsSync(ENTITY_INDEX)) {
    const raw = fs.readFileSync(ENTITY_INDEX, "utf8");
    const data = JSON.parse(raw);
    entityIndex = data.index || {};
  }

  // 加载跨引用图
  if (fs.existsSync(CROSS_REFS)) {
    const raw = fs.readFileSync(CROSS_REFS, "utf8");
    const data = JSON.parse(raw);
    crossRefGraph = data.graph || { outgoing: {}, incoming: {} };
  }

  console.error(`[vdi-knowledge V2] 已加载 ${clauses.length} 条条款, ${Object.keys(entityIndex).length} 个实体索引键`);

  // 加载公式库
  loadFormulas();
}

function loadFormulas() {
  // 加载公式主索引
  if (fs.existsSync(FORMULA_INDEX)) {
    formulaIndex = JSON.parse(fs.readFileSync(FORMULA_INDEX, "utf8"));
    console.error(`[vdi-knowledge V2] 已加载 ${formulaIndex.formulas?.length || 0} 条公式, ${formulaIndex.tables?.length || 0} 个参数表`);
  }

  // 加载关键词索引（数据在 .index 键下）
  if (fs.existsSync(FORMULA_KW_INDEX)) {
    const raw = JSON.parse(fs.readFileSync(FORMULA_KW_INDEX, "utf8"));
    formulaKeywordIndex = raw.index || raw;
  }

  // 加载参数索引（数据在 .index 键下）
  if (fs.existsSync(FORMULA_PARAM_INDEX)) {
    const raw = JSON.parse(fs.readFileSync(FORMULA_PARAM_INDEX, "utf8"));
    formulaParamIndex = raw.index || raw;
  }

  // 加载参数表
  const tablesPath = path.join(FORMULAS_DIR, "tables.json");
  if (fs.existsSync(tablesPath)) {
    formulaTables = JSON.parse(fs.readFileSync(tablesPath, "utf8"));
  }

  // 构建 formulaFileMap: formula_id → 文件相对路径
  // 扫描所有专业子目录下的公式文件
  buildFormulaFileMap();
}

function buildFormulaFileMap() {
  const disciplines = ["electrical", "hs", "instrument", "piping", "process", "water"];
  for (const disc of disciplines) {
    const discDir = path.join(FORMULAS_DIR, disc);
    if (!fs.existsSync(discDir)) continue;
    const files = fs.readdirSync(discDir).filter(f => f.endsWith(".json"));
    for (const file of files) {
      const filePath = path.join(discDir, file);
      try {
        const fileData = JSON.parse(fs.readFileSync(filePath, "utf8"));
        const formulas = Array.isArray(fileData) ? fileData : (fileData.formulas || []);
        const relPath = `${disc}/${file}`;
        for (const f of formulas) {
          const fid = f.formula_id || f.id;
          if (fid) formulaFileMap[fid] = relPath;
        }
      } catch { /* skip broken files */ }
    }
  }
  console.error(`[vdi-knowledge V2] 构建公式文件映射: ${Object.keys(formulaFileMap).length} 个公式`);
}

const DISC_CODE_TO_KNOWLEDGE_SLUG = {
  WA: "CI",
  PR: "PX",
  PI: "MP",
  EL: "EA",
  IN: "IN",
  HS: "HS",
  EQ: "MX",
  FI: "HX",
};

function normalizeKnowledgeDiscipline(raw) {
  if (!raw) return raw;
  const cfihos = resolveKnowledgeDiscipline(raw);
  return cfihos;
}

// 加载单个公式完整数据（懒加载缓存）
function loadFormulaDetail(formulaId) {
  if (formulaCache[formulaId]) return formulaCache[formulaId];

  // 优先从 formulaFileMap 查找文件路径
  let filePath = null;
  const relPath = formulaFileMap[formulaId];
  if (relPath) {
    filePath = path.join(FORMULAS_DIR, relPath);
  } else {
    // 回退：从索引找到文件路径（兼容旧格式）
    const entry = formulaIndex?.formulas?.find(f => f.formula_id === formulaId);
    if (entry && entry.file) {
      filePath = path.join(FORMULAS_DIR, entry.file);
    }
  }

  if (!filePath || !fs.existsSync(filePath)) return null;

  const fileData = JSON.parse(fs.readFileSync(filePath, "utf8"));
  const formulas = Array.isArray(fileData) ? fileData : (fileData.formulas || []);
  const formula = formulas.find(
    (f) => (f.formula_id || f.id) === formulaId || f.vdi_formula_id === formulaId
  );
  if (formula) {
    formulaCache[formulaId] = formula;
  }
  return formula || null;
}

// ============================================================
// 第一层：查询解析 + 路由
// ============================================================
function parseQuery(query) {
  const parsed = {
    raw: query,
    standardNumbers: [],    // 提取到的规范号
    clauseNumbers: [],      // 提取到的条款号
    disciplines: [],        // 推断的专业
    keywords: [],           // 核心关键词
    queryType: "concept",   // exact_lookup | numeric_lookup | concept_search
    isExactLookup: false,
    isNumericQuery: false,
    isMandatoryQuery: false,
  };

  const q = query.trim();

  // 检测空查询
  if (!q) {
    parsed.queryType = "concept";
    return parsed;
  }

  // 提取规范号
  const stdPatterns = [
    /(GB\s*[/T]*\s*\d+(?:\s*[-–—]\s*\d{4})?)/gi,
    /(SH\/T\s*\d+(?:\s*[-–—]\s*\d{4})?)/gi,
    /(HG\/T\s*\d+(?:\s*[-–—]\s*\d{4})?)/gi,
    /(安全生产法|消防法|特种设备安全法|环境保护法|职业病防治法)/g,
  ];
  for (const pat of stdPatterns) {
    const matches = q.matchAll(pat);
    for (const m of matches) {
      const normalized = normalizeStandardId(m[0]);
      if (!parsed.standardNumbers.includes(normalized)) {
        parsed.standardNumbers.push(normalized);
      }
    }
  }

  // 提取条款号
  const clausePat = /第[\d一二三四五六七八九十百]+条|(\d+(?:\.\d+)*)/g;
  const clauseMatches = q.matchAll(clausePat);
  for (const m of clauseMatches) {
    const cn = m[0];
    if (!parsed.clauseNumbers.includes(cn)) {
      parsed.clauseNumbers.push(cn);
    }
  }

  // 判断查询类型
  if (parsed.standardNumbers.length > 0 && parsed.clauseNumbers.length > 0) {
    parsed.queryType = "exact_lookup";
    parsed.isExactLookup = true;
  } else if (/[\d.]+\s*(mm|cm|m|L\/s|m\/s|m³|MPa|kPa|℃|°)/.test(q) ||
             /最小|最大|不小于|不大于|范围|多少/.test(q)) {
    parsed.queryType = "numeric_lookup";
    parsed.isNumericQuery = true;
  }

  // 检测强制性查询
  if (/必须|强制|严禁|不得|应当/.test(q)) {
    parsed.isMandatoryQuery = true;
  }

  // 推断专业
  const discAliases = domainDict?.discipline_aliases || {};
  for (const [disc, aliases] of Object.entries(discAliases)) {
    for (const alias of aliases) {
      if (q.includes(alias) && !parsed.disciplines.includes(disc)) {
        parsed.disciplines.push(disc);
      }
    }
  }

  // 提取关键词
  parsed.keywords = tokenize(q);

  return parsed;
}

function normalizeStandardId(raw) {
  let s = raw.trim();
  // 字母和数字之间加空格
  s = s.replace(/(GB|SH|HG)([/T]*)\s*[-–—]*\s*(\d+)/gi, "$1$2 $3");
  // 统一大小写
  s = s.replace(/gb/gi, "GB").replace(/sh\/t/gi, "SH/T").replace(/hg\/t/gi, "HG/T");
  return s;
}

// ============================================================
// 第二层：结构过滤（实体索引精确匹配）
// ============================================================
function exactEntityLookup(parsed) {
  const results = [];

  for (const std of parsed.standardNumbers) {
    for (const clauseNum of parsed.clauseNumbers) {
      // 直接查找
      const key = `${std}|${clauseNum}`;
      if (entityIndex[key]) {
        for (const clauseId of entityIndex[key]) {
          const clause = clauses.find(c => c.clause_id === clauseId);
          if (clause) {
            results.push({ ...clause, matchType: "exact", matchScore: 1.0 });
          }
        }
      }

      // 模糊查找（别名）
      const aliases = domainDict?.standard_aliases?.[std] || [];
      for (const alias of aliases) {
        const aliasKey = `${alias}|${clauseNum}`;
        if (entityIndex[aliasKey]) {
          for (const clauseId of entityIndex[aliasKey]) {
            const clause = clauses.find(c => c.clause_id === clauseId);
            if (clause && !results.find(r => r.clause_id === clauseId)) {
              results.push({ ...clause, matchType: "alias_exact", matchScore: 0.95 });
            }
          }
        }
      }
    }
  }

  return results;
}

// ============================================================
// 第三层：混合检索（BM25关键词 + 领域词典扩展）
// ============================================================
function tokenize(text) {
  const cleaned = text.replace(/[，。、；：！？《》""''（）\s]+/g, " ");
  return [...new Set(
    cleaned.split(/\s+/).filter(t => t.length > 0)
  )];
}

function expandQueryWithDictionary(keywords) {
  const expanded = [...keywords];
  const synonyms = domainDict?.synonyms || {};

  for (const kw of keywords) {
    // 同义词扩展
    for (const [canonical, aliases] of Object.entries(synonyms)) {
      if (canonical.includes(kw) || kw.includes(canonical) ||
          aliases.some(a => a.includes(kw) || kw.includes(a))) {
        if (!expanded.includes(canonical)) expanded.push(canonical);
        for (const a of aliases) {
          if (!expanded.includes(a)) expanded.push(a);
        }
      }
    }
    // 缩写扩展
    const abbr = domainDict?.abbreviations || {};
    const upperKw = kw.toUpperCase();
    if (abbr[upperKw] && !expanded.includes(abbr[upperKw])) {
      expanded.push(abbr[upperKw]);
    }
  }

  return [...new Set(expanded)];
}

function scoreClauseBM25(clause, queryTerms, avgDocLength, totalDocs) {
  if (!queryTerms.size) return 0;
  const tokens = clause.tokens || [];
  const tokenStr = tokens.join(" ");
  const content = clause.content || "";
  const keywords = (clause.keywords || []).join(" ");
  const fullText = `${tokenStr} ${content} ${keywords}`;

  const docLength = tokens.length || 1;
  const k1 = 1.2;
  const b = 0.75;

  let score = 0;
  for (const term of queryTerms) {
    // 词频
    const regex = new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    const matches = fullText.match(regex);
    const tf = matches ? matches.length : 0;
    if (tf === 0) continue;

    // 逆文档频率
    const docsWithTerm = clauses.filter(c => {
      const ct = (c.tokens || []).join(" ");
      return ct.toLowerCase().includes(term.toLowerCase());
    }).length;
    const idf = Math.log((totalDocs - docsWithTerm + 0.5) / (docsWithTerm + 0.5) + 1);

    // BM25 公式
    const numerator = tf * (k1 + 1);
    const denominator = tf + k1 * (1 - b + b * (docLength / avgDocLength));
    score += idf * (numerator / denominator);
  }

  // 关键词命中加权
  const kwLower = keywords.toLowerCase();
  for (const term of queryTerms) {
    if (kwLower.includes(term.toLowerCase())) {
      score += 0.5;
    }
  }

  // 条款号匹配加权
  const clauseNum = clause.clause || "";
  for (const term of queryTerms) {
    if (clauseNum === term || clauseNum.includes(term)) {
      score += 1.0;
    }
  }

  return score;
}

function hybridSearch(parsed, discipline, sourceType, limit) {
  const expandedKeywords = expandQueryWithDictionary(parsed.keywords);
  const queryTerms = new Set(expandedKeywords.map(k => k.toLowerCase()));

  const avgDocLength = clauses.reduce((s, c) => s + (c.tokens || []).length, 0) / Math.max(1, clauses.length);
  const totalDocs = clauses.length;

  // 评分
  const scored = [];
  for (const c of clauses) {
    // 专业过滤
    if (discipline && c.discipline && c.discipline !== discipline) continue;
    // 来源类型过滤
    if (sourceType && c.source_type !== sourceType) continue;

    const bm25Score = scoreClauseBM25(c, queryTerms, avgDocLength, totalDocs);
    if (bm25Score <= 0) continue;

    // 强制性别加权
    const mandatoryBoost = (parsed.isMandatoryQuery && c.mandatory) ? 1.3 : 1.0;

    // 精确查找加权
    const exactBoost = parsed.isExactLookup ? 1.5 : 1.0;

    const finalScore = bm25Score * mandatoryBoost * exactBoost;

    scored.push({
      clause_id: c.clause_id,
      source_type: c.source_type,
      source_id: c.source_id,
      version: c.version,
      clause: c.clause,
      effective_date: c.effective_date,
      discipline: c.discipline,
      excerpt: c.content,
      mandatory: c.mandatory,
      hierarchy: c.hierarchy,
      outgoing_refs: c.outgoing_refs,
      score: finalScore,
      bm25Score,
      mandatoryBoost,
    });
  }

  // 排序 + 去重 + 截断
  scored.sort((a, b) => b.score - a.score);

  const seen = new Set();
  const deduped = [];
  for (const item of scored) {
    const key = `${item.source_id}|${item.clause}`;
    if (!seen.has(key)) {
      seen.add(key);
      deduped.push(item);
    }
  }

  return deduped.slice(0, limit);
}

// ============================================================
// 第四层：精排 + 跨引用解析
// ============================================================
function resolveCrossRefs(clauseId, depth = 1) {
  if (depth <= 0) return [];
  const refs = crossRefGraph.outgoing?.[clauseId] || [];
  const resolved = [];

  for (const ref of refs) {
    const targetStd = ref.target_standard || ref.target;
    // 查找被引用规范的条款
    const matched = clauses.filter(c => c.source_id === targetStd);

    // 也查 partincoming 引用
    const incoming = crossRefGraph.incoming?.[targetStd] || [];

    resolved.push({
      target_standard: targetStd,
      context: ref.context || ref.raw_text || "",
      matched_clauses: matched.slice(0, 3).map(c => ({
        source_id: c.source_id,
        clause: c.clause,
        excerpt: (c.content || "").substring(0, 200),
      })),
      incoming_references: incoming.slice(0, 3).map(inc => ({
        from_source: inc.from_source,
        from_clause: inc.from_clause,
        context: inc.context || "",
      })),
    });
  }

  return resolved;
}

// ============================================================
// 工具实现
// ============================================================
const SearchSchema = z.object({
  query: z.string().describe("检索关键词，如：消防给水 消火栓流量 或 GB 50160 第5.2.3条"),
  discipline: z.string().optional().describe("学科码过滤：WA=给排水 / PR=工艺 / PI=管道 / IN=仪控 / EL=电气 / EQ=设备 / FI=消防 / HS=安全"),
  source_type: z.enum(["standard", "rule", "case"]).optional().describe("来源类型"),
  limit: z.number().int().min(1).max(20).optional().default(5),
  resolve_cross_refs: z.boolean().optional().default(true).describe("是否解析跨规范引用"),
});

const CitationSchema = z.object({
  source_id: z.string().describe("规范编号，如 GB 50974-2014"),
  clause: z.string().describe("条款号，如 7.2.1"),
  version: z.string().optional().describe("版本，可选"),
});

const EntityLookupSchema = z.object({
  source_id: z.string().describe("规范编号"),
  clause: z.string().optional().describe("条款号，不填则返回该规范所有条款"),
});

const CrossRefSchema = z.object({
  clause_id: z.string().describe("条款ID（从 search 结果中获取）"),
  depth: z.number().int().min(1).max(3).optional().default(1).describe("跨引用深度（1-3跳）"),
});

const ListStandardsSchema = z.object({
  discipline: z.string().optional().describe("按专业过滤"),
});

function formatSearchResults(results, withCrossRefs = false) {
  const formatted = results.map(r => ({
    source_id: r.source_id,
    clause: r.clause,
    version: r.version,
    discipline: r.discipline,
    source_type: r.source_type,
    mandatory: r.mandatory,
    excerpt: (r.excerpt || "").substring(0, 300),
    relevance: Math.min(0.99, Math.round(r.score * 100) / 100),
    hierarchy: r.hierarchy,
    evidence_tag: `[${r.source_id} §${r.clause}]`,
  }));

  if (withCrossRefs && formatted.length > 0) {
    const topResult = results[0];
    if (topResult.outgoing_refs && topResult.outgoing_refs.length > 0) {
      const crossRefs = resolveCrossRefs(topResult.clause_id, 1);
      if (crossRefs.length > 0) {
        formatted[0].cross_references = crossRefs;
      }
    }
  }

  return formatted;
}

// ============================================================
// 单公式计算（内部可复用）
// ============================================================
function executeSingleFormula(formulaId, inputs, inputUnits = {}) {
  const formula = loadFormulaDetail(formulaId);
  if (!formula) throw new Error(`公式 ${formulaId} 未找到`);
  if (!formula.equation_ast) throw new Error(`公式 ${formulaId} 缺少 AST`);

  // 单位转换
  const convertedInputs = {};
  const conversionLog = [];
  for (const v of formula.variables || []) {
    if (v.role !== "input") continue;
    let val = inputs[v.symbol];
    if (val === undefined) {
      if (v.default !== undefined) {
        val = v.default;
      } else {
        throw new Error(`缺少输入参数 ${v.symbol}（${v.name}，单位 ${v.unit}）`);
      }
    }
    const requestedUnit = inputUnits[v.symbol];
    if (requestedUnit && requestedUnit !== v.unit) {
      const alt = (v.alt_units || []).find(a => a.unit === requestedUnit);
      if (alt) {
        const originalVal = val;
        val = val * (alt.factor || 1) + (alt.offset || 0);
        conversionLog.push({ symbol: v.symbol, from: `${originalVal} ${requestedUnit}`, to: `${val} ${v.unit}` });
      }
    }
    if (v.constraints) {
      const c = v.constraints;
      if (c.min !== undefined && val < c.min) throw new Error(`${v.symbol}=${val} < min(${c.min})`);
      if (c.max !== undefined && val > c.max) throw new Error(`${v.symbol}=${val} > max(${c.max})`);
    }
    convertedInputs[v.symbol] = val;
  }

  const result = evaluateAST(formula.equation_ast, convertedInputs);
  const outputVar = (formula.variables || []).find(v => v.role === "output");
  const outputSymbol = outputVar?.symbol || "result";
  const outputUnit = outputVar?.unit || "";

  return {
    formula_id: formulaId,
    formula_name: formula.name,
    equation: formula.equation_text,
    inputs: convertedInputs,
    conversions: conversionLog,
    result: { [outputSymbol]: Math.round(result * 1e8) / 1e8, unit: outputUnit },
    result_value: result,
    result_symbol: outputSymbol,
    audit: {
      formula_id: formulaId,
      formula_name: formula.name,
      evidence_tag: `[${formula.source?.standard_id} §${formula.source?.clause}]`,
      source: `${formula.source?.standard_id} §${formula.source?.clause}`,
      precision: formula.precision || "精确",
      type: formula.type,
      confidence: formula.confidence,
    },
  };
}

// ============================================================
// AST 求值引擎
// ============================================================
function evaluateAST(node, vars) {
  if (!node || typeof node !== "object") {
    throw new Error(`Invalid AST node: ${JSON.stringify(node)}`);
  }

  // 变量引用
  if (node.var !== undefined) {
    const val = vars[node.var];
    if (val === undefined) throw new Error(`Missing variable: ${node.var}`);
    return val;
  }

  // 常量
  if (node.const !== undefined) {
    return node.const;
  }

  // div 节点（num / den 结构）
  if (node.op === "div" && node.num !== undefined && node.den !== undefined) {
    const num = evaluateAST(node.num, vars);
    const den = evaluateAST(node.den, vars);
    if (den === 0) throw new Error("Division by zero");
    return num / den;
  }

  // lhs/rhs 二元运算
  if (node.op && node.lhs !== undefined && node.rhs !== undefined) {
    const l = evaluateAST(node.lhs, vars);
    const r = evaluateAST(node.rhs, vars);
    switch (node.op) {
      case "add": return l + r;
      case "sub": return l - r;
      case "mul": return l * r;
      case "div": {
        if (r === 0) throw new Error("Division by zero");
        return l / r;
      }
      case "pow": return Math.pow(l, r);
      default: throw new Error(`Unknown lhs/rhs op: ${node.op}`);
    }
  }

  // 带 args 的多参数运算
  if (node.op && node.args) {
    const evaluated = node.args.map(a => evaluateAST(a, vars));
    switch (node.op) {
      case "add": case "+": return evaluated.reduce((s, v) => s + v, 0);
      case "sub": case "-": return evaluated[0] - (evaluated.length > 1 ? evaluated[1] : 0);
      case "mul": case "*": return evaluated.reduce((p, v) => p * v, 1);
      case "div": case "/": {
        if (evaluated[1] === 0) throw new Error("Division by zero");
        return evaluated[0] / evaluated[1];
      }
      case "pow": case "^": return Math.pow(evaluated[0], evaluated[1]);
      case "sum": return evaluated.reduce((s, v) => s + v, 0);
      default: throw new Error(`Unknown AST op: ${node.op}`);
    }
  }

  // 带 arg 的单参数函数（如 log10）
  if (node.arg !== undefined && node.op) {
    const arg = evaluateAST(node.arg, vars);
    switch (node.op) {
      case "log10": return Math.log10(arg);
      case "log": case "ln": return Math.log(arg);
      case "sqrt": return Math.sqrt(arg);
      case "abs": return Math.abs(arg);
      case "neg": return -arg;
      case "exp": return Math.exp(arg);
      default: throw new Error(`Unknown unary op: ${node.op}`);
    }
  }

  // 带 base/exp 的幂运算
  if (node.base !== undefined) {
    const base = evaluateAST(node.base, vars);
    if (node.exp !== undefined) {
      return Math.pow(base, node.exp);
    }
    // 单参数函数
    switch (node.op) {
      case "sqrt": return Math.sqrt(base);
      case "abs": return Math.abs(base);
      case "neg": return -base;
      case "log": case "ln": return Math.log(base);
      case "log10": return Math.log10(base);
      case "exp": return Math.exp(base);
      case "sin": return Math.sin(base);
      case "cos": return Math.cos(base);
      case "tan": return Math.tan(base);
      default: break;
    }
  }

  throw new Error(`Unrecognized AST structure: ${JSON.stringify(Object.keys(node))}`);
}

async function main() {
  loadAllIndices();

  const server = new Server(
    { name: "vdi-knowledge-v2", version: "2.0.0" },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: "vdi_search_knowledge",
        description: `【升级版】VDI 知识库混合检索。四层漏斗架构：查询解析→结构过滤→BM25混合检索→精排+跨引用解析。
支持：规范号精确查找、概念语义搜索、数值参数查询、专业过滤、强制性别加权、领域词典扩展、跨引用二跳检索。
返回：带 evidence_tag 的条文摘录 + cross_references（可选）。`,
        inputSchema: {
          type: "object",
          properties: {
            query: { type: "string", description: "检索查询，支持自然语言或规范号+条款号" },
            discipline: { type: "string", description: "专业过滤" },
            source_type: { type: "string", enum: ["standard", "rule", "case"] },
            limit: { type: "number", description: "返回条数（默认5，最大20）" },
            resolve_cross_refs: { type: "boolean", description: "是否解析跨引用（默认true）" },
          },
          required: ["query"],
        },
      },
      {
        name: "vdi_get_citation",
        description: "按规范号+条款号获取完整条文，用于证据链引用。",
        inputSchema: {
          type: "object",
          properties: {
            source_id: { type: "string" },
            clause: { type: "string" },
            version: { type: "string" },
          },
          required: ["source_id", "clause"],
        },
      },
      {
        name: "vdi_search_by_entity",
        description: "【新】精确实体查找：按规范号+条款号从实体索引中精确匹配条文。适合已知规范编号的场景。",
        inputSchema: {
          type: "object",
          properties: {
            source_id: { type: "string", description: "规范编号，如 GB 50160-2008" },
            clause: { type: "string", description: "条款号，如 5.2.1。不填则返回该规范的所有条款" },
          },
          required: ["source_id"],
        },
      },
      {
        name: "vdi_resolve_cross_refs",
        description: "【新】解析跨规范引用链。给定一个条款ID，追踪它引用了哪些其他规范，以及哪些规范引用了它。",
        inputSchema: {
          type: "object",
          properties: {
            clause_id: { type: "string", description: "条款ID（从 search 结果中获取）" },
            depth: { type: "number", description: "追踪深度（1-3，默认1）" },
          },
          required: ["clause_id"],
        },
      },
      {
        name: "vdi_list_standards",
        description: "【新】列出知识库中的规范清单，可按专业过滤。用于了解知识库覆盖范围。",
        inputSchema: {
          type: "object",
          properties: {
            discipline: { type: "string", description: "按专业过滤" },
          },
        },
      },
      // --- 公式库工具 ---
      {
        name: "vdi_search_formulas",
        description: "【公式库】按关键词、专业、类别搜索工程计算公式。返回匹配的公式摘要（ID、名称、输入输出参数）。",
        inputSchema: {
          type: "object",
          properties: {
            query: { type: "string", description: "搜索关键词，如：水头损失、水泵功率、消防水池" },
            discipline: { type: "string", description: "专业过滤（支持短代码或全名）：WA/water=给排水 PR/process=工艺 PI/piping=管道 EL/electrical=电气 IN/instrument=仪控 HS/hs=安全 EQ/equipment=设备 FI/fire=消防（hse 为兼容别名）" },
            category: { type: "string", description: "类别过滤，如：hydraulic、equipment、fire" },
            limit: { type: "number", description: "返回条数（默认5，最大20）" },
          },
          required: ["query"],
        },
      },
      {
        name: "vdi_get_formula",
        description: "【公式库】根据公式ID获取完整公式定义，包括变量、约束、AST、来源规范等。",
        inputSchema: {
          type: "object",
          properties: {
            formula_id: { type: "string", description: "公式ID，如 WA-HYD-001" },
          },
          required: ["formula_id"],
        },
      },
      {
        name: "vdi_calculate",
        description: "【公式库】执行单个工程计算。根据公式ID和输入参数，通过AST求值获得精确结果，自动执行单位转换和约束校验。返回带 evidence_tag 的审计记录。",
        inputSchema: {
          type: "object",
          properties: {
            formula_id: { type: "string", description: "公式ID，如 WA-HYD-001" },
            inputs: { type: "object", description: "输入参数键值对，如 {\"L\": 100, \"Q\": 0.05, \"C\": 130, \"D\": 0.2}" },
            input_units: { type: "object", description: "可选：非标准输入单位，如 {\"L\": \"km\"}，默认使用公式定义的标准单位" },
          },
          required: ["formula_id", "inputs"],
        },
      },
      {
        name: "vdi_calculate_composite",
        description: "【公式库】组合计算：按步骤串联多个公式，前序公式输出自动传递给后续公式作为输入。适用于需要多个公式联合计算的场景（如：沿程损失→局部损失→总水头→水泵功率）。每步可指定公式ID、输入来源（用户输入 或 前序步骤输出）。",
        inputSchema: {
          type: "object",
          properties: {
            pipeline: {
              type: "array",
              description: "计算步骤数组，按执行顺序排列",
              items: {
                type: "object",
                properties: {
                  step: { type: "number", description: "步骤序号（从1开始）" },
                  formula_id: { type: "string", description: "公式ID" },
                  inputs: { type: "object", description: "输入参数。值可以是数值，也可以是 {\"from_step\": N, \"symbol\": \"X\"} 引用前序步骤输出" },
                  input_units: { type: "object", description: "可选：输入单位覆盖" },
                },
                required: ["step", "formula_id", "inputs"],
              },
            },
            global_inputs: { type: "object", description: "全局共享输入参数（所有步骤可引用，避免重复指定）" },
          },
          required: ["pipeline"],
        },
      },
    ],
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    try {
      // --- vdi_search_knowledge ---
      if (name === "vdi_search_knowledge") {
        const input = SearchSchema.parse(args ?? {});
        const parsed = parseQuery(input.query);
        const discipline = normalizeKnowledgeDiscipline(input.discipline);

        // 第一层：实体索引精确匹配
        let exactResults = [];
        if (parsed.isExactLookup) {
          exactResults = exactEntityLookup(parsed);
        }

        // 第二层+第三层：混合检索
        const hybridResults = hybridSearch(
          parsed,
          discipline,
          input.source_type,
          input.limit
        );

        // 合并：精确结果优先
        const exactIds = new Set(exactResults.map(r => r.clause_id));
        const combined = [
          ...exactResults,
          ...hybridResults.filter(r => !exactIds.has(r.clause_id)),
        ].slice(0, input.limit);

        const formatted = formatSearchResults(combined, input.resolve_cross_refs ?? true);

        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              query: input.query,
              query_type: parsed.queryType,
              disciplines_detected: parsed.disciplines,
              count: formatted.length,
              results: formatted,
              meta: {
                exact_hits: exactResults.length,
                hybrid_hits: hybridResults.length,
                index_version: "V2",
              },
            }, null, 2),
          }],
        };
      }

      // --- vdi_get_citation ---
      if (name === "vdi_get_citation") {
        const input = CitationSchema.parse(args ?? {});
        const hit = clauses.find(c =>
          c.source_id === input.source_id &&
          c.clause === input.clause &&
          (!input.version || c.version === input.version)
        );

        if (!hit) {
          return {
            content: [{ type: "text", text: JSON.stringify({
              error: "not_found",
              message: `未找到 ${input.source_id} §${input.clause}`,
              suggestion: "使用 vdi_list_standards 查看可用规范",
            }, null, 2) }],
            isError: true,
          };
        }

        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              source_type: hit.source_type,
              source_id: hit.source_id,
              version: hit.version,
              clause: hit.clause,
              effective_date: hit.effective_date,
              discipline: hit.discipline,
              mandatory: hit.mandatory,
              content: hit.content,
              hierarchy: hit.hierarchy,
              outgoing_refs: hit.outgoing_refs,
              incoming_refs: hit.incoming_refs,
              file: hit.file,
              evidence_tag: `[${hit.source_id} §${hit.clause}]`,
            }, null, 2),
          }],
        };
      }

      // --- vdi_search_by_entity ---
      if (name === "vdi_search_by_entity") {
        const input = EntityLookupSchema.parse(args ?? {});
        const results = clauses.filter(c => {
          const sourceMatch = c.source_id === input.source_id ||
            c.source_id.startsWith(input.source_id);
          const clauseMatch = !input.clause || c.clause === input.clause ||
            c.clause.startsWith(input.clause);
          return sourceMatch && clauseMatch;
        });

        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              source_id: input.source_id,
              clause: input.clause || "(全部)",
              count: results.length,
              results: results.map(c => ({
                clause_id: c.clause_id,
                clause: c.clause,
                content: c.content,
                mandatory: c.mandatory,
                hierarchy: c.hierarchy,
                evidence_tag: `[${c.source_id} §${c.clause}]`,
              })),
            }, null, 2),
          }],
        };
      }

      // --- vdi_resolve_cross_refs ---
      if (name === "vdi_resolve_cross_refs") {
        const input = CrossRefSchema.parse(args ?? {});
        const clause = clauses.find(c => c.clause_id === input.clause_id);
        if (!clause) {
          return {
            content: [{ type: "text", text: JSON.stringify({ error: "not_found" }, null, 2) }],
            isError: true,
          };
        }

        const outgoing = resolveCrossRefs(input.clause_id, input.depth);
        const incoming = crossRefGraph.incoming?.[clause.source_id] || [];

        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              clause_id: input.clause_id,
              source: `${clause.source_id} §${clause.clause}`,
              content: clause.content,
              outgoing_references: outgoing,
              incoming_references: incoming.slice(0, 5).map(inc => ({
                from_source: inc.from_source,
                from_clause: inc.from_clause,
                context: inc.context || "",
              })),
            }, null, 2),
          }],
        };
      }

      // --- vdi_list_standards ---
      if (name === "vdi_list_standards") {
        const input = ListStandardsSchema.parse(args ?? {});
        const discipline = normalizeKnowledgeDiscipline(input.discipline);

        // 聚合统计
        const standardMap = {};
        for (const c of clauses) {
          if (discipline && c.discipline !== discipline) continue;
          const key = c.source_id;
          if (!standardMap[key]) {
            standardMap[key] = {
              source_id: c.source_id,
              source_type: c.source_type,
              version: c.version,
              effective_date: c.effective_date,
              discipline: c.discipline,
              clause_count: 0,
              mandatory_count: 0,
              sample_clauses: [],
            };
          }
          standardMap[key].clause_count++;
          if (c.mandatory) standardMap[key].mandatory_count++;
          if (standardMap[key].sample_clauses.length < 3) {
            standardMap[key].sample_clauses.push(c.clause);
          }
        }

        const standards = Object.values(standardMap).sort(
          (a, b) => b.clause_count - a.clause_count
        );

        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              discipline: input.discipline || "all",
              total_standards: standards.length,
              total_clauses: standards.reduce((s, st) => s + st.clause_count, 0),
              standards,
            }, null, 2),
          }],
        };
      }

      // ========================================
      // 公式库工具实现
      // ========================================

      // --- vdi_search_formulas ---
      if (name === "vdi_search_formulas") {
        const query = (args?.query || "").trim().toLowerCase();
        let discipline = args?.discipline || null;
        const category = args?.category || null;
        const limit = args?.limit || 5;

        // 专业短代码→全名映射
        const discCodeToName = DISC_CODE_TO_KNOWLEDGE_SLUG;
        if (discipline && discCodeToName[discipline.toUpperCase()]) {
          discipline = discCodeToName[discipline.toUpperCase()];
        }
        discipline = normalizeKnowledgeDiscipline(discipline);

        if (!formulaIndex) {
          return { content: [{ type: "text", text: JSON.stringify({ error: "formula_index_not_loaded" }) }], isError: true };
        }

        // 从关键词索引查找
        const kwHits = new Set();
        const queryTokens = query.split(/[\s,，、]+/).filter(t => t.length > 0);
        for (const token of queryTokens) {
          // 精确匹配
          if (formulaKeywordIndex[token]) {
            formulaKeywordIndex[token].forEach(id => kwHits.add(id));
          }
          // 模糊匹配
          for (const [kw, ids] of Object.entries(formulaKeywordIndex)) {
            if (kw.includes(token) || token.includes(kw)) {
              ids.forEach(id => kwHits.add(id));
            }
          }
        }

        // 也从参数索引查找
        for (const token of queryTokens) {
          if (formulaParamIndex[token]) {
            formulaParamIndex[token].forEach(id => kwHits.add(id));
          }
        }

        // 从索引条目中过滤
        let candidates = formulaIndex.formulas || [];
        if (kwHits.size > 0) {
          candidates = candidates.filter(f => kwHits.has(f.formula_id));
        }
        if (discipline) {
          candidates = candidates.filter(f => f.discipline === discipline);
        }
        if (category) {
          candidates = candidates.filter(f => f.category?.startsWith(category));
        }

        // 如果关键词索引无命中，回退到全量名称/标签模糊匹配
        if (kwHits.size === 0) {
          candidates = candidates.filter(f => {
            const text = `${f.name} ${(f.tags || []).join(" ")}`.toLowerCase();
            return queryTokens.some(t => text.includes(t));
          });
        }

        const results = candidates.slice(0, limit).map(f => ({
          formula_id: f.formula_id,
          name: f.name,
          discipline: f.discipline,
          category: f.category,
          type: f.type,
          inputs: f.inputs,
          outputs: f.outputs,
          tags: f.tags,
        }));

        return {
          content: [{
            type: "text",
            text: JSON.stringify({ query, count: results.length, results }, null, 2),
          }],
        };
      }

      // --- vdi_get_formula ---
      if (name === "vdi_get_formula") {
        const formulaId = args?.formula_id;
        if (!formulaId) {
          return { content: [{ type: "text", text: JSON.stringify({ error: "missing formula_id" }) }], isError: true };
        }

        const formula = loadFormulaDetail(formulaId);
        if (!formula) {
          return {
            content: [{ type: "text", text: JSON.stringify({ error: "not_found", formula_id: formulaId, suggestion: "使用 vdi_search_formulas 搜索" }) }],
            isError: true,
          };
        }

        // 解析查表引用，附带参数表数据
        const resolvedTables = {};
        for (const v of formula.variables || []) {
          if (v.look_up?.table_ref && formulaTables) {
            const tbl = formulaTables.tables?.find(t => t.id === v.look_up.table_ref);
            if (tbl) {
              resolvedTables[v.look_up.table_ref] = tbl;
            }
          }
        }

        return {
          content: [{
            type: "text",
            text: JSON.stringify({ ...formula, resolved_tables: Object.keys(resolvedTables).length > 0 ? resolvedTables : undefined }, null, 2),
          }],
        };
      }

      // --- vdi_calculate ---
      if (name === "vdi_calculate") {
        const formulaId = args?.formula_id;
        const inputs = args?.inputs || {};
        const inputUnits = args?.input_units || {};

        if (!formulaId) {
          return { content: [{ type: "text", text: JSON.stringify({ error: "missing formula_id" }) }], isError: true };
        }

        try {
          const r = executeSingleFormula(formulaId, inputs, inputUnits);

          const warnings = [];
          if (r.audit.type === "empirical" && r.audit.confidence !== undefined) {
            warnings.push(`经验公式，置信度 ${r.audit.confidence}，建议人工复核`);
          }
          if (r.conversions.length > 0) {
            warnings.push(`涉及 ${r.conversions.length} 项单位转换，请确认转换正确`);
          }

          return {
            content: [{
              type: "text",
              text: JSON.stringify({
                formula_id: r.formula_id,
                formula_name: r.formula_name,
                equation: r.equation,
                inputs: r.inputs,
                conversions: r.conversions.length > 0 ? r.conversions : undefined,
                result: r.result,
                audit: { ...r.audit, computed_at: new Date().toISOString() },
                validation: { passed: true, warnings: warnings.length > 0 ? warnings : undefined },
              }, null, 2),
            }],
          };
        } catch (err) {
          return { content: [{ type: "text", text: JSON.stringify({ error: "calculation_failed", message: String(err) }) }], isError: true };
        }
      }

      // --- vdi_calculate_composite ---
      if (name === "vdi_calculate_composite") {
        const pipeline = args?.pipeline || [];
        const globalInputs = args?.global_inputs || {};

        if (pipeline.length === 0) {
          return { content: [{ type: "text", text: JSON.stringify({ error: "empty_pipeline" }) }], isError: true };
        }

        // 按 step 排序
        const sorted = [...pipeline].sort((a, b) => (a.step || 0) - (b.step || 0));
        const stepResults = {};
        const allEvidenceTags = [];
        const errors = [];

        for (const step of sorted) {
          // 解析输入：合并全局输入 + 步骤输入 + 前序输出
          const resolvedInputs = {};

          // 先放全局输入
          for (const [k, v] of Object.entries(globalInputs)) {
            resolvedInputs[k] = v;
          }

          // 再放步骤输入（可能包含 from_step 引用）
          for (const [k, v] of Object.entries(step.inputs || {})) {
            if (v && typeof v === "object" && v.from_step !== undefined) {
              // 引用前序步骤输出
              const refResult = stepResults[v.from_step];
              if (!refResult) {
                errors.push({ step: step.step, error: `步骤 ${v.from_step} 的结果不存在` });
                break;
              }
              const refValue = refResult.result_value;
              if (refValue === undefined) {
                errors.push({ step: step.step, error: `步骤 ${v.from_step} 没有输出值` });
                break;
              }
              resolvedInputs[k] = refValue;
            } else {
              resolvedInputs[k] = v;
            }
          }

          if (errors.length > 0) break;

          // 执行单公式计算
          try {
            const stepResult = executeSingleFormula(step.formula_id, resolvedInputs, step.input_units || {});
            stepResults[step.step] = stepResult;
            allEvidenceTags.push(stepResult.audit.evidence_tag);
          } catch (err) {
            errors.push({ step: step.step, formula_id: step.formula_id, error: String(err) });
            break;
          }
        }

        if (errors.length > 0) {
          return {
            content: [{ type: "text", text: JSON.stringify({
              error: "composite_calculation_failed",
              completed_steps: Object.keys(stepResults).map(Number),
              failed_at: errors[0],
              partial_results: stepResults,
            }, null, 2) }],
            isError: true,
          };
        }

        // 汇总结果
        const lastStep = sorted[sorted.length - 1].step;
        const finalResult = stepResults[lastStep];

        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              pipeline_steps: sorted.length,
              step_results: Object.fromEntries(
                Object.entries(stepResults).map(([k, v]) => [k, {
                  formula_id: v.formula_id,
                  formula_name: v.formula_name,
                  equation: v.equation,
                  inputs: v.inputs,
                  result: v.result,
                  evidence_tag: v.audit.evidence_tag,
                }])
              ),
              final_result: finalResult.result,
              all_evidence_tags: allEvidenceTags,
              audit: {
                pipeline_steps: sorted.map(s => ({ step: s.step, formula_id: s.formula_id })),
                evidence_tags: allEvidenceTags,
                computed_at: new Date().toISOString(),
              },
            }, null, 2),
          }],
        };
      }

      return {
        content: [{ type: "text", text: `Unknown tool: ${name}` }],
        isError: true,
      };
    } catch (err) {
      return {
        content: [{ type: "text", text: JSON.stringify({ error: String(err) }, null, 2) }],
        isError: true,
      };
    }
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[vdi-knowledge V2] MCP 服务已启动");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
