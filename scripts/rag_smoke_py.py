from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from rag_python import EvalRecord, HybridQuestionRAGPy, QueryInput


def main() -> None:
    rag = HybridQuestionRAGPy()
    ingested = rag.ingest(
        {
            "questions": [
                {
                    "qid": "q1",
                    "stem": "Find the derivative of x^2 + 3x.",
                    "options": ["2x + 3", "x + 3", "2x", "3x"],
                    "answer": "A",
                    "explanation": "d/dx(x^2)=2x and d/dx(3x)=3",
                    "metadata": {"subject": "Mathematics", "difficulty": "easy", "year": 2024},
                },
                {
                    "qid": "q2",
                    "stem": "Differentiate x^2 + 3x with respect to x.",
                    "options": ["2x + 3", "2x", "x + 3", "3"],
                    "answer": "A",
                    "explanation": "Apply linearity of differentiation.",
                    "metadata": {"subject": "Mathematics", "difficulty": "easy", "year": 2025},
                },
                {
                    "qid": "q3",
                    "stem": "Solve 2x + 5 = 11.",
                    "options": ["x=3", "x=2", "x=8", "x=6"],
                    "answer": "A",
                    "explanation": "Subtract 5 then divide by 2.",
                    "metadata": {"subject": "Mathematics", "difficulty": "easy", "year": 2024},
                },
                {
                    "qid": "q4",
                    "stem": "Find the derivative of x^2 + 3x.",
                    "options": ["2x + 3", "x + 3", "2x", "3x"],
                    "answer": "A",
                    "explanation": "Same as q1.",
                    "metadata": {"subject": "Mathematics", "difficulty": "easy", "year": 2026},
                },
            ]
        }
    )
    print("Ingest:")
    for row in ingested:
        print(row.question.qid, row.status, row.matched_qid, row.score)

    resp = rag.retrieve(QueryInput(text="Differentiate x squared plus 3x", filters={"subject": "Mathematics"}, top_n=5))
    print("\nRetrieve:")
    for r in resp.results:
        print(r.qid, r.duplicate_class, round(r.rerank_score, 4), r.reason)

    metrics = rag.evaluate(
        [
            EvalRecord(query_qid="q1", relevant_qids=["q2"]),
            EvalRecord(query_qid="q2", relevant_qids=["q1"]),
        ]
    )
    print("\nEval:", metrics)


if __name__ == "__main__":
    main()
