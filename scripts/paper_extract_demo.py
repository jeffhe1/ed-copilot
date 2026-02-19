from __future__ import annotations

import argparse
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from rag_python.engine import HybridQuestionRAGPy
from rag_python.paper_extraction import PaperExtractionPipeline


def main() -> None:
    parser = argparse.ArgumentParser(description="Demo: extract questions from PDF and store to local bank")
    parser.add_argument("--pdf", required=True, help="Path to a PDF file")
    parser.add_argument(
        "--out",
        default=str(ROOT / "data" / "paper_extract_bank.jsonl"),
        help="Output local bank path (jsonl)",
    )
    args = parser.parse_args()

    pipeline = PaperExtractionPipeline()
    result = pipeline.process_pdf(args.pdf)

    print(f"document_id: {result.document_id}")
    print(f"pdf_type: {result.pdf_type}")
    print(f"questions: {len(result.questions)}")
    print(f"issues: {len(result.issues)}")
    for issue in result.issues[:10]:
        print(f"- [{issue.level}] {issue.code}: {issue.message} ({issue.question_id})")

    rag = HybridQuestionRAGPy()
    payload = pipeline.to_ingestion_payload(result)
    rag.ingest(payload)
    saved = rag.save_local_bank(args.out)
    print(f"saved_to: {args.out} ({saved} rows)")

    if result.questions:
        q = result.questions[0].stem
        resp = rag.retrieve({"text": q, "top_n": 3})
        print("sample_retrieve:")
        for r in resp.results:
            print(f"  {r.qid} rerank={r.rerank_score:.4f}")


if __name__ == "__main__":
    main()
