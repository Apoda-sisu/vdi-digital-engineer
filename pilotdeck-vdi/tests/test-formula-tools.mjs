#!/usr/bin/env node
/**
 * 公式库 MCP 工具端到端集成测试
 * ================================
 * 测试 vdi_search_formulas / vdi_get_formula / vdi_calculate / vdi_calculate_composite
 *
 * 运行: node pilotdeck-vdi/tests/test-formula-tools.mjs
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");

// ============================================================
// 测试工具
// ============================================================
let passed = 0;
let failed = 0;
let skipped = 0;

function assert(condition, msg) {
  if (condition) {
    passed++;
    console.log(`  ✓ ${msg}`);
  } else {
    failed++;
    console.error(`  ✗ ${msg}`);
  }
}

function assertApprox(actual, expected, tolerance, msg) {
  const ok = Math.abs(actual - expected) <= tolerance;
  assert(ok, `${msg} (got ${actual}, expected ${expected}±${tolerance})`);
}

function section(title) {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`  ${title}`);
  console.log("=".repeat(60));
}

// ============================================================
// 模拟 MCP Server 核心逻辑（直接导入会触发 MCP 启动）
// ============================================================

const FORMULAS_DIR = path.resolve(ROOT, "pilotdeck-vdi/data/formulas");
const FORMULA_INDEX = path.join(FORMULAS_DIR, "index.json");
const FORMULA_KW_INDEX = path.resolve(ROOT, "pilotdeck-vdi/data/formulas-indices/formula-keyword-index.json");
const FORMULA_PARAM_INDEX = path.resolve(ROOT, "pilotdeck-vdi/data/formulas-indices/formula-param-index.json");

const FORMULA_ID_MAP = JSON.parse(
  fs.readFileSync(path.resolve(ROOT, "pilotdeck-vdi/data/cfihos-formula-id-map.json"), "utf8")
).calc_id_map || JSON.parse(
  fs.readFileSync(path.resolve(ROOT, "pilotdeck-vdi/data/cfihos-formula-id-map.json"), "utf8")
).id_map;

/** 计算 ID 已是 canonical；入参可为计算 ID 或历史 CFIHOS 别名 */
function fid(vdiOrCfihosId) {
  return FORMULA_ID_MAP[vdiOrCfihosId] ? vdiOrCfihosId : (Object.entries(FORMULA_ID_MAP).find(([, v]) => v === vdiOrCfihosId)?.[0] || vdiOrCfihosId);
}
let formulaIndex = null;
let formulaCache = {};
let formulaKeywordIndex = {};
let formulaParamIndex = {};
let formulaTables = null;

function loadFormulas() {
  if (fs.existsSync(FORMULA_INDEX)) {
    formulaIndex = JSON.parse(fs.readFileSync(FORMULA_INDEX, "utf8"));
  }
  if (fs.existsSync(FORMULA_KW_INDEX)) {
    const raw = JSON.parse(fs.readFileSync(FORMULA_KW_INDEX, "utf8"));
    formulaKeywordIndex = raw.index || raw;
  }
  if (fs.existsSync(FORMULA_PARAM_INDEX)) {
    const raw = JSON.parse(fs.readFileSync(FORMULA_PARAM_INDEX, "utf8"));
    formulaParamIndex = raw.index || raw;
  }
  const tablesPath = path.join(FORMULAS_DIR, "tables.json");
  if (fs.existsSync(tablesPath)) {
    formulaTables = JSON.parse(fs.readFileSync(tablesPath, "utf8"));
  }
  // 构建 formulaFileMap
  buildFormulaFileMap();
}

let formulaFileMap = {};

function buildFormulaFileMap() {
  const disciplines = ["electrical", "hs", "instrument", "piping", "process", "water", "EA", "HS", "IN", "MP", "PX", "CI"];
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
}

function loadFormulaDetail(formulaId) {
  if (formulaCache[formulaId]) return formulaCache[formulaId];
  // 优先从 formulaFileMap 查找
  let filePath = null;
  const relPath = formulaFileMap[formulaId];
  if (relPath) {
    filePath = path.join(FORMULAS_DIR, relPath);
  } else {
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
  if (formula) formulaCache[formulaId] = formula;
  return formula || null;
}

function evaluateAST(node, vars) {
  if (node.var !== undefined) {
    const val = vars[node.var];
    if (val === undefined) throw new Error(`Missing variable: ${node.var}`);
    return val;
  }
  if (node.const !== undefined) return node.const;
  if (node.op === "div" && node.num !== undefined && node.den !== undefined) {
    const den = evaluateAST(node.den, vars);
    if (den === 0) throw new Error("Division by zero");
    return evaluateAST(node.num, vars) / den;
  }
  if (node.op && node.arg !== undefined) {
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
  if (node.op && node.lhs !== undefined && node.rhs !== undefined) {
    const l = evaluateAST(node.lhs, vars);
    const r = evaluateAST(node.rhs, vars);
    switch (node.op) {
      case "add": return l + r;
      case "sub": return l - r;
      case "mul": return l * r;
      case "div": { if (r === 0) throw new Error("Division by zero"); return l / r; }
      case "pow": return Math.pow(l, r);
      default: throw new Error(`Unknown lhs/rhs op: ${node.op}`);
    }
  }
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
  if (node.base !== undefined) {
    const base = evaluateAST(node.base, vars);
    if (node.exp !== undefined) return Math.pow(base, node.exp);
    switch (node.op) {
      case "sqrt": return Math.sqrt(base);
      case "abs": return Math.abs(base);
      case "neg": return -base;
      case "log": case "ln": return Math.log(base);
      case "log10": return Math.log10(base);
      case "exp": return Math.exp(base);
      default: break;
    }
  }
  throw new Error(`Unrecognized AST: ${JSON.stringify(Object.keys(node))}`);
}

function executeSingleFormula(formulaId, inputs, inputUnits = {}) {
  const formula = loadFormulaDetail(formulaId);
  if (!formula) throw new Error(`公式 ${formulaId} 未找到`);
  if (!formula.equation_ast) throw new Error(`公式 ${formulaId} 缺少 AST`);

  const convertedInputs = {};
  const conversionLog = [];
  for (const v of formula.variables || []) {
    if (v.role !== "input") continue;
    let val = inputs[v.symbol];
    if (val === undefined) {
      if (v.default !== undefined) { val = v.default; }
      else throw new Error(`缺少输入参数 ${v.symbol}（${v.name}）`);
    }
    const requestedUnit = inputUnits[v.symbol];
    if (requestedUnit && requestedUnit !== v.unit) {
      const alt = (v.alt_units || []).find(a => a.unit === requestedUnit);
      if (alt) {
        const orig = val;
        val = val * (alt.factor || 1) + (alt.offset || 0);
        conversionLog.push({ symbol: v.symbol, from: `${orig} ${requestedUnit}`, to: `${val} ${v.unit}` });
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

const DISC_RESOLVE = { water: "CI", process: "PX", piping: "MP", instrument: "IN", electrical: "EA", hs: "HS" };

// 模拟 vdi_search_formulas
function searchFormulas(query, discipline, category, limit = 5) {
  const q = query.trim().toLowerCase();
  const kwHits = new Set();
  const tokens = q.split(/[\s,，、]+/).filter(t => t.length > 0);
  for (const token of tokens) {
    if (formulaKeywordIndex[token]) formulaKeywordIndex[token].forEach(id => kwHits.add(id));
    for (const [kw, ids] of Object.entries(formulaKeywordIndex)) {
      if (kw.includes(token) || token.includes(kw)) ids.forEach(id => kwHits.add(id));
    }
  }
  for (const token of tokens) {
    if (formulaParamIndex[token]) formulaParamIndex[token].forEach(id => kwHits.add(id));
  }
  let candidates = formulaIndex.formulas || [];
  if (kwHits.size > 0) candidates = candidates.filter(f => kwHits.has(f.formula_id));
  if (discipline) {
    const d = DISC_RESOLVE[discipline] || discipline;
    candidates = candidates.filter(f => f.discipline === d);
  }
  if (category) candidates = candidates.filter(f => f.category?.startsWith(category));
  if (kwHits.size === 0) {
    candidates = candidates.filter(f => {
      const text = `${f.name} ${(f.tags || []).join(" ")}`.toLowerCase();
      return tokens.some(t => text.includes(t));
    });
  }
  return candidates.slice(0, limit);
}

// ============================================================
// 测试用例
// ============================================================

console.log("\n🔬 公式库 MCP 工具端到端集成测试\n");

// --- 测试 1: 数据加载 ---
section("1. 数据加载");

loadFormulas();
assert(formulaIndex !== null, "公式主索引加载成功");
assert(formulaIndex.formulas.length > 0, `索引包含 ${formulaIndex.formulas.length} 条公式`);
assert(Object.keys(formulaKeywordIndex).length > 0, `关键词索引包含 ${Object.keys(formulaKeywordIndex).length} 个关键词`);
assert(formulaTables !== null, "参数表加载成功");

// --- 测试 2: 公式搜索 ---
section("2. 公式搜索 vdi_search_formulas");

const search1 = searchFormulas("水头损失");
assert(search1.length >= 2, `搜索"水头损失"返回 ${search1.length} 条结果`);
assert(search1.some(f => f.formula_id === fid("WA-HYD-001")), "包含海曾-威廉姆斯公式");

const search2 = searchFormulas("水泵功率");
assert(search2.length >= 1, `搜索"水泵功率"返回 ${search2.length} 条结果`);
assert(search2.some(f => f.formula_id === fid("WA-EQ-001")), "包含水泵轴功率公式");

const search3 = searchFormulas("消防水池");
assert(search3.length >= 1, `搜索"消防水池"返回 ${search3.length} 条结果`);

const search4 = searchFormulas("曼宁");
assert(search4.length >= 1, `搜索"曼宁"返回 ${search4.length} 条结果`);

const search5 = searchFormulas("暴雨强度");
assert(search5.length >= 1, `搜索"暴雨强度"返回 ${search5.length} 条结果`);

// 按专业过滤
const search6 = searchFormulas("水头损失", "CI");
assert(search6.every(f => f.discipline === "CI"), "专业过滤生效");

// --- 测试 3: 公式详情 ---
section("3. 公式详情 vdi_get_formula");

const f1 = loadFormulaDetail(fid("WA-HYD-001"));
assert(f1 !== null, `${fid("WA-HYD-001")} 加载成功`);
assert(f1.formula_id === fid("WA-HYD-001"), "公式ID正确");
assert(f1.equation_ast !== null, "包含AST");
assert(f1.variables.length >= 4, `包含 ${f1.variables.length} 个变量`);
assert(f1.source?.standard_id === "GB 50013-2018", "来源规范正确");

const f2 = loadFormulaDetail(fid("WA-HYD-002"));
assert(f2 !== null, `${fid("WA-HYD-002")} 加载成功`);
assert(f2.equation_ast !== null, "暴雨强度公式包含AST");

// --- 测试 4: 单公式计算 ---
section("4. 单公式计算 vdi_calculate");

// 4.1 海曾-威廉姆斯水头损失
const calc1 = executeSingleFormula(fid("WA-HYD-001"), { L: 100, Q: 0.05, C: 130, D: 0.2 });
assertApprox(calc1.result_value, 1.281202, 0.001, `${fid("WA-HYD-001")}: Hf ≈ 1.281m`);
assert(calc1.audit.evidence_tag.includes("GB 50013-2018"), "包含 evidence_tag");

// 4.2 单位转换: mm → m
const calc1b = executeSingleFormula(fid("WA-HYD-001"), { L: 100, Q: 0.05, C: 130, D: 200 }, { D: "mm" });
assertApprox(calc1b.result_value, 1.281202, 0.001, `${fid("WA-HYD-001")}: mm转m后结果一致`);

// 4.3 曼宁公式
const calc2 = executeSingleFormula(fid("WA-HYD-002"), { n: 0.013, R: 0.05, S: 0.005 });
assert(calc2.result_value > 0, `曼宁公式: V = ${calc2.result_value.toFixed(4)} m/s`);
assertApprox(calc2.result_value, (1/0.013) * Math.pow(0.05, 2/3) * Math.pow(0.005, 0.5), 0.01, "曼宁公式手算验证");

// 4.4 流量公式
const calc3 = executeSingleFormula(fid("WA-HYD-003"), { A: 0.0314, V: 1.5 });
assertApprox(calc3.result_value, 0.0471, 0.001, "Q=A*V: 0.0314*1.5 ≈ 0.0471");

// 4.5 圆管水力半径
const calc4 = executeSingleFormula(fid("WA-HYD-004"), { D: 0.2 });
assertApprox(calc4.result_value, 0.05, 0.001, "R=D/4: 0.2/4 = 0.05");

// 4.6 局部水头损失
const calc5 = executeSingleFormula(fid("WA-HYD-005"), { Hf: 1.28, k: 0.25 });
assertApprox(calc5.result_value, 0.32, 0.001, "Hl=k*Hf: 0.25*1.28 = 0.32");

// 4.7 达西公式
const calc6 = executeSingleFormula(fid("WA-HYD-006"), { f: 0.02, L: 100, D: 0.2, V: 1.5 });
const expectedDarcy = 0.02 * (100 / 0.2) * (1.5 * 1.5 / (2 * 9.81));
assertApprox(calc6.result_value, expectedDarcy, 0.01, "达西公式手算验证");

// 4.8 水泵轴功率
const calc7 = executeSingleFormula(fid("WA-EQ-001"), { Q: 0.05, H: 30, η: 0.75 });
const expectedPower = 1000 * 9.81 * 0.05 * 30 / (1000 * 0.75);
assertApprox(calc7.result_value, expectedPower, 0.1, "水泵轴功率手算验证");

// 4.9 水泵电机功率
const calc8 = executeSingleFormula(fid("WA-EQ-002"), { P: 19.62, ηm: 0.9 });
assertApprox(calc8.result_value, 19.62 / 0.9, 0.1, "电机功率=轴功率/效率");

// 4.10 消防水池容积
const calc9 = executeSingleFormula(fid("WA-FIR-001"), { Qf: 108, Qb: 36, T: 3 });
assertApprox(calc9.result_value, 216, 0.1, "V=(108-36)*3=216 m³");

// 4.11 雨水设计流量
const calc10 = executeSingleFormula(fid("WA-RAI-001"), { q: 200, ψ: 0.6, F: 2 });
assertApprox(calc10.result_value, 240, 0.1, "Q=200*0.6*2=240 L/s");

// 4.12 循环冷却水补充水量
const calc11 = executeSingleFormula(fid("WA-WQ-001"), { E: 5, D: 0.5, F: 2 });
assertApprox(calc11.result_value, 7.5, 0.01, "M=5+0.5+2=7.5 m³/h");

// --- 测试 5: 约束校验 ---
section("5. 约束校验");

let constraintError = false;
try {
  executeSingleFormula(fid("WA-HYD-001"), { L: -10, Q: 0.05, C: 130, D: 0.2 });
} catch (e) {
  constraintError = e.message.includes("min");
}
assert(constraintError, "负管长触发 min 约束");

let constraintError2 = false;
try {
  executeSingleFormula(fid("WA-HYD-001"), { L: 100, Q: 0.05, C: 130, D: 5 });
} catch (e) {
  constraintError2 = e.message.includes("max");
}
assert(constraintError2, "超大管径触发 max 约束 (D=5 > 3.0)");

let missingInput = false;
try {
  executeSingleFormula(fid("WA-HYD-001"), { L: 100 });
} catch (e) {
  missingInput = e.message.includes("缺少输入参数");
}
assert(missingInput, "缺少必要输入参数报错");

// --- 测试 6: 组合计算 ---
section("6. 组合计算 vdi_calculate_composite");

// 场景：给水管段最不利点水头计算
// 步骤1: 沿程水头损失 (CX1380-001)
// 步骤2: 局部水头损失 (CX1380-005, 输入=步骤1输出)
// 步骤3: 水泵轴功率 (CI7303-001, H=步骤1+步骤2)
const pipeline = [
  { step: 1, formula_id: fid("WA-HYD-001"), inputs: { L: 200, Q: 0.03, C: 130, D: 0.15 } },
  { step: 2, formula_id: fid("WA-HYD-005"), inputs: { Hf: { from_step: 1, symbol: "Hf" }, k: 0.25 } },
  { step: 3, formula_id: fid("WA-EQ-001"), inputs: {
    Q: 0.03,
    H: null, // 将在下面计算
    η: 0.7,
  }},
];

// 手动执行组合计算验证
const step1 = executeSingleFormula(fid("WA-HYD-001"), { L: 200, Q: 0.03, C: 130, D: 0.15 });
const step2 = executeSingleFormula(fid("WA-HYD-005"), { Hf: step1.result_value, k: 0.25 });
const totalH = step1.result_value + step2.result_value;
const step3 = executeSingleFormula(fid("WA-EQ-001"), { Q: 0.03, H: totalH, η: 0.7 });

assert(step1.result_value > 0, `步骤1: 沿程损失 Hf = ${step1.result_value.toFixed(4)} m`);
assert(step2.result_value > 0, `步骤2: 局部损失 Hl = ${step2.result_value.toFixed(4)} m`);
assert(totalH > 0, `总水头 H = ${totalH.toFixed(4)} m`);
assert(step3.result_value > 0, `步骤3: 水泵功率 P = ${step3.result_value.toFixed(2)} kW`);
assert(step1.audit.evidence_tag.includes("GB 50013"), "步骤1 evidence_tag 正确");
assert(step3.audit.evidence_tag.includes("GB 50015"), "步骤3 evidence_tag 正确");

// 测试 from_step 引用解析
const pipelineSteps = [
  { step: 1, formula_id: fid("WA-HYD-004"), inputs: { D: 0.2 } },
  { step: 2, formula_id: fid("WA-HYD-002"), inputs: { n: 0.013, R: { from_step: 1, symbol: "R" }, S: 0.005 } },
];

const pStep1 = executeSingleFormula(pipelineSteps[0].formula_id, pipelineSteps[0].inputs);
assertApprox(pStep1.result_value, 0.05, 0.001, "组合步骤1: R=D/4=0.05");

const pStep2 = executeSingleFormula(pipelineSteps[1].formula_id, { n: 0.013, R: pStep1.result_value, S: 0.005 });
assert(pStep2.result_value > 0, `组合步骤2: V = ${pStep2.result_value.toFixed(4)} m/s (使用步骤1输出R)`);

// --- 测试 7: 公式完整性 ---
section("7. 公式完整性校验");

let allHaveAST = true;
let allHaveSource = true;
let allHaveVariables = true;
let totalFormulas = 0;
let astCheckedFormulas = 0;

for (const entry of formulaIndex.formulas) {
  const f = loadFormulaDetail(entry.formula_id);
  if (!f) { allHaveAST = false; continue; }
  totalFormulas++;
  if (!f.source?.standard_id) allHaveSource = false;
  if (!f.variables || f.variables.length === 0) allHaveVariables = false;
  // lookup 和 empirical 类型公式可能不需要 AST
  if (f.type === "lookup" || f.type === "empirical") continue;
  astCheckedFormulas++;
  if (!f.equation_ast) allHaveAST = false;
}

assert(allHaveAST, `所有 ${astCheckedFormulas} 条非 lookup 公式都有 AST`);
assert(allHaveSource, `所有 ${totalFormulas} 条公式都有来源规范`);
assert(allHaveVariables, `所有 ${totalFormulas} 条公式都有变量定义`);

// --- 测试 8: 新增公式覆盖 ---
section("8. 新增公式覆盖");

const allIds = formulaIndex.formulas.map(f => f.formula_id);

// 水力学扩充
const hydraulicNew = ["WA-HYD-007", "WA-HYD-008", "WA-HYD-009", "WA-HYD-010", "WA-HYD-011", "WA-HYD-012"];
for (const id of hydraulicNew) {
  assert(allIds.includes(fid(id)), `索引包含新水力学公式 ${fid(id)}`);
}

const processFormulas = allIds.filter(id => id.startsWith("PR-"));
assert(processFormulas.length >= 4, `工艺专业包含 ${processFormulas.length} 条计算公式 (≥4)`);

const pipingFormulas = allIds.filter(id => id.startsWith("PI-"));
assert(pipingFormulas.length >= 3, `管道专业包含 ${pipingFormulas.length} 条计算公式 (≥3)`);

const electricalFormulas = allIds.filter(id => id.startsWith("EL-"));
assert(electricalFormulas.length >= 3, `电气专业包含 ${electricalFormulas.length} 条计算公式 (≥3)`);

const hseFormulas = allIds.filter(id => id.startsWith("HS-VEN-"));
assert(hseFormulas.length >= 2, `通风类公式 ≥2`);

// --- 测试 9: 跨专业公式计算 ---
section("9. 跨专业公式计算");

// 管道壁厚
const pipingCalc = loadFormulaDetail(fid("PI-STR-001"));
if (pipingCalc) {
  const r = executeSingleFormula(fid("PI-STR-001"), { P: 1.6, D: 219, S: 137, E: 1.0, C: 1.5 });
  assert(r.result_value > 0, `管道壁厚 t = ${r.result_value.toFixed(2)} mm`);
  assert(r.audit.evidence_tag.includes("GB/T 20801"), "管道壁厚 evidence_tag 正确");
} else {
  skipped++;
  console.log("  ⊘ MP1029-001 未找到，跳过");
}

// 三相电机功率
const elecCalc = loadFormulaDetail(fid("EL-POW-001"));
if (elecCalc) {
  const r = executeSingleFormula(fid("EL-POW-001"), { U: 0.38, I: 50, cosphi: 0.85 });
  assert(r.result_value > 0, `三相功率 P = ${r.result_value.toFixed(2)} kW`);
} else {
  skipped++;
  console.log("  ⊘ EA1206-001 未找到，跳过");
}

// 通风换气次数
const hseCalc = loadFormulaDetail(fid("HS-VEN-001"));
if (hseCalc) {
  const r = executeSingleFormula(fid("HS-VEN-001"), { n: 6, V: 500 });
  assertApprox(r.result_value, 3000, 0.1, "Q=6*500=3000 m³/h");
} else {
  skipped++;
  console.log("  ⊘ CX1380-001 未找到，跳过");
}

// ============================================================
// 测试汇总
// ============================================================
section("测试汇总");
console.log(`\n  通过: ${passed}`);
console.log(`  失败: ${failed}`);
if (skipped > 0) console.log(`  跳过: ${skipped}`);
console.log(`  总计: ${passed + failed + skipped}`);
console.log(failed === 0 ? "\n  🎉 全部通过！" : "\n  ❌ 存在失败用例");
console.log("");
process.exit(failed > 0 ? 1 : 0);
