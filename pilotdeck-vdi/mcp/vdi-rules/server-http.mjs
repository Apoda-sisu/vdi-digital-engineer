#!/usr/bin/env node
/**
 * VDI Rules HTTP Gateway
 * 将 MCP stdio 规则引擎包装为 HTTP REST API
 */
import express from "express";
import cors from "cors";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3002;

const DEFAULT_RULES_PATH = path.resolve(__dirname, "vdi-rules.json");
const DISCIPLINE_CODES_PATH = path.resolve(__dirname, "../../config/discipline-codes.json");

let _cachedRules = null;
let _cachedRulesPath = null;

function loadRules() {
  const rulesPath = process.env.VDI_RULES_PATH || DEFAULT_RULES_PATH;
  if (_cachedRules && _cachedRulesPath === rulesPath) return _cachedRules;
  if (!fs.existsSync(rulesPath)) throw new Error(`Rules file not found: ${rulesPath}`);
  _cachedRules = JSON.parse(fs.readFileSync(rulesPath, "utf8"));
  _cachedRulesPath = rulesPath;
  return _cachedRules;
}

let _disciplineCodes = null;
function loadDisciplineCodes() {
  if (_disciplineCodes) return _disciplineCodes;
  if (!fs.existsSync(DISCIPLINE_CODES_PATH)) {
    _disciplineCodes = { discipline_slug_mapping: {} };
    return _disciplineCodes;
  }
  _disciplineCodes = JSON.parse(fs.readFileSync(DISCIPLINE_CODES_PATH, "utf8"));
  return _disciplineCodes;
}

function resolveDiscipline(input) {
  const codes = loadDisciplineCodes();
  const mapping = codes.discipline_slug_mapping || {};
  return mapping[input] || input;
}

const app = express();
app.use(cors());
app.use(express.json({ limit: "10mb" }));

// 根路径 - API 文档
app.get("/", (req, res) => {
  res.json({
    service: "vdi-rules",
    version: "1.0.0",
    description: "VDI 规则引擎服务",
    endpoints: {
      "GET  /health": "健康检查",
      "POST /api/check-redlines": "红线规则检查 (body: {discipline, output, stage?})",
      "POST /api/validate-output": "输出契约校验 (body: {discipline, sub_discipline?, output})",
      "POST /api/triple-review-gate": "三审三校闸门 (body: {discipline, output, review_history?})",
      "GET  /api/list-rules": "列出所有规则",
    },
  });
});

app.get("/health", (req, res) => {
  const rules = loadRules();
  res.json({
    status: "healthy",
    service: "vdi-rules",
    version: "1.0.0",
    redlines: rules.redlines?.length || 0,
    output_contracts: Object.keys(rules.output_contracts || {}).length,
    timestamp: new Date().toISOString(),
  });
});

// 红线规则检查
app.post("/api/check-redlines", (req, res) => {
  try {
    const { discipline, output, stage = "checking" } = req.body;
    if (!discipline || !output) return res.status(400).json({ error: "discipline and output required" });

    const disc = resolveDiscipline(discipline);
    const rules = loadRules();
    const applicable = rules.redlines.filter(r => r.discipline.includes(disc) || r.discipline.includes("*"));

    const results = applicable.map(rule => {
      let passed = true;
      const findings = [];

      if (rule.id === "RL-001") {
        const hasFireOutput = output?.output_type === "fire_water" ||
          (output?.content?.sub_outputs || []).some(s => s.sub_discipline === "fire");
        if (hasFireOutput) {
          const payload = output?.payload || {};
          if (payload.outdoor_fire_flow_Ls && payload.outdoor_fire_flow_Ls < 15) {
            passed = false;
            findings.push("室外消防流量不得低于 15 L/s（GB 50974-2014）");
          }
          if (payload.fire_tank_m3 && payload.fire_tank_m3 < 100) {
            passed = false;
            findings.push("消防水池有效容积不得低于 100 m³（GB 50974-2014）");
          }
        }
      }

      if (rule.id === "RL-005") {
        const payload = output?.payload || {};
        if (payload.effluent_standard && !payload.effluent_standard.match(/GB\s*8978|一级|二级|三级/)) {
          passed = false;
          findings.push("废水排放标准必须引用 GB 8978-1996 或明确排放等级");
        }
      }

      if (rule.id === "RL-007") {
        const citations = output?.citations;
        if (!citations || citations.length === 0) {
          passed = false;
          findings.push("DisciplineOutput 缺少 citations，每条设计结论必须附带规范依据");
        } else {
          const invalid = citations.filter(c => !c.source_type || !c.source_id || !c.version);
          if (invalid.length > 0) {
            passed = false;
            findings.push(`${invalid.length} 条 citations 缺少必填字段`);
          }
        }
      }

      return { rule_id: rule.id, rule_name: rule.name, severity: rule.severity, passed, findings: findings.length > 0 ? findings : ["符合要求"] };
    });

    const blocked = results.filter(r => !r.passed && r.severity === "critical");
    const warnings = results.filter(r => !r.passed && r.severity !== "critical");

    res.json({
      discipline: disc, stage, total_rules_checked: results.length,
      passed: results.filter(r => r.passed).length, failed: results.filter(r => !r.passed).length,
      blocked: blocked.length > 0, blocked_by: blocked.map(r => r.rule_id),
      results,
      summary: blocked.length > 0 ? `红线检查未通过` : warnings.length > 0 ? `通过，有 ${warnings.length} 个警告` : "全部通过",
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 输出契约校验
app.post("/api/validate-output", (req, res) => {
  try {
    const { discipline, sub_discipline, output } = req.body;
    if (!discipline || !output) return res.status(400).json({ error: "discipline and output required" });

    const disc = resolveDiscipline(discipline);
    const rules = loadRules();
    const issues = [];
    const contract = rules.output_contracts[disc];
    if (!contract) return res.status(400).json({ error: `未找到专业 '${disc}' 的输出契约` });

    for (const field of (contract.required_fields || [])) {
      if (field === "payload" && output.output_type === "integrated" && output.content !== undefined) continue;
      if (output[field] === undefined || output[field] === null) {
        issues.push({ field, error: `缺少必填字段 '${field}'`, severity: "error" });
      }
    }

    if (output.discipline !== disc) {
      issues.push({ field: "discipline", error: `discipline 应为 '${disc}'`, severity: "error" });
    }

    res.json({
      valid: issues.filter(i => i.severity === "error").length === 0,
      discipline: disc, issues,
      summary: issues.length === 0 ? "输出契约校验通过" : `发现 ${issues.length} 个问题`,
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 三审三校闸门
app.post("/api/triple-review-gate", (req, res) => {
  try {
    const { discipline, output, review_history = [] } = req.body;
    if (!discipline || !output) return res.status(400).json({ error: "discipline and output required" });

    const disc = resolveDiscipline(discipline);
    const rules = loadRules();
    const gate = rules.triple_review_gate;
    if (!gate) return res.status(400).json({ error: "三审三校闸门规则未配置" });

    const stages = gate.stages || [];
    const completed = review_history.map(r => r.stage);
    const currentStage = stages.find(s => !completed.includes(s.id));

    res.json({
      discipline: disc, stages,
      completed_stages: completed,
      current_stage: currentStage?.id || "complete",
      can_publish: completed.length >= stages.length,
      summary: currentStage ? `当前阶段: ${currentStage.name}` : "三审三校已完成，可以发布",
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 列出所有规则
app.get("/api/list-rules", (req, res) => {
  try {
    const rules = loadRules();
    res.json({
      redlines: (rules.redlines || []).map(r => ({ id: r.id, name: r.name, severity: r.severity, discipline: r.discipline })),
      output_contracts: Object.keys(rules.output_contracts || {}),
      has_triple_review: !!rules.triple_review_gate,
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.listen(PORT, () => {
  console.log(`[http-gateway] VDI Rules 服务已启动: http://localhost:${PORT}`);
});
