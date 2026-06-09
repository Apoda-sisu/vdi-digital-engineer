#!/usr/bin/env node
/**
 * VDI Events HTTP Gateway
 * 将 MCP stdio 事件总线包装为 HTTP REST API
 */
import express from "express";
import cors from "cors";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3001;
const WORKSPACE_ROOT = process.env.VDI_WORKSPACE_ROOT || "/app/workspaces";

const DEFAULT_REGISTRY = path.resolve(__dirname, "event-registry.json");
const DISCIPLINE_CODES_PATH = path.resolve(__dirname, "../../config/discipline-codes.json");

// 注册表加载
function loadRegistry() {
  const regPath = process.env.VDI_EVENTS_REGISTRY || DEFAULT_REGISTRY;
  if (!fs.existsSync(regPath)) throw new Error(`Event registry not found: ${regPath}`);
  return JSON.parse(fs.readFileSync(regPath, "utf8"));
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
  if (!input || typeof input !== "string") return input;
  const codes = loadDisciplineCodes();
  const mapping = codes.discipline_slug_mapping || {};
  return mapping[input] || input;
}

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
  } catch { return fallback; }
}

function writeJSON(filePath, data) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
}

function resolveSubscribers(registry, eventType, producerDiscipline) {
  const typeDef = registry.event_types[eventType];
  if (!typeDef) return [];
  if (typeDef.subscribers) return typeDef.subscribers;
  if (typeDef.subscribers_by_discipline) return typeDef.subscribers_by_discipline[producerDiscipline] || [];
  return [];
}

let eventSeq = 0;
function generateEventId() {
  const now = new Date();
  const datePart = now.toISOString().slice(0, 10).replace(/-/g, "");
  eventSeq++;
  return `EVT-${datePart}-${String(eventSeq).padStart(4, "0")}`;
}

// Express 应用
const app = express();
app.use(cors());
app.use(express.json({ limit: "10mb" }));

// 根路径 - API 文档
app.get("/", (req, res) => {
  const registry = loadRegistry();
  res.json({
    service: "vdi-events",
    version: "1.0.0",
    description: "VDI 事件总线服务",
    event_types: Object.keys(registry.event_types || {}),
    endpoints: {
      "GET  /health": "健康检查",
      "POST /api/publish": "发布事件 (body: {project_id, event_type, producer, payload})",
      "POST /api/consume": "消费待处理事件 (body: {project_id, discipline, event_type?, limit?})",
      "POST /api/acknowledge": "确认事件 (body: {project_id, event_id, discipline})",
      "POST /api/status": "查询事件状态 (body: {project_id, event_id?})",
    },
  });
});

app.get("/health", (req, res) => {
  const registry = loadRegistry();
  res.json({
    status: "healthy",
    service: "vdi-events",
    version: "1.0.0",
    event_types: Object.keys(registry.event_types || {}).length,
    timestamp: new Date().toISOString(),
  });
});

// 发布事件
app.post("/api/publish", (req, res) => {
  try {
    const { project_id, event_type, producer, payload, trace_id, object_refs } = req.body;
    if (!project_id || !event_type || !producer || !payload) {
      return res.status(400).json({ error: "project_id, event_type, producer, payload required" });
    }
    const prod = resolveDiscipline(producer);
    const registry = loadRegistry();
    const typeDef = registry.event_types[event_type];
    if (!typeDef) return res.status(400).json({ error: `Unknown event type: ${event_type}` });

    const subscribers = resolveSubscribers(registry, event_type, prod);
    const eventId = generateEventId();
    const event = {
      event_id: eventId, event_type, occurred_at: new Date().toISOString(),
      producer: prod, project_id, schema_version: registry.version,
      trace_id: trace_id || `TRACE-${eventId}`, object_refs: object_refs || [],
      payload, subscribers, acknowledged_by: [], status: "pending", retry_count: 0,
    };

    const inboxPath = path.join(eventsDir(project_id), "inbox", `${eventId}.json`);
    writeJSON(inboxPath, event);

    res.json({
      event_id: eventId, event_type, producer: prod,
      occurred_at: event.occurred_at, trace_id: event.trace_id,
      subscribers, subscriber_count: subscribers.length,
      summary: `事件 ${eventId} 已发布 → 订阅者 [${subscribers.join(", ")}]（共 ${subscribers.length} 个）`,
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 消费待处理事件
app.post("/api/consume", (req, res) => {
  try {
    const { project_id, discipline, event_type, limit = 10 } = req.body;
    if (!project_id || !discipline) return res.status(400).json({ error: "project_id and discipline required" });
    const disc = resolveDiscipline(discipline);
    const inboxDir = path.join(eventsDir(project_id), "inbox");
    if (!fs.existsSync(inboxDir)) return res.json({ project_id, discipline: disc, events: [], pending_count: 0 });

    const files = fs.readdirSync(inboxDir).filter(f => f.endsWith(".json"));
    const events = [];
    for (const file of files) {
      if (events.length >= limit) break;
      const event = readJSON(path.join(inboxDir, file));
      if (!event) continue;
      const isSubscriber = event.subscribers.includes(disc);
      const notAck = !event.acknowledged_by.includes(disc);
      const typeMatch = !event_type || event.event_type === event_type;
      if (isSubscriber && notAck && typeMatch) {
        events.push({ event_id: event.event_id, event_type: event.event_type, producer: event.producer, occurred_at: event.occurred_at, payload: event.payload, trace_id: event.trace_id });
      }
    }
    res.json({ project_id, discipline: disc, events, pending_count: events.length });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 确认事件
app.post("/api/acknowledge", (req, res) => {
  try {
    const { project_id, event_id, discipline } = req.body;
    if (!project_id || !event_id || !discipline) return res.status(400).json({ error: "project_id, event_id, discipline required" });
    const disc = resolveDiscipline(discipline);
    const inboxPath = path.join(eventsDir(project_id), "inbox", `${event_id}.json`);
    const event = readJSON(inboxPath);
    if (!event) return res.status(404).json({ error: `Event ${event_id} not found` });

    if (!event.acknowledged_by.includes(disc)) event.acknowledged_by.push(disc);
    if (event.acknowledged_by.length >= event.subscribers.length) event.status = "consumed";
    writeJSON(inboxPath, event);
    res.json({ event_id, discipline: disc, status: event.status, acknowledged_by: event.acknowledged_by });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 查询事件状态
app.post("/api/status", (req, res) => {
  try {
    const { project_id, event_id } = req.body;
    if (!project_id) return res.status(400).json({ error: "project_id required" });

    if (event_id) {
      const inboxPath = path.join(eventsDir(project_id), "inbox", `${event_id}.json`);
      const event = readJSON(inboxPath);
      if (!event) return res.status(404).json({ error: `Event ${event_id} not found` });
      return res.json(event);
    }

    const inboxDir = path.join(eventsDir(project_id), "inbox");
    if (!fs.existsSync(inboxDir)) return res.json({ project_id, events: [], total: 0 });

    const files = fs.readdirSync(inboxDir).filter(f => f.endsWith(".json"));
    const events = files.map(f => readJSON(path.join(inboxDir, f))).filter(Boolean);
    const pending = events.filter(e => e.status === "pending").length;
    const consumed = events.filter(e => e.status === "consumed").length;
    res.json({ project_id, total: events.length, pending, consumed, events });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.listen(PORT, () => {
  console.log(`[http-gateway] VDI Events 服务已启动: http://localhost:${PORT}`);
});
