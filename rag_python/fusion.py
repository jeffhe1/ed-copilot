from __future__ import annotations


def rrf_fuse(rankings: list[list[dict]], rrf_k: int) -> list[dict]:
    merged: dict[str, float] = {}
    for rows in rankings:
        for i, row in enumerate(rows):
            merged[row["qid"]] = merged.get(row["qid"], 0.0) + 1.0 / (rrf_k + i + 1)
    out = [{"qid": qid, "score": score} for qid, score in merged.items()]
    out.sort(key=lambda x: x["score"], reverse=True)
    return out
