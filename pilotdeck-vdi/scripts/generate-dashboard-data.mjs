#!/usr/bin/env node
/**
 * 从仓库实时数据生成 dashboard-data.json
 * 用法: node pilotdeck-vdi/scripts/generate-dashboard-data.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { listAllSkillSlugs, skillDir } from "../config/skills-layout.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "data/dashboard-data.json");

function skillCountFromConfig(entry) {
  const lead = entry.lead_skill ? 1 : 0;
  return lead + (entry.sub_skills?.length || 0) + (entry.shared_utils?.length || 0);
}

/** @returns {Map<string, { slug, name, level, deliverable, mayCall: string[], calledBy: string[] }>} */
function loadSkillRegistry() {
  const registry = new Map();
  for (const slug of listAllSkillSlugs()) {
    const p = path.join(skillDir(slug), "SKILL.md");
    if (!fs.existsSync(p)) continue;
    const text = fs.readFileSync(p, "utf8");
    const fm = text.match(/^---\n([\s\S]*?)\n---/);
    if (!fm) continue;
    const yaml = fm[1];
    const name = yaml.match(/^name:\s*(.+)$/m)?.[1]?.trim() || slug;
    const level = Number(yaml.match(/^\s+level:\s*(\d+)/m)?.[1] || 0);
    const deliverable = yaml.match(/deliverable_code:\s*(\S+)/)?.[1] || "";
    const cfihosUnique = yaml.match(/cfihos_unique_code:\s*(CFIHOS-\d+)/)?.[1] || "";
    const documentType = yaml.match(/cfihos_document_type:\s*(\S+)/)?.[1] || "";
    const disciplineCode = yaml.match(/^\s+discipline:\s*(\S+)/m)?.[1]?.replace(/"/g, "") || "";
    const vdiDeliverable = yaml.match(/vdi_deliverable_code:\s*(\S+)/)?.[1] || "";
    const mayCall = parseYamlList(yaml, "may_call");
    const calledBy = parseYamlList(yaml, "called_by");
    registry.set(slug, {
      slug, name, level, deliverable, cfihosUnique, documentType, disciplineCode, vdiDeliverable, mayCall, calledBy,
    });
  }
  return registry;
}

function parseYamlList(yaml, key) {
  const inline = yaml.match(new RegExp(`${key}:\\s*\\[([^\\]]*)\\]`));
  if (inline) {
    return inline[1].split(",").map((s) => s.trim().replace(/^["']|["']$/g, "")).filter(Boolean);
  }
  const block = yaml.match(new RegExp(`${key}:\\s*\\n((?:\\s+-\\s+.+\\n?)+)`));
  if (block) {
    return block[1].match(/-\s+(.+)/g)?.map((l) => l.replace(/^-\s+/, "").trim()) || [];
  }
  return [];
}

function nodeId(meta) {
  if (meta.documentType) return meta.documentType.replace(/[^A-Za-z0-9]/g, "_");
  if (meta.deliverable && /^[A-Z]{2,3}\d/.test(meta.deliverable)) {
    return meta.deliverable.replace(/[^A-Za-z0-9]/g, "_");
  }
  if (meta.deliverable) {
    const m = meta.deliverable.match(/^[A-Z]+-([A-Z0-9-]+)$/i);
    if (m) return m[1].replace(/-/g, "_");
  }
  const tail = meta.slug.replace(/^vdi-(process|water|piping|instrument)-/, "");
  return tail.replace(/-/g, "_").toUpperCase() || meta.slug.toUpperCase();
}

function nodeLabel(meta) {
  const tag = meta.documentType || meta.deliverable || "";
  if (tag) return `${tag} · ${meta.name}`;
  return meta.name;
}

function resolveTarget(ref, registry) {
  if (ref.startsWith("vdi-")) return registry.has(ref) ? ref : null;
  for (const [slug, meta] of registry) {
    if (meta.name === ref) return slug;
  }
  return null;
}

function mkNode(slug, registry) {
  const meta = registry.get(slug);
  if (!meta) return { id: slug, slug, label: slug };
  return {
    id: nodeId(meta),
    slug,
    label: nodeLabel(meta),
    level: meta.level,
    disciplineCode: meta.disciplineCode || "",
    cfihosUniqueCode: meta.cfihosUnique || "",
    documentType: meta.documentType || "",
    deliverableCode: meta.deliverable || "",
    vdiDeliverable: meta.vdiDeliverable || "",
  };
}

function supportsEdges(l2Slugs, l3Slugs, registry) {
  const l3Set = new Set(l3Slugs);
  const edges = [];
  const seen = new Set();
  for (const l2 of l2Slugs) {
    const meta = registry.get(l2);
    if (!meta) continue;
    const fromId = nodeId(meta);
    for (const ref of meta.mayCall) {
      const target = resolveTarget(ref, registry);
      if (!target || !l3Set.has(target)) continue;
      const toId = nodeId(registry.get(target));
      const key = `${fromId}->${toId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      edges.push({ from: fromId, to: toId, type: "supports" });
    }
  }
  return edges;
}

function idFor(registry, slug) {
  return nodeId(registry.get(slug) || { slug });
}

const L2_GROUP_SLUGS = {
  PX: [
    { title: "主链路", slugs: ["vdi-process-package", "vdi-process-route", "vdi-process-balance", "vdi-process-pfd", "vdi-process-pid"] },
    { title: "系统图/专项", slugs: ["vdi-process-utilities", "vdi-process-control", "vdi-process-safety", "vdi-process-relief", "vdi-process-equipment", "vdi-process-lab", "vdi-process-hydraulics"] },
  ],
  MP: [
    { title: "基础资料", slugs: ["vdi-piping-material-class", "vdi-piping-line-list"] },
    { title: "布置枢纽", slugs: ["vdi-piping-layout"] },
    { title: "分析派生", slugs: ["vdi-piping-equipment-connect", "vdi-piping-rack-layout", "vdi-piping-routing", "vdi-piping-support", "vdi-piping-stress", "vdi-piping-underground"] },
    { title: "详图·专项", slugs: ["vdi-piping-insulation", "vdi-piping-isometric", "vdi-piping-valve-spec", "vdi-piping-cad-3d"] },
  ],
  CI: [
    { title: "给水·循环", slugs: ["vdi-water-supply", "vdi-water-fire", "vdi-water-circulating"] },
    { title: "排水·污水", slugs: ["vdi-water-drainage", "vdi-water-stormwater", "vdi-water-wastewater"] },
  ],
  IN: [
    { title: "索引", slugs: ["vdi-instrument-index"] },
    { title: "回路·联锁·DCS", slugs: ["vdi-instrument-loop", "vdi-instrument-interlock", "vdi-instrument-valve", "vdi-instrument-dcs"] },
  ],
};

function buildSequenceEdges(code, registry) {
  const chain = {
    PX: ["vdi-process-package", "vdi-process-route", "vdi-process-balance", "vdi-process-pfd", "vdi-process-pid"],
    CI: ["vdi-water-supply", "vdi-water-fire", "vdi-water-drainage", "vdi-water-stormwater", "vdi-water-wastewater", "vdi-water-circulating"],
    MP: ["vdi-piping-material-class", "vdi-piping-line-list", "vdi-piping-layout", "vdi-piping-equipment-connect", "vdi-piping-rack-layout", "vdi-piping-routing"],
    IN: ["vdi-instrument-index", "vdi-instrument-loop", "vdi-instrument-interlock", "vdi-instrument-dcs"],
  }[code];
  if (!chain?.length) return [];
  const edges = [["LEAD", idFor(registry, chain[0])]];
  for (let i = 0; i < chain.length - 1; i++) {
    edges.push([idFor(registry, chain[i]), idFor(registry, chain[i + 1])]);
  }
  return edges.map(([from, to]) => ({ from, to, type: "sequence" }));
}

function buildL2Groups(code, registry, l2) {
  const spec = L2_GROUP_SLUGS[code];
  if (!spec) return [{ title: "交付物", ids: l2.map((n) => n.id) }];
  return spec.map((g) => ({
    title: g.title,
    ids: g.slugs.map((s) => idFor(registry, s)).filter(Boolean),
  }));
}

function buildDisciplineGraph(code, name, status, leadSlug, l2Slugs, l3Slugs, flow, registry) {
  const leadMeta = registry.get(leadSlug);
  const l2 = l2Slugs.map((s) => mkNode(s, registry));
  const l3 = l3Slugs.map((s) => mkNode(s, registry));

  const edges = [
    ...buildSequenceEdges(code, registry),
    ...supportsEdges(l2Slugs, l3Slugs, registry),
  ];

  if (code === "PX") {
    edges.push({ from: "LEAD", to: nodeId(registry.get("vdi-process-data-mgmt") || {}), type: "supports" });
  }

  const leadEntry = registry.get(leadSlug);
  return {
    code,
    name,
    status,
    flow,
    cfihosDisciplineCode: leadEntry?.disciplineCode || code,
    cfihosUniqueCode: leadEntry?.cfihosUnique || "",
    lead: {
      slug: leadSlug,
      label: leadMeta?.name || name + "负责人",
      id: "LEAD",
      disciplineCode: leadEntry?.disciplineCode || code,
      cfihosUniqueCode: leadEntry?.cfihosUnique || "",
      documentType: leadEntry?.documentType || "",
    },
    l2Groups: buildL2Groups(code, registry, l2),
    l2,
    l3,
    edges,
  };
}

function buildSkillGraph(mappings, registry) {
  const inL3 = mappings.IN.sub_skills.filter(
    (s) => s.includes("calc") || s.includes("selection") || s.includes("io-count"),
  );
  const inL2 = mappings.IN.sub_skills.filter((s) => !inL3.includes(s));

  return {
    platform: {
      nodes: [
        { slug: "vdi-design-manager", label: "设计经理" },
        { slug: "vdi-orchestrator", label: "编排器" },
        { slug: "vdi-knowledge", label: "知识库 MCP" },
        { slug: "vdi-rules", label: "规则 MCP" },
        { slug: "vdi-events", label: "事件 MCP" },
      ],
    },
    disciplines: [
      buildDisciplineGraph(
        "PX", "工艺", "active", "vdi-process-lead",
        mappings.PX.sub_skills, mappings.PX.shared_utils,
        "D01→D02→D03→D04→{S01,D05}→{S02,S03,S05}→S04/X01/X02",
        registry,
      ),
      buildDisciplineGraph(
        "CI", "给排水", "active", "vdi-water-lead",
        mappings.CI.sub_skills, mappings.CI.shared_utils,
        "D01→D02；D01→D03/D04/D05/D06",
        registry,
      ),
      buildDisciplineGraph(
        "MP", "管道", "active", "vdi-piping-lead",
        mappings.MP.sub_skills, mappings.MP.shared_utils,
        "D01→D02→D03→D04/D05→D06→D07/D08→D09→D10/D11/D12",
        registry,
      ),
      buildDisciplineGraph(
        "IN", "仪控", "active", "vdi-instrument-lead",
        inL2, inL3,
        "D01→D02∥D03→D06→D04",
        registry,
      ),
    ],
  };
}

const registry = loadSkillRegistry();
const kb = JSON.parse(fs.readFileSync(path.join(ROOT, "data/knowledge-clauses-v2.json"), "utf8"));
const formulas = JSON.parse(fs.readFileSync(path.join(ROOT, "data/formulas/index.json"), "utf8"));
const disciplines = JSON.parse(fs.readFileSync(path.join(ROOT, "config/discipline-codes.json"), "utf8"));
const events = JSON.parse(fs.readFileSync(path.join(ROOT, "mcp/vdi-events/event-registry.json"), "utf8"));

const discMap = {
  PX: "process", CI: "water", MP: "piping", IN: "instrument", EL: "electrical",
  EA: "electrical", EQ: "equipment", MX: "equipment", HS: "hs", HAZOP: "hazop",
};

const dashboardDisciplines = [];
for (const [code, entry] of Object.entries(disciplines.mappings)) {
  if (!["PX", "CI", "MP", "IN", "EL", "EA", "EQ", "MX", "HS", "HAZOP"].includes(code)) continue;
  const kbKey = discMap[code] || code.toLowerCase();
  dashboardDisciplines.push({
    name: entry.name,
    code,
    status: entry.status || (entry.sub_skills?.length ? "active" : "pending"),
    skills: skillCountFromConfig(entry),
    clauses: kb.stats?.disciplines?.[kbKey] || 0,
    formulas: formulas.stats?.disciplines?.[kbKey] || 0,
    color: entry.color || "#6366f1",
    icon: entry.icon || "📋",
    note: entry.note || "",
  });
}

const manifests = fs
  .readdirSync(path.join(ROOT, "data"))
  .filter((f) => f.endsWith("-knowledge-manifest.json"))
  .map((f) => {
    const m = JSON.parse(fs.readFileSync(path.join(ROOT, "data", f), "utf8"));
    return {
      discipline: m.discipline,
      current: m.current_clauses,
      phase2: m.targets?.phase2?.clause_count,
      version: m.manifest_version,
    };
  });

const payload = {
  generated_at: new Date().toISOString(),
  stats: {
    total_skills_files: registry.size,
    total_skills_configured: dashboardDisciplines.reduce((s, d) => s + d.skills, 0),
    total_clauses: kb.stats?.total_clauses || kb.clauses?.length || 0,
    mandatory_clauses: kb.stats?.mandatory || 0,
    cross_refs: kb.stats?.with_cross_refs || 0,
    total_formulas: formulas.stats?.total_formulas || 0,
    event_types: Object.keys(events.event_types || {}).length,
    knowledge_manifests: manifests.length,
    kb_built_at: kb.built_at,
  },
  disciplines: dashboardDisciplines,
  manifests,
  milestones: [
    { date: "2026-06-13", discipline: "仪控", activity: "IN-2：5 L2 + 3 L3 Skill V1.2 落地", status: "completed" },
    { date: "2026-06-12", discipline: "管道", activity: "知识库 Phase2 达标（316 条）+ manifest v2", status: "completed" },
    { date: "2026-06-12", discipline: "管道", activity: "Sprint 11–18 全量 Skill + audit 99/99", status: "completed" },
    { date: "2026-06-11", discipline: "给排水", activity: "知识库 Phase3（804 条）+ MCP 回归 18/18", status: "completed" },
    { date: "2026-06-11", discipline: "工艺", activity: "480 条条文 + process manifest", status: "completed" },
  ],
  skillGraph: buildSkillGraph(disciplines.mappings, registry),
};

fs.writeFileSync(OUT, JSON.stringify(payload, null, 2) + "\n", "utf8");
console.log(`Wrote ${OUT}`);
console.log(`  Skills(文件): ${payload.stats.total_skills_files} | 条文: ${payload.stats.total_clauses} | 公式: ${payload.stats.total_formulas}`);
