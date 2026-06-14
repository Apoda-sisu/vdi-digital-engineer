/**
 * Sugiyama layered layout + collision resolution for PFD equipment.
 */

import { getSheetFormat, SHEET_A1, layoutOptionsForSheet } from "./sheet-sizes.mjs";

const DEFAULT_OPTS = layoutOptionsForSheet(SHEET_A1);

/** @deprecated use getSheetFormat('A1') */
export { SHEET_A1 as DRAWING_AREA, getSheetFormat, layoutOptionsForSheet } from "./sheet-sizes.mjs";

function layoutTags(positions) {
  return Object.keys(positions || {}).filter((t) => !t.startsWith("_"));
}

function buildAdjacency(tags, lines) {
  const adj = {};
  const inDegree = {};
  for (const t of tags) {
    adj[t] = [];
    inDegree[t] = 0;
  }
  for (const line of lines) {
    const from = line.from_tag || line.from || "";
    const to = line.to_tag || line.to || "";
    if (!from || !to || adj[from] === undefined || adj[to] === undefined) continue;
    if (!adj[from].includes(to)) {
      adj[from].push(to);
      inDegree[to]++;
    }
  }
  return { adj, inDegree };
}

function topologicalOrder(tags, adj, inDegree) {
  const indeg = { ...inDegree };
  const queue = tags.filter((t) => (indeg[t] || 0) === 0);
  if (queue.length === 0) queue.push(...tags);

  const order = [];
  const visited = new Set();
  while (queue.length) {
    const node = queue.shift();
    if (visited.has(node)) continue;
    visited.add(node);
    order.push(node);
    for (const next of adj[node] || []) {
      indeg[next] = (indeg[next] || 0) - 1;
      if (indeg[next] <= 0 && !visited.has(next)) queue.push(next);
    }
  }
  for (const t of tags) {
    if (!visited.has(t)) order.push(t);
  }
  return order;
}

/** Longest-path layering (left → right flow). */
function assignLayers(tags, adj, order) {
  const layer = {};
  for (const t of tags) layer[t] = 0;
  for (const t of order) {
    for (const next of adj[t] || []) {
      layer[next] = Math.max(layer[next] ?? 0, (layer[t] ?? 0) + 1);
    }
  }
  return layer;
}

function groupByLayer(tags, layer) {
  const groups = {};
  for (const t of tags) {
    const L = layer[t] ?? 0;
    if (!groups[L]) groups[L] = [];
    groups[L].push(t);
  }
  return groups;
}

function layerOf(tag, groups) {
  for (const [L, nodes] of Object.entries(groups)) {
    if (nodes.includes(tag)) return Number(L);
  }
  return 0;
}

function buildRevAdj(tags, adj) {
  const rev = {};
  for (const t of tags) rev[t] = [];
  for (const [from, outs] of Object.entries(adj)) {
    for (const to of outs) rev[to].push(from);
  }
  return rev;
}

/** Barycenter ordering within layers to reduce crossings. */
function reorderLayers(groups, adj, revAdj, iterations = 4) {
  const layerIds = Object.keys(groups)
    .map(Number)
    .sort((a, b) => a - b);

  for (let iter = 0; iter < iterations; iter++) {
    for (const L of layerIds) {
      const nodes = groups[L];
      const scores = nodes.map((n) => {
        const neighbors = [...(revAdj[n] || []), ...(adj[n] || [])];
        const positions = neighbors
          .map((nb) => groups[layerOf(nb, groups)]?.indexOf(nb))
          .filter((i) => i >= 0);
        if (!positions.length) return groups[L].indexOf(n);
        return positions.reduce((a, b) => a + b, 0) / positions.length;
      });
      groups[L] = nodes
        .map((n, i) => ({ n, s: scores[i] }))
        .sort((a, b) => a.s - b.s || a.n.localeCompare(b.n))
        .map((x) => x.n);
    }
  }
  return groups;
}

function boxesOverlap(a, b) {
  return !(a.maxX < b.minX || b.maxX < a.minX || a.maxY < b.minY || b.maxY < a.minY);
}

/** Push apart overlapping symbol bboxes vertically within same layer. */
function resolveCollisions(positions, tags, opts) {
  const hw = opts.symbolHalfW + opts.padding;
  const hh = opts.symbolHalfH + opts.padding;
  const byLayer = {};
  for (const t of tags) {
    const L = Math.round((positions[t].x - opts.xStart) / opts.layerGap);
    if (!byLayer[L]) byLayer[L] = [];
    byLayer[L].push(t);
  }

  for (const nodes of Object.values(byLayer)) {
    let changed = true;
    let guard = 0;
    while (changed && guard < 50) {
      changed = false;
      guard++;
      nodes.sort((a, b) => positions[a].y - positions[b].y);
      for (let i = 0; i < nodes.length - 1; i++) {
        const a = nodes[i];
        const b = nodes[i + 1];
        const boxA = {
          minX: positions[a].x - hw,
          maxX: positions[a].x + hw,
          minY: positions[a].y - hh,
          maxY: positions[a].y + hh,
        };
        const boxB = {
          minX: positions[b].x - hw,
          maxX: positions[b].x + hw,
          minY: positions[b].y - hh,
          maxY: positions[b].y + hh,
        };
        if (boxesOverlap(boxA, boxB)) {
          const shift = boxA.maxY - boxB.minY + opts.padding;
          positions[b].y += shift;
          changed = true;
        }
      }
    }
  }
  return positions;
}

/**
 * Sugiyama-style layered layout: layers increase along process flow (left → right).
 */
export function sugiyamaLayout(tags, lines = [], options = {}) {
  const sheet = options.sheet ? getSheetFormat(options.sheet) : getSheetFormat("A1");
  const base = layoutOptionsForSheet(sheet);
  const opts = { ...base, ...options };
  if (!tags.length) return {};

  const { adj, inDegree } = buildAdjacency(tags, lines);
  const order = topologicalOrder(tags, adj, inDegree);
  const layer = assignLayers(tags, adj, order);
  let groups = groupByLayer(tags, layer);
  const revAdj = buildRevAdj(tags, adj);
  groups = reorderLayers(groups, adj, revAdj);

  const positions = {};
  const layerIds = Object.keys(groups)
    .map(Number)
    .sort((a, b) => a - b);

  for (const L of layerIds) {
    const nodes = groups[L];
    const count = nodes.length;
    const totalH = (count - 1) * opts.nodeGap;
    const y0 = opts.yCenter - totalH / 2;
    nodes.forEach((tag, i) => {
      positions[tag] = {
        x: opts.xStart + L * opts.layerGap,
        y: y0 + i * opts.nodeGap,
      };
    });
  }

  return resolveCollisions(positions, tags, opts);
}

/** Backward-compatible alias used by tests. */
export function autoLayoutEquipment(tags, lineList = [], options = {}) {
  return sugiyamaLayout(tags, lineList, options);
}

export function layoutBounds(positions, symbolHalfW = 24, symbolHalfH = 28) {
  const tags = layoutTags(positions);
  if (!tags.length) return { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0 };
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const tag of tags) {
    const p = positions[tag];
    if (!p) continue;
    minX = Math.min(minX, p.x - symbolHalfW);
    maxX = Math.max(maxX, p.x + symbolHalfW);
    minY = Math.min(minY, p.y - symbolHalfH);
    maxY = Math.max(maxY, p.y + symbolHalfH);
  }
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
}

/**
 * Scale and center Sugiyama layout to fit A3 printable area.
 * Without this, MEOH-100 spans ~4500×1300 mm and dwarfs the title block.
 */
export function fitLayoutToPage(positions, options = {}) {
  const sheet = options.sheet ? getSheetFormat(options.sheet) : null;
  const opts = sheet
    ? { width: sheet.width, height: sheet.height, margin: sheet.margin, symbolHalfW: sheet.symbolHalfW, symbolHalfH: sheet.symbolHalfH, ...options }
    : { ...getSheetFormat("A1"), ...options };
  const tags = layoutTags(positions);
  if (!tags.length) return {};

  const bounds = layoutBounds(positions, opts.symbolHalfW, opts.symbolHalfH);
  if (bounds.width < 1 || bounds.height < 1) return { ...positions };

  const targetW = opts.width - 2 * opts.margin;
  const targetH = opts.height - 2 * opts.margin;
  const scale = Math.min(targetW / bounds.width, targetH / bounds.height);
  const srcCx = (bounds.minX + bounds.maxX) / 2;
  const srcCy = (bounds.minY + bounds.maxY) / 2;
  const dstCx = opts.margin + targetW / 2;
  const dstCy = opts.margin + targetH / 2;

  let fitted = {};
  for (const tag of tags) {
    const p = positions[tag];
    fitted[tag] = {
      x: dstCx + (p.x - srcCx) * scale,
      y: dstCy + (p.y - srcCy) * scale,
    };
  }

  let symScale = computeSymbolScaleFromLayout(fitted, 28, 10);
  fitted = enforceMinSpacing(fitted, symScale * 0.92, opts);

  const symHalf = symScale / 2;
  let b = layoutBounds(fitted, symHalf, symHalf);
  const dx = b.minX < opts.margin ? opts.margin - b.minX : 0;
  const dy = b.minY < opts.margin ? opts.margin - b.minY : 0;
  if (dx || dy) {
    for (const tag of tags) {
      fitted[tag] = { x: fitted[tag].x + dx, y: fitted[tag].y + dy };
    }
  }

  symScale = computeSymbolScaleFromLayout(fitted, 28, 10);
  fitted._layoutMeta = { symbol_scale: symScale, overlap: layoutHasCollisions(fitted, tags, symScale / 2, symScale / 2) };
  return fitted;
}

/** Push nodes apart so symbol bboxes do not overlap on the fitted page. */
export function enforceMinSpacing(positions, minCenterDist, options = {}) {
  const tags = layoutTags(positions);
  if (tags.length < 2) return { ...positions };

  const pad = options.padding ?? 3;
  const need = Math.max(minCenterDist + pad, 6);
  const out = {};
  for (const t of tags) out[t] = { ...positions[t] };

  let changed = true;
  let guard = 0;
  while (changed && guard < 120) {
    changed = false;
    guard++;
    for (let i = 0; i < tags.length; i++) {
      for (let j = i + 1; j < tags.length; j++) {
        const a = out[tags[i]];
        const b = out[tags[j]];
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const d = Math.hypot(dx, dy);
        if (d >= need || d < 0.01) continue;
        const push = (need - d) / 2;
        const ux = dx / d || 1;
        const uy = dy / d || 0;
        a.x += ux * push;
        a.y += uy * push;
        b.x -= ux * push;
        b.y -= uy * push;
        changed = true;
      }
    }
  }

  const bounds = layoutBounds(out, need / 2, need / 2);
  const targetW = (options.width ?? getSheetFormat("A1").width) - 2 * (options.margin ?? getSheetFormat("A1").margin);
  const targetH = (options.height ?? getSheetFormat("A1").height) - 2 * (options.margin ?? getSheetFormat("A1").margin);
  if (bounds.width > targetW || bounds.height > targetH) {
    const shrink = Math.min(targetW / bounds.width, targetH / bounds.height, 1);
    if (shrink < 0.98) {
      const cx = (bounds.minX + bounds.maxX) / 2;
      const cy = (bounds.minY + bounds.maxY) / 2;
      for (const t of tags) {
        out[t] = {
          x: cx + (out[t].x - cx) * shrink,
          y: cy + (out[t].y - cy) * shrink,
        };
      }
    }
  }
  return out;
}

/** Dynamic symbol size (mm) — diameter ≈ 55% of nearest neighbor spacing, capped by count. */
export function computeSymbolScaleFromLayout(positions, maxSize = 32, minSize = null) {
  const tags = layoutTags(positions);
  const count = tags.length;
  const effectiveMin = minSize ?? (count <= 12 ? 16 : count <= 24 ? 12 : count <= 36 ? 10 : 8);
  const effectiveMax = count <= 12 ? Math.min(maxSize, 28) : count <= 24 ? Math.min(maxSize, 20) : Math.min(maxSize, 14);
  if (count < 2) return Math.min(effectiveMax, 22);
  let minDist = Infinity;
  for (let i = 0; i < tags.length; i++) {
    for (let j = i + 1; j < tags.length; j++) {
      const a = positions[tags[i]];
      const b = positions[tags[j]];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (d > 0.5 && d < minDist) minDist = d;
    }
  }
  if (!Number.isFinite(minDist)) minDist = 40;
  const ratio = count <= 12 ? 0.52 : count <= 24 ? 0.48 : 0.42;
  return Math.max(effectiveMin, Math.min(effectiveMax, minDist * ratio));
}

/** Area-based fallback when layout positions unavailable. */
export function computeSymbolScale(equipmentCount, pageWidth = 360, pageHeight = 220, margin = 20) {
  const w = pageWidth - 2 * margin;
  const h = pageHeight - 2 * margin;
  const areaPer = (w * h) / Math.max(equipmentCount, 1);
  const side = Math.sqrt(areaPer) * 0.62;
  return Math.max(8, Math.min(40, Math.round(side * 10) / 10));
}

export function equipmentBboxes(positions, tags, halfW = 24, halfH = 28) {
  const boxes = {};
  for (const tag of tags) {
    const p = positions[tag];
    if (!p) continue;
    boxes[tag] = {
      minX: p.x - halfW,
      maxX: p.x + halfW,
      minY: p.y - halfH,
      maxY: p.y + halfH,
    };
  }
  return boxes;
}

function segmentIntersectsBox(p1, p2, box) {
  const samples = 8;
  for (let i = 0; i <= samples; i++) {
    const t = i / samples;
    const x = p1[0] + t * (p2[0] - p1[0]);
    const y = p1[1] + t * (p2[1] - p1[1]);
    if (x > box.minX && x < box.maxX && y > box.minY && y < box.maxY) return true;
  }
  return false;
}

function pathHitsObstacles(waypoints, obstacles, margin = 4) {
  for (let i = 0; i < waypoints.length - 1; i++) {
    const a = waypoints[i];
    const b = waypoints[i + 1];
    for (const obs of obstacles) {
      const box = {
        minX: obs.minX - margin,
        maxX: obs.maxX + margin,
        minY: obs.minY - margin,
        maxY: obs.maxY + margin,
      };
      if (segmentIntersectsBox(a, b, box)) return true;
    }
  }
  return false;
}

/**
 * Manhattan route with mid-x candidates to avoid equipment bboxes.
 */
export function routePipeOrthogonal(p1, p2, obstacles = [], options = {}) {
  const padding = options.padding ?? 18;
  const defaultMid = (p1[0] + p2[0]) / 2;
  const candidates = new Set([defaultMid]);

  for (const obs of obstacles) {
    candidates.add(obs.maxX + padding);
    candidates.add(obs.minX - padding);
  }
  for (const dx of [-80, -40, 0, 40, 80]) {
    candidates.add(defaultMid + dx);
  }

  const sorted = [...candidates].sort(
    (a, b) => Math.abs(a - defaultMid) - Math.abs(b - defaultMid)
  );

  for (const midX of sorted) {
    const waypoints =
      Math.abs(p1[1] - p2[1]) < 0.5
        ? [p1, p2]
        : [
            p1,
            [midX, p1[1]],
            [midX, p2[1]],
            p2,
          ];
    if (!pathHitsObstacles(waypoints, obstacles)) {
      return { waypoints, midX };
    }
  }

  const fallback = [
    p1,
    [defaultMid, p1[1]],
    [defaultMid, p2[1]],
    p2,
  ];
  return { waypoints: fallback, midX: defaultMid };
}

export function labelPointOnPath(waypoints) {
  if (waypoints.length < 2) return waypoints[0] || [0, 0];
  let best = [waypoints[0], waypoints[1]];
  let bestLen = 0;
  for (let i = 0; i < waypoints.length - 1; i++) {
    const a = waypoints[i];
    const b = waypoints[i + 1];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (len >= bestLen) {
      bestLen = len;
      best = [a, b];
    }
  }
  const [a, b] = best;
  return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
}

export function layoutHasCollisions(positions, tags, halfW = 24, halfH = 28) {
  const tagList = tags || layoutTags(positions);
  const boxes = equipmentBboxes(positions, tagList, halfW, halfH);
  for (let i = 0; i < tagList.length; i++) {
    for (let j = i + 1; j < tagList.length; j++) {
      const a = boxes[tagList[i]];
      const b = boxes[tagList[j]];
      if (a && b && boxesOverlap(a, b)) return true;
    }
  }
  return false;
}
