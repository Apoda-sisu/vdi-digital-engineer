"""
Scheme JSON 规范化与 PFD 校验（阶段 0 数据门禁）

与 schemas/scheme-v1.schema.json、schemas/VDI_FIELD_MAPPING.md 配套。
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional


def _parse_dn(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, (int, float)):
        return str(int(value))
    return str(value).strip()


def _tag_for_id(objects: List[Dict], obj_id: str) -> str:
    for obj in objects:
        if obj.get("id") == obj_id or obj.get("label") == obj_id:
            return str(obj.get("label") or obj.get("id") or obj_id)
    return obj_id


def _next_revision(current: str) -> str:
    """A -> B -> ... -> Z -> AA -> AB ..."""
    if not current:
        return "B"
    last = current[-1]
    if last in ("Z", "z"):
        return _next_revision(current[:-1]) + "A"
    return current[:-1] + chr(ord(last) + 1)


def build_pipe_list(scheme: Dict[str, Any]) -> List[Dict[str, Any]]:
    """从 tables.pipe_list 或 connections + streams 推导管道表"""
    tables = scheme.get("tables") or {}
    existing = tables.get("pipe_list")
    if existing:
        return list(existing)

    objects = (scheme.get("geometry") or {}).get("objects") or []
    connections = (scheme.get("geometry") or {}).get("connections") or []
    stream_by_conn: Dict[str, Dict] = {}
    for s in scheme.get("streams") or []:
        cid = s.get("connection_id") or s.get("conn_id")
        if cid:
            stream_by_conn[cid] = s

    rows: List[Dict[str, Any]] = []
    for conn in connections:
        cid = conn.get("id") or ""
        params = conn.get("parameters") or {}
        stream = stream_by_conn.get(cid) or {}
        if not stream and conn.get("stream_no"):
            stream = {"stream_no": conn.get("stream_no")}
        rows.append({
            "line_no": conn.get("label") or cid or "",
            "stream_no": stream.get("stream_no") or conn.get("stream_no") or "",
            "from_tag": _tag_for_id(objects, conn.get("from", "")),
            "to_tag": _tag_for_id(objects, conn.get("to", "")),
            "DN": _parse_dn(params.get("diameter") or params.get("DN")),
            "medium": params.get("medium") or stream.get("medium") or "",
            "flow": stream.get("flow") or params.get("flow") or "",
            "phase": stream.get("phase") or params.get("phase") or "",
            "material": params.get("material") or "",
            "insulation": params.get("insulation") or "",
            "design_T_C": params.get("design_T_C") or stream.get("T_C") or "",
            "design_P_MPa": params.get("design_P_MPa") or stream.get("P_MPa") or "",
            "oper_T_C": params.get("oper_T_C") or "",
            "oper_P_MPa": params.get("oper_P_MPa") or "",
        })
    return rows


def build_stream_map(scheme: Dict[str, Any]) -> Dict[str, Dict[str, Any]]:
    """connection_id / stream_no -> stream 记录"""
    result: Dict[str, Dict[str, Any]] = {}
    for s in scheme.get("streams") or []:
        sn = s.get("stream_no") or s.get("id")
        if sn:
            result[str(sn)] = s
        cid = s.get("connection_id") or s.get("conn_id")
        if cid:
            result[str(cid)] = s
    return result


def enrich_scheme(scheme: Dict[str, Any], bump_revision: bool = False) -> Dict[str, Any]:
    """补全 pipe_list、instrument_list、vdi_source 与 output_config 默认值"""
    from datetime import datetime

    scheme = dict(scheme)
    scheme.setdefault("output_config", {})
    scheme.setdefault("geometry", {})
    scheme["geometry"].setdefault("objects", [])
    scheme["geometry"].setdefault("connections", [])
    scheme["geometry"].setdefault("instruments", [])
    scheme.setdefault("tables", {})

    # 修订号管理
    pi = dict(scheme.get("project_info") or {})
    scheme["project_info"] = pi
    if bump_revision:
        pi["revision"] = _next_revision(pi.get("revision", "A"))
    pi.setdefault("revision", "A")
    pi.setdefault("revision_date", datetime.now().strftime("%Y-%m-%d"))

    # revision_history 追踪
    hist = list(scheme.get("revision_history") or [])
    if bump_revision:
        hist.append({
            "revision": pi["revision"],
            "date": pi["revision_date"],
            "note": pi.get("revision_note", ""),
        })
    scheme["revision_history"] = hist

    # vdi_source 自动填充
    vs = dict(scheme.get("vdi_source") or {})
    scheme["vdi_source"] = vs
    vs.setdefault("cp_stage", "")
    vs.setdefault("material_balance_ref", "")
    vs.setdefault("equipment_datasheet_ref", "")
    vs.setdefault("control_philosophy_ref", "")

    pipe_list = build_pipe_list(scheme)
    scheme["tables"]["pipe_list"] = pipe_list

    instruments = scheme["geometry"].get("instruments") or scheme.get("instruments") or []
    if instruments and not scheme["tables"].get("instrument_list"):
        scheme["tables"]["instrument_list"] = [
            {
                "tag": i.get("tag", ""),
                "type": i.get("type") or i.get("function", ""),
                "loop": i.get("loop", ""),
                "location": i.get("location") or i.get("on_line") or i.get("on_equipment", ""),
                "range": i.get("range", ""),
                "signal": i.get("signal", ""),
            }
            for i in instruments
        ]

    # 连接上回填 stream_no（便于绘图）
    stream_map = build_stream_map(scheme)
    for conn in scheme["geometry"]["connections"]:
        cid = conn.get("id") or ""
        if conn.get("stream_no"):
            continue
        hit = stream_map.get(cid) or stream_map.get(conn.get("label", ""))
        if hit:
            conn["stream_no"] = hit.get("stream_no", "")

    return scheme


def validate_for_pfd(scheme: Dict[str, Any], strict: bool = False) -> Dict[str, Any]:
    """
    PFD 出图前校验。
    strict=True 时缺 MUST 字段返回 errors；否则仅 warnings。
    """
    errors: List[str] = []
    warnings: List[str] = []

    objects = (scheme.get("geometry") or {}).get("objects") or []
    connections = (scheme.get("geometry") or {}).get("connections") or []
    pipe_list = build_pipe_list(scheme)
    streams = scheme.get("streams") or []

    if not objects:
        errors.append("geometry.objects 为空，无法绘制 PFD")

    for obj in objects:
        if not obj.get("label") and not obj.get("id"):
            warnings.append("存在未标注位号的设备对象")

    if not connections:
        warnings.append("geometry.connections 为空，PFD 无管线")

    if not streams and strict:
        errors.append("streams 缺失（对应 VDI material_balance / 物流表）")
    elif not streams:
        warnings.append("未提供 streams，物流号将仅来自 connections.stream_no")

    if not pipe_list:
        warnings.append("管道表为空")

    for row in pipe_list:
        if not row.get("line_no"):
            warnings.append("管道表存在空管段号")
        if not row.get("stream_no") and strict:
            errors.append(f"管段 {row.get('line_no')} 缺少物流号 stream_no")

    drawing_type = (scheme.get("output_config") or {}).get("drawing_type", "").lower()
    if drawing_type not in ("pfd", "pid", "2d", "pfd2d", "drawing"):
        warnings.append(f"drawing_type={drawing_type} 非 PFD，请确认 output_config")

    return {
        "ok": len(errors) == 0,
        "errors": errors,
        "warnings": warnings,
        "pipe_list_count": len(pipe_list),
        "stream_count": len(streams),
    }


def validate_for_pid(scheme: Dict[str, Any], strict: bool = False) -> Dict[str, Any]:
    """P&ID 校验（阶段 2）"""
    base = validate_for_pfd(scheme, strict=False)
    instruments = (scheme.get("geometry") or {}).get("instruments") or scheme.get("instruments") or []
    pipe_list = build_pipe_list(scheme)

    if not instruments:
        msg = "instruments 缺失（对应 VDI control_philosophy / 仪表位号）"
        if strict:
            base["errors"].append(msg)
        else:
            base["warnings"].append(msg)

    for row in pipe_list:
        if strict and not row.get("material"):
            base["warnings"].append(f"管段 {row.get('line_no')} 缺少材质 material")
        if strict and not row.get("line_no"):
            base["errors"].append("管道表存在空管段号")

    base["instrument_count"] = len(instruments)
    base["ok"] = len(base["errors"]) == 0
    return base
