from __future__ import annotations

import random
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from rag_python import HybridQuestionRAGPy, QueryInput


def make_questions(n: int) -> list[dict]:
    subjects = [
        ("Mathematics", "Algebra"),
        ("Mathematics", "Calculus"),
        ("Physics", "Mechanics"),
        ("Chemistry", "Stoichiometry"),
        ("Biology", "Genetics"),
    ]
    questions: list[dict] = []
    for i in range(1, n + 1):
        subject, topic = subjects[(i - 1) % len(subjects)]
        a = (i % 17) + 2
        b = (i % 13) + 3
        c = a + b
        difficulty = ["easy", "medium", "hard"][i % 3]
        stem = f"[{topic}] Question {i}: If a={a} and b={b}, what is a+b?"
        options = [str(c), str(c + 1), str(c - 1), str(a * b)]
        questions.append(
            {
                "qid": f"demo_q_{i:05d}",
                "stem": stem,
                "options": options,
                "answer": "A",
                "explanation": f"Direct substitution gives {a}+{b}={c}.",
                "tags": [subject.lower(), topic.lower()],
                "metadata": {
                    "subject": subject,
                    "topic": topic,
                    "gradeLevel": "demo",
                    "difficulty": difficulty,
                    "year": 2024 + (i % 3),
                    "questionType": "MCQ",
                    "examBoard": "DEMO",
                },
            }
        )

    random.shuffle(questions)
    return questions


def main() -> None:
    size = 1000
    out_path = ROOT / "data" / "rag_demo_bank.jsonl"

    rag = HybridQuestionRAGPy()
    questions = make_questions(size)
    ingested = rag.ingest({"questions": questions})
    saved = rag.save_local_bank(str(out_path))

    print(f"Generated: {len(questions)}")
    print(f"Ingested (new/near/exact tracked): {len(ingested)}")
    print(f"Saved local bank: {saved} -> {out_path}")

    rag2 = HybridQuestionRAGPy()
    loaded = rag2.load_local_bank(str(out_path))
    print(f"Loaded from local bank: {loaded}")

    resp = rag2.retrieve(
        QueryInput(
            text="algebra question if a and b then what is a plus b",
            filters={"subject": "Mathematics"},
            top_n=5,
        )
    )
    print("Top-5 sample:")
    for r in resp.results:
        print(r.qid, round(r.rerank_score, 4), r.question.metadata.get("topic"))


if __name__ == "__main__":
    main()
