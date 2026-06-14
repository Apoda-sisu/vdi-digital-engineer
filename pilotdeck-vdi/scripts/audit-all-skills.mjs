#!/usr/bin/env node
/**
 * 全局 Skill 审计（Tier-0 跨专业 + Tier-1 委派专业脚本）
 *
 * 规格：docs/系统建设方案与各模块设计/1013_audit-all-skills规格.md
 *
 * 用法:
 *   node pilotdeck-vdi/scripts/audit-all-skills.mjs
 *   node pilotdeck-vdi/scripts/audit-all-skills.mjs --json
 *   node pilotdeck-vdi/scripts/audit-all-skills.mjs --strict-eval
 *   node pilotdeck-vdi/scripts/audit-all-skills.mjs --discipline PI|WA|PR
 */

import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  REPO,
  SKILLS_REGISTRY,
  USER_SCOPE_SLUGS,
  listAllSkillSlugs,
  skillDir,
  indexMdForGroup,
} from "../config/skills-layout.mjs";
import { buildVdiToCfihos, VDI_RUNTIME_EXCEPTIONS } from "../config/cfihos-discipline-resolve.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const USER_SKILLS_DIR = path.join(ROOT, "pilotdeck-user-skills");
const DISCIPLINE_CODES = path.join(ROOT, "config/discipline-codes.json");
const CFIHOS_SKILL_MAP = path.join(ROOT, "data/skill-cfihos-unique-codes.json");
const REPORT_PATH = path.join(ROOT, "tests/all-skill-audit.json");
const CFIHOS_CODE_RE = /^CFIHOS-\d{8}$/;

const INDEX_JSON = SKILLS_REGISTRY;
const GROUP_INDEX = { MP: "管道组", CI: "给排水组", PX: "工艺组", IN: "仪控组" };
const ACTIVE_DISCIPLINES = ["MP", "CI", "PX", "IN"];
/** CLI --discipline 兼容 legacy VDI 过滤 */
const DISCIPLINE_FILTER_ALIASES = { PI: "MP", PR: "PX", ...buildVdiToCfihos() };
const INDEX_DIRS = { MP: "vdi-piping", CI: "vdi-water", PX: "vdi-process" };

/** 质量优先：软警告阈值（规格 1013 §2） */
const LINE_LIMITS = {
  1: { soft: 150, hard: 250, progressive: 500 },
  2: { soft: 200, hard: 300, progressive: 500 },
  3: { min: 40, hard: 400, progressive: 500 },
};

const args = process.argv.slice(2);
const writeJson = args.includes("--json");
const strictEval = args.includes("--strict-eval");
const disciplineFilter = args.includes("--discipline")
  ? (DISCIPLINE_FILTER_ALIASES[args[args.indexOf("--discipline") + 1]?.toUpperCase()]
    || args[args.indexOf("--discipline") + 1]?.toUpperCase())
  : null;

const issues = [];
const warnings = [];
const passed = [];
const lineWarnings = [];
const evalGaps = [];
const ghostSkills = [];

function ok(msg) { passed.push(msg); }
function warn(msg) { warnings.push(msg); }
function fail(msg) { issues.push(msg); }

function readSkill(slug) {
  const p = path.join(skillDir(slug) || "", "SKILL.md");
  if (!fs.existsSync(p)) return null;
  const text = fs.readFileSync(p, "utf8");
  const fm = text.match(/^---\n([\s\S]*?)\n---/);
  const body = fm ? text.slice(fm[0].length) : text;
  const lines = text.split("\n").length;
  let level = null;
  let deliverable = null;
  if (fm) {
    const levelMatch = fm[1].match(/level:\s*(\d)/);
    if (levelMatch) level = Number(levelMatch[1]);
    const delMatch = fm[1].match(/deliverable_code:\s*(\S+)/);
    if (delMatch) deliverable = delMatch[1];
    if (!deliverable) {
      const delBody = body.match(/deliverable_code:\s*(\S+)/);
      if (delBody) deliverable = delBody[1];
    }
  }
  const descMatch = fm?.[1]?.match(/^description:\s*>?-?\s*\n?([\s\S]*?)(?:\n\w|\n---)/m)
    || fm?.[1]?.match(/^description:\s*(.+)$/m);
  const description = descMatch
    ? descMatch[1].replace(/\n\s+/g, " ").trim()
    : "";
  return { slug, path: p, text, yaml: fm?.[1] || "", body, lines, level, deliverable, description };
}

function listSkillSlugs() {
  return listAllSkillSlugs();
}

function slugMatchesDiscipline(slug, code) {
  const prefix = { MP: "vdi-piping-", PI: "vdi-piping-", CI: "vdi-water-", WA: "vdi-water-", PX: "vdi-process-", PR: "vdi-process-" }[code];
  return prefix ? slug.startsWith(prefix) : true;
}

// ── G-01 index.json ↔ filesystem ──
const fsSlugs = new Set(listSkillSlugs());
if (fs.existsSync(INDEX_JSON)) {
  const index = JSON.parse(fs.readFileSync(INDEX_JSON, "utf8"));
  const indexGroups = new Set((index.skills || index.groups || []).map((s) => (typeof s === "string" ? s : s.slug)));
  for (const g of indexGroups) {
    if (!fsSlugs.has(g)) fail(`index.json 引用但磁盘缺失: ${g}`);
  }
  for (const s of fsSlugs) {
    if (!indexGroups.has(s)) warn(`磁盘存在但未入 index.json: ${s}`);
  }
  if (indexGroups.size === fsSlugs.size) ok(`index.json 与文件系统一致: ${fsSlugs.size} 个 Skill`);
} else {
  fail("缺少 workspaces/skills-registry.json");
}

// ── G-02 / G-04 discipline-codes ↔ filesystem ──
if (fs.existsSync(DISCIPLINE_CODES)) {
  const dc = JSON.parse(fs.readFileSync(DISCIPLINE_CODES, "utf8"));
  for (const [code, cfg] of Object.entries(dc.mappings || {})) {
    const lead = cfg.lead_skill;
    const pending = cfg.status === "pending";
    const slots = [lead, ...(cfg.sub_skills || []), ...(cfg.shared_utils || [])].filter(Boolean);
    const allGhost = slots.length > 0 && slots.every((slug) => !fsSlugs.has(slug));

    if (lead && !pending && !allGhost) {
      if (fsSlugs.has(lead)) ok(`discipline ${code}: lead ${lead} 存在`);
      else fail(`discipline ${code}: lead 缺失 ${lead}`);
    } else if (lead && allGhost) {
      warn(`discipline ${code}: 仅配置未实体化（${slots.length} 槽位）`);
      for (const slug of slots) ghostSkills.push({ code, slug, reason: "configured_not_materialized" });
    }

    for (const slug of slots) {
      if (pending || allGhost) continue;
      if (fsSlugs.has(slug)) continue;
      if (slug.startsWith("hazop-") || slug.startsWith("vdi-instrument") || slug.startsWith("vdi-electrical")) {
        ghostSkills.push({ code, slug, reason: "configured_not_materialized" });
        warn(`ghost skill（仅配置）: ${code} → ${slug}`);
      } else if (!allGhost) {
        fail(`discipline ${code}: 配置槽位缺失实体 ${slug}`);
      }
    }
  }
} else {
  fail("缺少 discipline-codes.json");
}

// ── G-05 CFIHOS unique code（L1/L2/L3 全覆盖）──
if (fs.existsSync(CFIHOS_SKILL_MAP)) {
  const cfihosMap = JSON.parse(fs.readFileSync(CFIHOS_SKILL_MAP, "utf8")).skills || {};
  let cfihosOk = 0;
  for (const slug of fsSlugs) {
    const entry = cfihosMap[slug];
    if (!entry?.cfihos_unique_code) {
      fail(`${slug}: skill-cfihos-unique-codes.json 无映射`);
      continue;
    }
    const s = readSkill(slug);
    if (!s) continue;
    const codeLine = s.yaml.match(/^code:\s*["']?(CFIHOS-\d+)/m);
    const metaLine = s.yaml.match(/cfihos_unique_code:\s*(CFIHOS-\d+)/);
    const code = codeLine?.[1];
    const meta = metaLine?.[1];
    const expected = entry.cfihos_unique_code;
    if (!code || !CFIHOS_CODE_RE.test(code)) {
      fail(`${slug}: frontmatter code 非 CFIHOS unique code`);
    } else if (code !== expected) {
      fail(`${slug}: code ${code} ≠ 注册表 ${expected}`);
    } else if (!meta || meta !== expected) {
      fail(`${slug}: metadata.vdi.cfihos_unique_code 缺失或不一致`);
    } else {
      cfihosOk++;
    }
  }
  if (cfihosOk === fsSlugs.size) {
    ok(`CFIHOS unique code 全覆盖: L1=${(cfihosMap && Object.values(cfihosMap).filter((e) => e.level === 1).length) || "?"} L2+ L3 共 ${cfihosOk} 个 Skill`);
  }
} else {
  fail("缺少 skill-cfihos-unique-codes.json");
}

// ── G-06 CFIHOS discipline code（除 WA 例外）──
const legacyVdi = new Set(Object.keys(buildVdiToCfihos()).filter((k) => !VDI_RUNTIME_EXCEPTIONS.includes(k) && buildVdiToCfihos()[k] !== k));
let g06ok = 0;
for (const slug of fsSlugs) {
  const s = readSkill(slug);
  if (!s?.yaml) continue;
  const disc = s.yaml.match(/^\s+discipline:\s*(\S+)/m)?.[1]?.replace(/"/g, "");
  if (!disc) continue;
  if (VDI_RUNTIME_EXCEPTIONS.includes(disc)) { g06ok++; continue; }
  if (legacyVdi.has(disc)) fail(`${slug}: discipline 仍为 legacy VDI 码 ${disc}（应为 CFIHOS）`);
  else g06ok++;
}
if (g06ok === fsSlugs.size) ok(`CFIHOS discipline code: ${g06ok}/${fsSlugs.size}（WA 例外已计入）`);

// ── G-10 用户技能副本 ──
for (const slug of USER_SCOPE_SLUGS) {
  const main = path.join(skillDir(slug) || "", "SKILL.md");
  const user = path.join(USER_SKILLS_DIR, slug, "SKILL.md");
  if (!fs.existsSync(main)) {
    warn(`USER_SCOPE slug 在 workspaces 缺失: ${slug}`);
    continue;
  }
  if (!fs.existsSync(user)) {
    warn(`pilotdeck-user-skills 缺失副本: ${slug}`);
    continue;
  }
  const a = fs.statSync(main);
  const b = fs.statSync(user);
  if (a.size !== b.size) warn(`副本大小不一致: ${slug} (workspace ${a.size} vs user ${b.size})`);
  else ok(`用户技能副本一致: ${slug}`);
}

// ── G-20 ~ G-31 单 Skill 结构 ──
for (const slug of fsSlugs) {
  if (disciplineFilter) {
    const match = ["MP", "CI", "PX"].some((c) => slugMatchesDiscipline(slug, c) && c === disciplineFilter);
    const mg = disciplineFilter === "MG" && (slug.startsWith("vdi-design") || slug.startsWith("vdi-doc") || slug.startsWith("vdi-scheduler"));
    if (!match && !mg) continue;
  }

  const s = readSkill(slug);
  if (!s) continue;

  if (!s.yaml || !s.text.startsWith("---")) fail(`${slug}: 无 YAML frontmatter`);
  else ok(`${slug}: frontmatter`);

  if (!s.description) fail(`${slug}: 缺少 description`);
  else if (s.description.length > 280) warn(`${slug}: description 过长 (${s.description.length} 字符)`);
  else ok(`${slug}: description 长度 OK`);

  const level = s.level;
  if (level && LINE_LIMITS[level]) {
    const lim = LINE_LIMITS[level];
    if (level === 3 && s.lines < lim.min) {
      lineWarnings.push({ slug, level, lines: s.lines, issue: "too_thin" });
      warn(`${slug}: L3 过薄 (${s.lines} 行 < ${lim.min})`);
    } else if (level <= 2 && s.lines > lim.soft) {
      const exempt = /line_budget_exempt:\s*true/.test(s.yaml);
      if (exempt) {
        ok(`${slug}: L${level} 行数 ${s.lines}（已豁免 line_budget_exempt）`);
      } else {
        const severity = s.lines > lim.progressive ? "progressive_disclosure" : s.lines > lim.hard ? "hard" : "soft";
        lineWarnings.push({ slug, level, lines: s.lines, issue: severity, soft: lim.soft });
        warn(`${slug}: L${level} 行数 ${s.lines}（建议 ≤${lim.soft}，质量优先可保留，超长内容请拆 references/）`);
      }
    } else if (level === 1 && s.lines > lim.soft) {
      const exempt = /line_budget_exempt:\s*true/.test(s.yaml);
      if (exempt) {
        ok(`${slug}: L1 行数 ${s.lines}（已豁免 line_budget_exempt）`);
      } else {
        lineWarnings.push({ slug, level: 1, lines: s.lines, issue: s.lines > lim.hard ? "hard" : "soft", soft: lim.soft });
        warn(`${slug}: L1 行数 ${s.lines}（建议 ≤${lim.soft}，细则可拆 references/）`);
      }
    }
    if (s.lines > 500) warn(`${slug}: 超过 skill-creator 渐进披露红线 (500 行)`);
  }

  if (level === 2) {
    if (s.text.includes("CP-0") && s.text.includes("⛔ [CP-")) ok(`${slug}: CP 交互模式`);
    else warn(`${slug}: 缺少 CP 交互模式`);
    if (s.deliverable || s.yaml.includes("deliverable_code")) ok(`${slug}: deliverable_code`);
    else warn(`${slug}: 缺少 deliverable_code`);
    if (s.text.includes("vdi-knowledge") || s.yaml.includes("vdi-knowledge")) ok(`${slug}: vdi-knowledge`);
    else warn(`${slug}: L2 未引用 vdi-knowledge`);

    const evalPath = path.join(skillDir(slug) || "", "evals/evals.json");
    if (fs.existsSync(evalPath)) {
      try {
        const ev = JSON.parse(fs.readFileSync(evalPath, "utf8"));
        const count = ev.evals?.length || 0;
        const complete = (ev.evals || []).every((e) => e.prompt && e.expected_output && (e.expectations?.length || e.assertions?.length));
        if (count >= 2 && complete) ok(`${slug}: evals.json (${count} 条)`);
        else warn(`${slug}: evals.json 不完整 (${count} 条)`);
      } catch (e) {
        warn(`${slug}: evals.json 解析失败`);
      }
    } else {
      evalGaps.push(slug);
      const msg = `${slug}: L2 缺少 evals/evals.json`;
      if (strictEval) fail(msg);
      else warn(msg);
    }
  }

  if (level === 3) {
    if (s.text.includes("calc_type") || s.text.includes("formula_ids") || s.yaml.includes("formula_ids")) {
      ok(`${slug}: L3 公式/calc 映射`);
    } else {
      warn(`${slug}: L3 缺少 calc_type/formula_ids`);
    }
    if (/DisciplineOutput/.test(s.text) && !/禁止.*DisciplineOutput|不.*产出.*DisciplineOutput/i.test(s.text)) {
      warn(`${slug}: L3 提及 DisciplineOutput 但未声明禁止产出`);
    }
  }

  if (level === 1) {
    if (s.text.includes("vdi-knowledge") || s.yaml.includes("vdi-knowledge")) ok(`${slug}: L1 vdi-knowledge`);
    else warn(`${slug}: L1 未引用 vdi-knowledge`);
  }
}

// ── G-40 专业 INDEX ──
for (const code of ACTIVE_DISCIPLINES) {
  if (disciplineFilter && disciplineFilter !== code) continue;
  const group = GROUP_INDEX[code];
  const indexPath = indexMdForGroup(group);
  if (fs.existsSync(indexPath)) ok(`${code}: workspaces/${group}/skills/INDEX.md`);
  else fail(`${code}: 缺少 workspaces/${group}/skills/INDEX.md`);
}

// ── G-41 Skill formula_ids 引用门禁（全局）──
try {
  execSync(`node "${path.join(__dirname, "audit-skill-formula-refs.mjs")}"`, { stdio: "pipe", encoding: "utf8" });
  ok("G-41: Skill formula_ids 均在公式库中存在");
} catch (e) {
  fail("G-41: Skill formula_ids 引用缺失（见 audit-skill-formula-refs.mjs）");
}

// ── Tier-1 委派 ──
const tier1Scripts = [
  { code: "MP", script: "audit-piping-skills.mjs" },
  { code: "CI", script: "audit-water-skills.mjs" },
  { code: "PX", script: "audit-process-skills.mjs" },
  { code: "IN", script: "audit-instrument-skills.mjs" },
];
const tier1Results = [];

for (const { code, script } of tier1Scripts) {
  if (disciplineFilter && disciplineFilter !== code) continue;
  const scriptPath = path.join(__dirname, script);
  try {
    execSync(`node "${scriptPath}"`, { stdio: "pipe", encoding: "utf8" });
    tier1Results.push({ code, script, status: "pass" });
    ok(`Tier-1 ${code}: ${script} 通过`);
  } catch (e) {
    tier1Results.push({ code, script, status: "fail", output: e.stdout || e.message });
    fail(`Tier-1 ${code}: ${script} 失败`);
  }
}

// ── 输出 ──
const report = {
  generated_at: new Date().toISOString(),
  strict_eval: strictEval,
  discipline_filter: disciplineFilter,
  summary: { passed: passed.length, warnings: warnings.length, failed: issues.length },
  ghost_skills: ghostSkills,
  line_warnings: lineWarnings,
  eval_gaps: evalGaps,
  tier1: tier1Results,
  issues,
  warnings: warnings.slice(0, 50),
};

console.log("═".repeat(60));
console.log("  全局 Skill 审计 (audit-all-skills)");
console.log("═".repeat(60));
console.log(`\n✅ 通过: ${passed.length}`);
console.log(`⚠  警告: ${warnings.length}`);
console.log(`❌ 失败: ${issues.length}`);
if (evalGaps.length) console.log(`📋 L2 eval 缺口: ${evalGaps.length} 个`);
if (ghostSkills.length) console.log(`👻 ghost skills: ${ghostSkills.length} 个`);
if (warnings.length) warnings.slice(0, 20).forEach((w) => console.log(`   ⚠ ${w}`));
if (warnings.length > 20) console.log(`   … 另有 ${warnings.length - 20} 条警告`);
if (issues.length) issues.forEach((i) => console.log(`   ❌ ${i}`));

if (writeJson) {
  fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
  console.log(`\n报告: ${REPORT_PATH}`);
}

process.exit(issues.length > 0 ? 1 : 0);
