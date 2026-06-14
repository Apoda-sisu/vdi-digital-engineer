/**
 * Publish drawing.generated events directly to vdi-events inbox.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function workspaceRoot() {
  return process.env.VDI_WORKSPACE_ROOT || "/workspace/workspaces";
}

export function resolveProjectDir(projectId) {
  const root = workspaceRoot();
  const registryPath = path.join(root, ".vdi-project-registry.json");
  try {
    const registry = JSON.parse(fs.readFileSync(registryPath, "utf8"));
    const rel = registry.projects?.[projectId]?.workspace_rel;
    if (rel) return path.join(root, rel);
  } catch {}
  const candidates = [
    path.join(root, projectId),
    path.join(root, "工艺组", "pilot", projectId.toLowerCase()),
    path.join(root, "工艺组", projectId),
  ];
  for (const dir of candidates) {
    if (fs.existsSync(dir)) return dir;
  }
  return path.join(root, projectId);
}

function eventsDir(projectId) {
  return path.join(resolveProjectDir(projectId), "events");
}

function generateEventId() {
  const ts = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `EVT-${ts}-${rand}`;
}

export function publishDrawingGenerated({
  project_id,
  producer = "PR",
  payload,
  trace_id,
  object_refs = [],
}) {
  const eventId = generateEventId();
  const event = {
    event_id: eventId,
    event_type: "drawing.generated",
    occurred_at: new Date().toISOString(),
    producer,
    project_id,
    schema_version: "2.0.0",
    trace_id: trace_id || `TRACE-${eventId}`,
    object_refs,
    payload,
    subscribers: ["PR", "PI", "EQ", "IN"],
    acknowledged_by: [],
    status: "pending",
    retry_count: 0,
  };

  const inboxDir = path.join(eventsDir(project_id), "inbox");
  try {
    fs.mkdirSync(inboxDir, { recursive: true });
    const inboxPath = path.join(inboxDir, `${eventId}.json`);
    fs.writeFileSync(inboxPath, JSON.stringify(event, null, 2), "utf-8");
    return {
      published: true,
      event_id: eventId,
      inbox_path: inboxPath,
      summary: `drawing.generated → ${inboxPath}`,
    };
  } catch (e) {
    return {
      published: false,
      error: e.message,
      warning: "Event not written (workspace may be unavailable in local dev)",
    };
  }
}

function plantModelPath(projectId) {
  const projectDir = resolveProjectDir(projectId);
  return path.join(projectDir, "plant", "model.json");
}

export function writePlantModel(projectId, plantModel) {
  try {
    const filePath = plantModelPath(projectId);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(plantModel, null, 2), "utf-8");
    return { written: true, path: filePath };
  } catch (e) {
    return { written: false, error: e.message };
  }
}

export function readPlantModel(projectId) {
  try {
    const filePath = plantModelPath(projectId);
    if (!fs.existsSync(filePath)) {
      return { found: false, error: `PlantModel not found: ${filePath}` };
    }
    const model = JSON.parse(fs.readFileSync(filePath, "utf8"));
    return { found: true, path: filePath, model };
  } catch (e) {
    return { found: false, error: e.message };
  }
}

export function publishPlantObjectChanged({
  project_id,
  object_id,
  tag = "",
  revision = "A",
  producer = "PR",
}) {
  const eventId = generateEventId();
  const event = {
    event_id: eventId,
    event_type: "plant.object.changed",
    occurred_at: new Date().toISOString(),
    producer,
    project_id,
    schema_version: "2.0.0",
    trace_id: `TRACE-${eventId}`,
    object_refs: [object_id, tag].filter(Boolean),
    payload: { object_id, tag, revision },
    subscribers: ["PR", "PI", "EQ", "IN"],
    acknowledged_by: [],
    status: "pending",
    retry_count: 0,
  };

  const inboxDir = path.join(eventsDir(project_id), "inbox");
  try {
    fs.mkdirSync(inboxDir, { recursive: true });
    const inboxPath = path.join(inboxDir, `${eventId}.json`);
    fs.writeFileSync(inboxPath, JSON.stringify(event, null, 2), "utf-8");
    return {
      published: true,
      event_id: eventId,
      inbox_path: inboxPath,
      summary: `plant.object.changed → ${inboxPath}`,
    };
  } catch (e) {
    return { published: false, error: e.message };
  }
}
