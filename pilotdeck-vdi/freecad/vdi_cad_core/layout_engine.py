"""Sugiyama layered layout and pipe routing (no FreeCAD)."""

from __future__ import annotations

from typing import Any, Dict, List, Optional, Tuple

Point = Tuple[float, float]
BBox = Dict[str, float]

DEFAULT_OPTS = {
    "x_start": 100.0,
    "y_center": 200.0,
    "layer_gap": 140.0,
    "node_gap": 85.0,
    "symbol_half_w": 24.0,
    "symbol_half_h": 28.0,
    "padding": 12.0,
}


def _build_adjacency(tags: List[str], lines: List[dict]) -> Tuple[Dict[str, List[str]], Dict[str, int]]:
    adj: Dict[str, List[str]] = {t: [] for t in tags}
    in_degree: Dict[str, int] = {t: 0 for t in tags}
    for line in lines:
        fr = line.get("from_tag") or line.get("from") or ""
        to = line.get("to_tag") or line.get("to") or ""
        if not fr or not to or fr not in adj or to not in adj:
            continue
        if to not in adj[fr]:
            adj[fr].append(to)
            in_degree[to] += 1
    return adj, in_degree


def _topological_order(tags: List[str], adj: Dict[str, List[str]], in_degree: Dict[str, int]) -> List[str]:
    indeg = dict(in_degree)
    queue = [t for t in tags if indeg.get(t, 0) == 0]
    if not queue:
        queue = list(tags)
    order: List[str] = []
    visited: set = set()
    while queue:
        node = queue.pop(0)
        if node in visited:
            continue
        visited.add(node)
        order.append(node)
        for nxt in adj.get(node, []):
            indeg[nxt] = indeg.get(nxt, 0) - 1
            if indeg[nxt] <= 0 and nxt not in visited:
                queue.append(nxt)
    for t in tags:
        if t not in visited:
            order.append(t)
    return order


def _assign_layers(tags: List[str], adj: Dict[str, List[str]], order: List[str]) -> Dict[str, int]:
    layer = {t: 0 for t in tags}
    for t in order:
        for nxt in adj.get(t, []):
            layer[nxt] = max(layer.get(nxt, 0), layer.get(t, 0) + 1)
    return layer


def _group_by_layer(tags: List[str], layer: Dict[str, int]) -> Dict[int, List[str]]:
    groups: Dict[int, List[str]] = {}
    for t in tags:
        L = layer.get(t, 0)
        groups.setdefault(L, []).append(t)
    return groups


def _boxes_overlap(a: BBox, b: BBox) -> bool:
    return not (a["max_x"] < b["min_x"] or b["max_x"] < a["min_x"] or a["max_y"] < b["min_y"] or b["max_y"] < a["min_y"])


def _resolve_collisions(
    positions: Dict[str, Dict[str, float]],
    tags: List[str],
    opts: Dict[str, float],
) -> None:
    hw = opts["symbol_half_w"] + opts["padding"]
    hh = opts["symbol_half_h"] + opts["padding"]
    by_layer: Dict[int, List[str]] = {}
    for t in tags:
        p = positions[t]
        L = int(round((p["x"] - opts["x_start"]) / opts["layer_gap"]))
        by_layer.setdefault(L, []).append(t)

    for nodes in by_layer.values():
        for _ in range(50):
            changed = False
            nodes.sort(key=lambda n: positions[n]["y"])
            for i in range(len(nodes) - 1):
                a, b = nodes[i], nodes[i + 1]
                box_a = {
                    "min_x": positions[a]["x"] - hw,
                    "max_x": positions[a]["x"] + hw,
                    "min_y": positions[a]["y"] - hh,
                    "max_y": positions[a]["y"] + hh,
                }
                box_b = {
                    "min_x": positions[b]["x"] - hw,
                    "max_x": positions[b]["x"] + hw,
                    "min_y": positions[b]["y"] - hh,
                    "max_y": positions[b]["y"] + hh,
                }
                if _boxes_overlap(box_a, box_b):
                    shift = box_a["max_y"] - box_b["min_y"] + opts["padding"]
                    positions[b]["y"] += shift
                    changed = True
            if not changed:
                break


def sugiyama_layout(tags: List[str], lines: List[dict], options: Dict[str, Any] | None = None) -> Dict[str, Dict[str, float]]:
    opts = {**DEFAULT_OPTS, **(options or {})}
    if not tags:
        return {}

    adj, in_degree = _build_adjacency(tags, lines)
    order = _topological_order(tags, adj, in_degree)
    layer = _assign_layers(tags, adj, order)
    groups = _group_by_layer(tags, layer)

    positions: Dict[str, Dict[str, float]] = {}
    for L in sorted(groups.keys()):
        nodes = groups[L]
        count = len(nodes)
        total_h = (count - 1) * opts["node_gap"]
        y0 = opts["y_center"] - total_h / 2
        for i, tag in enumerate(nodes):
            positions[tag] = {
                "x": opts["x_start"] + L * opts["layer_gap"],
                "y": y0 + i * opts["node_gap"],
            }

    _resolve_collisions(positions, tags, opts)
    return positions


def equipment_bboxes(
    positions: Dict[str, Dict[str, float]],
    tags: List[str],
    half_w: float = 24.0,
    half_h: float = 28.0,
) -> Dict[str, BBox]:
    boxes: Dict[str, BBox] = {}
    for tag in tags:
        p = positions.get(tag)
        if not p:
            continue
        boxes[tag] = {
            "min_x": p["x"] - half_w,
            "max_x": p["x"] + half_w,
            "min_y": p["y"] - half_h,
            "max_y": p["y"] + half_h,
        }
    return boxes


def _segment_hits_box(p1: Point, p2: Point, box: BBox, margin: float = 4.0) -> bool:
    expanded = {
        "min_x": box["min_x"] - margin,
        "max_x": box["max_x"] + margin,
        "min_y": box["min_y"] - margin,
        "max_y": box["max_y"] + margin,
    }
    for i in range(9):
        t = i / 8.0
        x = p1[0] + t * (p2[0] - p1[0])
        y = p1[1] + t * (p2[1] - p1[1])
        if expanded["min_x"] < x < expanded["max_x"] and expanded["min_y"] < y < expanded["max_y"]:
            return True
    return False


def _path_hits_obstacles(waypoints: List[Point], obstacles: List[BBox], margin: float = 4.0) -> bool:
    for i in range(len(waypoints) - 1):
        for obs in obstacles:
            if _segment_hits_box(waypoints[i], waypoints[i + 1], obs, margin):
                return True
    return False


def route_pipe_orthogonal(
    p1: Point,
    p2: Point,
    obstacles: List[BBox] | None = None,
    padding: float = 18.0,
) -> List[Point]:
    obstacles = obstacles or []
    default_mid = (p1[0] + p2[0]) / 2.0
    candidates = {default_mid}
    for obs in obstacles:
        candidates.add(obs["max_x"] + padding)
        candidates.add(obs["min_x"] - padding)
    for dx in (-80, -40, 0, 40, 80):
        candidates.add(default_mid + dx)

    for mid_x in sorted(candidates, key=lambda v: abs(v - default_mid)):
        if abs(p1[1] - p2[1]) < 0.5:
            waypoints = [p1, p2]
        else:
            waypoints = [p1, (mid_x, p1[1]), (mid_x, p2[1]), p2]
        if not _path_hits_obstacles(waypoints, obstacles):
            return waypoints

    return [p1, (default_mid, p1[1]), (default_mid, p2[1]), p2]


def label_point_on_path(waypoints: List[Point]) -> Point:
    if len(waypoints) < 2:
        return waypoints[0] if waypoints else (0.0, 0.0)
    best: Tuple[Point, Point] = (waypoints[0], waypoints[1])
    best_len = 0.0
    for i in range(len(waypoints) - 1):
        a, b = waypoints[i], waypoints[i + 1]
        length = ((b[0] - a[0]) ** 2 + (b[1] - a[1]) ** 2) ** 0.5
        if length >= best_len:
            best_len = length
            best = (a, b)
    a, b = best
    return ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)


def layout_has_collisions(
    positions: Dict[str, Dict[str, float]],
    tags: List[str],
    half_w: float = 24.0,
    half_h: float = 28.0,
) -> bool:
    boxes = equipment_bboxes(positions, tags, half_w, half_h)
    tag_list = list(boxes.keys())
    for i, a in enumerate(tag_list):
        for b in tag_list[i + 1 :]:
            if _boxes_overlap(boxes[a], boxes[b]):
                return True
    return False


DRAWING_AREA = {
    "width": 360.0,
    "height": 220.0,
    "margin": 20.0,
    "symbol_half_w": 24.0,
    "symbol_half_h": 28.0,
}


def layout_bounds(
    positions: Dict[str, Dict[str, float]],
    half_w: float = 24.0,
    half_h: float = 28.0,
) -> Dict[str, float]:
    tags = list(positions.keys())
    if not tags:
        return {"min_x": 0.0, "min_y": 0.0, "max_x": 0.0, "max_y": 0.0, "width": 0.0, "height": 0.0}
    min_x = min(positions[t]["x"] - half_w for t in tags)
    max_x = max(positions[t]["x"] + half_w for t in tags)
    min_y = min(positions[t]["y"] - half_h for t in tags)
    max_y = max(positions[t]["y"] + half_h for t in tags)
    return {
        "min_x": min_x,
        "min_y": min_y,
        "max_x": max_x,
        "max_y": max_y,
        "width": max_x - min_x,
        "height": max_y - min_y,
    }


def fit_layout_to_page(
    positions: Dict[str, Dict[str, float]],
    options: Optional[Dict[str, float]] = None,
) -> Dict[str, Dict[str, float]]:
    """Scale Sugiyama layout to A3 printable area (mirrors layout-engine.mjs)."""
    opts = {**DRAWING_AREA, **(options or {})}
    tags = list(positions.keys())
    if not tags:
        return {}
    hw = opts["symbol_half_w"]
    hh = opts["symbol_half_h"]
    bounds = layout_bounds(positions, hw, hh)
    if bounds["width"] < 1 or bounds["height"] < 1:
        return dict(positions)
    target_w = opts["width"] - 2 * opts["margin"]
    target_h = opts["height"] - 2 * opts["margin"]
    scale = min(target_w / bounds["width"], target_h / bounds["height"])
    src_cx = (bounds["min_x"] + bounds["max_x"]) / 2
    src_cy = (bounds["min_y"] + bounds["max_y"]) / 2
    dst_cx = opts["margin"] + target_w / 2
    dst_cy = opts["margin"] + target_h / 2
    fitted: Dict[str, Dict[str, float]] = {}
    for tag in tags:
        p = positions[tag]
        fitted[tag] = {
            "x": dst_cx + (p["x"] - src_cx) * scale,
            "y": dst_cy + (p["y"] - src_cy) * scale,
        }
    return fitted
