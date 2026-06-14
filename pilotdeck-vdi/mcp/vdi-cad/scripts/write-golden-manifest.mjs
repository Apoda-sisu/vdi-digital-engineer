#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildMethanolFixture } from "../converter.mjs";
import { disciplineOutputToPlantModel } from "../plant-converter.mjs";
import { buildDrawingManifest } from "../manifest-export.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const f = buildMethanolFixture();
const m = disciplineOutputToPlantModel(f, { project_id: "MEOH-100" });
const manifest = buildDrawingManifest(m, {
  drawing_number: "PFD-100-001-PREVIEW",
  sheet_size: "A1",
});
const out = path.resolve(__dirname, "../../../freecad/golden/meoh-100/drawing-manifest-preview.json");
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(manifest, null, 2));
console.log("wrote", out, manifest.objects.length, "objects");
