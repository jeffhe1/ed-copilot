from __future__ import annotations

import re


def parse_questions_from_plain_text(content: str) -> list[dict]:
    text = content.replace("\r", "").strip()
    if not text:
        return []
    boundary = re.compile(r"(?:^|\n)\s*(?:question\s*\d+[\).:]|\d+[\).:])\s+", re.IGNORECASE)
    chunks = [c.strip() for c in boundary.split(text) if c.strip()]
    if len(chunks) == 1:
        chunks = [text]

    out: list[dict] = []
    for idx, chunk in enumerate(chunks, 1):
        answer_m = re.search(r"\banswer\s*[:\-]\s*([A-D])\b", chunk, re.IGNORECASE)
        expl_m = re.search(r"\bexplanation\s*[:\-]\s*([\s\S]*)$", chunk, re.IGNORECASE)
        stem = re.split(r"\n\s*[A-D][).:\-]\s+", chunk, maxsplit=1, flags=re.IGNORECASE)[0].strip()
        options = []
        for line in chunk.split("\n"):
            m = re.match(r"^\s*[A-D][).:\-]\s*(.+)$", line.strip(), re.IGNORECASE)
            if m:
                options.append(m.group(1).strip())
        if stem:
            out.append(
                {
                    "stem": stem,
                    "options": options,
                    "answer": answer_m.group(1).upper() if answer_m else None,
                    "explanation": expl_m.group(1).strip() if expl_m else None,
                    "source_question_no": idx,
                }
            )
    return out


def parse_questions_from_file(file_row: dict) -> list[dict]:
    return parse_questions_from_plain_text(str(file_row.get("content", "")))
