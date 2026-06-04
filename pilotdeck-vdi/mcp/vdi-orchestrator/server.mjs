#!/usr/bin/env node
/**
 * VDI 编排调度 MCP（stdio）— vdi-orchestrator 插件
 *
 * 提供任务包创建、WBS 拆解、任务派发、里程碑跟踪、依赖图查询、预警触发等工具。
 * 状态持久化到 WorkSpace 的 .pilotdeck/projects/{project_id}/ 目录。
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

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// 状态持久化
// ---------------------------------------------------------------------------

const WORKSPACE_ROOT = process.env.VDI_WORKSPACE_ROOT || "/workspace/workspaces";

function projectDir(projectId) {
  return path.join(WORKSPACE_ROOT, projectId);
}

function statePath(projectId, file) {
  return path.join(projectDir(projectId), ".pilotdeck", "projects", projectId, file);
}

function readJSON(filePath, fallback = null) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (e) {
    console.error(`[vdi-orchestrator] readJSON 失败: ${filePath} — ${e.message}`);
    return fallback;
  }
}

function writeJSON(filePath, data) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
}

// ---------------------------------------------------------------------------
// 学科代码体系（加载 discipline-codes.json）
// ---------------------------------------------------------------------------

const DISCIPLINE_CODES_PATH = path.resolve(__dirname, "../../config/discipline-codes.json");
let DISCIPLINE_CODES;
try {
  DISCIPLINE_CODES = JSON.parse(fs.readFileSync(DISCIPLINE_CODES_PATH, "utf8"));
} catch (e) {
  console.error(`[vdi-orchestrator] 无法加载学科代码表: ${e.message}`);
  process.exit(1);
}

function oldSlugToCode(slug) {
  // 尝试直接匹配（已经是代码）或通过映射表转换
  if (DISCIPLINE_CODES.disciplines[slug]) return slug;
  return DISCIPLINE_CODES.discipline_slug_mapping[slug] || slug;
}

function getLeadCode(disciplineCode) {
  return DISCIPLINE_CODES.disciplines[disciplineCode]?.lead_code || null;
}

function getDisciplineName(discipline) {
  return DISCIPLINE_CODES.disciplines[discipline]?.name || discipline;
}

// ---------------------------------------------------------------------------
// 依赖图（基于学科代码体系，键为 2 字母学科码）
// ---------------------------------------------------------------------------

const DEPENDENCY_GRAPH = {
  PR: {
    downstream: ["PI", "IN", "EQ", "WA", "HS"],
    description: "工艺设计基础（PFD/P&ID、物料平衡、设计基础参数）",
  },
  PI: {
    downstream: ["IN", "ST"],
    upstream: ["PR"],
    description: "管道布置、材料等级、应力分析",
  },
  IN: {
    downstream: ["EL"],
    upstream: ["PR", "PI"],
    description: "仪表索引、联锁逻辑、DCS/PLC 配置",
  },
  EQ: {
    downstream: ["ST", "PI"],
    upstream: ["PR"],
    description: "静动设备数据表、布置图",
  },
  WA: {
    downstream: ["FI", "EL"],
    upstream: ["PR"],
    description: "给排水专业（由 WA0L 统一管理子领域）",
    lead_code: "WA0L",
    active: true,
  },
  EL: {
    downstream: ["ST"],
    upstream: ["IN", "EQ", "WA"],
    description: "供配电、防爆分区、照明",
  },
  HS: {
    upstream: ["PR"],
    description: "HAZOP/LOPA、安全阀、环保",
  },
  FI: {
    upstream: ["WA"],
    description: "建筑防火分区、灭火器配置",
  },
  HV: {
    upstream: ["PR", "EQ"],
    description: "暖通空调",
  },
  ST: {
    upstream: ["PI", "EQ", "EL"],
    description: "结构设计、基础设计",
  },
  AR: {
    upstream: ["FI"],
    description: "建筑设计、防火疏散",
  },
  SI: {
    upstream: ["PR", "PI"],
    description: "总图布置、竖向设计",
  },
  TH: {
    upstream: ["PR"],
    description: "热工、换热站",
  },
  TC: {
    upstream: ["EL"],
    description: "电信、通信",
  },
  MG: {
    downstream: ["PR", "WA", "PI", "IN", "EQ", "EL", "HS", "FI", "HV", "ST"],
    description: "设计管理（顶层协调）",
    lead_code: "MGDM",
    active: true,
  },
  QA: {
    upstream: ["PR", "WA", "PI", "IN", "EQ"],
    description: "质量管理",
  },
};

// ---------------------------------------------------------------------------
// 工具：vdi_create_task_package
// ---------------------------------------------------------------------------

const CreateTaskPackageSchema = z.object({
  project_id: z.string().describe("项目编号，如 VDI-PROJ-001"),
  title: z.string().describe("任务包名称"),
  description: z.string().optional().describe("任务包描述"),
  disciplines: z.array(z.string()).describe("参与专业列表，如 ['process', 'piping', 'water']"),
  milestones: z
    .array(
      z.object({
        name: z.string().describe("里程碑名称"),
        target_date: z.string().describe("目标日期，YYYY-MM-DD"),
      })
    )
    .describe("里程碑列表"),
  standards: z.array(z.string()).optional().describe("适用标准规范列表"),
  risk_level: z.enum(["low", "medium", "high"]).optional().default("medium"),
});

function handleCreateTaskPackage(args) {
  const input = CreateTaskPackageSchema.parse(args);
  const packageId = `TP-${input.project_id}-${Date.now()}`;
  const resolvedDisciplines = input.disciplines.map((d) => {
    const code = oldSlugToCode(d);
    if (!DISCIPLINE_CODES.disciplines[code]) {
      throw new Error(`无效的学科标识 '${d}'（解析为 '${code}'），支持的专业：${Object.keys(DISCIPLINE_CODES.disciplines).join(", ")}`);
    }
    return code;
  });
  const pkg = {
    object_type: "TaskPackage",
    package_id: packageId,
    project_id: input.project_id,
    title: input.title,
    description: input.description || "",
    disciplines: resolvedDisciplines,
    milestones: input.milestones.map((m) => ({
      name: m.name,
      target_date: m.target_date,
      status: "pending",
      completed_wbs: [],
      pending_wbs: [],
    })),
    standards: input.standards || [],
    risk_level: input.risk_level,
    status: "draft",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  writeJSON(statePath(input.project_id, "task-package.json"), pkg);
  return pkg;
}

// ---------------------------------------------------------------------------
// 工具：vdi_decompose_tasks
// ---------------------------------------------------------------------------

const DecomposeTasksSchema = z.object({
  project_id: z.string().describe("项目编号"),
  package_id: z.string().optional().describe("任务包 ID，如不提供则使用最新的"),
});

function handleDecomposeTasks(args) {
  const input = DecomposeTasksSchema.parse(args);
  const pkgPath = statePath(input.project_id, "task-package.json");
  const pkg = readJSON(pkgPath);
  if (!pkg) {
    return { error: `TaskPackage not found for project ${input.project_id}. Create one first with vdi_create_task_package.` };
  }

  // WBS 生成规则：
  // 1. 按依赖图拓扑排序
  // 2. 每个专业至少一个 WBS 项
  // 3. 无上游依赖的专业排在最前
  const disciplines = pkg.disciplines.map((d) => oldSlugToCode(d));
  const graph = buildSubGraph(disciplines);

  const wbsItems = [];
  let wbsSeq = 0;

  // 拓扑排序
  const sorted = topologicalSort(graph, disciplines);
  const milestoneMap = {};
  for (const m of pkg.milestones) {
    milestoneMap[m.name] = m;
  }

  const defaultMilestone = pkg.milestones[0]?.name || "model_review_30";

  for (const disc of sorted) {
    wbsSeq++;
    const info = DEPENDENCY_GRAPH[disc] || { upstream: [], downstream: [], description: disc };
    const upstreamWbs = wbsItems
      .filter((w) => info.upstream?.includes(w.discipline))
      .map((w) => w.wbs_id);

    const leadCode = info.lead_code || getLeadCode(disc);
    const skillName = leadCode ? `[${leadCode}] ${getDisciplineName(disc)}` : `${getDisciplineName(disc)}专业负责人`;

    wbsItems.push({
      wbs_id: `${wbsSeq}`,
      title: `${disc} 设计任务`,
      discipline: disc,
      skill: skillName,
      description: info.description || `${disc} 专业设计`,
      input_from: info.upstream || [],
      output_to: info.downstream || [],
      estimated_hours: estimateHours(disc),
      milestone: defaultMilestone,
      risk_level: ["process", "hse"].includes(disc) ? "high" : "medium",
      depends_on: upstreamWbs,
      status: "pending",
    });
  }

  // 更新 task-package
  pkg.wbs_items = wbsItems;
  pkg.status = "decomposed";
  pkg.critical_path = computeCriticalPath(wbsItems);
  pkg.total_estimated_hours = wbsItems.reduce((s, w) => s + w.estimated_hours, 0);
  pkg.updated_at = new Date().toISOString();
  writeJSON(pkgPath, pkg);

  return {
    package_id: pkg.package_id,
    project_id: pkg.project_id,
    wbs_items: wbsItems,
    critical_path: pkg.critical_path,
    total_estimated_hours: pkg.total_estimated_hours,
    milestones: pkg.milestones,
  };
}

function buildSubGraph(disciplines) {
  const sub = {};
  for (const d of disciplines) {
    sub[d] = DEPENDENCY_GRAPH[d] || { upstream: [], downstream: [] };
  }
  return sub;
}

function topologicalSort(graph, disciplines) {
  const inDegree = {};
  const adj = {};
  for (const d of disciplines) {
    inDegree[d] = 0;
    adj[d] = [];
  }
  for (const d of disciplines) {
    const info = graph[d] || { downstream: [] };
    for (const down of info.downstream || []) {
      if (disciplines.includes(down)) {
        adj[d].push(down);
        inDegree[down] = (inDegree[down] || 0) + 1;
      }
    }
  }
  const queue = disciplines.filter((d) => inDegree[d] === 0);
  const result = [];
  while (queue.length > 0) {
    queue.sort();
    const node = queue.shift();
    result.push(node);
    for (const next of adj[node] || []) {
      inDegree[next]--;
      if (inDegree[next] === 0) queue.push(next);
    }
  }

  // 循环依赖检测：Kahn 算法排不出的节点即为循环成员
  if (result.length < disciplines.length) {
    const stuck = disciplines.filter((d) => !result.includes(d));
    console.error(`[vdi-orchestrator] 循环依赖检测：${stuck.length} 个节点无法排序 — ${stuck.join(", ")}`);
  }

  return result;
}

function estimateHours(discipline) {
  const estimates = {
    process: 40,
    piping: 32,
    instrument: 24,
    equipment: 24,
    water: 20,
    electrical: 20,
    hse: 16,
    fire: 12,
    hvac: 16,
    structure: 24,
    architecture: 16,
    site: 12,
    thermal: 16,
    telecom: 8,
  };
  return estimates[discipline] || 16;
}

function computeCriticalPath(wbsItems) {
  // 简化版：拓扑排序的最长路径
  const pathWbsIds = [];
  const visited = new Set();
  for (const w of wbsItems) {
    if (w.depends_on && w.depends_on.length > 0) {
      const allUpstreamVisited = w.depends_on.every((id) => visited.has(id));
      if (!allUpstreamVisited) continue;
    }
    pathWbsIds.push(w.wbs_id);
    visited.add(w.wbs_id);
  }
  return pathWbsIds;
}

// ---------------------------------------------------------------------------
// 工具：vdi_dispatch_task
// ---------------------------------------------------------------------------

const DispatchTaskSchema = z.object({
  project_id: z.string().describe("项目编号"),
  wbs_id: z.string().describe("WBS 编号"),
  instruction: z.string().optional().describe("补充指令"),
});

function handleDispatchTask(args) {
  const input = DispatchTaskSchema.parse(args);
  const pkgPath = statePath(input.project_id, "task-package.json");
  const pkg = readJSON(pkgPath);
  if (!pkg || !pkg.wbs_items) {
    return { error: `TaskPackage not found or not decomposed for project ${input.project_id}.` };
  }

  const wbs = pkg.wbs_items.find((w) => w.wbs_id === input.wbs_id);
  if (!wbs) {
    return { error: `WBS ${input.wbs_id} not found in project ${input.project_id}.` };
  }

  // 允许 pending（首次派发）或 failed/blocked（重试派发）
  const dispatchable = ["pending", "failed", "blocked"];
  if (!dispatchable.includes(wbs.status)) {
    return { error: `WBS ${input.wbs_id} 当前状态 '${wbs.status}'，不可派发。可派发状态：${dispatchable.join(", ")}` };
  }

  // 检查依赖是否满足
  const unmetDeps = [];
  if (wbs.depends_on && wbs.depends_on.length > 0) {
    const unmet = wbs.depends_on.filter((depId) => {
      const dep = pkg.wbs_items.find((w) => w.wbs_id === depId);
      return !dep || dep.status !== "completed";
    });
    unmetDeps.push(...unmet);
  }

  if (unmetDeps.length > 0) {
    return {
      error: `WBS ${input.wbs_id} 的前置依赖未完成：${unmetDeps.join(", ")}。请先完成上游 WBS 后再派发。`,
      wbs_id: input.wbs_id,
      discipline: wbs.discipline,
      unmet_dependencies: unmetDeps,
    };
  }

  // 重试派发时记录重试次数
  const isRetry = ["failed", "blocked"].includes(wbs.status);
  if (isRetry) {
    wbs.retry_count = (wbs.retry_count || 0) + 1;
    wbs.retry_history = wbs.retry_history || [];
    wbs.retry_history.push({
      from_status: wbs.status,
      dispatched_at: new Date().toISOString(),
      previous_failure_reason: wbs.failure_reason || wbs.blocked_reason || "未知",
    });
  } else {
    wbs.retry_count = 0;
  }

  wbs.status = "dispatched";
  wbs.dispatched_at = new Date().toISOString();
  wbs.failure_reason = null;
  wbs.blocked_reason = null;
  if (input.instruction) wbs.instruction = input.instruction;
  pkg.updated_at = new Date().toISOString();
  writeJSON(pkgPath, pkg);

  // 生成派发话术
  const leadCode = getLeadCode(wbs.discipline);
  const skillRef = wbs.skill || (leadCode ? `[${leadCode}] ${getDisciplineName(wbs.discipline)}` : `${getDisciplineName(wbs.discipline)}专业负责人`);
  const dispatchMessage = [
    `@${skillRef}`,
    "",
    `请执行以下设计任务：`,
    `- WBS 编号：${wbs.wbs_id}`,
    `- 任务名称：${wbs.title}`,
    `- 专业：${wbs.discipline}`,
    `- 输入来源：${(wbs.input_from || []).join(", ") || "无"}`,
    `- 输出目标：${(wbs.output_to || []).join(", ") || "无"}`,
    `- 预计工时：${wbs.estimated_hours}h`,
    `- 里程碑：${wbs.milestone}`,
    `- 风险等级：${wbs.risk_level}`,
    "",
    input.instruction ? `补充说明：${input.instruction}` : "",
    "",
    `请先调用 vdi_search_knowledge 检索相关规范，完成后提交 DisciplineOutput。`,
  ]
    .filter(Boolean)
    .join("\n");

  return {
    dispatched: true,
    wbs_id: wbs.wbs_id,
    skill: wbs.skill,
    discipline: wbs.discipline,
    dispatch_message: dispatchMessage,
  };
}

// ---------------------------------------------------------------------------
// 工具：vdi_check_milestone
// ---------------------------------------------------------------------------

const CheckMilestoneSchema = z.object({
  project_id: z.string().describe("项目编号"),
  milestone_name: z.string().optional().describe("里程碑名称，不提供则返回全部"),
});

function handleCheckMilestone(args) {
  const input = CheckMilestoneSchema.parse(args);
  const pkgPath = statePath(input.project_id, "task-package.json");
  const pkg = readJSON(pkgPath);
  if (!pkg || !pkg.wbs_items) {
    return { error: `TaskPackage not found for project ${input.project_id}.` };
  }

  const milestones = input.milestone_name
    ? pkg.milestones.filter((m) => m.name === input.milestone_name)
    : pkg.milestones;

  const results = milestones.map((m) => {
    const relatedWbs = pkg.wbs_items.filter((w) => w.milestone === m.name);
    const completed = relatedWbs.filter((w) => w.status === "completed").map((w) => w.wbs_id);
    const pending = relatedWbs.filter((w) => w.status !== "completed").map((w) => w.wbs_id);
    const blocked = relatedWbs.filter((w) => w.status === "blocked").map((w) => w.wbs_id);
    const total = relatedWbs.length;
    const progress = total > 0 ? Math.round((completed.length / total) * 100) : 0;

    // 警戒判定
    const targetDate = new Date(m.target_date);
    const now = new Date();
    const daysRemaining = Math.ceil((targetDate - now) / (1000 * 60 * 60 * 24));
    let alertLevel = "ok";
    if (daysRemaining < 0) {
      alertLevel = "critical";
    } else if (daysRemaining <= 5 && progress < 80) {
      alertLevel = "warning";
    } else if (daysRemaining <= 10 && progress < 50) {
      alertLevel = "warning";
    }

    return {
      name: m.name,
      target_date: m.target_date,
      status: m.status,
      progress_pct: progress,
      days_remaining: daysRemaining,
      completed_wbs: completed,
      pending_wbs: pending,
      blocked_wbs: blocked,
      alert_level: alertLevel,
    };
  });

  // 更新 task-package 中的里程碑状态
  for (const m of pkg.milestones) {
    const result = results.find((r) => r.name === m.name);
    if (result) {
      m.completed_wbs = result.completed_wbs;
      m.pending_wbs = result.pending_wbs;
      m.status = result.alert_level === "ok" ? "on_track" : result.alert_level === "warning" ? "at_risk" : "critical";
    }
  }
  pkg.updated_at = new Date().toISOString();
  writeJSON(pkgPath, pkg);

  return {
    project_id: input.project_id,
    milestones: results,
    overall_health: results.some((r) => r.alert_level === "critical")
      ? "critical"
      : results.some((r) => r.alert_level === "warning")
        ? "at_risk"
        : "on_track",
  };
}

// ---------------------------------------------------------------------------
// 工具：vdi_get_dependency_graph
// ---------------------------------------------------------------------------

const GetDependencyGraphSchema = z.object({
  disciplines: z.array(z.string()).optional().describe("要查询的专业列表，不提供则返回全部"),
});

function handleGetDependencyGraph(args) {
  const input = GetDependencyGraphSchema.parse(args);
  const discs = input.disciplines || Object.keys(DEPENDENCY_GRAPH);

  const nodes = discs.map((d) => ({
    discipline: d,
    description: DEPENDENCY_GRAPH[d]?.description || d,
    upstream: DEPENDENCY_GRAPH[d]?.upstream || [],
    downstream: DEPENDENCY_GRAPH[d]?.downstream || [],
  }));

  const edges = [];
  for (const d of discs) {
    const info = DEPENDENCY_GRAPH[d];
    if (info?.downstream) {
      for (const down of info.downstream) {
        if (discs.includes(down)) {
          edges.push({ from: d, to: down, type: "hard" });
        }
      }
    }
  }

  return { nodes, edges, total_disciplines: nodes.length };
}

// ---------------------------------------------------------------------------
// 工具：vdi_trigger_alert
// ---------------------------------------------------------------------------

const TriggerAlertSchema = z.object({
  project_id: z.string().describe("项目编号"),
  alert_type: z.enum(["milestone_deviation", "resource_conflict", "dependency_blocked", "quality_issue"]),
  severity: z.enum(["info", "warning", "critical"]),
  message: z.string().describe("预警内容"),
  affected_wbs: z.array(z.string()).optional().describe("受影响的 WBS 编号"),
});

function handleTriggerAlert(args) {
  const input = TriggerAlertSchema.parse(args);
  const alert = {
    alert_id: `ALT-${input.project_id}-${Date.now()}`,
    project_id: input.project_id,
    alert_type: input.alert_type,
    severity: input.severity,
    message: input.message,
    affected_wbs: input.affected_wbs || [],
    created_at: new Date().toISOString(),
    acknowledged: false,
  };

  const alertsPath = statePath(input.project_id, "alerts.json");
  const alerts = readJSON(alertsPath, []);
  alerts.push(alert);
  writeJSON(alertsPath, alerts);

  return {
    alert_id: alert.alert_id,
    severity: alert.severity,
    message: alert.message,
    action_required: input.severity === "critical" ? "IMMEDIATE" : "review",
  };
}

// ---------------------------------------------------------------------------
// 工具：vdi_update_task_status
// ---------------------------------------------------------------------------

const UpdateTaskStatusSchema = z.object({
  project_id: z.string().describe("项目编号"),
  wbs_id: z.string().describe("WBS 编号"),
  status: z.enum(["in_progress", "completed", "blocked", "failed", "paused", "dispatched"]),
  note: z.string().optional().describe("状态变更备注"),
  error_category: z.enum(["recoverable", "data_missing", "calculation_error", "human_required"]).optional()
    .describe("错误分类：recoverable=可自动重试，data_missing=上游数据缺失，calculation_error=计算不收敛，human_required=必须人类介入"),
  failure_reason: z.string().optional().describe("失败/阻塞原因（failed/blocked 状态时记录）"),
});

function handleUpdateTaskStatus(args) {
  const input = UpdateTaskStatusSchema.parse(args);
  const pkgPath = statePath(input.project_id, "task-package.json");
  const pkg = readJSON(pkgPath);
  if (!pkg || !pkg.wbs_items) {
    return { error: `TaskPackage not found for project ${input.project_id}.` };
  }

  const wbs = pkg.wbs_items.find((w) => w.wbs_id === input.wbs_id);
  if (!wbs) {
    return { error: `WBS ${input.wbs_id} not found in project ${input.project_id}.` };
  }

  const previousStatus = wbs.status;
  wbs.status = input.status;
  if (input.note) wbs.status_note = input.note;
  if (input.error_category) wbs.error_category = input.error_category;
  if (input.failure_reason) {
    if (input.status === "failed") wbs.failure_reason = input.failure_reason;
    if (input.status === "blocked") wbs.blocked_reason = input.failure_reason;
  }
  wbs.updated_at = new Date().toISOString();
  if (input.status === "completed") wbs.completed_at = new Date().toISOString();
  pkg.updated_at = new Date().toISOString();
  writeJSON(pkgPath, pkg);

  // 根据错误分类生成恢复建议
  const recoveryHints = {
    recoverable: "可自动重试，建议调用 vdi_dispatch_task 重新派发",
    data_missing: "上游数据缺失，需先完成上游 WBS 或补充数据",
    calculation_error: "计算不收敛，需检查输入参数或调整计算模型",
    human_required: "必须人类介入，建议调用 vdi_request_human_review",
  };

  return {
    wbs_id: wbs.wbs_id,
    discipline: wbs.discipline,
    old_status: previousStatus,
    new_status: input.status,
    updated_at: wbs.updated_at,
    error_category: input.error_category || null,
    recovery_hint: input.error_category ? recoveryHints[input.error_category] : null,
  };
}

// ---------------------------------------------------------------------------
// 工具：vdi_request_human_review — 请求人类审核（CP 检查点）
// ---------------------------------------------------------------------------

const RequestHumanReviewSchema = z.object({
  project_id: z.string().describe("项目编号"),
  wbs_id: z.string().describe("WBS 编号"),
  checkpoint: z.enum(["CP-0", "CP-1", "CP-2", "CP-3"]).describe("检查点标识"),
  summary: z.string().describe("检查点摘要，供人类审核时参考"),
  details: z.any().optional().describe("详细数据（DATA_REQUEST 表格、计算摘要、DisciplineOutput 等）"),
  options: z.array(z.string()).optional().default(["确认", "修改", "退回"])
    .describe("人类可选的决策选项"),
});

function handleRequestHumanReview(args) {
  const input = RequestHumanReviewSchema.parse(args);
  const pkgPath = statePath(input.project_id, "task-package.json");
  const pkg = readJSON(pkgPath);
  if (!pkg || !pkg.wbs_items) {
    return { error: `TaskPackage not found for project ${input.project_id}.` };
  }

  const wbs = pkg.wbs_items.find((w) => w.wbs_id === input.wbs_id);
  if (!wbs) {
    return { error: `WBS ${input.wbs_id} not found.` };
  }

  // 记录审核请求历史
  if (!wbs.review_history) wbs.review_history = [];
  const reviewEntry = {
    checkpoint: input.checkpoint,
    summary: input.summary,
    details: input.details || null,
    options: input.options,
    requested_at: new Date().toISOString(),
    status: "pending",
  };
  wbs.review_history.push(reviewEntry);

  // 设置任务为 paused
  wbs.previous_status = wbs.status;
  wbs.status = "paused";
  wbs.paused_at = new Date().toISOString();
  wbs.paused_reason = `等待人类审核：${input.checkpoint} - ${input.summary}`;
  pkg.updated_at = new Date().toISOString();
  writeJSON(pkgPath, pkg);

  return {
    acknowledged: true,
    project_id: input.project_id,
    wbs_id: input.wbs_id,
    checkpoint: input.checkpoint,
    status: "paused",
    review_index: wbs.review_history.length - 1,
    options: input.options,
    message: `任务已暂停，等待人类在 ${input.checkpoint} 做出决策。可选操作：${input.options.join(" / ")}`,
  };
}

// ---------------------------------------------------------------------------
// 工具：vdi_resolve_human_review — 人类确认/驳回审核请求
// ---------------------------------------------------------------------------

const ResolveHumanReviewSchema = z.object({
  project_id: z.string().describe("项目编号"),
  wbs_id: z.string().describe("WBS 编号"),
  review_index: z.number().describe("审核历史索引（从 vdi_request_human_review 返回）").optional(),
  decision: z.enum(["确认", "修改", "退回", "approved", "rejected", "amend"]).describe("人类决策"),
  comment: z.string().optional().describe("审核意见"),
  amended_data: z.record(z.any()).optional().describe("修改/补充的数据（决策为 amend 或 data_supplied 时提供）"),
});

function handleResolveHumanReview(args) {
  const input = ResolveHumanReviewSchema.parse(args);
  const pkgPath = statePath(input.project_id, "task-package.json");
  const pkg = readJSON(pkgPath);
  if (!pkg || !pkg.wbs_items) {
    return { error: `TaskPackage not found for project ${input.project_id}.` };
  }

  const wbs = pkg.wbs_items.find((w) => w.wbs_id === input.wbs_id);
  if (!wbs) {
    return { error: `WBS ${input.wbs_id} not found.` };
  }

  if (wbs.status !== "paused") {
    return { error: `WBS ${input.wbs_id} 当前状态为 '${wbs.status}'，非 paused，无法执行审核决议。` };
  }

  // 找到待处理的审核请求
  const reviewIdx = input.review_index !== undefined
    ? input.review_index
    : (wbs.review_history || []).length - 1;

  if (!wbs.review_history || !wbs.review_history[reviewIdx]) {
    return { error: `未找到审核历史索引 ${reviewIdx}` };
  }

  const review = wbs.review_history[reviewIdx];
  review.decision = input.decision;
  review.comment = input.comment || "";
  review.resolved_at = new Date().toISOString();

  // 根据决策恢复任务状态
  const approvedDecisions = ["确认", "approved"];
  if (approvedDecisions.includes(input.decision)) {
    review.status = "approved";
    wbs.status = wbs.previous_status || "in_progress";
    wbs.paused_reason = null;
    wbs.paused_at = null;
  } else {
    review.status = "rejected";
    // 保持 paused 或设为 blocked，等待人类进一步指示
    wbs.status = "blocked";
    wbs.paused_reason = `审核被驳回：${input.comment || input.decision}`;
    wbs.blocked_reason = wbs.paused_reason;
  }

  if (input.amended_data) {
    review.amended_data = input.amended_data;
    wbs.amended_data = input.amended_data;
  }

  pkg.updated_at = new Date().toISOString();
  writeJSON(pkgPath, pkg);

  return {
    resolved: true,
    project_id: input.project_id,
    wbs_id: input.wbs_id,
    decision: input.decision,
    new_status: wbs.status,
    review_index: reviewIdx,
    instruction: approvedDecisions.includes(input.decision)
      ? "审核通过。任务已恢复，Skill 可继续执行下一 CP。"
      : `审核被驳回。任务状态变为 blocked。修改意见：${input.comment || "无"}`,
  };
}

// ---------------------------------------------------------------------------
// 工具：vdi_check_stale_tasks — 超时/滞留任务检测
// ---------------------------------------------------------------------------

const CheckStaleTasksSchema = z.object({
  project_id: z.string().describe("项目编号"),
  timeout_hours: z.number().optional().default(24).describe("超时阈值（小时），默认 24h"),
});

function handleCheckStaleTasks(args) {
  const input = CheckStaleTasksSchema.parse(args);
  const pkgPath = statePath(input.project_id, "task-package.json");
  const pkg = readJSON(pkgPath);
  if (!pkg || !pkg.wbs_items) {
    return { error: `TaskPackage not found for project ${input.project_id}.` };
  }

  const now = new Date();
  const staleTasks = [];
  const activeStates = ["dispatched", "in_progress"];

  for (const wbs of pkg.wbs_items) {
    if (!activeStates.includes(wbs.status)) continue;

    const lastUpdate = new Date(wbs.updated_at || wbs.dispatched_at || pkg.created_at);
    const hoursElapsed = (now - lastUpdate) / (1000 * 60 * 60);

    if (hoursElapsed >= input.timeout_hours) {
      staleTasks.push({
        wbs_id: wbs.wbs_id,
        discipline: wbs.discipline,
        skill: wbs.skill,
        status: wbs.status,
        hours_elapsed: Math.round(hoursElapsed * 10) / 10,
        last_update: wbs.updated_at || wbs.dispatched_at,
        error_category: wbs.error_category || "unknown",
        suggested_action: wbs.error_category === "recoverable"
          ? "可重新派发"
          : wbs.error_category === "human_required"
            ? "需要人类介入"
            : "需检查任务状态",
      });
    }
  }

  // 按滞留时长降序排列
  staleTasks.sort((a, b) => b.hours_elapsed - a.hours_elapsed);

  return {
    project_id: input.project_id,
    timeout_threshold_hours: input.timeout_hours,
    total_wbs: pkg.wbs_items.length,
    stale_count: staleTasks.length,
    stale_tasks: staleTasks,
    health: staleTasks.length === 0 ? "healthy" : staleTasks.length <= 2 ? "warning" : "critical",
  };
}

// ---------------------------------------------------------------------------
// 工具：vdi_attempt_recovery — 自动恢复 failed/blocked 任务
// ---------------------------------------------------------------------------

const AttemptRecoverySchema = z.object({
  project_id: z.string().describe("项目编号"),
  wbs_id: z.string().describe("WBS 编号"),
  strategy: z.enum(["redispatch", "skip", "escalate"]).optional().default("redispatch")
    .describe("恢复策略：redispatch=重新派发，skip=跳过标记完成，escalate=升级到人类"),
});

function handleAttemptRecovery(args) {
  const input = AttemptRecoverySchema.parse(args);
  const pkgPath = statePath(input.project_id, "task-package.json");
  const pkg = readJSON(pkgPath);
  if (!pkg || !pkg.wbs_items) {
    return { error: `TaskPackage not found for project ${input.project_id}.` };
  }

  const wbs = pkg.wbs_items.find((w) => w.wbs_id === input.wbs_id);
  if (!wbs) {
    return { error: `WBS ${input.wbs_id} not found.` };
  }

  const recoverableStates = ["failed", "blocked"];
  if (!recoverableStates.includes(wbs.status)) {
    return {
      error: `WBS ${input.wbs_id} 当前状态 '${wbs.status}'，不在可恢复状态（${recoverableStates.join(", ")}）`,
    };
  }

  // 检查重试次数上限
  const maxRetries = 3;
  if ((wbs.retry_count || 0) >= maxRetries && input.strategy === "redispatch") {
    return {
      error: `WBS ${input.wbs_id} 已重试 ${wbs.retry_count} 次，达到上限。建议使用 strategy=escalate 升级到人类处理。`,
      retry_count: wbs.retry_count,
      max_retries: maxRetries,
    };
  }

  const recoveryRecord = {
    recovered_at: new Date().toISOString(),
    strategy: input.strategy,
    previous_status: wbs.status,
    previous_failure: wbs.failure_reason || wbs.blocked_reason || "未知",
    retry_count: wbs.retry_count || 0,
  };

  switch (input.strategy) {
    case "redispatch":
      // 重置为 pending，后续可调用 vdi_dispatch_task 重新派发
      wbs.status = "pending";
      wbs.failure_reason = null;
      wbs.blocked_reason = null;
      wbs.recovery_history = wbs.recovery_history || [];
      wbs.recovery_history.push(recoveryRecord);
      break;

    case "skip":
      // 跳过该任务，标记为 completed 并记录
      wbs.status = "completed";
      wbs.completed_at = new Date().toISOString();
      wbs.skipped = true;
      wbs.skip_reason = `任务被跳过：${wbs.failure_reason || wbs.blocked_reason || "无法恢复"}`;
      wbs.recovery_history = wbs.recovery_history || [];
      wbs.recovery_history.push(recoveryRecord);
      break;

    case "escalate":
      // 升级到人类审核
      wbs.status = "paused";
      wbs.paused_at = new Date().toISOString();
      wbs.paused_reason = `自动恢复失败，升级到人类处理。原始失败原因：${wbs.failure_reason || wbs.blocked_reason || "未知"}`;
      wbs.review_history = wbs.review_history || [];
      wbs.review_history.push({
        checkpoint: "auto_recovery",
        summary: `自动恢复失败，需要人类介入`,
        details: { failure_reason: wbs.failure_reason || wbs.blocked_reason, retry_count: wbs.retry_count },
        options: ["重新设计", "修改参数", "跳过", "退回"],
        requested_at: new Date().toISOString(),
        status: "pending",
      });
      wbs.recovery_history = wbs.recovery_history || [];
      wbs.recovery_history.push(recoveryRecord);
      break;
  }

  pkg.updated_at = new Date().toISOString();
  writeJSON(pkgPath, pkg);

  return {
    recovered: true,
    wbs_id: wbs.wbs_id,
    discipline: wbs.discipline,
    strategy: input.strategy,
    new_status: wbs.status,
    recovery_hint: input.strategy === "redispatch"
      ? "任务已重置为 pending，请调用 vdi_dispatch_task 重新派发"
      : input.strategy === "skip"
        ? "任务已跳过并标记完成，下游任务的依赖已满足"
        : "任务已升级到人类审核，请调用 vdi_request_human_review 提交详细信息",
  };
}

// ---------------------------------------------------------------------------
// MCP 服务入口
// ---------------------------------------------------------------------------

async function main() {
  const server = new Server(
    {
      name: "vdi-orchestrator",
      version: "0.1.0",
    },
    {
      capabilities: { tools: {} },
    }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: "vdi_create_task_package",
        description:
          "创建一个新的设计任务包（TaskPackage），定义项目范围、参与专业和里程碑。返回 package_id 用于后续拆解和派发。",
        inputSchema: {
          type: "object",
          properties: {
            project_id: { type: "string", description: "项目编号，如 VDI-PROJ-001" },
            title: { type: "string", description: "任务包名称" },
            description: { type: "string", description: "任务包描述" },
            disciplines: {
              type: "array",
              items: { type: "string" },
              description: "参与专业列表",
            },
            milestones: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  name: { type: "string" },
                  target_date: { type: "string" },
                },
                required: ["name", "target_date"],
              },
            },
            standards: { type: "array", items: { type: "string" } },
            risk_level: { type: "string", enum: ["low", "medium", "high"] },
          },
          required: ["project_id", "title", "disciplines", "milestones"],
        },
      },
      {
        name: "vdi_decompose_tasks",
        description:
          "将 TaskPackage 拆解为 WBS（工作分解结构），按专业依赖拓扑排序，标注输入/输出关系、估算工时和关键路径。",
        inputSchema: {
          type: "object",
          properties: {
            project_id: { type: "string" },
            package_id: { type: "string" },
          },
          required: ["project_id"],
        },
      },
      {
        name: "vdi_dispatch_task",
        description:
          "将 WBS 项派发到对应的专业 Skill。支持首次派发（pending）和重试派发（failed/blocked），自动记录重试历史。",
        inputSchema: {
          type: "object",
          properties: {
            project_id: { type: "string" },
            wbs_id: { type: "string" },
            instruction: { type: "string" },
          },
          required: ["project_id", "wbs_id"],
        },
      },
      {
        name: "vdi_check_milestone",
        description:
          "检查项目里程碑的进度状态。返回完成百分比、剩余天数、警戒级别（ok/warning/critical）和阻塞项。",
        inputSchema: {
          type: "object",
          properties: {
            project_id: { type: "string" },
            milestone_name: { type: "string" },
          },
          required: ["project_id"],
        },
      },
      {
        name: "vdi_get_dependency_graph",
        description:
          "获取专业间依赖关系图。返回每个专业的上游（输入来源）和下游（输出目标）关系，以及依赖边的类型。",
        inputSchema: {
          type: "object",
          properties: {
            disciplines: {
              type: "array",
              items: { type: "string" },
              description: "要查询的专业列表，不提供则返回全部",
            },
          },
        },
      },
      {
        name: "vdi_trigger_alert",
        description:
          "向设计经理触发预警通知。用于里程碑偏差、资源冲突、依赖阻塞、质量问题等场景。",
        inputSchema: {
          type: "object",
          properties: {
            project_id: { type: "string" },
            alert_type: {
              type: "string",
              enum: ["milestone_deviation", "resource_conflict", "dependency_blocked", "quality_issue"],
            },
            severity: { type: "string", enum: ["info", "warning", "critical"] },
            message: { type: "string" },
            affected_wbs: { type: "array", items: { type: "string" } },
          },
          required: ["project_id", "alert_type", "severity", "message"],
        },
      },
      {
        name: "vdi_update_task_status",
        description:
          "更新 WBS 项的状态（in_progress/completed/blocked/failed/paused）。支持错误分类（error_category）和失败原因记录，系统据此提供恢复建议。",
        inputSchema: {
          type: "object",
          properties: {
            project_id: { type: "string" },
            wbs_id: { type: "string" },
            status: { type: "string", enum: ["in_progress", "completed", "blocked", "failed", "paused", "dispatched"] },
            note: { type: "string" },
            error_category: {
              type: "string",
              enum: ["recoverable", "data_missing", "calculation_error", "human_required"],
              description: "错误分类：recoverable=可自动重试，data_missing=上游数据缺失，calculation_error=计算不收敛，human_required=必须人类介入",
            },
            failure_reason: { type: "string", description: "失败/阻塞原因" },
          },
          required: ["project_id", "wbs_id", "status"],
        },
      },
      {
        name: "vdi_request_human_review",
        description:
          "Skill 到达检查点（CP-0/CP-1/CP-2/CP-3）时调用，将任务置为 paused 并请求人类审核。返回决策选项供 UI 展示。",
        inputSchema: {
          type: "object",
          properties: {
            project_id: { type: "string" },
            wbs_id: { type: "string" },
            checkpoint: { type: "string", enum: ["CP-0", "CP-1", "CP-2", "CP-3"] },
            summary: { type: "string", description: "检查点摘要" },
            details: { description: "详细数据（DATA_REQUEST 表格、计算摘要等）" },
            options: { type: "array", items: { type: "string" }, description: "人类可选决策选项" },
          },
          required: ["project_id", "wbs_id", "checkpoint", "summary"],
        },
      },
      {
        name: "vdi_resolve_human_review",
        description:
          "人类对审核请求做出决策：批准（恢复任务）、修改（回退）、退回（阻塞）。支持附带修改意见和补充数据。",
        inputSchema: {
          type: "object",
          properties: {
            project_id: { type: "string" },
            wbs_id: { type: "string" },
            review_index: { type: "number", description: "审核历史索引" },
            decision: { type: "string", enum: ["确认", "修改", "退回", "approved", "rejected", "amend"] },
            comment: { type: "string", description: "审核意见" },
            amended_data: { type: "object", description: "修改/补充的数据" },
          },
          required: ["project_id", "wbs_id", "decision"],
        },
      },
      {
        name: "vdi_check_stale_tasks",
        description:
          "检测超时/滞留任务。扫描所有 dispatched/in_progress 状态的 WBS，找出超过指定时间未更新的任务。",
        inputSchema: {
          type: "object",
          properties: {
            project_id: { type: "string" },
            timeout_hours: { type: "number", description: "超时阈值（小时），默认 24h" },
          },
          required: ["project_id"],
        },
      },
      {
        name: "vdi_attempt_recovery",
        description:
          "自动恢复 failed/blocked 状态的任务。支持三种策略：redispatch（重新派发）、skip（跳过）、escalate（升级到人类）。",
        inputSchema: {
          type: "object",
          properties: {
            project_id: { type: "string" },
            wbs_id: { type: "string" },
            strategy: {
              type: "string",
              enum: ["redispatch", "skip", "escalate"],
              description: "恢复策略：redispatch=重新派发，skip=跳过标记完成，escalate=升级到人类",
            },
          },
          required: ["project_id", "wbs_id"],
        },
      },
    ],
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    try {
      let result;
      switch (name) {
        case "vdi_create_task_package":
          result = handleCreateTaskPackage(args ?? {});
          break;
        case "vdi_decompose_tasks":
          result = handleDecomposeTasks(args ?? {});
          break;
        case "vdi_dispatch_task":
          result = handleDispatchTask(args ?? {});
          break;
        case "vdi_check_milestone":
          result = handleCheckMilestone(args ?? {});
          break;
        case "vdi_get_dependency_graph":
          result = handleGetDependencyGraph(args ?? {});
          break;
        case "vdi_trigger_alert":
          result = handleTriggerAlert(args ?? {});
          break;
        case "vdi_update_task_status":
          result = handleUpdateTaskStatus(args ?? {});
          break;
        case "vdi_request_human_review":
          result = handleRequestHumanReview(args ?? {});
          break;
        case "vdi_resolve_human_review":
          result = handleResolveHumanReview(args ?? {});
          break;
        case "vdi_check_stale_tasks":
          result = handleCheckStaleTasks(args ?? {});
          break;
        case "vdi_attempt_recovery":
          result = handleAttemptRecovery(args ?? {});
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
