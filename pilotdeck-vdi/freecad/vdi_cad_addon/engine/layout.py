"""Layout helpers — bounds, instrument anchoring, collision avoidance."""

import math
import re
from typing import Dict, List, Optional, Tuple

from engine.symbols import DEFAULT_LINE_SPACING, DEFAULT_TEXT_SIZE, SYMBOL_SIZE, get_symbol_extents

INST_BUBBLE_RADIUS = 11.0
PSV_BUBBLE_RADIUS = 12.0
BUBBLE_MIN_GAP = 6.0


def content_bounds(
    positions: Dict[str, Tuple[float, float]],
    equipment: List[dict],
) -> Tuple[float, float, float, float]:
    """min_x, min_y, max_x, max_y including symbol extents."""
    if not positions:
        return 0.0, 0.0, 400.0, 300.0
    min_x = min_y = float("inf")
    max_x = max_y = float("-inf")
    eq_by_tag = {e.get("tag", ""): e for e in equipment}
    for tag, (x, y) in positions.items():
        eq = eq_by_tag.get(tag, {})
        hw, hh = get_symbol_extents(eq.get("type", ""), tag)
        min_x = min(min_x, x - hw)
        max_x = max(max_x, x + hw)
        min_y = min(min_y, y - hh)
        max_y = max(max_y, y + hh)
    return min_x, min_y, max_x, max_y


def find_equipment_for_instrument(
    inst_tag: str, positions: Dict[str, Tuple[float, float]]
) -> Optional[str]:
    """Map TIC-101 → R-101，优先后缀精确匹配。"""
    m = re.search(r"-(\d+[A-Za-z]?)$", inst_tag or "")
    if m:
        suffix = m.group(1)
        for eq_tag in sorted(positions.keys(), key=len):
            if eq_tag.endswith(f"-{suffix}") or eq_tag.split("-")[-1] == suffix:
                return eq_tag
    nums = re.findall(r"\d+", inst_tag or "")
    for num in reversed(nums):
        for eq_tag in positions:
            if num in eq_tag.split("-")[-1]:
                return eq_tag
    return None


class InstrumentPlacer:
    """Track placed bubbles and resolve overlaps."""

    def __init__(self):
        self._placed: List[Tuple[float, float, float]] = []
        self._slot: Dict[str, int] = {}

    def _collides(self, x: float, y: float, r: float) -> bool:
        for px, py, pr in self._placed:
            min_d = r + pr + BUBBLE_MIN_GAP
            if (x - px) ** 2 + (y - py) ** 2 < min_d * min_d:
                return True
        return False

    def _commit(self, x: float, y: float, r: float) -> Tuple[float, float]:
        self._placed.append((x, y, r))
        return x, y

    def _next_slot(self, anchor_key: str) -> int:
        n = self._slot.get(anchor_key, 0)
        self._slot[anchor_key] = n + 1
        return n

    def _candidates_above(self, ax: float, ay: float, slot: int) -> List[Tuple[float, float]]:
        """扇形排在锚点上方，避免多仪表叠在同一点。"""
        cols = [-40, 0, 40, -40, 40, 0, -55, 55]
        row = slot // 3
        col = slot % 3
        base_dy = SYMBOL_SIZE * 0.42 + 22
        dx = cols[col] if col < len(cols) else (col - 1) * 38
        dy = base_dy + row * 32
        out = [(ax + dx, ay + dy)]
        for ring in range(1, 4):
            for deg in (0, 60, -60, 120, -120):
                rad = math.radians(deg)
                dist = 28 + ring * 14
                out.append((ax + dx + dist * math.sin(rad), ay + dy + dist * math.cos(rad)))
        return out

    def _candidates_right(self, ax: float, ay: float, slot: int) -> List[Tuple[float, float]]:
        out = []
        for s in range(slot, slot + 6):
            out.append((ax + 22 + (s % 2) * 8, ay + 18 + s * 30))
            out.append((ax + 38 + s * 6, ay + s * 26))
        return out

    def _candidates_line(self, mx: float, my: float, slot: int) -> List[Tuple[float, float]]:
        offsets = [0, -34, 34, -68, 68, 0]
        dy = SYMBOL_SIZE * 0.4 + 18
        return [(mx + offsets[slot % len(offsets)], my + dy + (slot // 5) * 28)]

    def place(
        self,
        anchor_key: str,
        ax: float,
        ay: float,
        radius: float,
        pattern: str = "above",
    ) -> Tuple[float, float]:
        slot = self._next_slot(anchor_key)
        if pattern == "right":
            candidates = self._candidates_right(ax, ay, slot)
        elif pattern == "line":
            candidates = self._candidates_line(ax, ay, slot)
        else:
            candidates = self._candidates_above(ax, ay, slot)

        for cx, cy in candidates:
            if not self._collides(cx, cy, radius):
                return self._commit(cx, cy, radius)

        for ring in range(1, 8):
            for deg in range(0, 360, 30):
                rad = math.radians(deg)
                dist = radius + BUBBLE_MIN_GAP + ring * 12
                cx = ax + dist * math.cos(rad)
                cy = ay + dist * math.sin(rad)
                if not self._collides(cx, cy, radius):
                    return self._commit(cx, cy, radius)

        return self._commit(ax, ay + 30 + slot * 10, radius)


def place_instrument(
    placer: InstrumentPlacer,
    inst: dict,
    positions: Dict[str, Tuple[float, float]],
    equipment: List[dict],
    lines: List[dict],
    index: int,
    radius: float = INST_BUBBLE_RADIUS,
) -> Tuple[float, float]:
    """Resolve non-overlapping bubble position for control instrument."""
    tag = inst.get("tag", f"TI{index}")
    on_line = inst.get("on_line", "")

    if on_line:
        for line in lines:
            if line.get("line_no") != on_line:
                continue
            ft = line.get("from_tag", line.get("from", ""))
            tt = line.get("to_tag", line.get("to", ""))
            if ft in positions and tt in positions:
                x1, y1 = positions[ft]
                x2, y2 = positions[tt]
                mx, my = (x1 + x2) / 2, (y1 + y2) / 2
                key = f"line:{line.get('line_no', f'{ft}_{tt}')}"
                return placer.place(key, mx, my, radius, pattern="line")

    eq_tag = find_equipment_for_instrument(tag, positions)
    if eq_tag and eq_tag in positions:
        x, y = positions[eq_tag]
        return placer.place(f"eq:{eq_tag}", x, y, radius, pattern="above")

    min_x, min_y, max_x, max_y = content_bounds(positions, equipment)
    fx = min_x + (index % 5) * 50
    fy = max_y + 50 + (index // 5) * 34
    return placer.place(f"orphan:{tag}", fx, fy, radius, pattern="above")


def place_psv_bubble(
    placer: InstrumentPlacer,
    sv: dict,
    positions: Dict[str, Tuple[float, float]],
    equipment: List[dict],
    index: int,
    radius: float = PSV_BUBBLE_RADIUS,
) -> Tuple[float, float]:
    """PSV/BD/RD — 放在被保护设备右上侧，同设备多个则错开。"""
    tag = sv.get("tag", f"PSV-{index}")
    protected = sv.get("protected_equipment", "")
    eq_by_tag = {e.get("tag", ""): e for e in equipment}

    if protected in positions:
        px, py = positions[protected]
        eq = eq_by_tag.get(protected, {})
        hw, hh = get_symbol_extents(eq.get("type", ""), protected)
        return placer.place(
            f"psv:{protected}",
            px + hw,
            py + hh * 0.2,
            radius,
            pattern="right",
        )

    return place_instrument(
        placer,
        {"tag": tag, "on_line": ""},
        positions,
        equipment,
        [],
        index + 100,
        radius=radius,
    )


def annotate_zone_below(
    positions: Dict[str, Tuple[float, float]],
    equipment: List[dict],
    rows: int,
) -> Tuple[float, float]:
    min_x, min_y, max_x, max_y = content_bounds(positions, equipment)
    return min_x, min_y - 25 - rows * DEFAULT_LINE_SPACING


def annotate_zone_right(
    positions: Dict[str, Tuple[float, float]],
    equipment: List[dict],
) -> Tuple[float, float]:
    min_x, min_y, max_x, max_y = content_bounds(positions, equipment)
    return max_x + 50, max_y
