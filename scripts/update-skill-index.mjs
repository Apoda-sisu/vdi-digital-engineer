#!/usr/bin/env node
/** @deprecated 请使用 pilotdeck-vdi/scripts/generate-skill-index.mjs */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const script = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../pilotdeck-vdi/scripts/generate-skill-index.mjs"
);
const r = spawnSync(process.execPath, [script], { stdio: "inherit" });
process.exit(r.status ?? 1);
