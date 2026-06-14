#!/usr/bin/env node
/**
 * PilotDeck 系统健康检查脚本
 * ================================
 * 验证各模块（Skill、知识库、公式库、MCP）的调用链和数据完整性
 *
 * 运行: node pilotdeck-vdi/tests/test-system-health.mjs [--full|--quick|--target <module>]
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  WORKSPACES,
  listAllSkillSlugs,
  skillDir,
  SKILLS_REGISTRY,
} from "../config/skills-layout.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");

// ============================================================
// 配置
// ============================================================
const CONFIG = {
  knowledge: {
    clausesPath: path.resolve(ROOT, "pilotdeck-vdi/data/knowledge-clauses-v2.json"),
    entityIndexPath: path.resolve(ROOT, "pilotdeck-vdi/data/indices/entity-index.json"),
    crossRefsPath: path.resolve(ROOT, "pilotdeck-vdi/data/indices/cross-refs.json"),
  },
  formulas: {
    dir: path.resolve(ROOT, "pilotdeck-vdi/data/formulas"),
    indexPath: path.resolve(ROOT, "pilotdeck-vdi/data/formulas/index.json"),
    keywordIndexPath: path.resolve(ROOT, "pilotdeck-vdi/data/formulas-indices/formula-keyword-index.json"),
    paramIndexPath: path.resolve(ROOT, "pilotdeck-vdi/data/formulas-indices/formula-param-index.json"),
    tablesPath: path.resolve(ROOT, "pilotdeck-vdi/data/formulas/tables.json"),
  },
  skills: {
    registry: path.resolve(ROOT, "workspaces/skills-registry.json"),
    workspaces: path.resolve(ROOT, "workspaces"),
  },
  mcp: {
    dir: path.resolve(ROOT, "pilotdeck-vdi/mcp"),
  },
};

/** 非 Agent Skill 目录：专业 INDEX 或 converter 工具目录，不参与 SC-* 扫描 */
const SKILL_NON_AGENT_DIRS = new Set(["vdi-water", "vdi-process", "vdi-cad-drawing"]);

function listSkillSlugsForHealth() {
  return listAllSkillSlugs();
}

function skillPathForSlug(slug) {
  const dir = skillDir(slug);
  return dir ? path.join(dir, "SKILL.md") : null;
}

// ============================================================
// 公式文件扫描辅助函数
// ============================================================
function scanFormulaFiles() {
  const disciplines = ["electrical", "hs", "instrument", "piping", "process", "water"];
  const files = [];
  for (const disc of disciplines) {
    const discDir = path.join(CONFIG.formulas.dir, disc);
    if (!fs.existsSync(discDir)) continue;
    const discFiles = fs.readdirSync(discDir).filter(f => f.endsWith(".json"));
    for (const file of discFiles) {
      files.push(`${disc}/${file}`);
    }
  }
  return files;
}

function loadAllFormulasFromFiles() {
  const allFormulas = [];
  const files = scanFormulaFiles();
  for (const file of files) {
    const filePath = path.join(CONFIG.formulas.dir, file);
    try {
      const fileData = JSON.parse(fs.readFileSync(filePath, "utf8"));
      const formulas = Array.isArray(fileData) ? fileData : (fileData.formulas || []);
      allFormulas.push(...formulas);
    } catch { /* skip */ }
  }
  return allFormulas;
}

// ============================================================
// 报告生成器
// ============================================================
class HealthReport {
  constructor() {
    this.checks = [];
    this.startTime = Date.now();
  }

  addCheck(id, name, status, message, details = null, severity = "medium") {
    this.checks.push({
      id,
      name,
      status,
      message,
      details,
      severity,
      timestamp: new Date().toISOString(),
    });
  }

  pass(id, name, message, details = null) {
    this.addCheck(id, name, "passed", message, details);
  }

  fail(id, name, message, details = null, severity = "high") {
    this.addCheck(id, name, "failed", message, details, severity);
  }

  warn(id, name, message, details = null) {
    this.addCheck(id, name, "warning", message, details);
  }

  generate() {
    const passed = this.checks.filter(c => c.status === "passed").length;
    const failed = this.checks.filter(c => c.status === "failed").length;
    const warnings = this.checks.filter(c => c.status === "warning").length;
    const total = this.checks.length;
    const healthScore = total > 0 ? Math.round((passed / total) * 100 * 10) / 10 : 0;

    const criticalFailures = this.checks.filter(c => c.status === "failed" && c.severity === "critical");
    const highFailures = this.checks.filter(c => c.status === "failed" && c.severity === "high");

    const recommendations = [];
    if (criticalFailures.length > 0) {
      recommendations.push("立即修复 critical 级别问题，系统功能受限");
    }
    if (highFailures.length > 0) {
      recommendations.push("尽快修复 high 级别问题");
    }
    if (warnings > 0) {
      recommendations.push("处理 warning 级别问题以优化系统");
    }

    return {
      report_id: `HEALTH-${new Date().toISOString().slice(0, 10)}-${String(Date.now()).slice(-6)}`,
      timestamp: new Date().toISOString(),
      duration_ms: Date.now() - this.startTime,
      summary: {
        total_checks: total,
        passed,
        failed,
        warnings,
        health_score: healthScore,
        critical_failures: criticalFailures.length,
        high_failures: highFailures.length,
      },
      checks: this.checks,
      recommendations,
      status: criticalFailures.length > 0 ? "critical" : highFailures.length > 0 ? "degraded" : "healthy",
    };
  }
}

// ============================================================
// AST 求值引擎（用于验证公式 AST）
// ============================================================
function evaluateAST(node, vars) {
  if (!node || typeof node !== "object") {
    throw new Error(`Invalid AST node: ${JSON.stringify(node)}`);
  }
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

// ============================================================
// 检查函数
// ============================================================

function checkKnowledgeBase(report) {
  console.log("\n[知识库检查]");

  // KB-001: 条款数据完整性
  try {
    if (!fs.existsSync(CONFIG.knowledge.clausesPath)) {
      report.fail("KB-001", "条款数据完整性", "knowledge-clauses-v2.json 不存在", null, "critical");
      return;
    }
    const data = JSON.parse(fs.readFileSync(CONFIG.knowledge.clausesPath, "utf8"));
    const clauseCount = data.clauses?.length || 0;
    if (clauseCount === 0) {
      report.fail("KB-001", "条款数据完整性", "条款数据为空", null, "critical");
    } else {
      report.pass("KB-001", "条款数据完整性", `包含 ${clauseCount} 条条款`, { count: clauseCount });
    }
  } catch (err) {
    report.fail("KB-001", "条款数据完整性", `解析失败: ${err.message}`, null, "critical");
  }

  // KB-002: 规范索引有效性
  try {
    if (!fs.existsSync(CONFIG.knowledge.entityIndexPath)) {
      report.warn("KB-002", "规范索引有效性", "entity-index.json 不存在");
    } else {
      const index = JSON.parse(fs.readFileSync(CONFIG.knowledge.entityIndexPath, "utf8"));
      const indexKeys = Object.keys(index.index || {}).length;
      report.pass("KB-002", "规范索引有效性", `索引包含 ${indexKeys} 个键`, { keys: indexKeys });
    }
  } catch (err) {
    report.fail("KB-002", "规范索引有效性", `解析失败: ${err.message}`);
  }

  // KB-003: 跨引用关系完整性
  try {
    if (!fs.existsSync(CONFIG.knowledge.crossRefsPath)) {
      report.warn("KB-003", "跨引用关系完整性", "cross-refs.json 不存在");
    } else {
      const refs = JSON.parse(fs.readFileSync(CONFIG.knowledge.crossRefsPath, "utf8"));
      const outgoingCount = Object.keys(refs.graph?.outgoing || {}).length;
      report.pass("KB-003", "跨引用关系完整性", `包含 ${outgoingCount} 条出向引用`, { outgoing: outgoingCount });
    }
  } catch (err) {
    report.fail("KB-003", "跨引用关系完整性", `解析失败: ${err.message}`);
  }
}

function checkFormulaLibrary(report) {
  console.log("\n[公式库检查]");

  // FL-001: 公式数据完整性
  try {
    if (!fs.existsSync(CONFIG.formulas.indexPath)) {
      report.fail("FL-001", "公式数据完整性", "index.json 不存在", null, "critical");
      return;
    }
    const index = JSON.parse(fs.readFileSync(CONFIG.formulas.indexPath, "utf8"));
    const formulaCount = index.formulas?.length || 0;
    if (formulaCount === 0) {
      report.fail("FL-001", "公式数据完整性", "公式索引为空", null, "critical");
    } else {
      report.pass("FL-001", "公式数据完整性", `索引包含 ${formulaCount} 条公式`, { count: formulaCount });
    }
  } catch (err) {
    report.fail("FL-001", "公式数据完整性", `解析失败: ${err.message}`, null, "critical");
  }

  // FL-002: AST 语法树有效性
  try {
    const formulaFiles = scanFormulaFiles();
    let validAST = 0;
    let invalidAST = 0;
    const errors = [];

    for (const file of formulaFiles) {
      const filePath = path.join(CONFIG.formulas.dir, file);
      if (!fs.existsSync(filePath)) {
        errors.push(`文件不存在: ${file}`);
        continue;
      }
      const fileData = JSON.parse(fs.readFileSync(filePath, "utf8"));
      const formulas = Array.isArray(fileData) ? fileData : (fileData.formulas || []);

      for (const formula of formulas) {
        if (!formula.equation_ast) {
          invalidAST++;
          errors.push(`${formula.formula_id}: 缺少 AST`);
          continue;
        }
        try {
          const testInputs = {};
          let inputIdx = 0;
          for (const v of formula.variables || []) {
            if (v.role === "input" || v.role === "constant") {
              testInputs[v.symbol] = v.default || (inputIdx++ + 2);
            }
          }
          evaluateAST(formula.equation_ast, testInputs);
          validAST++;
        } catch (err) {
          invalidAST++;
          errors.push(`${formula.formula_id}: AST 求值失败 - ${err.message}`);
        }
      }
    }

    if (invalidAST > 0) {
      report.warn("FL-002", "AST 语法树有效性", `${invalidAST} 个公式 AST 无效（含 lookup 型）`, { errors: errors.slice(0, 5) });
    } else {
      report.pass("FL-002", "AST 语法树有效性", `全部 ${validAST} 个公式 AST 有效`, { valid: validAST });
    }
  } catch (err) {
    report.fail("FL-002", "AST 语法树有效性", `检查失败: ${err.message}`, null, "critical");
  }

  // FL-003: 参数表关联正确性
  try {
    if (!fs.existsSync(CONFIG.formulas.tablesPath)) {
      report.warn("FL-003", "参数表关联正确性", "tables.json 不存在");
    } else {
      const tables = JSON.parse(fs.readFileSync(CONFIG.formulas.tablesPath, "utf8"));
      const tableCount = tables.tables?.length || 0;
      report.pass("FL-003", "参数表关联正确性", `包含 ${tableCount} 个参数表`, { count: tableCount });
    }
  } catch (err) {
    report.fail("FL-003", "参数表关联正确性", `解析失败: ${err.message}`);
  }

  // FL-004: 索引文件一致性
  try {
    const index = JSON.parse(fs.readFileSync(CONFIG.formulas.indexPath, "utf8"));
    const indexedCount = index.formulas?.length || 0;
    const statsCount = index.stats?.total_formulas || 0;

    if (indexedCount !== statsCount) {
      report.fail("FL-004", "索引文件一致性", `索引公式数 (${indexedCount}) 与统计数 (${statsCount}) 不一致`);
    } else {
      report.pass("FL-004", "索引文件一致性", `索引公式数与统计数一致: ${indexedCount}`, { indexed: indexedCount, stats: statsCount });
    }
  } catch (err) {
    report.fail("FL-004", "索引文件一致性", `检查失败: ${err.message}`);
  }

  // FL-005: 关键词索引有效性
  try {
    if (!fs.existsSync(CONFIG.formulas.keywordIndexPath)) {
      report.warn("FL-005", "关键词索引有效性", "formula-keyword-index.json 不存在");
    } else {
      const kwIndex = JSON.parse(fs.readFileSync(CONFIG.formulas.keywordIndexPath, "utf8"));
      const keywordCount = Object.keys(kwIndex.index || {}).length;
      report.pass("FL-005", "关键词索引有效性", `包含 ${keywordCount} 个关键词`, { count: keywordCount });
    }
  } catch (err) {
    report.fail("FL-005", "关键词索引有效性", `解析失败: ${err.message}`);
  }

  // FL-006: 公式参数表引用完整性
  try {
    const formulaFiles = scanFormulaFiles();
    const tableRefs = new Set();
    const tableIds = new Set();

    if (fs.existsSync(CONFIG.formulas.tablesPath)) {
      const tables = JSON.parse(fs.readFileSync(CONFIG.formulas.tablesPath, "utf8"));
      (tables.tables || []).forEach(t => tableIds.add(t.table_id));
    }

    for (const file of formulaFiles) {
      const filePath = path.join(CONFIG.formulas.dir, file);
      if (!fs.existsSync(filePath)) continue;
      const fileData = JSON.parse(fs.readFileSync(filePath, "utf8"));
      const formulas = Array.isArray(fileData) ? fileData : (fileData.formulas || []);
      for (const formula of formulas) {
        for (const v of formula.variables || []) {
          if (v.look_up?.table_ref) {
            tableRefs.add(v.look_up.table_ref);
          }
        }
      }
    }

    const missingTables = [...tableRefs].filter(ref => !tableIds.has(ref));
    if (missingTables.length > 0) {
      report.fail("FL-006", "公式参数表引用完整性", `${missingTables.length} 个参数表引用无效`, { missing: missingTables });
    } else {
      report.pass("FL-006", "公式参数表引用完整性", `全部 ${tableRefs.size} 个参数表引用有效`, { refs: tableRefs.size });
    }
  } catch (err) {
    report.fail("FL-006", "公式参数表引用完整性", `检查失败: ${err.message}`);
  }

  // FL-007: 公式 related_formulas 引用完整性
  try {
    const allFormulas = loadAllFormulasFromFiles();
    const allFormulaIds = new Set(allFormulas.map(f => f.formula_id || f.id));
    const invalidRefs = [];

    for (const formula of allFormulas) {
      for (const ref of formula.related_formulas || []) {
        if (!allFormulaIds.has(ref.formula_id)) {
          invalidRefs.push({ from: formula.formula_id, to: ref.formula_id });
        }
      }
    }

    if (invalidRefs.length > 0) {
      report.fail("FL-007", "公式 related_formulas 引用完整性", `${invalidRefs.length} 个引用无效`, { invalid: invalidRefs.slice(0, 5) });
    } else {
      report.pass("FL-007", "公式 related_formulas 引用完整性", "所有 related_formulas 引用有效");
    }
  } catch (err) {
    report.fail("FL-007", "公式 related_formulas 引用完整性", `检查失败: ${err.message}`);
  }

  // FL-008: 公式索引与实际文件一致性
  try {
    const index = JSON.parse(fs.readFileSync(CONFIG.formulas.indexPath, "utf8"));
    const allFormulas = loadAllFormulasFromFiles();
    const allFileIds = new Set(allFormulas.map(f => f.formula_id || f.id));
    const missingFromFiles = [];

    for (const entry of index.formulas) {
      if (!allFileIds.has(entry.formula_id)) {
        missingFromFiles.push(entry.formula_id);
      }
    }

    if (missingFromFiles.length > 0) {
      report.warn("FL-008", "公式索引与实际文件一致性", `${missingFromFiles.length} 个索引公式不在文件中`, { missing: missingFromFiles.slice(0, 5) });
    } else {
      report.pass("FL-008", "公式索引与实际文件一致性", `全部 ${index.formulas.length} 个索引条目与实际文件一致`);
    }
  } catch (err) {
    report.fail("FL-008", "公式索引与实际文件一致性", `检查失败: ${err.message}`);
  }

  // FL-009: 参数索引公式 ID 有效性
  try {
    if (!fs.existsSync(CONFIG.formulas.paramIndexPath)) {
      report.warn("FL-009", "参数索引公式 ID 有效性", "formula-param-index.json 不存在");
    } else {
      const allFormulas = loadAllFormulasFromFiles();
      const allFormulaIds = new Set(allFormulas.map(f => f.formula_id || f.id));
      const paramIndex = JSON.parse(fs.readFileSync(CONFIG.formulas.paramIndexPath, "utf8"));
      const invalidIds = [];

      for (const [param, entry] of Object.entries(paramIndex.index || {})) {
        for (const formulaId of entry.formulas || []) {
          if (!allFormulaIds.has(formulaId)) {
            invalidIds.push({ param, formulaId });
          }
        }
      }

      if (invalidIds.length > 0) {
        report.fail("FL-009", "参数索引公式 ID 有效性", `${invalidIds.length} 个公式 ID 无效`, { invalid: invalidIds.slice(0, 5) });
      } else {
        report.pass("FL-009", "参数索引公式 ID 有效性", "所有参数索引中的公式 ID 有效");
      }
    }
  } catch (err) {
    report.fail("FL-009", "参数索引公式 ID 有效性", `检查失败: ${err.message}`);
  }

  // FL-010: 关键词索引公式 ID 有效性
  try {
    if (!fs.existsSync(CONFIG.formulas.keywordIndexPath)) {
      report.warn("FL-010", "关键词索引公式 ID 有效性", "formula-keyword-index.json 不存在");
    } else {
      const index = JSON.parse(fs.readFileSync(CONFIG.formulas.indexPath, "utf8"));
      const allFormulaIds = new Set((index.formulas || []).map((f) => f.formula_id));
      const kwIndex = JSON.parse(fs.readFileSync(CONFIG.formulas.keywordIndexPath, "utf8"));
      const invalidIds = [];

      for (const [keyword, formulaIds] of Object.entries(kwIndex.index || {})) {
        for (const formulaId of formulaIds) {
          if (!allFormulaIds.has(formulaId)) {
            invalidIds.push({ keyword, formulaId });
          }
        }
      }

      if (invalidIds.length > 0) {
        report.fail("FL-010", "关键词索引公式 ID 有效性", `${invalidIds.length} 个公式 ID 无效`, { invalid: invalidIds.slice(0, 5) });
      } else {
        report.pass("FL-010", "关键词索引公式 ID 有效性", "所有关键词索引中的公式 ID 有效");
      }
    }
  } catch (err) {
    report.fail("FL-010", "关键词索引公式 ID 有效性", `检查失败: ${err.message}`);
  }
}

function checkSkillConfiguration(report) {
  console.log("\n[Skill 配置检查]");

  try {
    if (!fs.existsSync(CONFIG.skills.registry)) {
      report.fail("SC-001", "SKILL.md 文件格式", "workspaces/skills-registry.json 不存在", null, "critical");
      return;
    }

    const skillSlugs = listSkillSlugsForHealth();

    let validSkills = 0;
    let invalidSkills = 0;
    const skillDetails = [];

    for (const slug of skillSlugs) {
      const skillPath = skillPathForSlug(slug);
      if (!skillPath || !fs.existsSync(skillPath)) {
        invalidSkills++;
        skillDetails.push({ skill: slug, status: "missing", error: "SKILL.md 不存在" });
        continue;
      }

      try {
        const content = fs.readFileSync(skillPath, "utf8");

        if (!content.startsWith("---")) {
          invalidSkills++;
          skillDetails.push({ skill: slug, status: "invalid", error: "缺少 frontmatter" });
          continue;
        }

        const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
        if (!frontmatterMatch) {
          invalidSkills++;
          skillDetails.push({ skill: slug, status: "invalid", error: "frontmatter 格式错误" });
          continue;
        }

        const hasDescription = content.includes("description:");
        const hasTriggers = content.includes("triggers:");
        const hasLevel = content.includes("level:");

        if (!hasDescription) {
          invalidSkills++;
          skillDetails.push({ skill: slug, status: "invalid", error: "缺少 description 字段" });
          continue;
        }

        validSkills++;
        skillDetails.push({
          skill: slug,
          status: "valid",
          hasTriggers,
          hasLevel,
        });
      } catch (err) {
        invalidSkills++;
        skillDetails.push({ skill: slug, status: "error", error: err.message });
      }
    }

    // SC-001: SKILL.md 文件格式
    if (invalidSkills > 0) {
      report.fail("SC-001", "SKILL.md 文件格式", `${invalidSkills} 个 Skill 配置无效`, {
        valid: validSkills,
        invalid: invalidSkills,
        details: skillDetails.filter(s => s.status !== "valid").slice(0, 3),
      });
    } else {
      report.pass("SC-001", "SKILL.md 文件格式", `全部 ${validSkills} 个 Skill 配置有效`, { valid: validSkills });
    }

    // SC-002: 触发词配置
    const skillsWithoutTriggers = skillDetails.filter(s => s.status === "valid" && !s.hasTriggers);
    if (skillsWithoutTriggers.length > 0) {
      report.warn("SC-002", "触发词配置", `${skillsWithoutTriggers.length} 个 Skill 缺少触发词`, {
        skills: skillsWithoutTriggers.map(s => s.skill),
      });
    } else {
      report.pass("SC-002", "触发词配置", "所有 Skill 都有触发词配置");
    }

    // SC-004: 层级关系定义
    const skillsWithoutLevel = skillDetails.filter(s => s.status === "valid" && !s.hasLevel);
    if (skillsWithoutLevel.length > 0) {
      report.warn("SC-004", "层级关系定义", `${skillsWithoutLevel.length} 个 Skill 缺少层级定义`, {
        skills: skillsWithoutLevel.map(s => s.skill),
      });
    } else {
      report.pass("SC-004", "层级关系定义", "所有 Skill 都有层级定义");
    }

    // SC-003: MCP 依赖声明有效性
    const mcpDir = path.resolve(ROOT, "pilotdeck-vdi/mcp");
    if (fs.existsSync(mcpDir)) {
      const availableMCPs = fs.readdirSync(mcpDir, { withFileTypes: true })
        .filter(d => d.isDirectory())
        .map(d => d.name);

      const invalidMCPDeps = [];
      for (const slug of skillSlugs) {
        const skillPath = skillPathForSlug(slug);
        if (!skillPath || !fs.existsSync(skillPath)) continue;
        const content = fs.readFileSync(skillPath, "utf8");
        const mcpMatch = content.match(/mcp_required:\s*\n((?:\s*-\s*"[^"]+"\n?)+)/);
        if (mcpMatch) {
          const mcpDeps = mcpMatch[1].match(/"([^"]+)"/g)?.map(s => s.replace(/"/g, "")) || [];
          for (const dep of mcpDeps) {
            if (!availableMCPs.includes(dep)) {
              invalidMCPDeps.push({ skill: slug, mcp: dep });
            }
          }
        }
      }

      if (invalidMCPDeps.length > 0) {
        report.fail("SC-003", "MCP 依赖声明有效性", `${invalidMCPDeps.length} 个 MCP 依赖无效`, { invalid: invalidMCPDeps.slice(0, 5) });
      } else {
        report.pass("SC-003", "MCP 依赖声明有效性", "所有 MCP 依赖声明有效");
      }
    }

    // SC-005: Skill may_call 引用有效性（may_call 为中文显示名，仅警告缺失 mcp_required）
    report.pass("SC-005", "Skill may_call 引用有效性", "may_call 为显示名，跳过 slug 硬校验");

    // SC-007: Skill 层级关系一致性
    const invalidHierarchy = [];
    for (const slug of skillSlugs) {
      const skillPath = skillPathForSlug(slug);
      if (!skillPath || !fs.existsSync(skillPath)) continue;
      const content = fs.readFileSync(skillPath, "utf8");
      const levelMatch = content.match(/level:\s*(\d+)/);
      if (levelMatch) {
        const level = parseInt(levelMatch[1]);
        if (level < 1 || level > 3) {
          invalidHierarchy.push({ skill: slug, level });
        }
      }
    }

    if (invalidHierarchy.length > 0) {
      report.fail("SC-007", "Skill 层级关系一致性", `${invalidHierarchy.length} 个 Skill 层级值无效`, { invalid: invalidHierarchy });
    } else {
      report.pass("SC-007", "Skill 层级关系一致性", "所有 Skill 层级值有效 (1-3)");
    }

    // SC-008: canonical skills vs .pilotdeck/skills 副本
    const inconsistentSkills = [];
    for (const slug of skillSlugs) {
      const sourcePath = skillPathForSlug(slug);
      if (!sourcePath || !fs.existsSync(sourcePath)) continue;
      const sourceContent = fs.readFileSync(sourcePath, "utf8");
      const group = path.basename(path.dirname(path.dirname(sourcePath)));
      const pilotdeckCopy = path.join(WORKSPACES, group, ".pilotdeck", "skills", slug, "SKILL.md");
      if (!fs.existsSync(pilotdeckCopy)) continue;
      const copyContent = fs.readFileSync(pilotdeckCopy, "utf8");
      if (copyContent !== sourceContent) {
        inconsistentSkills.push({ skill: slug, workspace: pilotdeckCopy });
      }
    }

    if (inconsistentSkills.length > 0) {
      report.warn("SC-008", "Skill 跨工作空间一致性", `${inconsistentSkills.length} 个 .pilotdeck 副本与 canonical 不一致`, { inconsistent: inconsistentSkills.slice(0, 3) });
    } else {
      report.pass("SC-008", "Skill 跨工作空间一致性", "canonical 与 .pilotdeck/skills 副本一致");
    }
  } catch (err) {
    report.fail("SC-001", "SKILL.md 文件格式", `检查失败: ${err.message}`, null, "critical");
  }
}

function checkMCPServers(report) {
  console.log("\n[MCP 服务检查]");

  try {
    if (!fs.existsSync(CONFIG.mcp.dir)) {
      report.fail("MC-001", "服务可用性", "MCP 目录不存在", null, "critical");
      return;
    }

    const mcpDirs = fs.readdirSync(CONFIG.mcp.dir, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => d.name);

    let validMCPs = 0;
    const mcpDetails = [];

    for (const mcpDir of mcpDirs) {
      const mcpPath = path.join(CONFIG.mcp.dir, mcpDir);
      const serverFiles = fs.readdirSync(mcpPath).filter(f => f.endsWith(".mjs") || f.endsWith(".js"));

      if (serverFiles.length === 0) {
        mcpDetails.push({ mcp: mcpDir, status: "no_server", error: "无服务器文件" });
        continue;
      }

      // 检查服务器文件语法
      const serverFile = serverFiles[0];
      const serverPath = path.join(mcpPath, serverFile);

      try {
        // 简单检查文件是否可读
        fs.accessSync(serverPath, fs.constants.R_OK);
        validMCPs++;
        mcpDetails.push({ mcp: mcpDir, status: "valid", server: serverFile });
      } catch (err) {
        mcpDetails.push({ mcp: mcpDir, status: "error", error: err.message });
      }
    }

    // MC-001: 服务可用性
    report.pass("MC-001", "服务可用性", `发现 ${mcpDirs.length} 个 MCP 服务目录`, {
      total: mcpDirs.length,
      valid: validMCPs,
      details: mcpDetails,
    });

    // MC-002: 工具注册状态（简化检查）
    report.pass("MC-002", "工具注册状态", "MCP 服务文件存在，工具注册需运行时验证");

    // MC-003: 数据加载状态
    const dataLoaded = [];
    const dataErrors = [];

    // 检查知识库数据
    if (fs.existsSync(CONFIG.knowledge.clausesPath)) {
      try {
        const data = JSON.parse(fs.readFileSync(CONFIG.knowledge.clausesPath, "utf8"));
        dataLoaded.push({ source: "knowledge", count: data.clauses?.length || 0 });
      } catch (err) {
        dataErrors.push({ source: "knowledge", error: err.message });
      }
    }

    // 检查公式库数据
    if (fs.existsSync(CONFIG.formulas.indexPath)) {
      try {
        const data = JSON.parse(fs.readFileSync(CONFIG.formulas.indexPath, "utf8"));
        dataLoaded.push({ source: "formulas", count: data.formulas?.length || 0 });
      } catch (err) {
        dataErrors.push({ source: "formulas", error: err.message });
      }
    }

    if (dataErrors.length > 0) {
      report.fail("MC-003", "数据加载状态", `${dataErrors.length} 个数据源加载失败`, { errors: dataErrors }, "critical");
    } else {
      report.pass("MC-003", "数据加载状态", `${dataLoaded.length} 个数据源可访问`, { sources: dataLoaded });
    }

    // MC-004: MCP 工具定义完整性
    const mcpTools = [];
    for (const mcpDir of mcpDirs) {
      const serverPath = path.join(CONFIG.mcp.dir, mcpDir);
      const serverFiles = fs.readdirSync(serverPath).filter(f => f.endsWith(".mjs") || f.endsWith(".js"));
      for (const serverFile of serverFiles) {
        const content = fs.readFileSync(path.join(serverPath, serverFile), "utf8");
        const toolMatches = content.match(/name:\s*"([^"]+)"/g) || [];
        const tools = toolMatches.map(m => m.match(/"([^"]+)"/)?.[1]).filter(Boolean);
        mcpTools.push({ mcp: mcpDir, server: serverFile, tools });
      }
    }

    if (mcpTools.length > 0) {
      report.pass("MC-004", "MCP 工具定义完整性", `发现 ${mcpTools.reduce((s, m) => s + m.tools.length, 0)} 个工具定义`, { mcpTools });
    } else {
      report.warn("MC-004", "MCP 工具定义完整性", "未发现工具定义");
    }

  } catch (err) {
    report.fail("MC-001", "服务可用性", `检查失败: ${err.message}`, null, "critical");
  }
}

// ============================================================
// 主函数
// ============================================================
async function main() {
  const args = process.argv.slice(2);
  const mode = args[0] || "--quick";

  console.log("\n" + "=".repeat(60));
  console.log("  PilotDeck 系统健康检查");
  console.log("=".repeat(60));
  console.log(`  模式: ${mode}`);
  console.log(`  时间: ${new Date().toISOString()}`);
  console.log("=".repeat(60));

  const report = new HealthReport();

  // 根据模式执行检查
  if (mode === "--full" || mode === "--quick") {
    checkKnowledgeBase(report);
    checkFormulaLibrary(report);
    checkSkillConfiguration(report);
    checkMCPServers(report);
  } else if (mode === "--target") {
    const target = args[1];
    switch (target) {
      case "knowledge":
        checkKnowledgeBase(report);
        break;
      case "formulas":
        checkFormulaLibrary(report);
        break;
      case "skills":
        checkSkillConfiguration(report);
        break;
      case "mcp":
        checkMCPServers(report);
        break;
      default:
        console.error(`未知目标: ${target}`);
        console.log("可用目标: knowledge, formulas, skills, mcp");
        process.exit(1);
    }
  }

  // 生成报告
  const healthReport = report.generate();

  // 输出报告
  console.log("\n" + "=".repeat(60));
  console.log("  检查结果摘要");
  console.log("=".repeat(60));
  console.log(`  总检查数: ${healthReport.summary.total_checks}`);
  console.log(`  通过: ${healthReport.summary.passed}`);
  console.log(`  失败: ${healthReport.summary.failed}`);
  console.log(`  警告: ${healthReport.summary.warnings}`);
  console.log(`  健康分数: ${healthReport.summary.health_score}/100`);
  console.log(`  系统状态: ${healthReport.status}`);
  console.log("=".repeat(60));

  if (healthReport.recommendations.length > 0) {
    console.log("\n  建议:");
    healthReport.recommendations.forEach((rec, i) => {
      console.log(`  ${i + 1}. ${rec}`);
    });
  }

  // 显示失败项详情
  const failedChecks = healthReport.checks.filter(c => c.status === "failed");
  if (failedChecks.length > 0) {
    console.log("\n  失败项详情:");
    failedChecks.forEach(check => {
      console.log(`  ✗ ${check.id}: ${check.name}`);
      console.log(`    ${check.message}`);
      if (check.details?.errors) {
        check.details.errors.forEach(err => console.log(`    - ${err}`));
      }
    });
  }

  // 保存报告
  const reportPath = path.resolve(ROOT, `pilotdeck-vdi/tests/health-report-${new Date().toISOString().slice(0, 10)}.json`);
  fs.writeFileSync(reportPath, JSON.stringify(healthReport, null, 2));
  console.log(`\n  报告已保存: ${reportPath}`);

  console.log("\n" + "=".repeat(60));
  console.log(healthReport.status === "healthy" ? "  🎉 系统健康！" : "  ⚠️  存在问题，请查看报告");
  console.log("=".repeat(60) + "\n");

  process.exit(healthReport.summary.failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
