#!/usr/bin/env python3
"""构建 VDI 知识检索索引（JSON，供 MCP 服务加载）。源文件位于 KNOWLEDGE_SRC 目录。"""

from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from pathlib import Path

try:
    import yaml
except ImportError as exc:
    raise SystemExit("需要 PyYAML: pip install PyYAML") from exc

ROOT = Path(__file__).resolve().parents[2]
# 知识源文件目录（YAML/JSON），重建索引前请确认此路径下有数据
KNOWLEDGE_SRC = ROOT / "pilotdeck-vdi" / "data" / "knowledge-src"
OUT_DIR = Path(__file__).resolve().parents[1] / "data"
OUT_FILE = OUT_DIR / "knowledge-clauses.json"

WATER_STANDARDS = {
    "GB 50015-2019",
    "GB 50013-2018",
    "GB 50014-2021",
    "GB 50974-2014",
    "GB 50084-2017",
    "GB 50050-2017",
    "GB 18918-2002",
    "SH/T 3015-2019",
}


def _tokenize(text: str) -> list[str]:
    return re.findall(r"[\u4e00-\u9fff\w]+", text.lower())


def _load_yaml(path: Path) -> dict:
    with path.open("r", encoding="utf-8") as f:
        data = yaml.safe_load(f)
    return data if isinstance(data, dict) else {}


def _source_type_from_path(rel: str) -> str:
    if rel.startswith("laws/"):
        return "standard"
    if rel.startswith("standards/"):
        return "standard"
    if rel.startswith("cases/"):
        return "case"
    if rel.startswith("company/"):
        return "rule"
    return "standard"


def _iter_knowledge_files() -> list[Path]:
    files: list[Path] = []
    for pattern in ("**/*.yaml", "**/*.yml"):
        files.extend(KNOWLEDGE_SRC.glob(pattern))
    return sorted({p for p in files if p.name != "index.yaml"})


def build_index() -> dict:
    clauses: list[dict] = []
    for path in _iter_knowledge_files():
        rel = str(path.relative_to(KNOWLEDGE_SRC))
        data = _load_yaml(path)
        source_ref = str(data.get("source_ref") or path.stem)
        version = str(data.get("version") or "")
        effective_date = str(data.get("effective_date") or "")
        discipline = str(data.get("discipline") or "")
        source_type = _source_type_from_path(rel)

        for article in data.get("articles") or []:
            if not isinstance(article, dict):
                continue
            clause_id = str(article.get("id") or "")
            content = str(article.get("content") or "").strip()
            if not content:
                continue
            keywords = article.get("keywords") or []
            if not isinstance(keywords, list):
                keywords = []
            clauses.append(
                {
                    "source_type": source_type,
                    "source_id": source_ref,
                    "version": version,
                    "effective_date": effective_date,
                    "discipline": discipline,
                    "clause": clause_id,
                    "content": content,
                    "keywords": [str(k) for k in keywords],
                    "file": rel,
                    "tokens": _tokenize(
                        f"{source_ref} {clause_id} {content} {' '.join(keywords)}"
                    ),
                }
            )

    water_clauses = [c for c in clauses if c["source_id"] in WATER_STANDARDS or c["discipline"] == "water"]
    return {
        "schema_version": 1,
        "built_at": datetime.now(timezone.utc).isoformat(),
        "knowledge_root": str(KNOWLEDGE_SRC),
        "stats": {
            "total_clauses": len(clauses),
            "water_clauses": len(water_clauses),
            "files_scanned": len(_iter_knowledge_files()),
        },
        "clauses": clauses,
    }


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    index = build_index()
    OUT_FILE.write_text(json.dumps(index, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Wrote {OUT_FILE}")
    print(json.dumps(index["stats"], ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
