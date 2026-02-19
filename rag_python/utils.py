from __future__ import annotations

import math
import re


def normalize_text(text: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9\s]", " ", text.lower())).strip()


def normalize_template_text(text: str) -> str:
    return re.sub(r"\b\d+(\.\d+)?\b", "<num>", normalize_text(text))


def tokenize(text: str) -> list[str]:
    t = normalize_text(text)
    return [x for x in t.split(" ") if x] if t else []


def stable_hash(text: str) -> str:
    h1 = 0xDEADBEEF
    h2 = 0x41C6CE57
    for ch in text:
        c = ord(ch)
        h1 = ((h1 ^ c) * 2654435761) & 0xFFFFFFFF
        h2 = ((h2 ^ c) * 1597334677) & 0xFFFFFFFF
    h1 = (((h1 ^ (h1 >> 16)) * 2246822507) ^ ((h2 ^ (h2 >> 13)) * 3266489909)) & 0xFFFFFFFF
    h2 = (((h2 ^ (h2 >> 16)) * 2246822507) ^ ((h1 ^ (h1 >> 13)) * 3266489909)) & 0xFFFFFFFF
    return f"{h2:08x}{h1:08x}"


def clamp01(x: float) -> float:
    return max(0.0, min(1.0, x))


def cosine_similarity(a: list[float], b: list[float]) -> float:
    if not a or not b or len(a) != len(b):
        return 0.0
    dot = sum(x * y for x, y in zip(a, b))
    na = math.sqrt(sum(x * x for x in a))
    nb = math.sqrt(sum(y * y for y in b))
    if na == 0 or nb == 0:
        return 0.0
    return dot / (na * nb)
