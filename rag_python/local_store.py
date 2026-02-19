from __future__ import annotations

import json
from dataclasses import asdict
from pathlib import Path
from typing import Iterable, List

from .types import QuestionDocument


def save_questions_jsonl(path: str | Path, questions: Iterable[QuestionDocument]) -> int:
    p = Path(path)
    p.parent.mkdir(parents=True, exist_ok=True)
    count = 0
    with p.open("w", encoding="utf-8") as f:
        for q in questions:
            f.write(json.dumps(asdict(q), ensure_ascii=False) + "\n")
            count += 1
    return count


def load_questions_jsonl(path: str | Path) -> List[dict]:
    p = Path(path)
    if not p.exists():
        return []
    rows: List[dict] = []
    with p.open("r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            rows.append(json.loads(line))
    return rows
