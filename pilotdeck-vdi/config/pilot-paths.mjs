#!/usr/bin/env node
/** Canonical workspace / pilot paths — 见 pilotdeck-vdi/config/workspace-paths.json */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = path.join(__dirname, "workspace-paths.json");
const REPO = path.resolve(__dirname, "../..");

const cfg = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));

export const WORKSPACE_ROOT = path.join(REPO, "workspaces");
export const PROCESS_WS = path.join(WORKSPACE_ROOT, cfg.discipline_workspaces.process);
export const PIPING_WS = path.join(WORKSPACE_ROOT, cfg.discipline_workspaces.piping);

export const MEOH_PILOT = path.join(
  WORKSPACE_ROOT,
  cfg.pilots.meoh_process?.workspace_rel || cfg.pilots.meoh_2d?.workspace_rel || "工艺组/pilot/meoh-100"
);
export const MEOH_PROJECT_ID = cfg.pilots.meoh_process?.id || cfg.pilots.meoh_2d?.id || "MEOH-100";
export const ATFD_PILOT = path.join(
  WORKSPACE_ROOT,
  cfg.pilots.atfd_demo?.workspace_rel || "工艺组/pilot/atfd-demo"
);
export const ATFD_PROJECT_ID = cfg.pilots.atfd_demo?.id || "ATFD-DEMO";
export const PLANT3D_PILOT = path.join(
  WORKSPACE_ROOT,
  cfg.pilots.plant_3d?.workspace_rel || "管道组/pilot/plant3d"
);
export const PLANT3D_PROJECT_ID = cfg.pilots.plant_3d?.id || "PLANT3D-001";

export function pilotPath(discipline, name) {
  const p = cfg.pilots[name];
  if (!p) throw new Error(`Unknown pilot: ${name}`);
  return path.join(WORKSPACE_ROOT, p.workspace_rel);
}
