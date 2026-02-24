from __future__ import annotations

import argparse
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from rag_python.engine import HybridQuestionRAGPy


def main() -> int:
    parser = argparse.ArgumentParser(description="Search local RAG question bank")
    parser.add_argument(
        "--bank",
        default=str(ROOT / "data" / "paper_extract_bank.jsonl"),
        help="Path to local bank jsonl",
    )
    args = parser.parse_args()

    raw = sys.stdin.read().strip()
    if not raw:
        raise ValueError("stdin payload is empty")

    payload = json.loads(raw)
    query = str(payload.get("query") or "").strip()
    top_n = int(payload.get("top_n") or 10)
    if not query:
        raise ValueError("query is required")

    rag = HybridQuestionRAGPy()
    bank_path = str(args.bank)
    loaded = rag.load_local_bank(bank_path)
    if loaded <= 0:
        print(json.dumps({"results": [], "counts": {"loaded": 0}}, ensure_ascii=True))
        return 0

    resp = rag.retrieve({"text": query, "top_n": top_n})
    out = []
    for row in resp.results:
        graph = None
        if isinstance(row.question.metadata, dict):
            graph = row.question.metadata.get("graph")

        out.append(
            {
                "qid": row.qid,
                "score": row.score,
                "confidence": row.rerank_score,
                "duplicate_class": row.duplicate_class,
                "reason": row.reason,
                "question": {
                    "stem": row.question.stem,
                    "options": row.question.options,
                    "answer": row.question.answer,
                    "explanation": row.question.explanation,
                    "graph": graph,
                    "images": [
                        {
                            "imageId": img.image_id,
                            "path": img.path,
                            "ocrText": img.ocr_text,
                            "caption": img.caption,
                        }
                        for img in (row.question.images or [])
                    ],
                    "metadata": row.question.metadata,
                },
            }
        )

    print(
        json.dumps(
            {
                "took_ms": resp.took_ms,
                "counts": {"loaded": loaded, **resp.counts},
                "results": out,
            },
            ensure_ascii=True,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
