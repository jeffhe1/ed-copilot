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
    parser = argparse.ArgumentParser(description="Ingest generated MCQs into local RAG JSONL bank")
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
    questions = payload.get("questions")
    if not isinstance(questions, list):
        raise ValueError("payload.questions must be a list")

    rag = HybridQuestionRAGPy()
    bank_path = str(args.bank)
    rag.load_local_bank(bank_path)
    ingested = rag.ingest({"version": payload.get("version"), "questions": questions})
    saved = rag.save_local_bank(bank_path)

    print(
        json.dumps(
            {
                "ingested": len(ingested),
                "saved": saved,
                "bank": bank_path,
            },
            ensure_ascii=False,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
