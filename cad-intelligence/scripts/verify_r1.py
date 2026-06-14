"""R1/R2 无头验证: freecadcmd scripts/verify_r1.py

验证 1) 2D PFD（物流号+管段号+管道表+TechDraw+DXF）
     2) 3D 参数化设备建模
     3) AI plan -> scheme
"""

import functools
import json
import os
import sys
import traceback

print = functools.partial(print, flush=True)

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, ".."))
sys.path.insert(0, ROOT)

import FreeCAD as App

PASS, FAIL = [], []


def check(name, cond, detail=""):
    if cond:
        PASS.append(name)
        print(f"  [PASS] {name} {detail}")
    else:
        FAIL.append(name)
        print(f"  [FAIL] {name} {detail}")


def test_2d():
    print("\n=== 测试 1: 2D PFD (drawing2d + TechDraw) ===")
    from core.drawing_pipeline import DrawingPipeline

    with open(os.path.join(ROOT, "examples/input/example_pfd.json"), encoding="utf-8") as f:
        scheme = json.load(f)

    doc = App.newDocument("Verify2D")
    pipeline = DrawingPipeline(use_active_document=True)
    result = pipeline.apply_scheme(scheme)
    meta = result.get("metadata", {})

    check("2D 生成状态", result.get("status") == "success")
    check("2D 模式分发", meta.get("mode") == "pfd2d", f"mode={meta.get('mode')}")
    check("设备符号数", meta.get("object_count") == 3)
    check("管线数", meta.get("connection_count") == 2)
    check("管道表行数", meta.get("pipe_table_rows", 0) >= 2, f"n={meta.get('pipe_table_rows')}")
    check("物流标注数", meta.get("stream_label_count", 0) >= 2, f"n={meta.get('stream_label_count')}")
    check("设备位号标注", meta.get("equipment_label_count", 0) >= 3)

    syms = [o for o in doc.Objects if o.Name.startswith("Sym_")]
    lines = [o for o in doc.Objects if o.Name.startswith("Line_")]
    pages = [o for o in doc.Objects if o.TypeId == "TechDraw::DrawPage"]
    views = [o for o in doc.Objects if o.TypeId == "TechDraw::DrawViewPart"]
    sheets = [o for o in doc.Objects if o.Name == "PipeTable"]
    table_views = [o for o in doc.Objects if o.TypeId == "TechDraw::DrawViewSpreadsheet"]
    check("符号对象", len(syms) == 3, f"n={len(syms)}")
    check("管线对象(含箭头)", len(lines) == 2, f"n={len(lines)}")
    check("TechDraw 页", len(pages) == 1, f"n={len(pages)}")
    check("TechDraw 视图", len(views) == 1, f"n={len(views)}")
    check("管道表 Spreadsheet", len(sheets) == 1, f"n={len(sheets)}")
    check("管道表 TechDraw 视图", len(table_views) == 1, f"n={len(table_views)}")

    if pages and getattr(pages[0], "Template", None):
        tpl_path = pages[0].Template.Template
        check("GB 图框模板", "GB_A3" in str(tpl_path), os.path.basename(str(tpl_path)))
        try:
            texts = dict(pages[0].Template.EditableTexts)
            check("标题栏图号", texts.get("DrawingNumber") == "PFD-001",
                  f"DrawingNumber={texts.get('DrawingNumber')}")
        except Exception as e:
            check("标题栏图号", False, str(e))

    out_dir = os.path.join(ROOT, "output")
    os.makedirs(out_dir, exist_ok=True)
    fcstd = os.path.join(out_dir, "verify_2d_pfd.FCStd")
    doc.saveAs(fcstd)
    check("2D FCStd 保存", os.path.isfile(fcstd))

    # DXF 无头导出
    try:
        from core.export_engine import ExportEngine
        engine = ExportEngine()
        dxf = os.path.join(out_dir, "verify_2d_pfd.dxf")
        res = engine.export(doc, dxf, "DXF")
        check("DXF 导出", res.get("status") == "success" and os.path.isfile(dxf),
              res.get("error", ""))
    except Exception as e:
        check("DXF 导出", False, str(e))

    App.closeDocument(doc.Name)


def test_3d():
    print("\n=== 测试 2: 3D 参数化设备 (equipment3d) ===")
    from core.drawing_pipeline import DrawingPipeline

    types = ["pump", "tank", "heat_exchanger", "reactor", "column", "valve", "compressor", "fan"]
    objects = []
    for i, t in enumerate(types):
        objects.append({
            "id": f"EQ-{i+1:03d}",
            "type": "equipment",
            "ai_type": t,
            "label": f"{t.upper()[:1]}-{1001+i}",
            "position": {"x": i % 4 * 300, "y": i // 4 * 300, "z": 0},
            "parameters": {},
        })
    scheme = {
        "input_type": "scheme",
        "project_info": {"project_id": "VERIFY", "drawing_number": "M3D-001"},
        "geometry": {
            "objects": objects,
            "connections": [
                {"id": "C1", "from": "EQ-001", "to": "EQ-002", "parameters": {"diameter": "DN100"}},
                {"id": "C2", "from": "EQ-002", "to": "EQ-003", "parameters": {"diameter": 10}},
            ],
        },
        "output_config": {"drawing_type": "3d"},
    }

    doc = App.newDocument("Verify3D")
    pipeline = DrawingPipeline(use_active_document=True)
    result = pipeline.apply_scheme(scheme)
    meta = result.get("metadata", {})

    check("3D 生成状态", result.get("status") == "success")
    check("3D 模式分发", meta.get("mode") == "3d", f"mode={meta.get('mode')}")
    check("设备数", meta.get("object_count") == 8)
    check("管道数", meta.get("connection_count") == 2)

    solids_ok = 0
    for obj in doc.Objects:
        if hasattr(obj, "Shape") and not obj.Name.startswith("Pipe_"):
            if obj.Shape.Volume > 1.0:
                solids_ok += 1
            else:
                print(f"    体积异常: {obj.Name} V={obj.Shape.Volume:.2f}")
    check("设备实体体积>0", solids_ok == 8, f"n={solids_ok}/8")

    pipes = [o for o in doc.Objects if o.Name.startswith("Pipe_")]
    check("管道对象", len(pipes) == 2, f"n={len(pipes)}")
    if pipes:
        check("管道体积>0", all(p.Shape.Volume > 1.0 for p in pipes))

    out_dir = os.path.join(ROOT, "output")
    fcstd = os.path.join(out_dir, "verify_3d_plant.FCStd")
    doc.saveAs(fcstd)
    check("3D FCStd 保存", os.path.isfile(fcstd))
    App.closeDocument(doc.Name)


def test_ai_plan():
    print("\n=== 测试 3: AI plan -> scheme (chat_engine) ===")
    from core.chat_engine import ai_plan_to_scheme

    plan = {
        "action": "create",
        "objects": [
            {"type": "pump", "tag": "P-2001",
             "parameters": {"diameter": 50, "position": [0, 0, 0]}},
            {"type": "column", "tag": "C-2001",
             "parameters": {"diameter": 60, "height": 400, "position": [300, 0, 0]}},
        ],
        "connections": [{"from": "P-2001", "to": "C-2001", "pipe_diameter": 8}],
        "response": "测试",
    }
    s3d = ai_plan_to_scheme(plan, 1, mode="3d")
    spfd = ai_plan_to_scheme(plan, 2, mode="pfd")
    check("3d 模式标记", s3d["output_config"]["drawing_type"] == "3d")
    check("pfd 模式标记", spfd["output_config"]["drawing_type"] == "pfd")
    check("参数透传", s3d["geometry"]["objects"][1]["parameters"].get("height") == 400)
    check("位置 z 透传", "z" in s3d["geometry"]["objects"][0]["position"])

    from core.drawing_pipeline import DrawingPipeline
    doc = App.newDocument("VerifyAI")
    pipeline = DrawingPipeline(use_active_document=True)
    result = pipeline.apply_scheme(s3d)
    check("AI scheme 3D 落图", result.get("status") == "success"
          and result["metadata"]["object_count"] == 2)
    App.closeDocument(doc.Name)


def test_pid():
    print("\n=== 测试 4: 2D P&ID (drawing_pid) ===")
    from core.drawing_pipeline import DrawingPipeline

    with open(os.path.join(ROOT, "examples/input/example_pid.json"), encoding="utf-8") as f:
        scheme = json.load(f)

    doc = App.newDocument("VerifyPID")
    pipeline = DrawingPipeline(use_active_document=True)
    result = pipeline.apply_scheme(scheme)
    meta = result.get("metadata", {})

    check("P&ID 生成状态", result.get("status") == "success")
    check("P&ID 模式", meta.get("mode") == "pid2d", f"mode={meta.get('mode')}")
    check("仪表数", meta.get("instrument_count", 0) >= 4)
    check("阀门数", meta.get("valve_count", 0) >= 2)
    check("管道表行数", meta.get("pipe_table_rows", 0) >= 2)

    inst_objs = [o for o in doc.Objects if o.Name.startswith("Inst_")]
    valve_objs = [o for o in doc.Objects if o.Name.startswith("Valve_")]
    pages = [o for o in doc.Objects if o.Name == "PID_Page"]
    pipe_tbl = [o for o in doc.Objects if o.Name == "PipeTablePID"]
    inst_tbl = [o for o in doc.Objects if o.Name == "InstTable"]
    ce_tbl = [o for o in doc.Objects if o.Name == "CauseEffectTable"]

    check("仪表对象", len(inst_objs) >= 4, f"n={len(inst_objs)}")
    check("阀门对象", len(valve_objs) >= 2, f"n={len(valve_objs)}")
    check("PID TechDraw 页", len(pages) == 1)
    check("PID 管道表", len(pipe_tbl) == 1)
    check("仪表索引表", len(inst_tbl) == 1)
    check("因果图表", len(ce_tbl) == 1)

    out_dir = os.path.join(ROOT, "output")
    os.makedirs(out_dir, exist_ok=True)
    fcstd = os.path.join(out_dir, "verify_2d_pid.FCStd")
    doc.saveAs(fcstd)
    check("P&ID FCStd 保存", os.path.isfile(fcstd))

    try:
        from core.export_engine import ExportEngine
        engine = ExportEngine()
        dxf = os.path.join(out_dir, "verify_2d_pid.dxf")
        res = engine.export(doc, dxf, "DXF")
        check("P&ID DXF 导出", res.get("status") == "success" and os.path.isfile(dxf))
    except Exception as e:
        check("P&ID DXF 导出", False, str(e))

    App.closeDocument(doc.Name)


def test_layout():
    print("\n=== 测试 5: 设备布置平面图 (drawing_layout) ===")
    from core.drawing_pipeline import DrawingPipeline

    with open(os.path.join(ROOT, "examples/input/example_layout.json"), encoding="utf-8") as f:
        scheme = json.load(f)

    doc = App.newDocument("VerifyLayout")
    pipeline = DrawingPipeline(use_active_document=True)
    result = pipeline.apply_scheme(scheme)
    meta = result.get("metadata", {})

    check("布置图生成状态", result.get("status") == "success")
    check("布置图模式", meta.get("mode") == "layout2d", f"mode={meta.get('mode')}")
    check("设备数", meta.get("object_count") == 5)
    check("管道数", meta.get("connection_count") == 4)
    check("设备表行数", meta.get("equipment_table_rows", 0) >= 5)

    lay_objs = [o for o in doc.Objects if o.Name.startswith("Lay_")]
    dim_objs = [o for o in doc.Objects if o.Name.startswith("Dim")]
    pages = [o for o in doc.Objects if o.Name == "Layout_Page"]
    eq_tbl = [o for o in doc.Objects if o.Name == "EqTable"]
    grid = [o for o in doc.Objects if o.Name == "Grid"]

    check("设备轮廓对象", len(lay_objs) == 5, f"n={len(lay_objs)}")
    check("尺寸标注对象", len(dim_objs) >= 4, f"n={len(dim_objs)}")
    check("Layout TechDraw 页", len(pages) == 1)
    check("设备表 Spreadsheet", len(eq_tbl) == 1)
    check("轴网", len(grid) == 1)

    out_dir = os.path.join(ROOT, "output")
    os.makedirs(out_dir, exist_ok=True)
    fcstd = os.path.join(out_dir, "verify_layout.FCStd")
    doc.saveAs(fcstd)
    check("布置图 FCStd 保存", os.path.isfile(fcstd))
    App.closeDocument(doc.Name)


def test_isometric():
    print("\n=== 测试 6: 管道单线图 (drawing_isometric) ===")
    from core.drawing_pipeline import DrawingPipeline

    with open(os.path.join(ROOT, "examples/input/example_isometric.json"), encoding="utf-8") as f:
        scheme = json.load(f)

    doc = App.newDocument("VerifyIso")
    pipeline = DrawingPipeline(use_active_document=True)
    result = pipeline.apply_scheme(scheme)
    meta = result.get("metadata", {})

    check("单线图生成状态", result.get("status") == "success")
    check("单线图模式", meta.get("mode") == "isometric2d", f"mode={meta.get('mode')}")
    check("设备定位点", meta.get("object_count") == 5)
    check("管道段数", meta.get("connection_count") == 4)
    check("管道表行数", meta.get("iso_table_rows", 0) >= 4)

    iso_objs = [o for o in doc.Objects if o.Name.startswith("Iso_") and o.TypeId == "Part::Feature" and not o.Name.startswith("Pipe_")]
    pipe_objs = [o for o in doc.Objects if o.Name.startswith("Pipe_")]
    pages = [o for o in doc.Objects if o.Name == "Iso_Page"]
    iso_tbl = [o for o in doc.Objects if o.Name == "IsoPipeTable"]

    check("设备定位圆", len(iso_objs) >= 5, f"n={len(iso_objs)}")
    check("管道段对象", len(pipe_objs) == 4, f"n={len(pipe_objs)}")
    check("Iso TechDraw 页", len(pages) == 1)
    check("管道表 Spreadsheet", len(iso_tbl) == 1)

    out_dir = os.path.join(ROOT, "output")
    os.makedirs(out_dir, exist_ok=True)
    fcstd = os.path.join(out_dir, "verify_isometric.FCStd")
    doc.saveAs(fcstd)
    check("单线图 FCStd 保存", os.path.isfile(fcstd))
    App.closeDocument(doc.Name)


def main():
    try:
        test_2d()
    except Exception:
        traceback.print_exc()
        FAIL.append("test_2d 异常")
    try:
        test_3d()
    except Exception:
        traceback.print_exc()
        FAIL.append("test_3d 异常")
    try:
        test_ai_plan()
    except Exception:
        traceback.print_exc()
        FAIL.append("test_ai_plan 异常")
    try:
        test_pid()
    except Exception:
        traceback.print_exc()
        FAIL.append("test_pid 异常")
    try:
        test_layout()
    except Exception:
        traceback.print_exc()
        FAIL.append("test_layout 异常")
    try:
        test_isometric()
    except Exception:
        traceback.print_exc()
        FAIL.append("test_isometric 异常")

    print(f"\n==== 结果: PASS {len(PASS)} / FAIL {len(FAIL)} ====")
    if FAIL:
        print("失败项: " + ", ".join(FAIL))
        sys.exit(1)
    print("全部验证通过 (R1/R2/R3)")


main()
