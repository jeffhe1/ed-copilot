from __future__ import annotations

import math
from typing import Protocol

from .utils import stable_hash, tokenize


class Embedder(Protocol):
    def encode(self, text: str) -> list[float]:
        ...


class DeterministicHashEmbedder:
    def __init__(self, dim: int = 512):
        self.dim = dim

    def encode(self, text: str) -> list[float]:
        out = [0.0] * self.dim
        tokens = tokenize(text)
        if not tokens:
            return out

        for token in tokens:
            h = stable_hash(token)
            bucket = int(h[:8], 16) % self.dim
            sign = 1.0 if int(h[8:16], 16) % 2 == 0 else -1.0
            out[bucket] += sign

        norm = math.sqrt(sum(x * x for x in out))
        if norm == 0:
            return out
        return [x / norm for x in out]
