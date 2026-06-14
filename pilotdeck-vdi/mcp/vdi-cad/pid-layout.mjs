/**
 * P&ID view placement helpers — instrument / inline valve / PSV positions.
 */

const VALVE_TYPES = ["gate", "ball", "check"];

export function inferValveType(index) {
  return VALVE_TYPES[index % VALVE_TYPES.length];
}

export function valveTagForLine(line, index) {
  if (line.valve_tag) return line.valve_tag;
  return `XV-${101 + index}`;
}

/** Midpoint on pipe with slight offset to avoid overlapping equipment centers. */
export function inlineValvePosition(line, positions, index = 0) {
  const from = positions[line.from_tag];
  const to = positions[line.to_tag];
  if (!from || !to) return null;
  const t = 0.45 + (index % 3) * 0.05;
  const offset = ((index % 3) - 1) * 10;
  return {
    x: from.x + t * (to.x - from.x),
    y: from.y + t * (to.y - from.y) + offset,
  };
}

export function instrumentPositionAbove(positions, inst, equipmentTags, index) {
  const onLine = inst.on_line;
  if (onLine) {
    for (const [tag, pos] of Object.entries(positions)) {
      // resolved by caller using line endpoints
    }
  }
  const suffix = (inst.tag || "").match(/-(\d+[A-Za-z]?)$/)?.[1];
  if (suffix) {
    for (const tag of Object.keys(positions)) {
      if (tag.endsWith(`-${suffix}`)) {
        const p = positions[tag];
        return { x: p.x, y: p.y + 55 + (index % 3) * 12 };
      }
    }
  }
  const keys = Object.keys(positions);
  const anchor = keys[index % Math.max(keys.length, 1)];
  const p = positions[anchor] || { x: 100, y: 200 };
  return { x: p.x + 30, y: p.y + 60 };
}

export function instrumentPositionOnLine(line, positions, index) {
  const from = positions[line.from_tag];
  const to = positions[line.to_tag];
  if (!from || !to) return null;
  return {
    x: (from.x + to.x) / 2,
    y: (from.y + to.y) / 2 + 28 + (index % 2) * 14,
  };
}

export function psvPosition(positions, protectedTag, index = 0) {
  const p = positions[protectedTag];
  if (!p) return null;
  return { x: p.x + 45 + index * 8, y: p.y + 35 };
}

export function buildSignalLineSegments(loop, idToPlacement) {
  const segments = [];
  const pick = (oid) => (oid && idToPlacement[oid] ? idToPlacement[oid] : null);

  const sensor = pick(loop.sensor_id);
  const controller = pick(loop.controller_id) || sensor;
  const finalEl = pick(loop.final_element_id);

  if (sensor && controller) {
    segments.push({ from: sensor, to: controller, kind: "process" });
  }
  if (controller && finalEl) {
    segments.push({ from: controller, to: finalEl, kind: "signal" });
  }
  return segments;
}

export function computePidPlacements({
  equipmentPositions,
  lines,
  instruments,
  valves,
  safetyValves,
  lineByNo,
}) {
  const tagPositions = { ...equipmentPositions };
  const placements = {};

  for (const v of valves) {
    const line = lineByNo[v.on_line] || lineByNo[v.line_no];
    if (!line) continue;
    const pos =
      inlineValvePosition(line, tagPositions, valves.indexOf(v)) ||
      instrumentPositionOnLine(line, tagPositions, 0);
    if (pos) {
      placements[v.object_id] = { ...pos, rotation: 0 };
      tagPositions[v.tag] = pos;
    }
  }

  instruments.forEach((inst, i) => {
    const line = inst.on_line ? lineByNo[inst.on_line] : null;
    let pos = line ? instrumentPositionOnLine(line, tagPositions, i) : null;
    if (!pos) pos = instrumentPositionAbove(tagPositions, inst, [], i);
    placements[inst.object_id] = { ...pos, rotation: 0 };
    tagPositions[inst.tag] = pos;
  });

  safetyValves.forEach((sv, i) => {
    const pos = psvPosition(tagPositions, sv.protected_equipment, i);
    if (pos) {
      placements[sv.object_id] = { ...pos, rotation: 0 };
      tagPositions[sv.tag] = pos;
    }
  });

  return placements;
}
