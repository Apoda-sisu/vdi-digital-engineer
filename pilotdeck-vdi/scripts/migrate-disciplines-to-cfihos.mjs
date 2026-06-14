#!/usr/bin/env node
/**
 * 将 VDI 专业代码（除给排水 WA）迁移为 CFIHOS canonical code。
 *
 * 范围：
 * - workspaces 下全部 SKILL.md metadata.vdi.discipline / branch / deliverable_code
 * - workspaces/skills-registry.json
 * - mcp/vdi-events/event-registry.json
 * - mcp/vdi-orchestrator/server.mjs DEPENDENCY_GRAPH
 * - mcp/vdi-rules/vdi-rules.json redlines + contracts 键
 * - config/discipline-codes.json 策略字段
 *
 * 用法: node pilotdeck-vdi/scripts/migrate-disciplines-to-cfihos.mjs [--dry-run]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  REPO,
  SKILLS_REGISTRY,
  listAllSkillSlugs,
  skillDir,
} from "../config/skills-layout.mjs";
import {
  buildVdiToCfihos,
  migrateDisciplineList,
  migrateDisciplineToken,
  migrateDeliverablePrefix,
} from "../config/cfihos-discipline-resolve.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const DRY = process.argv.includes("--dry-run");
const VDI_TO_CFIHOS = buildVdiToCfihos();

const UNIQUE_PATH = path.join(ROOT, "data/skill-cfihos-unique-codes.json");
const CODES_PATH = path.join(ROOT, "config/discipline-codes.json");
const EVENT_REG = path.join(ROOT, "mcp/vdi-events/event-registry.json");
const ORCH = path.join(ROOT, "mcp/vdi-orchestrator/server.mjs");
const RULES = path.join(ROOT, "mcp/vdi-rules/vdi-rules.json");

const uniqueMap = JSON.parse(fs.readFileSync(UNIQUE_PATH, "utf8")).skills || {};

function write(file, content) {
  if (DRY) {
    console.log(`[dry-run] would write ${file}`);
    return;
  }
  fs.writeFileSync(file, content);
}

function migrateYamlDiscipline(yaml, slug) {
  const entry = uniqueMap[slug];
  let out = yaml;
  const discMatch = out.match(/^(\s+discipline:\s*)(\S+)/m);
  if (!discMatch) return { out, changed: false };

  const oldDisc = discMatch[2].replace(/"/g, "");
  if (oldDisc === "WA") return { out, changed: false };

  const cfihos =
    VDI_TO_CFIHOS[oldDisc] ||
    VDI_TO_CFIHOS[oldDisc.toUpperCase()] ||
    (entry?.document_type_short_code?.match(/^[A-Z]{2}/)?.[0]);
  if (!cfihos || cfihos === oldDisc) return { out, changed: false };

  if (!/vdi_discipline:/m.test(out)) {
    out = out.replace(
      /^(\s+discipline:\s*\S+.*)$/m,
      `$1\n    vdi_discipline: ${oldDisc}`
    );
  }
  out = out.replace(/^(\s+discipline:\s*)\S+/m, `$1${cfihos}`);

  const branchMatch = out.match(/^(\s+branch:\s*)(\S+)/m);
  if (branchMatch) {
    const newBranch = migrateDeliverablePrefix(branchMatch[2]);
    if (newBranch !== branchMatch[2]) {
      if (!/vdi_branch:/m.test(out)) {
        out = out.replace(/^(\s+branch:\s*\S+.*)$/m, `$1\n    vdi_branch: ${branchMatch[2]}`);
      }
      out = out.replace(/^(\s+branch:\s*)\S+/m, `$1${newBranch}`);
    }
  }

  const delMatch = out.match(/^(\s+deliverable_code:\s*)(\S+)/m);
  if (delMatch && entry?.document_type_short_code) {
    const oldDel = delMatch[2];
    const newDel = entry.document_type_short_code;
    if (oldDel !== newDel) {
      if (!/vdi_deliverable_code:/m.test(out)) {
        out = out.replace(/^(\s+deliverable_code:\s*\S+.*)$/m, `$1\n    vdi_deliverable_code: ${oldDel}`);
      }
      out = out.replace(/^(\s+deliverable_code:\s*)\S+/m, `$1${newDel}`);
    }
  }

  return { out, changed: true, oldDisc, cfihos };
}

// ── Skills ──
let skillUpdates = 0;
for (const slug of listAllSkillSlugs()) {
  const mdPath = path.join(skillDir(slug), "SKILL.md");
  let text = fs.readFileSync(mdPath, "utf8");
  const fm = text.match(/^---\n([\s\S]*?)\n---/);
  if (!fm) continue;
  const { out, changed } = migrateYamlDiscipline(fm[1], slug);
  if (!changed) continue;
  text = text.replace(fm[1], out);
  write(mdPath, text);
  skillUpdates++;
}
console.log(`✅ SKILL.md discipline 迁移: ${skillUpdates} 个`);

// ── skills-registry ──
const registry = JSON.parse(fs.readFileSync(SKILLS_REGISTRY, "utf8"));
let regUpdates = 0;
for (const s of registry.skills) {
  if (!s.discipline || s.discipline === "WA") continue;
  const cfihos = VDI_TO_CFIHOS[s.discipline] || uniqueMap[s.slug]?.document_type_short_code?.slice(0, 2);
  const mapped = VDI_TO_CFIHOS[s.discipline];
  if (mapped && mapped !== s.discipline) {
    s.vdi_discipline = s.discipline;
    s.discipline = mapped;
    if (s.deliverable_code && uniqueMap[s.slug]?.document_type_short_code) {
      s.vdi_deliverable_code = s.deliverable_code;
      s.deliverable_code = uniqueMap[s.slug].document_type_short_code;
    }
    regUpdates++;
  } else if (s.discipline === "MG") {
    s.vdi_discipline = "MG";
    s.discipline = "AA";
    regUpdates++;
  } else if (s.discipline === "system") {
    s.vdi_discipline = "system";
    s.discipline = "JA";
    regUpdates++;
  }
}
registry.cfihos_canonical = true;
registry.generated = new Date().toISOString();
write(SKILLS_REGISTRY, JSON.stringify(registry, null, 2) + "\n");
console.log(`✅ skills-registry.json: ${regUpdates} 条`);

// ── event-registry ──
function isDisciplineCodeToken(s) {
  return typeof s === "string" && /^[A-Z]{2,5}$/.test(s);
}

function walkMigrate(obj) {
  if (Array.isArray(obj)) {
    return [...new Set(obj.map((x) => (isDisciplineCodeToken(x) ? migrateDisciplineToken(x) : x)))];
  }
  if (obj && typeof obj === "object") {
    const next = {};
    for (const [k, v] of Object.entries(obj)) {
      const nk = isDisciplineCodeToken(k) ? migrateDisciplineToken(k) : k;
      if (typeof v === "string") {
        next[nk] = isDisciplineCodeToken(v) ? migrateDisciplineToken(v) : v;
      } else {
        next[nk] = walkMigrate(v);
      }
    }
    return next;
  }
  return obj;
}

const evReg = JSON.parse(fs.readFileSync(EVENT_REG, "utf8"));
const evMigrated = walkMigrate(evReg);
if (evMigrated.subscriber_lookup?.MP) {
  evMigrated.subscriber_lookup.MP = {
    name: "配管工程",
    skill_group: "vdi-piping-lead",
    status: "active",
  };
}
write(EVENT_REG, JSON.stringify(evMigrated, null, 2) + "\n");
console.log("✅ event-registry.json 已迁移为 CFIHOS 码");

// ── orchestrator DEPENDENCY_GRAPH ──
const VDI_CODES = Object.keys(VDI_TO_CFIHOS).sort((a, b) => b.length - a.length);
let orchText = fs.readFileSync(ORCH, "utf8");
for (const vdi of VDI_CODES) {
  if (vdi === "WA") continue;
  const cfihos = VDI_TO_CFIHOS[vdi];
  if (!cfihos || vdi === cfihos) continue;
  const re = new RegExp(`\\b${vdi}\\b`, "g");
  const graphStart = orchText.indexOf("const DEPENDENCY_GRAPH = {");
  const graphEnd = orchText.indexOf("};", graphStart) + 2;
  if (graphStart < 0) break;
  const before = orchText.slice(0, graphStart);
  const graph = orchText.slice(graphStart, graphEnd);
  const after = orchText.slice(graphEnd);
  orchText = before + graph.replace(re, cfihos) + after;
}
write(ORCH, orchText);
console.log("✅ orchestrator DEPENDENCY_GRAPH 已迁移");

// ── vdi-rules ──
const rules = JSON.parse(fs.readFileSync(RULES, "utf8"));
for (const rl of rules.redlines || []) {
  if (rl.discipline) rl.discipline = migrateDisciplineList(rl.discipline);
}
for (const key of ["output_contracts", "data_contracts"]) {
  if (!rules[key]) continue;
  const migrated = {};
  for (const [k, v] of Object.entries(rules[key])) {
    migrated[migrateDisciplineToken(k)] = v;
  }
  rules[key] = migrated;
}
write(RULES, JSON.stringify(rules, null, 2) + "\n");
console.log("✅ vdi-rules.json 已迁移");

// ── discipline-codes.json policy ──
const codes = JSON.parse(fs.readFileSync(CODES_PATH, "utf8"));
codes.version = "1.3.0";
codes.description = "专业代码映射（CFIHOS canonical；给排水 canonical = CI）";
codes.canonical_discipline_policy = {
  source: "cfihos",
  exceptions: ["WA"],
  skill_discipline_field: "cfihos_discipline_code",
  deliverable_code_field: "cfihos_document_type",
  note: "除给排水外，L1/L2/L3 Skill 的 metadata.vdi.discipline 使用 CFIHOS 两字母码；WA 保留内部键并桥接 CI",
};
codes.discipline_slug_mapping = {
  process: "PX",
  piping: "MP",
  water: "WA",
  instrument: "IN",
  electrical: "EA",
  equipment: "MX",
  hse: "HS",
  hs: "HS",
  fire: "HX",
  structural: "CS",
  architectural: "CB",
  material: "RA",
  hvac: "MH",
  management: "AA",
  quality: "QA",
  procurement: "VA",
  hazop: "HX",
  system: "JA",
};

const newMappings = {};
for (const [k, v] of Object.entries(codes.mappings || {})) {
  const nk = k === "WA" ? "WA" : (v.cfihos_discipline_code || VDI_TO_CFIHOS[k] || k);
  newMappings[nk] = { ...v, vdi_runtime_key: k === "WA" ? "WA" : k };
}
codes.mappings = newMappings;

const newReverse = {};
for (const [slug, vdi] of Object.entries(codes.reverse_mappings || {})) {
  newReverse[slug] = vdi === "WA" ? "WA" : (VDI_TO_CFIHOS[vdi] || vdi);
}
codes.reverse_mappings = newReverse;
write(CODES_PATH, JSON.stringify(codes, null, 2) + "\n");
console.log("✅ discipline-codes.json → v1.3.0");

console.log(DRY ? "\n(dry-run 完成)" : "\n🎉 CFIHOS 专业代码迁移完成");
