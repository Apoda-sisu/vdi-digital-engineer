"""DEXPI Proteus XML subset export from PlantModel v1."""

import json
import os
import re
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from xml.etree.ElementTree import Element, SubElement, tostring

DEXPI_NS = "http://www.dexpi.org/PlantModel/1.4"
RDL = "http://data.posccaesar.org/rdl"

EQUIPMENT_CLASS = {
    "pump": ("CentrifugalPump", f"{RDL}/RDS416937"),
    "vessel": ("Vessel", f"{RDL}/RDS414674"),
    "tank": ("Tank", f"{RDL}/RDS414674"),
    "reactor": ("Vessel", f"{RDL}/RDS414674"),
    "column": ("Column", f"{RDL}/RDS415842"),
    "heat_exchanger": ("ShellAndTubeHeatExchanger", f"{RDL}/RDS416321"),
    "compressor": ("Compressor", f"{RDL}/RDS415842"),
    "generic": ("Equipment", f"{RDL}/RDS414674"),
}

VALVE_CLASS = {
    "gate": ("GateValve", f"{RDL}/RDS416842"),
    "ball": ("BallValve", f"{RDL}/RDS416842"),
    "check": ("CheckValve", f"{RDL}/RDS416842"),
}


def _mapping_path() -> str:
    return os.path.normpath(
        os.path.join(os.path.dirname(__file__), "..", "..", "mcp", "vdi-cad", "schemas", "cfihos-vdi-mapping.json")
    )


def load_cfihos_mapping() -> Dict[str, Any]:
    with open(_mapping_path(), encoding="utf-8") as f:
        return json.load(f)


def _dexpi_id(object_id: str, prefix: str = "obj") -> str:
    clean = re.sub(r"[^a-zA-Z0-9]", "", object_id or "")
    return f"{prefix}_{clean[:32] or 'unknown'}"


def _nozzle_id(equipment_id: str, role: str) -> str:
    return f"{_dexpi_id(equipment_id, 'eq')}_nozzle_{role}"


def _add_generic_attributes(parent: Element, attrs: Dict[str, Any], mapping: Dict[str, Any]) -> None:
    ga_list: List[Dict[str, str]] = []
    for key, val in (attrs or {}).items():
        if val is None or val == "":
            continue
        meta = mapping.get(key, {})
        entry: Dict[str, str] = {"Name": str(meta.get("dexpi") or key), "Value": str(val)}
        unit = meta.get("unit")
        if unit:
            entry["Format"] = unit
        ga_list.append(entry)
    if not ga_list:
        return
    ga_wrap = SubElement(parent, "GenericAttributes", Number=str(len(ga_list)))
    for entry in ga_list:
        SubElement(ga_wrap, "GenericAttribute", **entry)


def plant_model_to_dexpi_xml(model: Dict[str, Any], discipline: str = "PID") -> str:
    mapping = load_cfihos_mapping()
    now = datetime.now(timezone.utc)
    project_id = model.get("project_id") or "VDI-PROJECT"
    revision = model.get("revision") or "A"
    objects = model.get("objects") or []

    equipment = [o for o in objects if o.get("class") == "Equipment"]
    pipes = [o for o in objects if o.get("class") == "PipeRun"]
    instruments = [o for o in objects if o.get("class") == "Instrument"]
    valves = [o for o in objects if o.get("class") == "Valve"]
    psvs = [o for o in objects if o.get("class") == "SafetyValve"]

    root = Element("PlantModel")
    root.set("xmlns", DEXPI_NS)

    pi = SubElement(root, "PlantInformation")
    pi.set("OriginatingSystem", "PilotDeck-VDI")
    pi.set("OriginatingSystemVersion", "1.0")
    pi.set("Date", now.strftime("%Y-%m-%d"))
    pi.set("Time", now.strftime("%H:%M:%S"))
    pi.set("Is3D", "no")
    pi.set("Discipline", discipline)
    pi.set("SchemaVersion", "4.2.0")
    SubElement(pi, "UnitsOfMeasure", Distance="Millimetre", Pressure="MPa", Temperature="DegreeCelsius")
    ga_pi = SubElement(pi, "GenericAttributes", Number="2")
    SubElement(ga_pi, "GenericAttribute", Name="ProjectId", Value=project_id)
    SubElement(ga_pi, "GenericAttribute", Name="Revision", Value=revision)

    eq_map = mapping.get("mappings", {}).get("Equipment", {})
    for eq in equipment:
        attrs = eq.get("attributes") or {}
        et = str(attrs.get("equipment_type", "generic")).lower()
        cls, uri = EQUIPMENT_CLASS.get(et, EQUIPMENT_CLASS["generic"])
        el = SubElement(root, "Equipment")
        el.set("ID", _dexpi_id(eq["object_id"], "eq"))
        el.set("TagName", eq.get("tag", ""))
        el.set("ComponentClass", cls)
        el.set("ComponentClassURI", uri)
        _add_generic_attributes(el, attrs, eq_map)
        SubElement(
            el,
            "Nozzle",
            ID=_nozzle_id(eq["object_id"], "in"),
            TagName="N1",
            ComponentClass="Nozzle",
            ComponentClassURI=f"{RDL}/RDS415214",
        )
        SubElement(
            el,
            "Nozzle",
            ID=_nozzle_id(eq["object_id"], "out"),
            TagName="N2",
            ComponentClass="Nozzle",
            ComponentClassURI=f"{RDL}/RDS415214",
        )

    if pipes:
        pns = SubElement(root, "PipingNetworkSystem")
        pns.set("ID", "pns_main")
        pns.set("TagName", f"{project_id}-Piping")
        pns.set("ComponentClass", "PipingNetworkSystem")
        pns.set("ComponentClassURI", f"{RDL}/RDS270359")
        pipe_map = mapping.get("mappings", {}).get("PipeRun", {})
        for pipe in pipes:
            attrs = pipe.get("attributes") or {}
            seg = SubElement(pns, "PipingNetworkSegment")
            seg_id = _dexpi_id(pipe["object_id"], "seg")
            seg.set("ID", seg_id)
            seg.set("TagName", pipe.get("tag", ""))
            seg.set("ComponentClass", "PipingNetworkSegment")
            seg.set("ComponentClassURI", f"{RDL}/RDS267704")
            _add_generic_attributes(seg, attrs, pipe_map)
            from_tag = attrs.get("from_tag", "")
            to_tag = attrs.get("to_tag", "")
            from_eq = next((e for e in equipment if e.get("tag") == from_tag), None)
            to_eq = next((e for e in equipment if e.get("tag") == to_tag), None)
            if from_eq:
                SubElement(seg, "Connection", FromID=_nozzle_id(from_eq["object_id"], "out"), ToID=f"{seg_id}_start")
            if to_eq:
                SubElement(seg, "Connection", FromID=f"{seg_id}_end", ToID=_nozzle_id(to_eq["object_id"], "in"))

    inst_map = mapping.get("mappings", {}).get("Instrument", {})
    for inst in instruments:
        el = SubElement(root, "InstrumentationLoopFunction")
        el.set("ID", _dexpi_id(inst["object_id"], "inst"))
        el.set("TagName", inst.get("tag", ""))
        el.set("ComponentClass", "ProcessInstrumentationFunction")
        el.set("ComponentClassURI", f"{RDL}/RDS416842")
        _add_generic_attributes(el, inst.get("attributes") or {}, inst_map)

    valve_map = mapping.get("mappings", {}).get("Valve", {})
    for valve in valves:
        vt = str((valve.get("attributes") or {}).get("valve_type", "gate")).lower()
        cls, uri = VALVE_CLASS.get(vt, VALVE_CLASS["gate"])
        el = SubElement(root, "OperatedValve")
        el.set("ID", _dexpi_id(valve["object_id"], "valve"))
        el.set("TagName", valve.get("tag", ""))
        el.set("ComponentClass", cls)
        el.set("ComponentClassURI", uri)
        _add_generic_attributes(el, valve.get("attributes") or {}, valve_map)

    psv_map = mapping.get("mappings", {}).get("SafetyValve", {})
    for psv in psvs:
        el = SubElement(root, "SafetyValveOrFitting")
        el.set("ID", _dexpi_id(psv["object_id"], "psv"))
        el.set("TagName", psv.get("tag", ""))
        el.set("ComponentClass", "SafetyValve")
        el.set("ComponentClassURI", f"{RDL}/RDS416842")
        _add_generic_attributes(el, psv.get("attributes") or {}, psv_map)

    return '<?xml version="1.0" encoding="UTF-8"?>\n' + tostring(root, encoding="unicode")


def dexpi_export_summary(model: Dict[str, Any]) -> Dict[str, Any]:
    objects = model.get("objects") or []
    by_class = {}
    for o in objects:
        c = o.get("class", "")
        by_class[c] = by_class.get(c, 0) + 1
    return {
        "project_id": model.get("project_id"),
        "revision": model.get("revision"),
        "equipment": by_class.get("Equipment", 0),
        "pipe_segments": by_class.get("PipeRun", 0),
        "instruments": by_class.get("Instrument", 0),
        "valves": by_class.get("Valve", 0),
        "safety_valves": by_class.get("SafetyValve", 0),
        "format": "DEXPI-Proteus-subset-1.4",
    }
