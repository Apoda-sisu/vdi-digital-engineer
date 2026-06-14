"""Engine utilities."""

import re

import FreeCAD as App


def safe_object_name(prefix: str, raw: str, max_len: int = 100) -> str:
    """FreeCAD 对象名仅允许字母数字下划线，非法字符会导致崩溃。"""
    cleaned = re.sub(r"[^a-zA-Z0-9_]", "_", str(raw))
    cleaned = re.sub(r"_+", "_", cleaned).strip("_") or "item"
    name = f"{prefix}_{cleaned}"
    return name[:max_len]


def draft_make_text(
    doc,
    lines,
    x: float,
    y: float,
    z: float = 0,
    font_size: float = 4.0,
    line_spacing: float = 5.0,
):
    """Draft 文本标注 — 兼容 FreeCAD 1.x，显式设置字号与位置。"""
    try:
        import Draft
    except ImportError:
        return None
    text = lines if isinstance(lines, list) else [str(lines)]
    obj = None
    try:
        obj = Draft.make_text(text, App.Vector(x, y, z))
    except TypeError:
        try:
            obj = Draft.make_text(text, x, y, z)
        except Exception:
            return None
    except Exception:
        return None

    if obj is None:
        return None

    try:
        obj.Placement = App.Placement(App.Vector(x, y, z), App.Rotation())
    except Exception:
        pass

    vo = getattr(obj, "ViewObject", None)
    if vo:
        if hasattr(vo, "FontSize"):
            vo.FontSize = font_size
        if hasattr(vo, "LineSpacing"):
            vo.LineSpacing = line_spacing
        vo.Visibility = True
    return obj


def draft_make_single_line_centered(
    doc,
    text: str,
    cx: float,
    cy: float,
    z: float = 0,
    font_size: float = 3.0,
    char_width_ratio: float = 0.52,
):
    """单行文本水平/垂直居中于 (cx, cy)。"""
    line = str(text)
    if not line:
        return None
    block_w = len(line) * font_size * char_width_ratio
    x = cx - block_w / 2
    y = cy - font_size / 2
    return draft_make_text(doc, [line], x, y, z, font_size, line_spacing=font_size)


def draft_make_centered_text(
    doc,
    lines,
    cx: float,
    cy: float,
    z: float = 0,
    font_size: float = 3.0,
    line_spacing: float = 3.5,
    upper_y_offset: float = 3.0,
    lower_y_offset: float = 2.5,
    char_width_ratio: float = 0.52,
):
    """ISA 仪表气泡两行：上类型、下位号，各自独立居中（避免多行锚点错位）。"""
    text = lines if isinstance(lines, list) else [str(lines)]
    if not text:
        return None

    objs = []
    if len(text) == 1:
        o = draft_make_single_line_centered(
            doc, text[0], cx, cy, z, font_size, char_width_ratio
        )
        return o

    o1 = draft_make_single_line_centered(
        doc,
        text[0],
        cx,
        cy + upper_y_offset,
        z,
        font_size,
        char_width_ratio,
    )
    o2 = draft_make_single_line_centered(
        doc,
        text[1],
        cx,
        cy - lower_y_offset,
        z,
        font_size,
        char_width_ratio,
    )
    if o1:
        objs.append(o1)
    if o2:
        objs.append(o2)
    return objs[-1] if objs else None
