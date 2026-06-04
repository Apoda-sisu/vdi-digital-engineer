#!/usr/bin/env node
/**
 * VDI 事件总线 MCP（stdio）— vdi-events 插件
 *
 * 提供跨专业提资事件发布、消费确认、订阅查询、状态统计四个工具。
 * 事件持久化到 WorkSpace .pilotdeck/projects/{project_id}/events/。
 * 订阅者注册表从 event-registry.json 加载。
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
const WORKSPACE_ROOT = process.env.VDI_WORKSPACE_ROOT || "/workspace/workspaces";

const DEFAULT_REGISTRY = path.resolve(__dirname, "event-registry.json");
const DISCIPLINE_CODES_PATH = path.resolve(__dirname, "../../config/discipline-codes.json");

// ---------------------------------------------------------------------------
// 注册表加载
// ---------------------------------------------------------------------------

function loadRegistry() {
  const regPath = process.env.VDI_EVENTS_REGISTRY || DEFAULT_REGISTRY;
  if (!fs.existsSync(regPath)) {
    throw new Error(`Event registry not found: ${regPath}`);
  }
  return JSON.parse(fs.readFileSync(regPath, "utf8"));
}

// ---------------------------------------------------------------------------
// 学科代码转换
// ---------------------------------------------------------------------------

let _disciplineCodes = null;
function loadDisciplineCodes() {
  if (_disciplineCodes) return _disciplineCodes;
  if (!fs.existsSync(DISCIPLINE_CODES_PATH)) {
    console.error(`[vdi-events] discipline-codes.json not found at ${DISCIPLINE_CODES_PATH}`);
    _disciplineCodes = { discipline_slug_mapping: {} };
    return _disciplineCodes;
  }
  _disciplineCodes = JSON.parse(fs.readFileSync(DISCIPLINE_CODES_PATH, "utf8"));
  return _disciplineCodes;
}

/** 将 slug（如 "water"）转换为 2 字母学科码（如 "WA"），已是代码则原样返回 */
function resolveDiscipline(input) {
  if (!input || typeof input !== "string") return input;
  const codes = loadDisciplineCodes();
  const mapping = codes.discipline_slug_mapping || {};
  return mapping[input] || input;
}

// ---------------------------------------------------------------------------
// 路径工具
// ---------------------------------------------------------------------------

function eventsDir(projectId) {
  return path.join(WORKSPACE_ROOT, projectId, ".pilotdeck", "projects", projectId, "events");
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function readJSON(filePath, fallback = null) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJSON(filePath, data) {
  const dir = path.dirname(filePath);
  ensureDir(dir);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
}

// ---------------------------------------------------------------------------
// 订阅者推断
// ---------------------------------------------------------------------------

function resolveSubscribers(registry, eventType, producerDiscipline) {
  const typeDef = registry.event_types[eventType];
  if (!typeDef) return [];

  // 静态订阅者列表
  if (typeDef.subscribers) {
    return typeDef.subscribers;
  }

  // 按生产者专业动态路由
  if (typeDef.subscribers_by_discipline) {
    return typeDef.subscribers_by_discipline[producerDiscipline] || [];
  }

  return [];
}

// ---------------------------------------------------------------------------
// 生成事件 ID
// ---------------------------------------------------------------------------

let eventSeq = 0;
function generateEventId() {
  const now = new Date();
  const datePart = now.toISOString().slice(0, 10).replace(/-/g, "");
  eventSeq++;
  return `EVT-${datePart}-${String(eventSeq).padStart(4, "0")}`;
}

// ---------------------------------------------------------------------------
// 工具 1：vdi_publish_event
// ---------------------------------------------------------------------------

const PublishEventSchema = z.object({
  project_id: z.string().describe("项目编号"),
  event_type: z.string().describe("事件类型，如 design_basis.updated / discipline_output.published"),
  producer: z.string().describe("生产者专业标识（学科码），如 PR / WA / PI"),
  payload: z.any().describe("事件 payload，包含业务数据"),
  trace_id: z.string().optional().describe("追踪 ID，用于关联上下游事件"),
  object_refs: z.array(z.string()).optional().describe("关联对象 ID 列表"),
});

function handlePublishEvent(args) {
  const input = PublishEventSchema.parse(args);
  input.producer = resolveDiscipline(input.producer);
  const registry = loadRegistry();

  // 校验事件类型
  const typeDef = registry.event_types[input.event_type];
  if (!typeDef) {
    return {
      error: `未知事件类型 '${input.event_type}'。支持的类型：${Object.keys(registry.event_types).join(", ")}`,
    };
  }

  // 推断订阅者
  const subscribers = resolveSubscribers(registry, input.event_type, input.producer);

  // 构建事件对象（即使没有订阅者也写入，供审计追溯）
  const eventId = generateEventId();
  const event = {
    event_id: eventId,
    event_type: input.event_type,
    occurred_at: new Date().toISOString(),
    producer: input.producer,
    project_id: input.project_id,
    schema_version: registry.version,
    trace_id: input.trace_id || `TRACE-${eventId}`,
    object_refs: input.object_refs || [],
    payload: input.payload,
    subscribers,
    acknowledged_by: [],
    status: "pending",
    retry_count: 0,
  };

  // 写入 inbox
  const inboxPath = path.join(eventsDir(input.project_id), "inbox", `${eventId}.json`);
  ensureDir(path.dirname(inboxPath));
  writeJSON(inboxPath, event);

  if (subscribers.length === 0) {
    return {
      event_id: eventId,
      event_type: input.event_type,
      producer: input.producer,
      occurred_at: event.occurred_at,
      trace_id: event.trace_id,
      subscribers: [],
      subscriber_count: 0,
      warning: `事件类型 '${input.event_type}' 无匹配订阅者。事件已存储至 inbox 供后续查询。`,
      summary: `事件 ${eventId} 已存储（${input.event_type}，无订阅者）`,
    };
  }

  return {
    event_id: eventId,
    event_type: input.event_type,
    producer: input.producer,
    occurred_at: event.occurred_at,
    trace_id: event.trace_id,
    subscribers,
    subscriber_count: subscribers.length,
    summary: `事件 ${eventId} 已发布 → 订阅者 [${subscribers.join(", ")}]（共 ${subscribers.length} 个）`,
  };
}

// ---------------------------------------------------------------------------
// 工具 2：vdi_consume_pending
// ---------------------------------------------------------------------------

const ConsumePendingSchema = z.object({
  project_id: z.string().describe("项目编号"),
  discipline: z.string().describe("消费者专业标识（学科码），如 PI / IN / WA"),
  event_type: z.string().optional().describe("按事件类型过滤，不提供则返回全部待消费事件"),
  limit: z.number().int().min(1).max(50).optional().default(10).describe("返回条数上限"),
});

function handleConsumePending(args) {
  const input = ConsumePendingSchema.parse(args);
  input.discipline = resolveDiscipline(input.discipline);
  const inboxDir = path.join(eventsDir(input.project_id), "inbox");

  if (!fs.existsSync(inboxDir)) {
    return {
      project_id: input.project_id,
      discipline: input.discipline,
      events: [],
      pending_count: 0,
      summary: "暂无待消费事件",
    };
  }

  const files = fs.readdirSync(inboxDir).filter((f) => f.endsWith(".json"));
  const events = [];

  for (const file of files) {
    if (events.length >= input.limit) break;
    const event = readJSON(path.join(inboxDir, file));
    if (!event) continue;

    // 过滤：该专业是否在订阅者列表中且未确认
    const isSubscriber = event.subscribers.includes(input.discipline);
    const notAcknowledged = !event.acknowledged_by.includes(input.discipline);
    const typeMatch = !input.event_type || event.event_type === input.event_type;

    if (isSubscriber && notAcknowledged && typeMatch) {
      // 检查 TTL
      const registry = loadRegistry();
      const typeDef = registry.event_types[event.event_type];
      if (typeDef?.ttl_hours) {
        const ageMs = Date.now() - new Date(event.occurred_at).getTime();
        if (ageMs > typeDef.ttl_hours * 3600 * 1000) {
          continue; // 过期，跳过
        }
      }
      events.push({
        event_id: event.event_id,
        event_type: event.event_type,
        producer: event.producer,
        occurred_at: event.occurred_at,
        trace_id: event.trace_id,
        object_refs: event.object_refs,
        payload: event.payload,
      });
    }
  }

  return {
    project_id: input.project_id,
    discipline: input.discipline,
    events,
    pending_count: events.length,
    total_inbox: files.length,
    summary: events.length > 0
      ? `发现 ${events.length} 条待消费事件`
      : "暂无待消费事件",
  };
}

// ---------------------------------------------------------------------------
// 工具 3：vdi_ack_event
// ---------------------------------------------------------------------------

const AckEventSchema = z.object({
  project_id: z.string().describe("项目编号"),
  event_id: z.string().describe("事件 ID"),
  discipline: z.string().describe("确认者专业标识（学科码）"),
  success: z.boolean().optional().default(true).describe("消费是否成功，false 则移入死信"),
  note: z.string().optional().describe("确认备注，失败时说明原因"),
});

function handleAckEvent(args) {
  const input = AckEventSchema.parse(args);
  input.discipline = resolveDiscipline(input.discipline);
  const inboxPath = path.join(eventsDir(input.project_id), "inbox", `${input.event_id}.json`);
  const event = readJSON(inboxPath);

  if (!event) {
    return {
      error: `事件 ${input.event_id} 未找到。可能已被消费或不存在。`,
    };
  }

  if (!event.subscribers.includes(input.discipline)) {
    return {
      error: `专业 '${input.discipline}' 不是事件 ${input.event_id} 的订阅者。订阅者：${event.subscribers.join(", ")}`,
    };
  }

  if (event.acknowledged_by.includes(input.discipline)) {
    return {
      warning: `专业 '${input.discipline}' 已确认过事件 ${input.event_id}，跳过重复确认。`,
      remaining_subscribers: event.subscribers.filter((s) => !event.acknowledged_by.includes(s)),
    };
  }

  // 失败处理 — 深拷贝后再变异，避免污染原始引用
  if (!input.success) {
    const failedEvent = JSON.parse(JSON.stringify(event));
    failedEvent.status = "failed";
    failedEvent.failed_by = input.discipline;
    failedEvent.fail_note = input.note || "消费失败";
    const failedPath = path.join(eventsDir(input.project_id), "failed", `${input.event_id}.error.json`);
    writeJSON(failedPath, failedEvent);
    // 同时保留 inbox 副本供重试
    event.retry_count = (event.retry_count || 0) + 1;
    writeJSON(inboxPath, event);
    return {
      event_id: input.event_id,
      acknowledged_by: input.discipline,
      success: false,
      remaining_subscribers: event.subscribers.filter((s) => !event.acknowledged_by.includes(s)),
      summary: `事件 ${input.event_id} 被 ${input.discipline} 标记为失败，已移入死信队列。`,
    };
  }

  // 成功确认
  event.acknowledged_by.push(input.discipline);
  if (input.note) {
    event.ack_notes = event.ack_notes || {};
    event.ack_notes[input.discipline] = input.note;
  }

  // 检查是否全部确认
  const allAcked = event.subscribers.every((s) => event.acknowledged_by.includes(s));
  if (allAcked) {
    event.status = "processed";
    event.processed_at = new Date().toISOString();
    // 移入 processed
    const processedPath = path.join(eventsDir(input.project_id), "processed", `${input.event_id}.json`);
    writeJSON(processedPath, event);
    // 删除 inbox 副本
    try { fs.unlinkSync(inboxPath); } catch {}
  } else {
    writeJSON(inboxPath, event);
  }

  return {
    event_id: input.event_id,
    acknowledged_by: input.discipline,
    success: true,
    all_acknowledged: allAcked,
    remaining_subscribers: event.subscribers.filter((s) => !event.acknowledged_by.includes(s)),
    summary: allAcked
      ? `事件 ${input.event_id} 所有订阅者已确认，已移入 processed`
      : `事件 ${input.event_id} 已由 ${input.discipline} 确认，剩余 ${event.subscribers.filter((s) => !event.acknowledged_by.includes(s)).length} 个订阅者待确认`,
  };
}

// ---------------------------------------------------------------------------
// 工具 4：vdi_get_event_status
// ---------------------------------------------------------------------------

const GetEventStatusSchema = z.object({
  project_id: z.string().describe("项目编号"),
  discipline: z.string().optional().describe("按专业过滤，不提供则返回全局统计"),
  event_type: z.string().optional().describe("按事件类型过滤"),
});

function handleGetEventStatus(args) {
  const input = GetEventStatusSchema.parse(args);
  if (input.discipline) input.discipline = resolveDiscipline(input.discipline);
  const baseDir = eventsDir(input.project_id);

  const counts = { inbox: 0, processed: 0, failed: 0 };
  const pendingEvents = [];
  const recentProcessed = [];

  // inbox
  const inboxDir = path.join(baseDir, "inbox");
  if (fs.existsSync(inboxDir)) {
    const files = fs.readdirSync(inboxDir).filter((f) => f.endsWith(".json"));
    counts.inbox = files.length;
    for (const file of files.slice(0, 10)) {
      const event = readJSON(path.join(inboxDir, file));
      if (!event) continue;

      // 按专业过滤
      if (input.discipline && !event.subscribers.includes(input.discipline)) continue;
      if (input.event_type && event.event_type !== input.event_type) continue;

      const notAcked = event.subscribers.filter((s) => !event.acknowledged_by.includes(s));
      pendingEvents.push({
        event_id: event.event_id,
        event_type: event.event_type,
        producer: event.producer,
        occurred_at: event.occurred_at,
        total_subscribers: event.subscribers.length,
        acknowledged: event.acknowledged_by.length,
        pending: notAcked,
      });
    }
  }

  // processed
  const processedDir = path.join(baseDir, "processed");
  if (fs.existsSync(processedDir)) {
    const files = fs.readdirSync(processedDir).filter((f) => f.endsWith(".json"));
    counts.processed = files.length;
    for (const file of files.slice(-5)) {
      const event = readJSON(path.join(processedDir, file));
      if (!event) continue;
      if (input.event_type && event.event_type !== input.event_type) continue;
      recentProcessed.push({
        event_id: event.event_id,
        event_type: event.event_type,
        processed_at: event.processed_at,
      });
    }
  }

  // failed
  const failedDir = path.join(baseDir, "failed");
  if (fs.existsSync(failedDir)) {
    counts.failed = fs.readdirSync(failedDir).filter((f) => f.endsWith(".json")).length;
  }

  return {
    project_id: input.project_id,
    filter_discipline: input.discipline || null,
    filter_event_type: input.event_type || null,
    counts,
    pending_events: pendingEvents,
    recent_processed: recentProcessed,
    overall_health: counts.failed > 0
      ? "degraded"
      : counts.inbox > 10
        ? "busy"
        : "healthy",
    summary: `inbox=${counts.inbox} processed=${counts.processed} failed=${counts.failed}`,
  };
}

// ---------------------------------------------------------------------------
// 工具 5：vdi_list_subscribers
// ---------------------------------------------------------------------------

const ListSubscribersSchema = z.object({
  event_type: z.string().optional().describe("事件类型，不提供则返回全部订阅关系"),
  discipline: z.string().optional().describe("按专业查询其订阅的事件类型"),
});

function handleListSubscribers(args) {
  const input = ListSubscribersSchema.parse(args);
  if (input.discipline) input.discipline = resolveDiscipline(input.discipline);
  const registry = loadRegistry();

  if (input.discipline) {
    const sub = registry.subscriber_lookup[input.discipline];
    if (!sub) {
      return { error: `未找到专业 '${input.discipline}' 的订阅信息` };
    }
    return {
      discipline: input.discipline,
      skill: sub.skill,
      subscribes_to: sub.subscribes_to,
    };
  }

  if (input.event_type) {
    const typeDef = registry.event_types[input.event_type];
    if (!typeDef) {
      return { error: `未找到事件类型 '${input.event_type}'` };
    }
    return {
      event_type: input.event_type,
      description: typeDef.description,
      produced_by: typeDef.produced_by,
      subscribers: typeDef.subscribers || "动态路由（见 subscribers_by_discipline）",
      subscribers_by_discipline: typeDef.subscribers_by_discipline || null,
      priority: typeDef.priority,
      requires_ack: typeDef.requires_ack,
    };
  }

  // 全部
  const all = Object.entries(registry.event_types).map(([type, def]) => ({
    event_type: type,
    description: def.description,
    produced_by: def.produced_by,
    subscriber_count: def.subscribers
      ? def.subscribers.length
      : Object.values(def.subscribers_by_discipline || {}).flat().length,
    priority: def.priority,
  }));

  return {
    event_types: all,
    total_types: all.length,
    subscriber_lookup: Object.keys(registry.subscriber_lookup),
  };
}

// ---------------------------------------------------------------------------
// MCP 服务入口
// ---------------------------------------------------------------------------

async function main() {
  loadRegistry(); // 预加载验证
  loadDisciplineCodes(); // 预加载学科代码映射表

  const server = new Server(
    { name: "vdi-events", version: "0.1.0" },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: "vdi_publish_event",
        description:
          "发布事件到事件总线。根据事件类型和生产者专业自动推断订阅者列表，将事件写入各订阅者的 inbox。支持 design_basis.updated / discipline_output.published / condition.changed 等事件。",
        inputSchema: {
          type: "object",
          properties: {
            project_id: { type: "string", description: "项目编号" },
            event_type: { type: "string", description: "事件类型，如 design_basis.updated" },
            producer: { type: "string", description: "生产者专业标识" },
            payload: { description: "事件 payload JSON" },
            trace_id: { type: "string", description: "追踪 ID" },
            object_refs: { type: "array", items: { type: "string" }, description: "关联对象 ID" },
          },
          required: ["project_id", "event_type", "producer", "payload"],
        },
      },
      {
        name: "vdi_consume_pending",
        description:
          "获取指定专业的待消费事件列表。只返回该专业是订阅者且尚未确认的事件，自动过滤 TTL 过期事件。",
        inputSchema: {
          type: "object",
          properties: {
            project_id: { type: "string", description: "项目编号" },
            discipline: { type: "string", description: "消费者专业标识" },
            event_type: { type: "string", description: "按事件类型过滤" },
            limit: { type: "number", description: "返回条数上限，默认 10" },
          },
          required: ["project_id", "discipline"],
        },
      },
      {
        name: "vdi_ack_event",
        description:
          "确认消费事件。订阅者处理完事件后调用此工具确认。当所有订阅者确认后，事件自动移入 processed。失败时移入 dead letter queue。",
        inputSchema: {
          type: "object",
          properties: {
            project_id: { type: "string", description: "项目编号" },
            event_id: { type: "string", description: "事件 ID" },
            discipline: { type: "string", description: "确认者专业标识" },
            success: { type: "boolean", description: "消费是否成功，默认 true" },
            note: { type: "string", description: "确认备注" },
          },
          required: ["project_id", "event_id", "discipline"],
        },
      },
      {
        name: "vdi_get_event_status",
        description:
          "获取项目事件总线状态统计（inbox/processed/failed 数量、待消费事件列表、最近已处理事件）。",
        inputSchema: {
          type: "object",
          properties: {
            project_id: { type: "string", description: "项目编号" },
            discipline: { type: "string", description: "按专业过滤" },
            event_type: { type: "string", description: "按事件类型过滤" },
          },
          required: ["project_id"],
        },
      },
      {
        name: "vdi_list_subscribers",
        description:
          "查询事件订阅关系。可按事件类型查看订阅者，或按专业查看其订阅的事件类型，或不带参数返回全部。",
        inputSchema: {
          type: "object",
          properties: {
            event_type: { type: "string", description: "事件类型" },
            discipline: { type: "string", description: "专业标识" },
          },
        },
      },
    ],
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    try {
      let result;
      switch (name) {
        case "vdi_publish_event":       result = handlePublishEvent(args ?? {}); break;
        case "vdi_consume_pending":     result = handleConsumePending(args ?? {}); break;
        case "vdi_ack_event":           result = handleAckEvent(args ?? {}); break;
        case "vdi_get_event_status":    result = handleGetEventStatus(args ?? {}); break;
        case "vdi_list_subscribers":    result = handleListSubscribers(args ?? {}); break;
        default:
          return { content: [{ type: "text", text: `Unknown tool: ${name}` }], isError: true };
      }
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
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
