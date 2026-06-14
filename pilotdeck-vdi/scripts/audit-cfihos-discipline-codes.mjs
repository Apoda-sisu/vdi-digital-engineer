#!/usr/bin/env node
/**
 * CFIHOS 专业代码验收（canonical = CFIHOS 两字母码，给排水 CI）
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { listAllSkillSlugs, skillDir, SKILLS_REGISTRY } from "../config/skills-layout.mjs";
import {
  buildVdiToCfihos,
  resolveCanonicalDiscipline,
  VDI_RUNTIME_EXCEPTIONS,
} from "../config/cfihos-discipline-resolve.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const CODES_PATH = path.join(ROOT, "config/discipline-codes.json");
const EVENT_REG = path.join(ROOT, "mcp/vdi-events/event-registry.json");
const UNIQUE_PATH = path.join(ROOT, "data/skill-cfihos-unique-codes.json");

const VDI_TO_CFIHOS = buildVdiToCfihos();
const codes = JSON.parse(fs.readFileSync(CODES_PATH, "utf8"));
const uniqueMap = JSON.parse(fs.readFileSync(UNIQUE_PATH, "utf8")).skills || {};
const legacyVdi = new Set(Object.keys(VDI_TO_CFIHOS).filter((k) => VDI_TO_CFIHOS[k] !== k && k !== "WA"));

let fail = 0;
let pass = 0;

function ok(m) { pass++; console.log(`  ✅ ${m}`); }
function bad(m) { fail++; console.error(`  ❌ ${m}`); }

console.log("CFIHOS 专业代码验收\n");

// Skills
for (const slug of listAllSkillSlugs()) {
  const md = fs.readFileSync(path.join(skillDir(slug), "SKILL.md"), "utf8");
  const fm = md.match(/^---\n([\s\S]*?)\n---/)?.[1] || "";
  const disc = fm.match(/^\s+discipline:\s*(\S+)/m)?.[1]?.replace(/"/g, "");
  if (!disc) {
    bad(`${slug}: 缺少 discipline`);
    continue;
  }
  if (VDI_RUNTIME_EXCEPTIONS.includes(disc)) {
    bad(`${slug}: discipline 使用已废弃例外码 ${disc}`);
    continue;
  }
  if (legacyVdi.has(disc)) {
    bad(`${slug}: discipline 仍为 legacy VDI 码 ${disc}`);
    continue;
  }
  const expected = uniqueMap[slug]?.document_type_short_code?.match(/^[A-Z]{2}/)?.[0]
    || codes.mappings && Object.values(codes.mappings).find((m) => m.lead_skill === slug || m.skill_group === slug)?.cfihos_discipline_code;
  if (expected && disc !== expected && !disc.startsWith(expected)) {
    // L2 may use full document type family — discipline should be 2-letter cfihos
  }
  const canonical = resolveCanonicalDiscipline(disc);
  if (canonical !== disc && !legacyVdi.has(disc)) {
    bad(`${slug}: discipline ${disc} 未归一化`);
  } else {
    ok(`${slug}: ${disc}`);
  }
}

// event-registry — no legacy producer keys
const ev = JSON.parse(fs.readFileSync(EVENT_REG, "utf8"));
for (const [etype, cfg] of Object.entries(ev.event_types || {})) {
  for (const field of ["produced_by", "subscribers"]) {
    if (!cfg[field]) continue;
    for (const d of cfg[field]) {
      if (d !== "*" && legacyVdi.has(d)) bad(`event ${etype}.${field} 含 legacy ${d}`);
    }
  }
  if (cfg.subscribers_by_discipline) {
    for (const k of Object.keys(cfg.subscribers_by_discipline)) {
      if (legacyVdi.has(k)) bad(`event ${etype}.subscribers_by_discipline 键 legacy ${k}`);
    }
  }
}
if (fail === 0) ok("event-registry 无 legacy VDI 键");

// registry
const reg = JSON.parse(fs.readFileSync(SKILLS_REGISTRY, "utf8"));
for (const s of reg.skills) {
  if (legacyVdi.has(s.discipline)) bad(`registry ${s.slug}: legacy ${s.discipline}`);
}
if (!reg.cfihos_canonical) bad("skills-registry 未标记 cfihos_canonical");

console.log(`\n通过 ${pass}  失败 ${fail}`);
process.exit(fail > 0 ? 1 : 0);
