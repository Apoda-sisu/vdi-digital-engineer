#!/usr/bin/env node
/**
 * PilotDeck 模块关联关系图生成器
 * ================================
 * 扫描所有模块源文件，生成：
 *   1. module-graph.json   — 完整结构化关联数据（供程序查询）
 *   2. module-graph.mmd    — Mermaid 架构总览图（供可视化渲染）
 *   3. module-graph-report.md — 可读的关联关系报告
 *
 * 用法：
 *   node build-module-graph.mjs [--dry-run]
 *
 * 关联关系类型：
 *   SKILL_MCP        — Skill 依赖 MCP 服务
 *   SKILL_MANAGES    — Skill 管理其他 Skill
 *   SKILL_REPORTS_TO — Skill 向上级汇报
 *   SKILL_MAY_CALL  — Skill 可调用其他 Skill
 *   SKILL_DISCIPLINE — Skill 所属专业
 *   MCP_TOOL         — MCP 服务提供工具
 *   FORMULA_TABLE    — 公式引用参数表
 *   FORMULA_RELATED  — 公式间关联
 *   FORMULA_DISCIPLINE — 公式所属专业
 *   EVENT_PRODUCER   — 事件生产者
 *   EVENT_CONSUMER   — 事件消费者
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");

// ============================================================
// 路径配置
// ============================================================
const PATHS = {
  skillsIndex: path.join(ROOT, "skills/index.json"),
  mcpDir: path.join(ROOT, "pilotdeck-vdi/mcp"),
  formulasDir: path.join(ROOT, "pilotdeck-vdi/data/formulas"),
  tablesFile: path.join(ROOT, "pilotdeck-vdi/data/formulas/tables.json"),
  eventRegistry: path.join(ROOT, "pilotdeck-vdi/mcp/vdi-events/event-registry.json"),
  outputFileJson: path.join(ROOT, "pilotdeck-vdi/data/module-graph.json"),
  outputFileMmd: path.join(ROOT, "pilotdeck-vdi/data/module-graph.mmd"),
  outputFileReport: path.join(ROOT, "pilotdeck-vdi/data/module-graph-report.md"),
};

// ============================================================
// 工具函数
// ============================================================

function loadJson(p) {
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

function scanFormulaDir(dir) {
  const formulas = [];
  if (!fs.existsSync(dir)) return formulas;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const fp = path.join(dir, e.name);
    if (e.isDirectory()) { formulas.push(...scanFormulaDir(fp)); continue; }
    if (!e.name.endsWith(".json") || ["index.json", "schema.json"].includes(e.name)) continue;
    try {
      const data = JSON.parse(fs.readFileSync(fp, "utf8"));
      if (data.formulas) formulas.push(...data.formulas);
    } catch {}
  }
  return formulas;
}

function extractMcpTools(mcpDir) {
  const result = {};
  if (!fs.existsSync(mcpDir)) return result;
  const entries = fs.readdirSync(mcpDir, { withFileTypes: true });
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const sf = [path.join(mcpDir, e.name, "server-v2.mjs"), path.join(mcpDir, e.name, "server.mjs")]
      .find(f => fs.existsSync(f));
    if (!sf) continue;
    const content = fs.readFileSync(sf, "utf8");
    const tools = [];
    const re = /name:\s*['"]vdi_[^'"]+['"]/g;
    let m;
    while ((m = re.exec(content)) !== null) {
      const name = m[0].match(/['"]([^'"]+)['"]/)[1];
      if (!tools.includes(name)) tools.push(name);
    }
    result[e.name] = tools;
  }

  // 外部 MCP 服务（非本项目源码，通过 Cursor mcp.json 配置）
  const EXTERNAL_MCP = {
    "documents": [
      "content_read", "content_write", "content_append", "content_insert", "content_replace",
      "compose_docx", "compose_pdf", "compose_from_markdown",
      "structured_get", "structured_set", "structured_delete", "structured_meta",
      "search_in_format", "file_create", "file_delete", "file_copy", "file_move",
      "version_list", "version_diff", "version_restore"
    ],
  };
  for (const [name, tools] of Object.entries(EXTERNAL_MCP)) {
    if (!result[name] || result[name].length === 0) result[name] = tools;
  }

  return result;
}

// ============================================================
// 构建关联图
// ============================================================

function buildGraph() {
  const nodes = [];
  const edges = [];
  const nodeSet = new Set();

  function addNode(id, type, name, group) {
    if (nodeSet.has(id)) return;
    nodeSet.add(id);
    nodes.push({ id, type, name, group: group || "" });
  }

  function addEdge(from, to, type, label) {
    edges.push({ from, to, type, label: label || "" });
  }

  // --- 1. Skills ---
  const skillsIndex = loadJson(PATHS.skillsIndex);
  if (skillsIndex) {
    for (const s of skillsIndex.skills) {
      const sid = `skill:${s.group}`;
      addNode(sid, "skill", s.name, s.discipline || "");

      for (const mcp of (s.mcp_required || [])) {
        const mid = `mcp:${mcp}`;
        addNode(mid, "mcp", mcp, "mcp");
        addEdge(sid, mid, "SKILL_MCP", "依赖");
      }

      for (const child of (s.manages || [])) {
        addEdge(sid, `skill:${child}`, "SKILL_MANAGES", "管理");
      }

      for (const target of (s.may_call || [])) {
        const targetSkill = skillsIndex.skills.find(x => x.name === target);
        if (targetSkill) addEdge(sid, `skill:${targetSkill.group}`, "SKILL_MAY_CALL", "可调用");
      }

      if (s.reports_to) {
        // 先尝试按group查找，再按name查找
        const parent = skillsIndex.skills.find(x => x.group === s.reports_to) || 
                       skillsIndex.skills.find(x => x.name === s.reports_to);
        if (parent) addEdge(sid, `skill:${parent.group}`, "SKILL_REPORTS_TO", "汇报");
      }

      if (s.discipline) {
        const did = `disc:${s.discipline}`;
        addNode(did, "discipline", s.discipline, "discipline");
        addEdge(sid, did, "SKILL_DISCIPLINE", "所属专业");
      }
    }
  }

  // --- 2. MCP Tools ---
  const mcpTools = extractMcpTools(PATHS.mcpDir);
  for (const [mcp, tools] of Object.entries(mcpTools)) {
    const mid = `mcp:${mcp}`;
    addNode(mid, "mcp", mcp, "mcp");
    for (const tool of tools) {
      const tid = `tool:${tool}`;
      addNode(tid, "tool", tool, mcp);
      addEdge(mid, tid, "MCP_TOOL", "提供");
    }
  }

  // --- 3. Formulas ---
  const formulas = scanFormulaDir(PATHS.formulasDir);
  const discFormulaCounts = {};
  for (const f of formulas) {
    const fid = `formula:${f.formula_id}`;
    addNode(fid, "formula", f.formula_id, f.discipline || "");
    if (f.discipline) {
      discFormulaCounts[f.discipline] = (discFormulaCounts[f.discipline] || 0) + 1;
      const did = `disc:${f.discipline}`;
      addNode(did, "discipline", f.discipline, "discipline");
      addEdge(fid, did, "FORMULA_DISCIPLINE", "所属专业");
    }
    for (const rf of (f.related_formulas || [])) {
      addEdge(fid, `formula:${rf}`, "FORMULA_RELATED", "关联");
    }
    for (const v of (f.variables || [])) {
      if (v.look_up) {
        const tid = `table:${v.look_up}`;
        addNode(tid, "table", v.look_up, "table");
        addEdge(fid, tid, "FORMULA_TABLE", v.symbol);
      }
    }
  }

  // --- 4. Tables ---
  const tablesData = loadJson(PATHS.tablesFile);
  if (tablesData && tablesData.tables) {
    for (const t of tablesData.tables) {
      addNode(`table:${t.table_id}`, "table", t.table_id, "table");
    }
  }

  // --- 5. Events ---
  const eventReg = loadJson(PATHS.eventRegistry);
  if (eventReg) {
    const eventTypes = eventReg.event_types || {};
    for (const [evType, evDef] of Object.entries(eventTypes)) {
      const eid = `event:${evType}`;
      addNode(eid, "event", evType, "event");

      // produced_by are discipline codes
      for (const prod of (evDef.produced_by || [])) {
        if (prod === "*") continue;
        const did = `disc:${prod}`;
        if (nodeSet.has(did)) addEdge(did, eid, "EVENT_PRODUCER", "发布");
      }
      // subscribers are discipline codes
      for (const cons of (evDef.subscribers || [])) {
        if (cons === "*") continue;
        const did = `disc:${cons}`;
        if (nodeSet.has(did)) addEdge(eid, did, "EVENT_CONSUMER", "订阅");
      }
    }
  }

  return {
    nodes, edges,
    meta: {
      generated_at: new Date().toISOString(),
      node_count: nodes.length,
      edge_count: edges.length,
      by_type: {
        skill: nodes.filter(n => n.type === "skill").length,
        mcp: nodes.filter(n => n.type === "mcp").length,
        tool: nodes.filter(n => n.type === "tool").length,
        formula: nodes.filter(n => n.type === "formula").length,
        table: nodes.filter(n => n.type === "table").length,
        event: nodes.filter(n => n.type === "event").length,
        discipline: nodes.filter(n => n.type === "discipline").length,
      },
      by_edge_type: edges.reduce((acc, e) => { acc[e.type] = (acc[e.type] || 0) + 1; return acc; }, {}),
      formula_disciplines: discFormulaCounts,
    },
  };
}

// ============================================================
// 生成 Mermaid 架构总览图（高层视图）
// ============================================================

function generateMermaid(graph) {
  const lines = [];
  lines.push("---");
  lines.push("title: PilotDeck 模块关联关系图");
  lines.push("config:");
  lines.push("  theme: base");
  lines.push("  themeVariables:");
  lines.push("    primaryColor: '#4A90D9'");
  lines.push("---");
  lines.push("graph TB");
  lines.push("");

  // Style definitions
  lines.push("  classDef skill fill:#4A90D9,stroke:#2C5F8A,color:#fff,rx:8");
  lines.push("  classDef mcp fill:#E8A838,stroke:#B07D1A,color:#fff,rx:8");
  lines.push("  classDef tool fill:#7BC67E,stroke:#4A8B4D,color:#fff,rx:4");
  lines.push("  classDef formula fill:#C77DBA,stroke:#9A5A8E,color:#fff,rx:4");
  lines.push("  classDef table fill:#95A5A6,stroke:#7F8C8D,color:#fff,rx:4");
  lines.push("  classDef event fill:#E74C3C,stroke:#C0392B,color:#fff,rx:4");
  lines.push("  classDef disc fill:#3498DB,stroke:#2980B9,color:#fff,rx:12");
  lines.push("");

  // --- Layer 1: Disciplines ---
  lines.push("  subgraph SG_DISC[\"专业层\"]");
  const discs = graph.nodes.filter(n => n.type === "discipline");
  for (const d of discs) {
    const formulaCount = graph.meta.formula_disciplines[d.name] || 0;
    const skillCount = graph.edges.filter(e => e.type === "SKILL_DISCIPLINE" && e.to === d.id).length;
    lines.push(`    ${safeId(d.id)}["${d.name}<br/>${skillCount} Skills · ${formulaCount} 公式"]`);
  }
  lines.push("  end");
  lines.push("");

  // --- Layer 2: Skills grouped by discipline ---
  lines.push("  subgraph SG_SKILLS[\"Skill 层\"]");
  const skillGroups = {};
  for (const n of graph.nodes.filter(n => n.type === "skill")) {
    const disc = n.group || "其他";
    if (!skillGroups[disc]) skillGroups[disc] = [];
    skillGroups[disc].push(n);
  }
  for (const [disc, skills] of Object.entries(skillGroups)) {
    lines.push(`    subgraph SG_SK_${safeId(disc)}["${disc}"]`);
    for (const s of skills) {
      lines.push(`      ${safeId(s.id)}["${s.name}"]`);
    }
    lines.push("    end");
  }
  lines.push("  end");
  lines.push("");

  // --- Layer 3: MCP Services ---
  lines.push("  subgraph SG_MCP[\"MCP 服务层\"]");
  const mcps = graph.nodes.filter(n => n.type === "mcp");
  for (const m of mcps) {
    const toolCount = graph.edges.filter(e => e.type === "MCP_TOOL" && e.from === m.id).length;
    lines.push(`    ${safeId(m.id)}["${m.name}<br/>${toolCount} 个工具"]`);
  }
  lines.push("  end");
  lines.push("");

  // --- Layer 4: Events ---
  lines.push("  subgraph SG_EVENTS[\"事件总线\"]");
  const events = graph.nodes.filter(n => n.type === "event");
  for (const ev of events) {
    lines.push(`    ${safeId(ev.id)}["${ev.name}"]`);
  }
  lines.push("  end");
  lines.push("");

  // --- Key edges ---
  // Skill → MCP
  for (const e of graph.edges.filter(e => e.type === "SKILL_MCP")) {
    lines.push(`  ${safeId(e.from)} -->|依赖| ${safeId(e.to)}`);
  }

  // Skill manages
  for (const e of graph.edges.filter(e => e.type === "SKILL_MANAGES")) {
    lines.push(`  ${safeId(e.from)} -.->|管理| ${safeId(e.to)}`);
  }

  // Skill reports_to
  for (const e of graph.edges.filter(e => e.type === "SKILL_REPORTS_TO")) {
    lines.push(`  ${safeId(e.from)} -.->|汇报| ${safeId(e.to)}`);
  }

  // Skill → discipline
  for (const e of graph.edges.filter(e => e.type === "SKILL_DISCIPLINE")) {
    lines.push(`  ${safeId(e.from)} -->|专业| ${safeId(e.to)}`);
  }

  // Event producers/consumers
  for (const e of graph.edges.filter(e => e.type === "EVENT_PRODUCER")) {
    lines.push(`  ${safeId(e.from)} ==>|发布| ${safeId(e.to)}`);
  }
  for (const e of graph.edges.filter(e => e.type === "EVENT_CONSUMER")) {
    lines.push(`  ${safeId(e.to)} ==>|消费| ${safeId(e.from)}`);
  }

  lines.push("");

  // Apply classes
  for (const type of ["skill", "mcp", "tool", "formula", "table", "event", "discipline"]) {
    const ids = graph.nodes.filter(n => n.type === type).map(n => safeId(n.id));
    if (ids.length > 0) {
      // Mermaid class assignment: comma-separated IDs
      // Split into chunks of 10 to avoid line-too-long
      for (let i = 0; i < ids.length; i += 10) {
        const chunk = ids.slice(i, i + 10).join(",");
        lines.push(`  class ${chunk} ${type}`);
      }
    }
  }

  lines.push("");
  lines.push(`  %% Generated: ${graph.meta.generated_at}`);
  lines.push(`  %% Nodes: ${graph.meta.node_count} | Edges: ${graph.meta.edge_count}`);

  return lines.join("\n");
}

function safeId(id) {
  return id.replace(/[^a-zA-Z0-9_]/g, "_");
}

// ============================================================
// 生成可读报告
// ============================================================

function generateReport(graph) {
  const lines = [];
  lines.push("# PilotDeck 模块关联关系图");
  lines.push("");
  lines.push(`> 自动生成于 ${graph.meta.generated_at}`);
  lines.push(`> 节点: ${graph.meta.node_count} | 边: ${graph.meta.edge_count}`);
  lines.push("");

  // Summary table
  lines.push("## 总览");
  lines.push("");
  lines.push("| 模块类型 | 数量 |");
  lines.push("|----------|------|");
  const typeLabels = { skill: "Skill", mcp: "MCP 服务", tool: "MCP 工具", formula: "公式", table: "参数表", event: "事件类型", discipline: "专业" };
  for (const [type, count] of Object.entries(graph.meta.by_type)) {
    lines.push(`| ${typeLabels[type] || type} | ${count} |`);
  }
  lines.push("");

  // Edge type summary
  lines.push("## 关联关系统计");
  lines.push("");
  lines.push("| 关联类型 | 数量 | 说明 |");
  lines.push("|----------|------|------|");
  const edgeTypeLabels = {
    SKILL_MCP: "Skill → MCP", SKILL_MANAGES: "Skill 管理", SKILL_REPORTS_TO: "Skill 汇报",
    SKILL_MAY_CALL: "Skill 可调用", SKILL_DISCIPLINE: "Skill 专业", MCP_TOOL: "MCP 工具", FORMULA_TABLE: "公式→参数表",
    FORMULA_RELATED: "公式关联", FORMULA_DISCIPLINE: "公式专业", EVENT_PRODUCER: "事件发布", EVENT_CONSUMER: "事件消费",
  };
  for (const [type, count] of Object.entries(graph.meta.by_edge_type)) {
    lines.push(`| ${type} | ${count} | ${edgeTypeLabels[type] || ""} |`);
  }
  lines.push("");

  // Skill → MCP detail
  lines.push("## Skill → MCP 依赖详情");
  lines.push("");
  lines.push("| Skill | MCP 依赖 |");
  lines.push("|-------|----------|");
  const skillNodes = graph.nodes.filter(n => n.type === "skill");
  for (const s of skillNodes) {
    const mcps = graph.edges.filter(e => e.from === s.id && e.type === "SKILL_MCP").map(e => graph.nodes.find(n => n.id === e.to)?.name || e.to);
    if (mcps.length > 0) lines.push(`| ${s.name} | ${mcps.join(", ")} |`);
  }
  lines.push("");

  // MCP → Tools detail
  lines.push("## MCP 工具详情");
  lines.push("");
  for (const m of graph.nodes.filter(n => n.type === "mcp")) {
    const tools = graph.edges.filter(e => e.from === m.id && e.type === "MCP_TOOL").map(e => graph.nodes.find(n => n.id === e.to)?.name || e.to);
    lines.push(`### ${m.name}（${tools.length} 个工具）`);
    lines.push("");
    for (const t of tools) lines.push(`- \`${t}\``);
    lines.push("");
  }

  // Skill org chart
  lines.push("## Skill 组织关系");
  lines.push("");
  const managers = graph.edges.filter(e => e.type === "SKILL_MANAGES");
  const reporters = graph.edges.filter(e => e.type === "SKILL_REPORTS_TO");
  if (managers.length > 0) {
    lines.push("### 管理链");
    lines.push("");
    for (const e of managers) {
      const from = graph.nodes.find(n => n.id === e.from);
      const to = graph.nodes.find(n => n.id === e.to);
      lines.push(`- **${from?.name}** 管理 → ${to?.name}`);
    }
    lines.push("");
  }
  if (reporters.length > 0) {
    lines.push("### 汇报链");
    lines.push("");
    for (const e of reporters) {
      const from = graph.nodes.find(n => n.id === e.from);
      const to = graph.nodes.find(n => n.id === e.to);
      lines.push(`- ${from?.name} → 汇报至 **${to?.name}**`);
    }
    lines.push("");
  }

  // Formula summary by discipline
  lines.push("## 公式库分布");
  lines.push("");
  lines.push("| 专业 | 公式数量 |");
  lines.push("|------|----------|");
  for (const [disc, count] of Object.entries(graph.meta.formula_disciplines)) {
    lines.push(`| ${disc} | ${count} |`);
  }
  lines.push("");

  // Formula → Table refs
  const tableRefs = graph.edges.filter(e => e.type === "FORMULA_TABLE");
  if (tableRefs.length > 0) {
    lines.push("## 公式 → 参数表引用");
    lines.push("");
    lines.push("| 公式 | 参数 | 参数表 |");
    lines.push("|------|------|--------|");
    for (const e of tableRefs) {
      const formula = graph.nodes.find(n => n.id === e.from);
      const table = graph.nodes.find(n => n.id === e.to);
      lines.push(`| ${formula?.name} | ${e.label} | ${table?.name} |`);
    }
    lines.push("");
  }

  // Formula relations
  const formulaRels = graph.edges.filter(e => e.type === "FORMULA_RELATED");
  if (formulaRels.length > 0) {
    lines.push("## 公式间关联");
    lines.push("");
    lines.push("| 公式 | 关联公式 |");
    lines.push("|------|----------|");
    for (const e of formulaRels) {
      const from = graph.nodes.find(n => n.id === e.from);
      const to = graph.nodes.find(n => n.id === e.to);
      lines.push(`| ${from?.name} | ${to?.name} |`);
    }
    lines.push("");
  }

  // Event details
  lines.push("## 事件驱动关系");
  lines.push("");
  for (const ev of graph.nodes.filter(n => n.type === "event")) {
    const producers = graph.edges.filter(e => e.to === ev.id && e.type === "EVENT_PRODUCER").map(e => graph.nodes.find(n => n.id === e.from)?.name || e.from);
    const consumers = graph.edges.filter(e => e.from === ev.id && e.type === "EVENT_CONSUMER").map(e => graph.nodes.find(n => n.id === e.to)?.name || e.to);
    lines.push(`### \`${ev.name}\``);
    lines.push(`- 发布者: ${producers.length > 0 ? producers.join(", ") : "(无)"}`);
    lines.push(`- 消费者: ${consumers.length > 0 ? consumers.join(", ") : "(无)"}`);
    lines.push("");
  }

  return lines.join("\n");
}

// ============================================================
// 主流程
// ============================================================

const dryRun = process.argv.includes("--dry-run");

console.log("正在扫描所有模块...");
const graph = buildGraph();

console.log(`\n扫描完成:`);
console.log(`  节点: ${graph.meta.node_count}`);
console.log(`  边:   ${graph.meta.edge_count}`);
for (const [type, count] of Object.entries(graph.meta.by_type)) {
  console.log(`  ${type}: ${count}`);
}
console.log(`\n关联类型:`);
for (const [type, count] of Object.entries(graph.meta.by_edge_type)) {
  console.log(`  ${type}: ${count}`);
}

const mermaid = generateMermaid(graph);
const report = generateReport(graph);

if (dryRun) {
  console.log("\n--- DRY RUN ---");
  console.log("\nMermaid (前 30 行):");
  console.log(mermaid.split("\n").slice(0, 30).join("\n"));
} else {
  fs.mkdirSync(path.dirname(PATHS.outputFileJson), { recursive: true });
  fs.writeFileSync(PATHS.outputFileJson, JSON.stringify(graph, null, 2), "utf8");
  console.log(`\n已写入: ${PATHS.outputFileJson}`);

  fs.writeFileSync(PATHS.outputFileMmd, mermaid, "utf8");
  console.log(`已写入: ${PATHS.outputFileMmd}`);

  fs.writeFileSync(PATHS.outputFileReport, report, "utf8");
  console.log(`已写入: ${PATHS.outputFileReport}`);

  console.log("\n完成！使用以下方式查看:");
  console.log("  - JSON: 直接查看 module-graph.json");
  console.log("  - Mermaid: 在支持 Mermaid 的编辑器中打开 module-graph.mmd");
  console.log("  - 报告: 查看 module-graph-report.md");
}
