from __future__ import annotations

from .utils import normalize_template_text, normalize_text, stable_hash


def build_exact_hash(stem: str, options: list[str], answer: str | None) -> str:
    payload = f"{normalize_text(stem)}||{'|'.join(normalize_text(x) for x in options)}||{normalize_text(answer or '')}"
    return stable_hash(payload)


def build_template_hash(stem: str) -> str:
    return stable_hash(normalize_template_text(stem))
