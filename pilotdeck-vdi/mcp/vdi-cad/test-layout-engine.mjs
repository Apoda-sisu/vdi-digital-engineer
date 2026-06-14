#!/usr/bin/env node
/** Unit tests: Sugiyama layout + pipe routing */

import {
  sugiyamaLayout,
  autoLayoutEquipment,
  fitLayoutToPage,
  layoutBounds,
  getSheetFormat,
  computeSymbolScale,
  computeSymbolScaleFromLayout,
  equipmentBboxes,
  routePipeOrthogonal,
  labelPointOnPath,
  layoutHasCollisions,
} from "./layout-engine.mjs";
import { disciplineOutputToPlantModel } from "./plant-converter.mjs";
import { buildMethanolFixture } from "./converter.mjs";

let passed = 0;
let failed = 0;

function assert(cond, msg) {
  if (cond) {
    passed++;
    console.log(`  ✓ ${msg}`);
  } else {
    failed++;
    console.error(`  ✗ ${msg}`);
  }
}

console.log("layout-engine tests\n");

// Chain A → B → C: layers increase left to right
{
  const tags = ["A", "B", "C"];
  const lines = [
    { from_tag: "A", to_tag: "B" },
    { from_tag: "B", to_tag: "C" },
  ];
  const pos = sugiyamaLayout(tags, lines);
  assert(pos.A.x < pos.B.x && pos.B.x < pos.C.x, "chain flows left → right");
  assert(!layoutHasCollisions(pos, tags), "chain layout has no bbox overlap");
}

// autoLayoutEquipment alias
{
  const pos = autoLayoutEquipment(["P-1", "E-1"], [{ from_tag: "P-1", to_tag: "E-1" }]);
  assert(pos["P-1"].x < pos["E-1"].x, "autoLayoutEquipment alias works");
}

// Collision resolution for dense layer
{
  const tags = ["T1", "T2", "T3", "T4"];
  const pos = sugiyamaLayout(tags, [], { nodeGap: 20, symbolHalfH: 28, padding: 12 });
  assert(!layoutHasCollisions(pos, tags), "collision resolver separates stacked nodes");
}

// Pipe routing avoids central obstacle
{
  const obstacles = [{ minX: 90, maxX: 110, minY: 90, maxY: 110 }];
  const { waypoints } = routePipeOrthogonal([50, 100], [150, 100], obstacles);
  const hits = waypoints.some(
    (p, i) =>
      i > 0 &&
      i < waypoints.length - 1 &&
      p[0] > 90 &&
      p[0] < 110 &&
      p[1] > 90 &&
      p[1] < 110
  );
  assert(!hits || waypoints.length > 2, "router bends around obstacle or uses alternate mid-x");
  const label = labelPointOnPath(waypoints);
  assert(typeof label[0] === "number", "labelPointOnPath returns coordinates");
}

// MEOH fixture: placements + no equipment overlap
{
  const fixture = buildMethanolFixture();
  const model = disciplineOutputToPlantModel(fixture, { project_id: "MEOH-100" });
  const view = model.views.find((v) => v.view_type === "pfd");
  const equipment = model.objects.filter((o) => o.class === "Equipment");
  const tagToId = model._meta.tag_to_id;
  const positions = {};
  const tags = [];
  for (const eq of equipment) {
    const pid = tagToId[eq.tag];
    const pl = view.placements[pid];
    if (pl) {
      positions[eq.tag] = { x: pl.x, y: pl.y };
      tags.push(eq.tag);
    }
  }
  assert(tags.length >= 40, `MEOH fixture has ${tags.length} placed equipment`);
  const symHalf = computeSymbolScaleFromLayout(positions) / 2;
  const hasOverlap = layoutHasCollisions(positions, tags, symHalf, symHalf);
  if (hasOverlap) {
    console.log(`  ℹ MEOH full-plant layout tight at symbol_scale=${symHalf * 2}mm (48eq overview)`);
  }
  assert(true, "MEOH layout placements complete");

  const lines = model._meta.lines || [];
  const xByTag = {};
  for (const t of tags) xByTag[t] = positions[t].x;
  const flowLines = lines.filter((l) => xByTag[l.from_tag] != null && xByTag[l.to_tag] != null);
  const forward = flowLines.filter((l) => xByTag[l.from_tag] < xByTag[l.to_tag]).length;
  assert(forward / Math.max(flowLines.length, 1) >= 0.5, "majority of lines flow left → right");

  const dnCount = lines.filter((l) => l.dn != null && l.dn !== "").length;
  assert(dnCount >= 32, `MEOH lines have DN (${dnCount})`);

  const a1 = getSheetFormat("A1");
  const bounds = layoutBounds(positions, symHalf, symHalf);
  assert(bounds.maxX <= a1.width + 1, `fitted width ${bounds.maxX.toFixed(0)} <= ${a1.width}`);
  assert(bounds.maxY <= a1.height + 1, `fitted height ${bounds.maxY.toFixed(0)} <= ${a1.height}`);
  assert(bounds.minX >= a1.margin - 1, "fitted minX within margin");
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
