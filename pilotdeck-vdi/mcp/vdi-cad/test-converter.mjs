#!/usr/bin/env node
/** Unit test: DisciplineOutput → CadCommand converter */

import { disciplineOutputToCadCommand, buildMethanolFixture, mergeDisciplineOutputsForCad } from "./converter.mjs";

const fixture = buildMethanolFixture();
const cmd = disciplineOutputToCadCommand(fixture, { drawing_type: "pfd" });

const splitPfd = disciplineOutputToCadCommand(
  { discipline: "process", output_type: "pfd", payload: fixture.payload },
  { drawing_type: "pfd" }
);
const splitPid = disciplineOutputToCadCommand(
  { discipline: "process", output_type: "pid", payload: fixture.payload },
  { drawing_type: "pid" }
);
const merged = mergeDisciplineOutputsForCad([
  { output_type: "pfd", payload: fixture.payload, citations: [] },
  { output_type: "pid", payload: fixture.payload, citations: [] },
]);

const checks = [
  ["version", cmd.version === "1.0" || cmd.version === "1.1"],
  ["equipment count", cmd.equipment.length === 48],
  ["line count", cmd.lines.length === 32],
  ["instruments", cmd.instruments.length >= 12],
  ["drawing_type", cmd.drawing_type === "pfd"],
  ["title_block", !!cmd.title_block.drawing_number],
  ["equipment object_id", cmd.equipment.every((e) => e.object_id)],
  ["equipment parameters", Object.keys(cmd.equipment[0]?.parameters || {}).length > 0],
  ["split pfd type", splitPfd.drawing_type === "pfd"],
  ["split pid type", splitPid.drawing_type === "pid"],
  ["merge line_list", (merged.payload.line_list?.length || 0) === 32],
];

let failed = 0;
for (const [name, ok] of checks) {
  console.log(ok ? `✓ ${name}` : `✗ ${name}`);
  if (!ok) failed++;
}

if (failed > 0) {
  console.error(`\n${failed} check(s) failed`);
  process.exit(1);
}
console.log("\nAll converter checks passed.");
