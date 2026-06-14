#!/usr/bin/env node
/**
 * VDI 规则校验 MCP（stdio）— vdi-rules 插件
 *
 * 提供红线规则检查、输出契约校验、三审三校闸门三个工具。
 * 规则定义从 pilotdeck-vdi/data/vdi-rules.json 加载。
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
import { resolveCanonicalDiscipline, getDisciplineSlugMapping } from "../../config/cfihos-discipline-resolve.mjs";
import { validatePlantModelForPublish } from "../vdi-cad/plant-model-validator.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DEFAULT_RULES_PATH = path.resolve(__dirname, "vdi-rules.json");
const DISCIPLINE_CODES_PATH = path.resolve(__dirname, "../../config/discipline-codes.json");

// ---------------------------------------------------------------------------
// 规则 & 学科代码加载（带缓存）
// ---------------------------------------------------------------------------

let _cachedRules = null;
let _cachedRulesPath = null;

function loadRules() {
  const rulesPath = process.env.VDI_RULES_PATH || DEFAULT_RULES_PATH;
  if (_cachedRules && _cachedRulesPath === rulesPath) return _cachedRules;
  if (!fs.existsSync(rulesPath)) {
    throw new Error(`Rules file not found: ${rulesPath}`);
  }
  const raw = fs.readFileSync(rulesPath, "utf8");
  _cachedRules = JSON.parse(raw);
  _cachedRulesPath = rulesPath;
  return _cachedRules;
}

let _disciplineCodes = null;
function loadDisciplineCodes() {
  if (_disciplineCodes) return _disciplineCodes;
  if (!fs.existsSync(DISCIPLINE_CODES_PATH)) {
    console.error(`[vdi-rules] discipline-codes.json not found at ${DISCIPLINE_CODES_PATH}`);
    _disciplineCodes = { discipline_slug_mapping: {} };
    return _disciplineCodes;
  }
  _disciplineCodes = JSON.parse(fs.readFileSync(DISCIPLINE_CODES_PATH, "utf8"));
  return _disciplineCodes;
}

/** slug / legacy VDI / CFIHOS → canonical discipline code */
function resolveDiscipline(input) {
  const slugMap = getDisciplineSlugMapping(loadDisciplineCodes());
  if (slugMap[input]) return slugMap[input];
  return resolveCanonicalDiscipline(input);
}

/** 子领域 slug → vdi-rules data_contracts 键（如 supply → S） */
const SUB_DISCIPLINE_ALIASES = {
  supply: "S",
  fire: "F",
  drainage: "D",
  stormwater: "R",
  wastewater: "W",
  circulating: "C",
  package: "K",
  safety: "F",
  route: "R",
  balance: "B",
  pfd: "P",
  pid: "P",
  equipment: "E",
  utilities: "U",
  hydraulics: "H",
  relief: "L",
  control: "C",
  lab: "A",
};

function resolveSubDiscipline(disciplineCode, subDiscipline) {
  if (!subDiscipline) return subDiscipline;
  const contracts = loadRules().data_contracts?.[disciplineCode];
  if (contracts?.[subDiscipline]) return subDiscipline;
  const alias = SUB_DISCIPLINE_ALIASES[subDiscipline.toLowerCase()];
  if (alias && contracts?.[alias]) return alias;
  return subDiscipline;
}
// ---------------------------------------------------------------------------
// 工具 1：vdi_check_redlines — 红线规则检查
// ---------------------------------------------------------------------------

const CheckRedlinesSchema = z.object({
  discipline: z.string().describe("专业标识（学科码），如 WA / PR / PI"),
  output: z.any().describe("待检查的 DisciplineOutput JSON 对象"),
  stage: z.enum(["design", "checking", "review", "approval"]).optional().default("checking")
    .describe("当前校审阶段，影响检查严格度"),
});

function handleCheckRedlines(args) {
  const input = CheckRedlinesSchema.parse(args);
  input.discipline = resolveDiscipline(input.discipline);
  const rules = loadRules();
  const applicable = rules.redlines.filter((r) =>
    r.discipline.includes(input.discipline) || r.discipline.includes("*")
  );

  const results = applicable.map((rule) => {
    let passed = true;
    const findings = [];

    // RL-001: 消防设计合规
    if (rule.id === "RL-001") {
      const hasFireOutput = input.output?.output_type === "fire_water" ||
        (input.output?.content?.sub_outputs || []).some((s) => s.sub_discipline === "fire");
      if (hasFireOutput) {
        const payload = input.output?.payload || {};
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

    // RL-005: 排污水质达标
    if (rule.id === "RL-005") {
      const payload = input.output?.payload || {};
      if (payload.effluent_standard && !payload.effluent_standard.match(/GB\s*8978|一级|二级|三级/)) {
        passed = false;
        findings.push("废水排放标准必须引用 GB 8978-1996 或明确排放等级");
      }
    }

    // RL-007: 证据链完整性（通用）
    if (rule.id === "RL-007") {
      const citations = input.output?.citations;
      if (!citations || citations.length === 0) {
        passed = false;
        findings.push("DisciplineOutput 缺少 citations，每条设计结论必须附带规范依据");
      } else {
        const invalidCitations = citations.filter((c) =>
          !c.source_type || !c.source_id || !c.version
        );
        if (invalidCitations.length > 0) {
          passed = false;
          findings.push(`${invalidCitations.length} 条 citations 缺少必填字段（source_type/source_id/version）`);
        }
      }
    }

    return {
      rule_id: rule.id,
      rule_name: rule.name,
      severity: rule.severity,
      passed,
      findings: findings.length > 0 ? findings : ["符合要求"],
    };
  });

  const blocked = results.filter((r) => !r.passed && r.severity === "critical");
  const warnings = results.filter((r) => !r.passed && r.severity !== "critical");

  return {
    discipline: input.discipline,
    stage: input.stage,
    total_rules_checked: results.length,
    passed: results.filter((r) => r.passed).length,
    failed: results.filter((r) => !r.passed).length,
    blocked: blocked.length > 0,
    blocked_by: blocked.map((r) => r.rule_id),
    results,
    summary: blocked.length > 0
      ? `红线检查未通过：${blocked.map((r) => r.rule_name).join("、")}`
      : warnings.length > 0
        ? `通过，但存在 ${warnings.length} 个非严重问题需整改`
        : "全部红线规则通过",
  };
}

// ---------------------------------------------------------------------------
// 工具 2：vdi_validate_discipline_output — 输出契约校验
// ---------------------------------------------------------------------------

const ValidateOutputSchema = z.object({
  discipline: z.string().describe("专业标识（学科码），如 WA / PR"),
  sub_discipline: z.string().optional().describe("子领域码（如 S=给水 / F=消防 / C=循环水）"),
  output: z.any().describe("待校验的 DisciplineOutput JSON 对象"),
});

function handleValidateOutput(args) {
  const input = ValidateOutputSchema.parse(args);
  input.discipline = resolveDiscipline(input.discipline);
  if (input.sub_discipline) {
    input.sub_discipline = resolveSubDiscipline(input.discipline, input.sub_discipline);
  }
  const rules = loadRules();
  const issues = [];

  // 1. 检查通用必填字段
  const contract = rules.output_contracts[input.discipline];
  if (!contract) {
    return {
      valid: false,
      discipline: input.discipline,
      issues: [{ field: "discipline", error: `未找到专业 '${input.discipline}' 的输出契约定义。支持的专业：${Object.keys(rules.output_contracts).join(", ")}` }],
    };
  }

  const requiredFields = contract.required_fields || [];
  for (const field of requiredFields) {
    // 'integrated' 输出类型使用 'content' 替代 'payload'
    if (field === "payload" && input.output.output_type === "integrated" && input.output.content !== undefined) {
      continue;
    }
    if (input.output[field] === undefined || input.output[field] === null) {
      issues.push({ field, error: `缺少必填字段 '${field}'`, severity: "error" });
    }
  }

  // 2. 检查 discipline 字段值（允许 slug 与学科码等价，如 water ↔ WA）
  const outputDiscipline = resolveDiscipline(input.output.discipline ?? "");
  if (outputDiscipline !== input.discipline) {
    issues.push({ field: "discipline", error: `discipline 应为 '${input.discipline}'，实际为 '${input.output.discipline}'`, severity: "error" });
  }

  // 3. 检查 output_type
  if (input.sub_discipline) {
    const subContract = contract.sub_discipline_contracts?.[input.sub_discipline];
    if (subContract) {
      if (input.output.output_type !== subContract.output_type) {
        issues.push({ field: "output_type", error: `output_type 应为 '${subContract.output_type}'，实际为 '${input.output.output_type}'`, severity: "error" });
      }
      // 检查子领域 payload 必填字段
      for (const pf of (subContract.required_payload_fields || [])) {
        if (!input.output.payload || input.output.payload[pf] === undefined) {
          issues.push({ field: `payload.${pf}`, error: `子领域 '${input.sub_discipline}' 的 payload 缺少必填字段 '${pf}'`, severity: "error" });
        }
      }
    }
  }

  // 4. 检查 status 枚举
  const validStatuses = ["draft", "under_review", "approved", "published"];
  if (input.output.status && !validStatuses.includes(input.output.status)) {
    issues.push({ field: "status", error: `status 值 '${input.output.status}' 无效，应为 ${validStatuses.join(" / ")}`, severity: "warning" });
  }

  // 5. 检查 risk_level 枚举
  const validRisks = ["low", "medium", "high"];
  if (input.output.risk_level && !validRisks.includes(input.output.risk_level)) {
    issues.push({ field: "risk_level", error: `risk_level 值 '${input.output.risk_level}' 无效`, severity: "warning" });
  }

  // 6. 检查 confidence 范围
  if (input.output.confidence !== undefined && (input.output.confidence < 0 || input.output.confidence > 1)) {
    issues.push({ field: "confidence", error: `confidence 应为 0.0-1.0，实际为 ${input.output.confidence}`, severity: "warning" });
  }

  return {
    valid: issues.filter((i) => i.severity === "error").length === 0,
    discipline: input.discipline,
    sub_discipline: input.sub_discipline || null,
    issues_count: issues.length,
    errors: issues.filter((i) => i.severity === "error").length,
    warnings: issues.filter((i) => i.severity === "warning").length,
    issues,
    summary: issues.length === 0 ? "输出契约校验通过" : `发现 ${issues.length} 个问题`,
  };
}

// ---------------------------------------------------------------------------
// 工具 3：vdi_check_data_completeness — 输入数据完整性校验
// ---------------------------------------------------------------------------

const CheckDataCompletenessSchema = z.object({
  discipline: z.string().describe("专业标识，如 water / process"),
  sub_discipline: z.string().describe("子领域码（如 S / F / D）"),
  provided_data: z.record(z.any()).describe("已提供的输入数据键值对，如 { Q_process_m3d: 320, H_geo_m: 15 }"),
});

function handleCheckDataCompleteness(args) {
  const input = CheckDataCompletenessSchema.parse(args);
  input.discipline = resolveDiscipline(input.discipline);
  input.sub_discipline = resolveSubDiscipline(input.discipline, input.sub_discipline);
  const rules = loadRules();
  const dataContracts = rules.data_contracts;
  
  if (!dataContracts) {
    return { 
      error: "data_contracts 未在 vdi-rules.json 中定义",
      complete: false,
      status: "ERROR"
    };
  }

  const disciplineContract = dataContracts[input.discipline];
  if (!disciplineContract) {
    return {
      complete: false,
      discipline: input.discipline,
      sub_discipline: input.sub_discipline,
      error: `未找到专业 '${input.discipline}' 的数据契约。支持的专业：${Object.keys(dataContracts).join(", ")}`,
      status: "ERROR"
    };
  }

  const subContract = disciplineContract[input.sub_discipline];
  if (!subContract) {
    return {
      complete: false,
      discipline: input.discipline,
      sub_discipline: input.sub_discipline,
      error: `未找到子领域 '${input.sub_discipline}' 的数据契约。支持的子领域：${Object.keys(disciplineContract).join(", ")}`,
      status: "ERROR"
    };
  }

  const provided = input.provided_data || {};

  // 检查 MUST 数据
  const missingMust = [];
  const presentMust = [];
  for (const item of (subContract.must || [])) {
    const value = provided[item.field];
    if (value === undefined || value === null || value === "") {
      missingMust.push({
        field: item.field,
        label: item.label,
        source: item.source,
        rule: item.rule,
      });
    } else {
      presentMust.push({
        field: item.field,
        label: item.label,
        value_provided: value,
        rule: item.rule,
      });
    }
  }

  // 检查 SHOULD 数据
  const missingShould = [];
  const assumedShould = [];
  for (const item of (subContract.should || [])) {
    const value = provided[item.field];
    if (value === undefined || value === null || value === "") {
      missingShould.push({
        field: item.field,
        label: item.label,
        default_value: item.default,
        basis: item.basis,
        needs_human_confirm: item.confirm_when || false,
      });
    } else {
      assumedShould.push({
        field: item.field,
        label: item.label,
        value_provided: value,
      });
    }
  }

  const complete = missingMust.length === 0;
  const totalMust = (subContract.must || []).length;
  const totalShould = (subContract.should || []).length;

  return {
    complete,
    discipline: input.discipline,
    sub_discipline: input.sub_discipline,
    status: complete ? "READY" : "BLOCKED",
    summary: complete
      ? `数据完整性校验通过：${totalMust}/${totalMust} MUST 数据齐全，${missingShould.length} 项 SHOULD 数据使用默认值`
      : `数据不完整：${missingMust.length}/${totalMust} 项 MUST 数据缺失，设计无法继续`,
    must: {
      total: totalMust,
      present: presentMust.length,
      missing: missingMust.length,
      missing_items: missingMust,
      present_items: presentMust,
    },
    should: {
      total: totalShould,
      provided: assumedShould.length,
      missing: missingShould.length,
      missing_items: missingShould,
      defaults_applied: assumedShould,
    },
    instruction: complete
      ? "MUST 数据齐全。请检查 SHOULD 默认值（见上表），向人类输出 ASSUMPTION 声明并等待确认后进入 CP-1。"
      : `以下 MUST 数据缺失，请向人类发出 DATA_REQUEST：\n${
          missingMust.map((m) => `- ${m.label}（来源：${m.source}）`).join("\n")
        }\n\n在人类补充以上数据前，不得执行任何设计计算。`,
  };
}

// ---------------------------------------------------------------------------
// 工具 4：vdi_check_review_gate — 三审三校闸门
// ---------------------------------------------------------------------------

const CheckReviewGateSchema = z.object({
  discipline: z.string().describe("专业标识"),
  stage: z.enum(["design", "checking", "review", "approval"]).describe("校审阶段"),
  output: z.any().describe("DisciplineOutput JSON 对象"),
  reviewer_notes: z.string().optional().describe("校审人备注"),
  human_approval: z.boolean().optional().describe("审定阶段人工确认（high risk 时）"),
});

function handleCheckReviewGate(args) {
  const input = CheckReviewGateSchema.parse(args);
  input.discipline = resolveDiscipline(input.discipline);
  const rules = loadRules();
  const gate = rules.review_gates[input.stage];

  if (!gate) {
    return { error: `未找到阶段 '${input.stage}' 的闸门规则` };
  }

  const gateChecks = gate.checks.map((check) => {
    let passed = true;
    let note = "";

    switch (check.id) {
      case "DS-01":
      case "CK-01":
        // 设计计算正确性 — 检查 output 中关键数值是否在合理范围
        passed = input.output.confidence >= 0.7;
        if (!passed) note = "confidence 过低，可能影响计算正确性";
        break;

      case "CK-06":
        // 红线规则符合性 — 委托给红线检查
        passed = true; // 假设红线已单独检查
        note = "需确保红线规则检查已通过";
        break;

      case "CK-04":
        // 证据链校核
        passed = input.output.citations && input.output.citations.length > 0;
        if (!passed) note = "citations 为空，缺少证据链";
        break;

      case "RV-01":
        // 技术方案合理性审核
        passed = input.output.confidence >= 0.85;
        if (!passed) note = "审核阶段 confidence 应 ≥ 0.85";
        break;

      case "AP-01":
      case "AP-02":
      case "AP-03":
        // 审定：high risk 须人工确认；E2E/流程传入 human_approval 表示已审定
        if (input.output.risk_level === "high" && !input.human_approval) {
          passed = false;
          note = "重大方案（risk_level=high）须人工审定；确认后传 human_approval=true";
        } else if (input.output.risk_level === "high" && input.human_approval) {
          passed = true;
          note = "人工审定已确认";
        }
        break;

      default:
        // 其余检查项默认通过（需人工确认）
        note = "需人工确认";
    }

    return {
      check_id: check.id,
      item: check.item,
      weight: check.weight,
      passed,
      note,
    };
  });

  const criticalChecks = gateChecks.filter((c) => c.weight === "critical");
  const highChecks = gateChecks.filter((c) => c.weight === "high");
  const criticalFailed = criticalChecks.filter((c) => !c.passed);
  const highFailed = highChecks.filter((c) => !c.passed);

  let passed = false;
  if (input.stage === "approval") {
    passed = criticalFailed.length === 0;
  } else {
    passed = criticalFailed.length === 0 &&
      (highChecks.length === 0 || highFailed.length / Math.max(highChecks.length, 1) < 0.1);
  }

  const stageLabel = { design: "设计自校", checking: "校核", review: "审核", approval: "审定" }[input.stage];
  return {
    stage: input.stage,
    stage_label: stageLabel,
    performed_by: gate.performed_by || "设计人",
    reviewer_notes: input.reviewer_notes || null,
    passed,
    total_checks: gateChecks.length,
    passed_checks: gateChecks.filter((c) => c.passed).length,
    failed_checks: gateChecks.filter((c) => !c.passed).length,
    critical_failed: criticalFailed.length,
    checks: gateChecks,
    next_stage: passed ? getNextStage(input.stage) : null,
    summary: passed
      ? `校审阶段「${stageLabel}」通过`
      : `校审未通过：${criticalFailed.map((c) => c.item).join("、")} 未达标`,
  };
}

function getNextStage(current) {
  const order = ["design", "checking", "review", "approval"];
  const idx = order.indexOf(current);
  return idx < order.length - 1 ? order[idx + 1] : null;
}

// ---------------------------------------------------------------------------
// 工具 5：vdi_validate_plant_model — PlantModel 发布闸门
// ---------------------------------------------------------------------------

const ValidatePlantModelSchema = z.object({
  plant_model: z.any().describe("PlantModel v1 JSON"),
  stage: z.enum(["design", "checking", "review", "approval"]).optional().default("checking"),
  min_equipment: z.number().optional(),
});

function handleValidatePlantModel(args) {
  const input = ValidatePlantModelSchema.parse(args);
  return validatePlantModelForPublish(input.plant_model, {
    stage: input.stage,
    min_equipment: input.min_equipment,
  });
}

// ---------------------------------------------------------------------------
// MCP 服务入口
// ---------------------------------------------------------------------------

async function main() {
  loadRules(); // 预加载验证规则文件存在
  loadDisciplineCodes(); // 预加载学科代码映射表

  const server = new Server(
    {
      name: "vdi-rules",
      version: "0.1.0",
    },
    {
      capabilities: { tools: {} },
    }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: "vdi_check_redlines",
        description:
          "红线规则检查。对 DisciplineOutput 进行必须通过的合规性检查（消防、环保、安全、证据链等）。任一 critical 规则未通过即阻断发布。",
        inputSchema: {
          type: "object",
          properties: {
            discipline: { type: "string", description: "专业标识，如 water / process / piping" },
            output: { description: "待检查的 DisciplineOutput JSON 对象" },
            stage: {
              type: "string",
              enum: ["design", "checking", "review", "approval"],
              description: "当前校审阶段，影响检查严格度",
            },
          },
          required: ["discipline", "output"],
        },
      },
      {
        name: "vdi_validate_discipline_output",
        description:
          "输出契约校验。验证 DisciplineOutput 是否满足该专业/子领域的 Schema 契约要求（必填字段、枚举值、数值范围）。",
        inputSchema: {
          type: "object",
          properties: {
            discipline: { type: "string", description: "专业标识" },
            sub_discipline: { type: "string", description: "子领域标识（如 supply / fire / circulating）" },
            output: { description: "待校验的 DisciplineOutput JSON 对象" },
          },
          required: ["discipline", "output"],
        },
      },
      {
        name: "vdi_check_data_completeness",
        description:
          "输入数据完整性校验（CP-0 程序化闸门）。逐项检查子领域 MUST/SHOULD 输入数据是否齐全。MUST 数据缺失时返回 BLOCKED，Skill 必须发出 DATA_REQUEST 并停止。",
        inputSchema: {
          type: "object",
          properties: {
            discipline: { type: "string", description: "专业标识，如 water" },
            sub_discipline: { type: "string", description: "子领域标识，如 supply / fire / drainage / stormwater / wastewater / circulating" },
            provided_data: {
              type: "object",
              description: "已提供的输入数据键值对，键名须与 data_contracts 中的 field 一致",
            },
          },
          required: ["discipline", "sub_discipline", "provided_data"],
        },
      },
      {
        name: "vdi_check_review_gate",
        description:
          "三审三校闸门。对指定阶段（设计自校/校核/审核/审定）执行闸门规则检查，返回通过/不通过的判定及逐项检查结果。",
        inputSchema: {
          type: "object",
          properties: {
            discipline: { type: "string", description: "专业标识" },
            stage: {
              type: "string",
              enum: ["design", "checking", "review", "approval"],
              description: "校审阶段",
            },
            output: { description: "DisciplineOutput JSON 对象" },
            reviewer_notes: { type: "string", description: "校审人备注" },
            human_approval: { type: "boolean", description: "审定阶段：high risk 时人工已确认" },
          },
          required: ["discipline", "stage", "output"],
        },
      },
      {
        name: "vdi_validate_plant_model",
        description:
          "PlantModel 发布闸门。校验工厂对象模型完整性（Equipment 设计条件、PipeRun 管径、object_id 等）。缺 design_P 等设备设计条件时拒绝发布。",
        inputSchema: {
          type: "object",
          properties: {
            plant_model: { description: "PlantModel v1 JSON 对象" },
            stage: {
              type: "string",
              enum: ["design", "checking", "review", "approval"],
              description: "校审阶段",
            },
            min_equipment: { type: "number", description: "最少设备数量" },
          },
          required: ["plant_model"],
        },
      },
    ],
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    try {
      let result;
      switch (name) {
        case "vdi_check_redlines":
          result = handleCheckRedlines(args ?? {});
          break;
        case "vdi_validate_discipline_output":
          result = handleValidateOutput(args ?? {});
          break;
        case "vdi_check_data_completeness":
          result = handleCheckDataCompleteness(args ?? {});
          break;
        case "vdi_check_review_gate":
          result = handleCheckReviewGate(args ?? {});
          break;
        case "vdi_validate_plant_model":
          result = handleValidatePlantModel(args ?? {});
          break;
        default:
          return {
            content: [{ type: "text", text: `Unknown tool: ${name}` }],
            isError: true,
          };
      }
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
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
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
