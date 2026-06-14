#!/usr/bin/env node
/** Run pick coordinate round-trip diagnostic in live FreeCAD. */
import { diagnosePick } from "../cad-client.mjs";

const docName = process.argv[2] || "";
const result = await diagnosePick(docName);
console.log(JSON.stringify(result, null, 2));
if (result.status !== "success") process.exit(1);
const failed = (result.items || []).filter((i) => !i.pick_ok);
if (failed.length) {
  console.error(`\n${failed.length}/${result.tested} pick round-trips FAILED`);
  for (const f of failed) {
    console.error(`  ${f.tag}: expected ${f.tag}, got ${f.pick_tag} (${f.pick_method})`);
  }
  process.exit(1);
}
console.log(`\n✓ All ${result.tested} equipment round-trip picks OK`);
