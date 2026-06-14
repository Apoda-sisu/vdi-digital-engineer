"""
参数化 3D 工艺设备建模引擎

将 AI plan / scheme 中的设备类型 + 参数转为真实比例的三维设备模型
（替代旧的"一个圆柱代表一台泵"原型）。

每台设备产出一个 Part::Feature 复合体，单位 mm。
"""

import logging
import math
from typing import Any, Dict, List, Optional, Tuple

logger = logging.getLogger(__name__)

EQUIPMENT_TYPES = (
    "pump", "valve", "vessel", "tank", "heat_exchanger", "exchanger",
    "reactor", "column", "compressor", "fan", "filter",
)


def _vec(App, x, y, z=0.0):
    return App.Vector(float(x), float(y), float(z))


def _cyl(Part, App, r, h, base=(0, 0, 0), axis=(0, 0, 1)):
    return Part.makeCylinder(
        float(r), float(h), _vec(App, *base), _vec(App, *axis)
    )


def _box(Part, App, l, w, h, base=(0, 0, 0)):
    box = Part.makeBox(float(l), float(w), float(h))
    box.translate(_vec(App, *base))
    return box


def _sphere(Part, App, r, center=(0, 0, 0)):
    return Part.makeSphere(float(r), _vec(App, *center))


def _torus(Part, App, r1, r2, center=(0, 0, 0), axis=(0, 0, 1)):
    return Part.makeTorus(
        float(r1), float(r2), _vec(App, *center), _vec(App, *axis)
    )


def _cone(Part, App, r1, r2, h, base=(0, 0, 0), axis=(0, 0, 1)):
    return Part.makeCone(
        float(r1), float(r2), float(h), _vec(App, *base), _vec(App, *axis)
    )


def _fuse_all(shapes: List[Any]) -> Any:
    result = shapes[0]
    for sh in shapes[1:]:
        result = result.fuse(sh)
    return result


# ---------------------------------------------------------------- 设备建模 --


def build_pump(Part, App, p: Dict) -> Tuple[Any, Dict]:
    """卧式离心泵: 底座 + 蜗壳 + 吸入/排出口 + 电机 + 联轴器"""
    r = float(p.get("radius") or (p.get("diameter", 40) / 2) or 20)
    shapes = [
        _box(Part, App, r * 5.5, r * 2.4, r * 0.3, base=(-r * 1.4, -r * 1.2, 0)),          # 底座
        _cyl(Part, App, r, r * 0.9, base=(0, 0, r * 0.3), axis=(0, 1, 0)),                  # 蜗壳(轴向Y)
        _cyl(Part, App, r * 0.32, r * 1.1, base=(0, 0, r * 0.3), axis=(-1, 0, 0)),          # 吸入口(轴向-X)
        _cyl(Part, App, r * 0.28, r * 1.2, base=(0, r * 0.45, r * 0.3 + r * 0.6)),          # 排出口(竖直)
        _cyl(Part, App, r * 0.18, r * 1.3, base=(0, r * 0.9, r * 0.3), axis=(0, 1, 0)),     # 联轴器轴
        _cyl(Part, App, r * 0.75, r * 2.2, base=(0, r * 2.0, r * 0.3), axis=(0, 1, 0)),     # 电机
        _box(Part, App, r * 1.6, r * 2.2, r * 0.25, base=(-r * 0.8, r * 1.9, 0.0)),         # 电机座
    ]
    # 蜗壳中心抬高
    for sh in shapes[1:]:
        sh.translate(_vec(App, 0, 0, r * 0.7))
    nozzles = {
        "suction": (-r * 1.1, 0, r * 1.0),
        "discharge": (0, r * 0.45, r * 1.0 + r * 1.8),
    }
    return _fuse_all(shapes), nozzles


def build_valve(Part, App, p: Dict) -> Tuple[Any, Dict]:
    """闸阀: 双锥体阀体 + 阀盖 + 阀杆 + 手轮"""
    r = float(p.get("radius") or (p.get("diameter", 24) / 2) or 12)
    body_l = r * 2.2
    shapes = [
        _cone(Part, App, r, r * 0.45, body_l / 2, base=(-body_l / 2, 0, 0), axis=(1, 0, 0)),
        _cone(Part, App, r, r * 0.45, body_l / 2, base=(body_l / 2, 0, 0), axis=(-1, 0, 0)),
        _cyl(Part, App, r * 0.4, r * 1.6, base=(0, 0, r * 0.3)),                            # 阀盖/阀杆套
        _cyl(Part, App, r * 0.12, r * 1.2, base=(0, 0, r * 1.7)),                           # 阀杆
        _torus(Part, App, r * 0.8, r * 0.1, center=(0, 0, r * 2.9)),                        # 手轮
    ]
    nozzles = {"in": (-body_l / 2 - r * 0.2, 0, 0), "out": (body_l / 2 + r * 0.2, 0, 0)}
    return _fuse_all(shapes), nozzles


def build_vessel(Part, App, p: Dict) -> Tuple[Any, Dict]:
    """立式容器/储罐: 筒体 + 上下封头 + 支腿 + 顶部/侧面接管"""
    r = float(p.get("radius") or (p.get("diameter", 60) / 2) or 30)
    h = float(p.get("height", r * 2.4))
    leg_h = r * 0.6
    shapes = [
        _cyl(Part, App, r, h, base=(0, 0, leg_h)),                                          # 筒体
        _sphere(Part, App, r, center=(0, 0, leg_h)),                                        # 下封头(半球)
        _sphere(Part, App, r, center=(0, 0, leg_h + h)),                                    # 上封头
        _cyl(Part, App, r * 0.15, r * 0.5, base=(0, 0, leg_h + h + r * 0.85)),              # 顶部接管
        _cyl(Part, App, r * 0.12, r * 0.5, base=(r * 0.85, 0, leg_h + h * 0.25), axis=(1, 0, 0)),  # 底侧出口
    ]
    for ang in (45, 165, 285):                                                              # 3 支腿
        x = (r * 0.8) * math.cos(math.radians(ang))
        y = (r * 0.8) * math.sin(math.radians(ang))
        shapes.append(_box(Part, App, r * 0.18, r * 0.18, leg_h + r * 0.2,
                           base=(x - r * 0.09, y - r * 0.09, 0)))
    nozzles = {
        "top": (0, 0, leg_h + h + r + r * 0.35),
        "bottom": (r * 1.35, 0, leg_h + h * 0.25),
    }
    return _fuse_all(shapes), nozzles


def build_heat_exchanger(Part, App, p: Dict) -> Tuple[Any, Dict]:
    """卧式管壳式换热器: 壳体 + 两端管箱 + 4 接管 + 双鞍座"""
    r = float(p.get("radius") or (p.get("diameter", 50) / 2) or 25)
    length = float(p.get("length") or p.get("height", r * 5))
    saddle_h = r * 0.7
    z0 = saddle_h + r
    shapes = [
        _cyl(Part, App, r, length, base=(0, 0, z0), axis=(1, 0, 0)),                        # 壳体(轴向X)
        _cyl(Part, App, r * 1.12, r * 0.7, base=(-r * 0.7, 0, z0), axis=(1, 0, 0)),         # 左管箱
        _cyl(Part, App, r * 1.12, r * 0.7, base=(length, 0, z0), axis=(1, 0, 0)),           # 右管箱
        _sphere(Part, App, r * 1.12, center=(-r * 0.7, 0, z0)),                             # 左封头
        _sphere(Part, App, r * 1.12, center=(length + r * 0.7, 0, z0)),                     # 右封头
        _cyl(Part, App, r * 0.22, r * 0.8, base=(length * 0.15, 0, z0 + r * 0.8)),          # 壳程入口
        _cyl(Part, App, r * 0.22, r * 0.8, base=(length * 0.85, 0, z0 + r * 0.8)),          # 壳程出口
        _cyl(Part, App, r * 0.2, r * 0.8, base=(-r * 0.7, 0, z0 + r * 0.9)),                # 管程入口
        _cyl(Part, App, r * 0.2, r * 0.8, base=(length + r * 0.7, 0, z0 - r * 1.9)),        # 管程出口(下)
    ]
    for x in (length * 0.2, length * 0.8):                                                  # 鞍座
        shapes.append(_box(Part, App, r * 0.5, r * 1.8, saddle_h, base=(x - r * 0.25, -r * 0.9, 0)))
    nozzles = {
        "shell_in": (length * 0.15, 0, z0 + r * 1.6),
        "shell_out": (length * 0.85, 0, z0 + r * 1.6),
        "tube_in": (-r * 0.7, 0, z0 + r * 1.7),
        "tube_out": (length + r * 0.7, 0, z0 - r * 1.9),
    }
    return _fuse_all(shapes), nozzles


def build_reactor(Part, App, p: Dict) -> Tuple[Any, Dict]:
    """搅拌反应器: 容器 + 顶部电机 + 搅拌轴 + 桨叶 + 夹套法兰"""
    r = float(p.get("radius") or (p.get("diameter", 70) / 2) or 35)
    h = float(p.get("height", r * 2))
    leg_h = r * 0.6
    z_top = leg_h + h + r
    shapes = [
        _cyl(Part, App, r, h, base=(0, 0, leg_h)),
        _sphere(Part, App, r, center=(0, 0, leg_h)),
        _sphere(Part, App, r, center=(0, 0, leg_h + h)),
        _cyl(Part, App, r * 1.05, r * 0.12, base=(0, 0, leg_h + h * 0.55)),                 # 法兰环
        _cyl(Part, App, r * 0.35, r * 0.8, base=(0, 0, z_top)),                             # 机架
        _cyl(Part, App, r * 0.45, r * 0.9, base=(0, 0, z_top + r * 0.8)),                   # 电机
        _cyl(Part, App, r * 0.08, h + r, base=(0, 0, leg_h + h * 0.15)),                    # 搅拌轴
        _box(Part, App, r * 1.2, r * 0.12, r * 0.25, base=(-r * 0.6, -r * 0.06, leg_h + h * 0.2)),  # 桨叶
    ]
    for ang in (0, 120, 240):
        x = (r * 0.85) * math.cos(math.radians(ang))
        y = (r * 0.85) * math.sin(math.radians(ang))
        shapes.append(_box(Part, App, r * 0.18, r * 0.18, leg_h + r * 0.2,
                           base=(x - r * 0.09, y - r * 0.09, 0)))
    nozzles = {
        "feed": (r * 0.6, 0, leg_h + h + r * 0.9),
        "discharge": (0, 0, leg_h - r * 0.95),
    }
    return _fuse_all(shapes), nozzles


def build_column(Part, App, p: Dict) -> Tuple[Any, Dict]:
    """精馏塔: 裙座 + 塔体 + 封头 + 多层侧接管 + 人孔"""
    r = float(p.get("radius") or (p.get("diameter", 50) / 2) or 25)
    h = float(p.get("height", r * 6))
    skirt_h = r * 1.2
    shapes = [
        _cone(Part, App, r * 1.15, r, skirt_h, base=(0, 0, 0)),                             # 裙座
        _cyl(Part, App, r, h, base=(0, 0, skirt_h)),                                        # 塔体
        _sphere(Part, App, r, center=(0, 0, skirt_h + h)),                                  # 顶封头
        _cyl(Part, App, r * 0.18, r * 0.6, base=(0, 0, skirt_h + h + r * 0.8)),             # 塔顶气相口
    ]
    for i, frac in enumerate((0.2, 0.45, 0.7, 0.9)):                                        # 侧接管
        z = skirt_h + h * frac
        shapes.append(_cyl(Part, App, r * 0.12, r * 0.55, base=(r * 0.9, 0, z), axis=(1, 0, 0)))
    shapes.append(_cyl(Part, App, r * 0.3, r * 0.4, base=(0, -r * 0.95, skirt_h + h * 0.55), axis=(0, -1, 0)))  # 人孔
    nozzles = {
        "overhead": (0, 0, skirt_h + h + r + r * 0.4),
        "feed": (r * 1.45, 0, skirt_h + h * 0.45),
        "bottom": (r * 1.45, 0, skirt_h + h * 0.2),
    }
    return _fuse_all(shapes), nozzles


def build_compressor(Part, App, p: Dict) -> Tuple[Any, Dict]:
    """压缩机组: 底座 + 缸体 + 电机 + 进出口"""
    r = float(p.get("radius") or (p.get("diameter", 50) / 2) or 25)
    shapes = [
        _box(Part, App, r * 5, r * 2.6, r * 0.35, base=(-r * 1.3, -r * 1.3, 0)),
        _box(Part, App, r * 1.8, r * 1.8, r * 1.6, base=(-r * 0.9, -r * 0.9, r * 0.35)),    # 缸体
        _cyl(Part, App, r * 0.8, r * 2.2, base=(r * 0.9, 0, r * 1.1), axis=(1, 0, 0)),      # 电机
        _cyl(Part, App, r * 0.25, r * 0.9, base=(-r * 0.45, 0, r * 1.95)),                  # 出口
        _cyl(Part, App, r * 0.3, r * 0.9, base=(0, -r * 0.9, r * 1.1), axis=(0, -1, 0)),    # 入口
    ]
    nozzles = {"in": (0, -r * 1.8, r * 1.1), "out": (-r * 0.45, 0, r * 2.85)}
    return _fuse_all(shapes), nozzles


def build_fan(Part, App, p: Dict) -> Tuple[Any, Dict]:
    """离心风机: 蜗壳 + 进风口 + 出风口 + 电机"""
    r = float(p.get("radius") or (p.get("diameter", 50) / 2) or 25)
    shapes = [
        _cyl(Part, App, r, r * 0.8, base=(0, 0, r), axis=(0, 1, 0)),                        # 蜗壳
        _cyl(Part, App, r * 0.45, r * 0.6, base=(0, -r * 0.6, r), axis=(0, -1, 0)),         # 进风口
        _box(Part, App, r * 0.7, r * 0.8, r * 0.9, base=(r * 0.55, 0, r * 1.0)),            # 出风口
        _cyl(Part, App, r * 0.5, r * 1.4, base=(0, r * 0.8, r), axis=(0, 1, 0)),            # 电机
        _box(Part, App, r * 2.6, r * 2.6, r * 0.25, base=(-r * 1.3, -r * 0.8, 0)),          # 底座
    ]
    nozzles = {"in": (0, -r * 1.2, r), "out": (r * 1.25, r * 0.4, r * 1.45)}
    return _fuse_all(shapes), nozzles


BUILDERS = {
    "pump": build_pump,
    "valve": build_valve,
    "vessel": build_vessel,
    "tank": build_vessel,
    "heat_exchanger": build_heat_exchanger,
    "exchanger": build_heat_exchanger,
    "reactor": build_reactor,
    "column": build_column,
    "compressor": build_compressor,
    "fan": build_fan,
}


# -------------------------------------------------------------- 管道布线 --


def _pipe_between(Part, App, p1, p2, radius):
    """两点间直管段"""
    v1 = _vec(App, *p1)
    v2 = _vec(App, *p2)
    direction = v2.sub(v1)
    length = direction.Length
    if length < 0.5:
        return None
    return Part.makeCylinder(float(radius), length, v1, direction)


def build_pipe_run(Part, App, start, end, radius=4.0) -> Optional[Any]:
    """曼哈顿(正交)管道: 水平 X → 水平 Y → 垂直 Z，弯头处加球"""
    x1, y1, z1 = start
    x2, y2, z2 = end
    waypoints = [
        (x1, y1, z1),
        (x2, y1, z1),
        (x2, y2, z1),
        (x2, y2, z2),
    ]
    # 去除重复点
    pts = [waypoints[0]]
    for wp in waypoints[1:]:
        if wp != pts[-1]:
            pts.append(wp)
    if len(pts) < 2:
        return None

    segments = []
    for a, b in zip(pts, pts[1:]):
        seg = _pipe_between(Part, App, a, b, radius)
        if seg:
            segments.append(seg)
    for corner in pts[1:-1]:
        segments.append(_sphere(Part, App, radius * 1.25, center=corner))
    if not segments:
        return None
    return _fuse_all(segments)


def _parse_diameter(value, default: float = 8.0) -> float:
    """兼容 'DN100' / '100' / 100 等管径写法（DN 折算为 mm 后再缩小到模型比例）"""
    if isinstance(value, (int, float)):
        return float(value)
    digits = "".join(c for c in str(value) if c.isdigit() or c == ".")
    if not digits:
        return default
    num = float(digits)
    # DN 公称直径通常 >= 25，按 1:10 缩小到模型比例
    return num / 10 if num >= 25 else num


# ------------------------------------------------------------ 场景级构建 --


def build_plant3d(doc, scheme: Dict[str, Any]) -> Dict[str, Any]:
    """scheme JSON -> 3D 工厂模型（设备 + 正交管道）"""
    import FreeCAD as App
    import Part

    geometry = scheme.get("geometry", {})
    objects = geometry.get("objects", [])
    connections = geometry.get("connections", [])

    created = {}
    nozzle_map = {}
    pos_map = {}

    for i, obj in enumerate(objects):
        etype = (obj.get("ai_type") or obj.get("type") or "vessel").lower()
        if etype == "equipment":
            etype = (obj.get("ai_type") or "vessel").lower()
        builder = BUILDERS.get(etype, build_vessel)

        params = dict(obj.get("parameters") or {})
        label = obj.get("label") or obj.get("id") or f"EQ-{i+1:03d}"
        pos = obj.get("position") or {}
        px = float(pos.get("x", 100 + i * 150))
        py = float(pos.get("y", 0))
        pz = float(pos.get("z", 0))
        rotation = obj.get("rotation", 0) or 0

        try:
            shape, nozzles = builder(Part, App, params)
        except Exception as e:
            logger.warning(f"设备建模失败 {label}({etype}): {e}，使用默认容器")
            shape, nozzles = build_vessel(Part, App, {})

        safe = "".join(c if c.isalnum() or c in "_-" else "_" for c in str(label)) or f"EQ{i}"
        fc = doc.addObject("Part::Feature", safe)
        fc.Label = str(label)
        fc.Shape = shape
        fc.Placement = App.Placement(
            App.Vector(px, py, pz),
            App.Rotation(App.Vector(0, 0, 1), float(rotation)),
        )

        obj_id = obj.get("id") or label
        created[obj_id] = fc
        created[label] = fc
        pos_map[obj_id] = (px, py, pz)
        pos_map[label] = (px, py, pz)
        nozzle_map[obj_id] = {
            k: (v[0] + px, v[1] + py, v[2] + pz) for k, v in nozzles.items()
        }
        nozzle_map[label] = nozzle_map[obj_id]

    pipe_count = 0
    for j, conn in enumerate(connections):
        from_key = conn.get("from", "")
        to_key = conn.get("to", "")
        if from_key not in nozzle_map or to_key not in nozzle_map:
            continue
        src_nozzles = nozzle_map[from_key]
        dst_nozzles = nozzle_map[to_key]
        # 出口优先级: discharge/out/shell_out/overhead > 任意
        start = (
            src_nozzles.get("discharge") or src_nozzles.get("out")
            or src_nozzles.get("shell_out") or src_nozzles.get("overhead")
            or next(iter(src_nozzles.values()))
        )
        end = (
            dst_nozzles.get("suction") or dst_nozzles.get("in")
            or dst_nozzles.get("shell_in") or dst_nozzles.get("feed")
            or next(iter(dst_nozzles.values()))
        )
        diameter = _parse_diameter((conn.get("parameters") or {}).get("diameter", 8))
        pipe = build_pipe_run(Part, App, start, end, radius=max(diameter / 2, 2))
        if pipe is None:
            continue
        label = conn.get("label") or conn.get("id") or f"PIPE-{j+1:03d}"
        safe = "".join(c if c.isalnum() or c in "_-" else "_" for c in str(label))
        fc = doc.addObject("Part::Feature", f"Pipe_{safe}")
        fc.Label = str(label)
        fc.Shape = pipe
        pipe_count += 1

    doc.recompute()
    return {
        "status": "success",
        "output_type": "3d_model",
        "metadata": {
            "object_count": len(objects),
            "connection_count": pipe_count,
            "mode": "3d",
        },
    }
