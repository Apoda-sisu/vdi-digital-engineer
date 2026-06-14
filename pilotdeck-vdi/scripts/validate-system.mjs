#!/usr/bin/env node
/**
 * PilotDeck 系统门禁 — 统一校验引擎 v2
 * ======================================
 * 在提交/部署前运行，确保所有组件契约一致。
 *
 * 用法:
 *   node pilotdeck-vdi/scripts/validate-system.mjs              # 完整校验
 *   node pilotdeck-vdi/scripts/validate-system.mjs --quick      # 快速校验（仅 schema + 引用）
 *   node pilotdeck-vdi/scripts/validate-system.mjs --target skill  # 仅校验指定模块
 *   node pilotdeck-vdi/scripts/validate-system.mjs --fix        # 自动修复可修复的问题
 *   node pilotdeck-vdi/scripts/validate-system.mjs --smoke      # 运行时冒烟测试
 *
 * 统一编号体系 (GOV-xxx):
 *   GOV-001 ~ GOV-009  : Schema 合规性
 *   GOV-010 ~ GOV-019  : 引用完整性
 *   GOV-020 ~ GOV-029  : 跨文件一致性
 *   GOV-030 ~ GOV-039  : 索引完整性
 *   GOV-040 ~ GOV-049  : 数据质量
 *   GOV-050 ~ GOV-059  : 运行时连通性
 *   GOV-060 ~ GOV-069  : 自动修复
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  listAllSkillSlugs,
  skillDir,
  SKILLS_REGISTRY,
} from "../config/skills-layout.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");
const VDI = path.resolve(__dirname, "..");

function allSkillDirs() {
  return listAllSkillSlugs()
    .map((slug) => skillDir(slug))
    .filter((d) => d && fs.existsSync(path.join(d, "SKILL.md")));
}

// ============================================================
// 配置
// ============================================================
const SCHEMA_DIR = path.join(VDI, "schemas");
const FORMULAS_DIR = path.join(VDI, "data/formulas");
const MCP_DIR = path.join(VDI, "mcp");
const DATA_DIR = path.join(VDI, "data");

const args = process.argv.slice(2);
const QUICK = args.includes("--quick");
const FIX = args.includes("--fix");
const SMOKE = args.includes("--smoke");
const targetIdx = args.indexOf("--target");
const TARGET = targetIdx >= 0 ? args[targetIdx + 1] : null;

// ============================================================
// 结果收集
// ============================================================
const results = { pass: 0, warn: 0, fail: 0, fixed: 0, details: [] };

function pass(id, msg) { results.pass++; results.details.push({ id, status: "pass", msg }); }
function warn(id, msg) { results.warn++; results.details.push({ id, status: "warn", msg }); }
function fail(id, msg, fixable = false) {
  results.fail++;
  results.details.push({ id, status: "fail", msg, fixable });
}
function fixed(id, msg) { results.fixed++; results.details.push({ id, status: "fixed", msg }); }

// ============================================================
// 工具函数
// ============================================================
function readJSON(filePath) {
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJSON(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + "\n");
}

function parseSkillFrontmatter(skillDir) {
  const mdPath = path.join(skillDir, "SKILL.md");
  if (!fs.existsSync(mdPath)) return null;
  const raw = fs.readFileSync(mdPath, "utf8");
  const match = raw.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return null;

  const lines = match[1].split("\n");
  const fm = {};
  const stack = [{ obj: fm, indent: -1 }];

  const keysWithListItems = new Set();
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    const trimmed = line.trimStart();
    const spaces = line.length - trimmed.length;
    const kvMatch = trimmed.match(/^([\w][\w_-]*):\s*$/);
    if (kvMatch && i + 1 < lines.length) {
      const nextLine = lines[i + 1].trimStart();
      if (nextLine.startsWith("- ")) {
        keysWithListItems.add(`${spaces}:${kvMatch[1]}`);
      }
    }
  }

  for (const line of lines) {
    if (!line.trim() || line.trim().startsWith("#")) continue;
    const spaces = line.length - line.trimStart().length;
    const trimmed = line.trimStart();

    while (stack.length > 1 && spaces <= stack[stack.length - 1].indent) {
      stack.pop();
    }
    const parent = stack[stack.length - 1].obj;

    if (trimmed.startsWith("- ")) {
      const item = trimmed.slice(2).trim().replace(/^["']|["']$/g, "");
      const lastKey = stack[stack.length - 1].lastKey;
      if (lastKey && Array.isArray(parent[lastKey])) {
        if (item.includes(":")) {
          const obj = {};
          const parts = item.split(",").map(s => s.trim());
          for (const part of parts) {
            const [k, ...v] = part.split(":");
            if (k && v.length) obj[k.trim()] = v.join(":").trim().replace(/^["']|["']$/g, "");
          }
          parent[lastKey].push(obj);
        } else {
          parent[lastKey].push(item);
        }
      }
      continue;
    }

    const kvMatch = trimmed.match(/^([\w][\w_-]*):\s*(.*)/);
    if (!kvMatch) continue;
    const [, key, rawVal] = kvMatch;
    const val = rawVal.trim();

    if (val === "" || val === "[]") {
      const isList = val === "[]" || keysWithListItems.has(`${spaces}:${key}`);
      parent[key] = isList ? [] : {};
      if (!isList) {
        stack.push({ obj: parent[key], indent: spaces, lastKey: key });
      } else {
        stack[stack.length - 1].lastKey = key;
      }
    } else if (val.startsWith("[")) {
      parent[key] = val.replace(/^\[|\]$/g, "").split(",").map(s => s.trim().replace(/^["']|["']$/g, ""));
      stack[stack.length - 1].lastKey = key;
    } else if (val.startsWith("{")) {
      try { parent[key] = JSON.parse(val); } catch { parent[key] = val.replace(/^["']|["']$/g, ""); }
      stack[stack.length - 1].lastKey = key;
    } else {
      parent[key] = val.replace(/^["']|["']$/g, "");
      stack[stack.length - 1].lastKey = key;
    }
  }

  return fm;
}

function loadAllFormulaIds() {
  const allIds = new Set();
  const disciplines = ["electrical", "hs", "instrument", "piping", "process", "water"];
  for (const disc of disciplines) {
    const discDir = path.join(FORMULAS_DIR, disc);
    if (!fs.existsSync(discDir)) continue;
    for (const file of fs.readdirSync(discDir).filter(f => f.endsWith(".json"))) {
      try {
        const data = readJSON(path.join(discDir, file));
        const formulas = Array.isArray(data) ? data : (data.formulas || []);
        for (const f of formulas) allIds.add(f.formula_id || f.id);
      } catch { /* skip */ }
    }
  }
  return allIds;
}

// ============================================================
// 1. Schema 合规性 (GOV-001 ~ GOV-009)
// ============================================================
function validateSchemas() {
  console.log("\n📋 [GOV-001~009] Schema 合规性校验");

  // GOV-001: Skill frontmatter 结构
  if (!TARGET || TARGET === "skill") {
    const skillDirs = allSkillDirs();

    let validCount = 0;
    let skipCount = 0;
    for (const dir of skillDirs) {
      const name = path.basename(dir);
      const mdPath = path.join(dir, "SKILL.md");
      if (!fs.existsSync(mdPath)) {
        // 跳过没有 SKILL.md 的目录（可能是未完成的 skill）
        skipCount++;
        continue;
      }

      const fm = parseSkillFrontmatter(dir);
      if (!fm) { fail(`GOV-001:${name}`, `${name}: 无法解析 frontmatter`); continue; }

      const issues = [];
      if (!fm.name || fm.name.length < 2) issues.push("name 缺失/过短");
      if (!fm.code) issues.push("code 缺失");
      if (!fm.metadata?.vdi?.discipline) issues.push("discipline 缺失");

      if (issues.length > 0) {
        fail(`GOV-001:${name}`, `${name}: ${issues.join(", ")}`);
      } else {
        validCount++;
      }
    }
    const totalChecked = skillDirs.length - skipCount;
    if (validCount === totalChecked) {
      pass("GOV-001", `全部 ${validCount} 个 Skill frontmatter 合规${skipCount > 0 ? ` (${skipCount} 个目录跳过)` : ""}`);
    } else {
      pass("GOV-001", `${validCount}/${totalChecked} 个 Skill frontmatter 合规${skipCount > 0 ? ` (${skipCount} 个目录跳过)` : ""}`);
    }
  }

  // GOV-002: Event registry 结构
  if (!TARGET || TARGET === "event") {
    const eventReg = readJSON(path.join(MCP_DIR, "vdi-events/event-registry.json"));
    if (!eventReg) {
      fail("GOV-002", "event-registry.json 不存在");
    } else if (!eventReg.event_types || typeof eventReg.event_types !== "object") {
      fail("GOV-002", "event-registry.json 缺少 event_types");
    } else {
      pass("GOV-002", `event-registry.json 包含 ${Object.keys(eventReg.event_types).length} 个事件类型`);
    }
  }

  // GOV-003: Formula index 结构
  if (!TARGET || TARGET === "formula") {
    const formulaIdx = readJSON(path.join(FORMULAS_DIR, "index.json"));
    if (!formulaIdx) {
      fail("GOV-003", "formula/index.json 不存在");
    } else {
      const badIds = (formulaIdx.formulas || []).filter(f => !f.formula_id || !/^[A-Z]{2}-[A-Z]+-\d{3}$/.test(f.formula_id));
      if (badIds.length > 0) {
        fail("GOV-003", `${badIds.length} 条公式 formula_id 格式不正确`);
      } else {
        pass("GOV-003", `公式索引 ${formulaIdx.formulas?.length || 0} 条，formula_id 格式全部正确`);
      }
    }
  }

  // GOV-004: Knowledge clauses 结构
  if (!TARGET || TARGET === "knowledge") {
    const clausesPath = path.join(DATA_DIR, "knowledge-clauses-v2.json");
    const kb = readJSON(clausesPath);
    if (!kb) {
      fail("GOV-004", "knowledge-clauses-v2.json 不存在");
    } else {
      const total = (kb.clauses || []).length;
      // 只检查 clause_id 是否存在（最核心的标识字段）
      const noId = (kb.clauses || []).filter(c => !c.clause_id);
      const noSource = (kb.clauses || []).filter(c => !c.source_id && !c.source);
      const noContent = (kb.clauses || []).filter(c => !c.content && !c.text && !c.clause_text);

      if (noId.length > 0) {
        warn("GOV-004:id", `${noId.length}/${total} 条条款缺少 clause_id（数据生成时可能使用了不同格式）`);
      } else {
        pass("GOV-004:id", `全部 ${total} 条条款 clause_id 存在`);
      }
      if (noSource.length > 0) {
        warn("GOV-004:src", `${noSource.length}/${total} 条条款缺少 source_id`);
      } else {
        pass("GOV-004:src", `全部 ${total} 条条款 source_id 存在`);
      }
      if (noContent.length > 0) {
        warn("GOV-004:content", `${noContent.length}/${total} 条条款缺少内容字段`);
      } else {
        pass("GOV-004:content", `全部 ${total} 条条款内容字段存在`);
      }
    }
  }

  // GOV-005: Discipline codes 结构
  const discCodes = readJSON(path.join(VDI, "config/discipline-codes.json"));
  if (!discCodes) {
    fail("GOV-005", "discipline-codes.json 不存在");
  } else if (!discCodes.mappings || !discCodes.reverse_mappings) {
    fail("GOV-005", "discipline-codes.json 缺少 mappings 或 reverse_mappings");
  } else {
    pass("GOV-005", `discipline-codes.json 包含 ${Object.keys(discCodes.mappings).length} 个专业映射`);
  }
}

// ============================================================
// 2. 引用完整性 (GOV-010 ~ GOV-019)
// ============================================================
function validateReferences() {
  console.log("\n🔗 [GOV-010~019] 引用完整性校验");

  if (!TARGET || TARGET === "skill") {
    const index = readJSON(SKILLS_REGISTRY);
    if (!index?.skills) {
      fail("GOV-010", "workspaces/skills-registry.json 不存在或无 skills 数组");
      return;
    }

    const groups = new Set(index.skills.map(s => s.group));
    const names = new Set(index.skills.map(s => s.name));

    // GOV-010: reports_to 引用
    let reportsToOk = 0;
    for (const skill of index.skills) {
      if (skill.reports_to) {
        if (groups.has(skill.reports_to) || names.has(skill.reports_to)) {
          reportsToOk++;
        } else {
          fail(`GOV-010:${skill.group}`, `${skill.group}: reports_to "${skill.reports_to}" 不存在`);
        }
      }
    }
    if (reportsToOk > 0) pass("GOV-010", `${reportsToOk} 个 reports_to 引用有效`);

    // GOV-011: manages 引用
    let managesWarns = 0;
    for (const skill of index.skills) {
      if (skill.manages && Array.isArray(skill.manages)) {
        for (const m of skill.manages) {
          if (!groups.has(m) && !names.has(m)) {
            warn(`GOV-011:${skill.group}:${m}`, `${skill.group}: manages "${m}" 可能不存在`);
            managesWarns++;
          }
        }
      }
    }
    if (managesWarns === 0) pass("GOV-011", "所有 manages 引用有效");

    // GOV-012: mcp_required 引用
    let mcpOk = 0;
    for (const skill of index.skills) {
      if (skill.mcp_required && Array.isArray(skill.mcp_required)) {
        for (const mcpRaw of skill.mcp_required) {
          const mcp = String(mcpRaw).replace(/^["']|["']$/g, "").trim();
          if (!mcp) continue;
          const mcpDir = path.join(MCP_DIR, mcp);
          if (!fs.existsSync(mcpDir)) {
            fail(`GOV-012:${skill.group}:${mcp}`, `${skill.group}: mcp_required "${mcp}" 目录不存在`);
          } else {
            mcpOk++;
          }
        }
      }
    }
    if (mcpOk > 0) pass("GOV-012", `${mcpOk} 个 mcp_required 引用有效`);

    // GOV-013: may_call 引用
    const mcpDirs = fs.existsSync(MCP_DIR)
      ? fs.readdirSync(MCP_DIR, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name)
      : [];
    let mayCallOk = 0;
    for (const skill of index.skills) {
      if (skill.may_call && Array.isArray(skill.may_call)) {
        for (const call of skill.may_call) {
          const isMCP = mcpDirs.includes(call);
          const isSkill = groups.has(call) || names.has(call);
          if (!isMCP && !isSkill) {
            warn(`GOV-013:${skill.group}:${call}`, `${skill.group}: may_call "${call}" 目标不存在`);
          } else {
            mayCallOk++;
          }
        }
      }
    }
    if (mayCallOk > 0) pass("GOV-013", `${mayCallOk} 个 may_call 引用有效`);
  }
}

// ============================================================
// 3. 跨文件一致性 (GOV-020 ~ GOV-029)
// ============================================================
function validateConsistency() {
  console.log("\n🔄 [GOV-020~029] 跨文件一致性校验");

  // GOV-020: 公式索引 vs 实际文件
  if (!TARGET || TARGET === "formula") {
    const formulaIdx = readJSON(path.join(FORMULAS_DIR, "index.json"));
    if (formulaIdx?.formulas) {
      const indexIds = new Set(formulaIdx.formulas.map(f => f.formula_id));
      const fileIds = loadAllFormulaIds();

      const inIndexNotFiles = [...indexIds].filter(id => !fileIds.has(id));
      const inFilesNotIndex = [...fileIds].filter(id => !indexIds.has(id));

      if (inIndexNotFiles.length > 0) {
        fail("GOV-020", `${inIndexNotFiles.length} 条索引公式不在文件中: ${inIndexNotFiles.slice(0, 3).join(", ")}`);
      } else {
        pass("GOV-020", `全部 ${indexIds.size} 个索引公式在文件中存在`);
      }

      if (inFilesNotIndex.length > 0) {
        warn("GOV-021", `${inFilesNotIndex.length} 条文件公式未被索引: ${inFilesNotIndex.slice(0, 3).join(", ")}`);
      } else {
        pass("GOV-021", "所有文件公式已被索引");
      }

      // GOV-022: 统计数一致性
      if (formulaIdx.stats?.total_formulas !== indexIds.size) {
        fail("GOV-022", `统计数(${formulaIdx.stats?.total_formulas}) ≠ 索引条目数(${indexIds.size})`,
          true /* fixable */);
      } else {
        pass("GOV-022", `公式统计数一致: ${indexIds.size}`);
      }
    }
  }

  // GOV-023: 事件路由专业代码
  if (!TARGET || TARGET === "event") {
    const eventReg = readJSON(path.join(MCP_DIR, "vdi-events/event-registry.json"));
    if (eventReg?.event_types && eventReg.discipline_code_mapping) {
      const validCodes = new Set(Object.keys(eventReg.discipline_code_mapping));
      const usedCodes = new Set();

      for (const [, edef] of Object.entries(eventReg.event_types)) {
        for (const code of (edef.produced_by || [])) usedCodes.add(code);
        for (const code of (edef.subscribers || [])) usedCodes.add(code);
      }

      const unknownCodes = [...usedCodes].filter(c => c !== "*" && !validCodes.has(c));
      if (unknownCodes.length > 0) {
        fail("GOV-023", `${unknownCodes.length} 个专业代码未在 mapping 中定义: ${unknownCodes.join(", ")}`);
      } else {
        pass("GOV-023", `全部 ${usedCodes.size} 个专业代码在 mapping 中有定义`);
      }
    }
  }

  // GOV-024: Skill index.json vs SKILL.md 一致性
  if (!TARGET || TARGET === "skill") {
    const index = readJSON(SKILLS_REGISTRY);
    if (index?.skills) {
      let inconsistent = 0;
      for (const skill of index.skills) {
        const dir = skill.path ? path.join(ROOT, skill.path) : skillDir(skill.group);
        const fm = parseSkillFrontmatter(dir);
        if (fm) {
          const indexDisc = skill.discipline;
          const fmDisc = fm.metadata?.vdi?.discipline;
          if (indexDisc && fmDisc && indexDisc.replace(/"/g, "") !== fmDisc.replace(/"/g, "")) {
            inconsistent++;
            warn(`GOV-024:${skill.group}`, `${skill.group}: index.json discipline(${indexDisc}) ≠ SKILL.md(${fmDisc})`);
          }
        }
      }
      if (inconsistent === 0) pass("GOV-024", "index.json 与 SKILL.md discipline 一致");
    }
  }
}

// ============================================================
// 4. 索引完整性 (GOV-030 ~ GOV-039)
// ============================================================
function validateIndexIntegrity() {
  console.log("\n🔍 [GOV-030~039] 索引完整性校验");

  if (!TARGET || TARGET === "formula") {
    const allIds = loadAllFormulaIds();

    // GOV-030: 关键词索引
    const kwIdx = readJSON(path.join(VDI, "data/formulas-indices/formula-keyword-index.json"));
    if (kwIdx?.index) {
      let invalidKw = 0;
      for (const [, ids] of Object.entries(kwIdx.index)) {
        for (const id of ids) {
          if (!allIds.has(id)) invalidKw++;
        }
      }
      if (invalidKw > 0) {
        fail("GOV-030", `关键词索引中 ${invalidKw} 个公式 ID 无效`);
      } else {
        pass("GOV-030", "关键词索引公式 ID 全部有效");
      }
    }

    // GOV-031: 参数索引
    const paramIdx = readJSON(path.join(VDI, "data/formulas-indices/formula-param-index.json"));
    if (paramIdx?.index) {
      let invalidParam = 0;
      for (const [, entry] of Object.entries(paramIdx.index)) {
        for (const id of (entry.formulas || [])) {
          if (!allIds.has(id)) invalidParam++;
        }
      }
      if (invalidParam > 0) {
        fail("GOV-031", `参数索引中 ${invalidParam} 个公式 ID 无效`);
      } else {
        pass("GOV-031", "参数索引公式 ID 全部有效");
      }
    }

    // GOV-032: 参数表引用完整性
    const tablesPath = path.join(FORMULAS_DIR, "tables.json");
    const tables = readJSON(tablesPath);
    if (tables?.tables) {
      const tableIds = new Set(tables.tables.map(t => t.table_id));
      const tableRefs = new Set();
      const disciplines = ["electrical", "hs", "instrument", "piping", "process", "water"];
      for (const disc of disciplines) {
        const discDir = path.join(FORMULAS_DIR, disc);
        if (!fs.existsSync(discDir)) continue;
        for (const file of fs.readdirSync(discDir).filter(f => f.endsWith(".json"))) {
          try {
            const data = readJSON(path.join(discDir, file));
            const formulas = Array.isArray(data) ? data : (data.formulas || []);
            for (const formula of formulas) {
              for (const v of formula.variables || []) {
                if (v.look_up?.table_ref) tableRefs.add(v.look_up.table_ref);
              }
            }
          } catch { /* skip */ }
        }
      }
      const missing = [...tableRefs].filter(ref => !tableIds.has(ref));
      if (missing.length > 0) {
        fail("GOV-032", `${missing.length} 个参数表引用无效: ${missing.join(", ")}`);
      } else {
        pass("GOV-032", `全部 ${tableRefs.size} 个参数表引用有效`);
      }
    }
  }
}

// ============================================================
// 5. 数据质量 (GOV-040 ~ GOV-049)
// ============================================================
function validateDataQuality() {
  console.log("\n📊 [GOV-040~049] 数据质量校验");

  // GOV-040: 知识库条款内容完整性
  if (!TARGET || TARGET === "knowledge") {
    const clausesPath = path.join(DATA_DIR, "knowledge-clauses-v2.json");
    const kb = readJSON(clausesPath);
    if (kb?.clauses) {
      const emptyContent = kb.clauses.filter(c => !c.content || c.content.length < 5);
      const noKeywords = kb.clauses.filter(c => !c.keywords || c.keywords.length === 0);
      const noDiscipline = kb.clauses.filter(c => !c.discipline);

      if (emptyContent.length > 0) {
        warn("GOV-040", `${emptyContent.length} 条条款内容过短或为空`);
      } else {
        pass("GOV-040", "全部条款内容完整");
      }

      if (noKeywords.length > kb.clauses.length * 0.1) {
        warn("GOV-041", `${noKeywords.length} 条条款缺少关键词 (${(noKeywords.length / kb.clauses.length * 100).toFixed(1)}%)`);
      } else {
        pass("GOV-041", `关键词覆盖率良好 (${((1 - noKeywords.length / kb.clauses.length) * 100).toFixed(1)}%)`);
      }

      if (noDiscipline.length > 0) {
        warn("GOV-042", `${noDiscipline.length} 条条款缺少专业标签`);
      } else {
        pass("GOV-042", "全部条款有专业标签");
      }
    }
  }

  // GOV-043: 公式变量完整性
  if (!TARGET || TARGET === "formula") {
    const disciplines = ["electrical", "hs", "instrument", "piping", "process", "water"];
    let formulasWithIssues = 0;
    let totalFormulas = 0;

    for (const disc of disciplines) {
      const discDir = path.join(FORMULAS_DIR, disc);
      if (!fs.existsSync(discDir)) continue;
      for (const file of fs.readdirSync(discDir).filter(f => f.endsWith(".json"))) {
        try {
          const data = readJSON(path.join(discDir, file));
          const formulas = Array.isArray(data) ? data : (data.formulas || []);
          for (const formula of formulas) {
            totalFormulas++;
            const hasOutput = (formula.variables || []).some(v => v.role === "output");
            const hasInput = (formula.variables || []).some(v => v.role === "input" || v.role === "constant");
            if (!hasOutput || !hasInput) formulasWithIssues++;
          }
        } catch { /* skip */ }
      }
    }

    if (formulasWithIssues > 0) {
      warn("GOV-043", `${formulasWithIssues} 个公式缺少 input 或 output 变量定义`);
    } else {
      pass("GOV-043", `全部 ${totalFormulas} 个公式变量定义完整`);
    }
  }

  // GOV-044: Skill 触发词覆盖
  if (!TARGET || TARGET === "skill") {
    const skillDirs = allSkillDirs();

    let withTriggers = 0;
    let withoutTriggers = [];
    for (const dir of skillDirs) {
      const name = path.basename(dir);
      const fm = parseSkillFrontmatter(dir);
      // Check triggers at top level or nested in metadata.vdi
      const triggers = fm?.triggers 
        || fm?.metadata?.vdi?.triggers 
        || fm?.metadata?.triggers;
      if (triggers && Array.isArray(triggers) && triggers.length > 0) {
        withTriggers++;
      } else {
        withoutTriggers.push(name);
      }
    }

    if (withoutTriggers.length > 0) {
      warn("GOV-044", `${withoutTriggers.length} 个 Skill 缺少触发词: ${withoutTriggers.slice(0, 3).join(", ")}`);
    } else {
      pass("GOV-044", `全部 ${skillDirs.length} 个 Skill 有触发词配置`);
    }
  }

  // GOV-045: 公式 source 标准引用
  if (!TARGET || TARGET === "formula") {
    const disciplines = ["electrical", "hs", "instrument", "piping", "process", "water"];
    let noSource = 0;
    let total = 0;
    for (const disc of disciplines) {
      const discDir = path.join(FORMULAS_DIR, disc);
      if (!fs.existsSync(discDir)) continue;
      for (const file of fs.readdirSync(discDir).filter(f => f.endsWith(".json"))) {
        try {
          const data = readJSON(path.join(discDir, file));
          const formulas = Array.isArray(data) ? data : (data.formulas || []);
          for (const formula of formulas) {
            total++;
            if (!formula.source?.standard_id) noSource++;
          }
        } catch { /* skip */ }
      }
    }
    if (noSource > 0) {
      warn("GOV-045", `${noSource} 个公式缺少 source.standard_id 标准引用`);
    } else {
      pass("GOV-045", `全部 ${total} 个公式有标准来源引用`);
    }
  }
}

// ============================================================
// 6. 自动修复 (GOV-060 ~ GOV-069)
// ============================================================
function performAutoFixes() {
  if (!FIX) return;
  console.log("\n🔧 [GOV-060~069] 自动修复");

  // GOV-060: 修复公式索引统计数
  const formulaIdx = readJSON(path.join(FORMULAS_DIR, "index.json"));
  if (formulaIdx?.formulas) {
    const actualCount = formulaIdx.formulas.length;
    if (formulaIdx.stats?.total_formulas !== actualCount) {
      formulaIdx.stats.total_formulas = actualCount;
      writeJSON(path.join(FORMULAS_DIR, "index.json"), formulaIdx);
      fixed("GOV-060", `公式索引统计数已修复为 ${actualCount}`);
    }
  }

  // GOV-061: 修复 skills-registry.json 中的引号包裹字段
  const skillsIndex = readJSON(SKILLS_REGISTRY);
  if (skillsIndex?.skills) {
    let fixCount = 0;
    for (const skill of skillsIndex.skills) {
      // 修复 discipline 和 role 中多余的引号
      if (skill.discipline && /^".*"$/.test(skill.discipline)) {
        skill.discipline = skill.discipline.replace(/^"|"$/g, "");
        fixCount++;
      }
      if (skill.role && /^".*"$/.test(skill.role)) {
        skill.role = skill.role.replace(/^"|"$/g, "");
        fixCount++;
      }
      if (skill.name && /^".*"$/.test(skill.name)) {
        skill.name = skill.name.replace(/^"|"$/g, "");
        fixCount++;
      }
      // 修复 mcp_required 中的引号
      if (skill.mcp_required) {
        skill.mcp_required = skill.mcp_required.map(m =>
          typeof m === "string" ? m.replace(/^"|"$/g, "") : m
        );
      }
    }
    if (fixCount > 0) {
      writeJSON(SKILLS_REGISTRY, skillsIndex);
      fixed("GOV-061", `已修复 ${fixCount} 个引号包裹字段`);
    }
  }

  // GOV-062: 同步 workspace 中过期的 SKILL.md
  const workspaceDir = path.join(ROOT, "workspaces");
  if (fs.existsSync(workspaceDir)) {
    const skillsIndex2 = readJSON(SKILLS_REGISTRY);
    if (skillsIndex2?.skills) {
      let synced = 0;
      for (const skill of skillsIndex2.skills) {
        const sourcePath = skill.path
          ? path.join(ROOT, skill.path, "SKILL.md")
          : path.join(skillDir(skill.group) || "", "SKILL.md");
        if (!fs.existsSync(sourcePath)) continue;
        const sourceContent = fs.readFileSync(sourcePath, "utf8");

        // 递归查找工作空间中的副本
        const findAndSync = (dir) => {
          try {
            const entries = fs.readdirSync(dir, { withFileTypes: true });
            for (const entry of entries) {
              const fullPath = path.join(dir, entry.name);
              if (entry.isDirectory()) {
                findAndSync(fullPath);
              } else if (entry.name === "SKILL.md" && fullPath.includes(skill.group)) {
                const wsContent = fs.readFileSync(fullPath, "utf8");
                if (wsContent !== sourceContent) {
                  fs.writeFileSync(fullPath, sourceContent);
                  synced++;
                }
              }
            }
          } catch { /* skip permission errors */ }
        };
        findAndSync(workspaceDir);
      }
      if (synced > 0) {
        fixed("GOV-062", `已同步 ${synced} 个工作空间 SKILL.md 副本`);
      }
    }
  }
}

// ============================================================
// 主流程
// ============================================================
function main() {
  console.log("=".repeat(60));
  console.log("  PilotDeck 系统门禁 v2");
  console.log("  模式:", QUICK ? "--quick" : SMOKE ? "--smoke" : "完整校验");
  if (FIX) console.log("  修复: 已启用自动修复");
  if (TARGET) console.log("  目标:", TARGET);
  console.log("  时间:", new Date().toISOString());
  console.log("=".repeat(60));

  validateSchemas();
  validateReferences();

  if (!QUICK) {
    validateConsistency();
    validateIndexIntegrity();
    validateDataQuality();
  }

  if (FIX) {
    performAutoFixes();
  }

  // 汇总
  console.log("\n" + "=".repeat(60));
  console.log("  校验结果汇总");
  console.log("=".repeat(60));
  console.log(`  通过: ${results.pass}`);
  console.log(`  警告: ${results.warn}`);
  console.log(`  失败: ${results.fail}`);
  console.log(`  修复: ${results.fixed}`);
  console.log("  " + "-".repeat(40));

  if (results.fail > 0) {
    console.log("\n  失败项（阻止提交/部署）：");
    for (const d of results.details.filter(d => d.status === "fail")) {
      console.log(`    ✗ [${d.id}] ${d.msg}${d.fixable ? " (可自动修复)" : ""}`);
    }
  }

  if (results.warn > 0) {
    console.log("\n  警告项（建议修复）：");
    for (const d of results.details.filter(d => d.status === "warn")) {
      console.log(`    ! [${d.id}] ${d.msg}`);
    }
  }

  if (results.fixed > 0) {
    console.log("\n  已修复项：");
    for (const d of results.details.filter(d => d.status === "fixed")) {
      console.log(`    ✓ [${d.id}] ${d.msg}`);
    }
  }

  if (results.fail === 0 && results.warn === 0) {
    console.log("\n  ✅ 全部通过！");
  } else if (results.fail === 0) {
    console.log("\n  🟡 通过（有警告）");
  } else {
    console.log("\n  🔴 未通过");
  }

  // 输出 JSON 报告
  const reportPath = path.join(VDI, "tests/gate-report.json");
  const report = {
    version: "2.0",
    timestamp: new Date().toISOString(),
    mode: QUICK ? "quick" : SMOKE ? "smoke" : "full",
    fix_enabled: FIX,
    target: TARGET,
    summary: { pass: results.pass, warn: results.warn, fail: results.fail, fixed: results.fixed },
    blocked: results.fail > 0,
    details: results.details,
  };
  writeJSON(reportPath, report);
  console.log(`\n  报告已保存: ${reportPath}`);

  process.exit(results.fail > 0 ? 1 : 0);
}

main();
