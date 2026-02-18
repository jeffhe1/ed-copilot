import { HybridQuestionRAG } from "../src/rag-module";

function printSection(title: string) {
  console.log(`\n=== ${title} ===`);
}

async function main() {
  const rag = new HybridQuestionRAG();

  printSection("Ingest");
  const ingested = rag.ingest({
    questions: [
      {
        qid: "q1",
        stem: "Find the derivative of x^2 + 3x.",
        options: ["2x + 3", "x + 3", "2x", "3x"],
        answer: "A",
        explanation: "Derivative rules: d/dx(x^2)=2x and d/dx(3x)=3.",
        tags: ["calculus", "derivative"],
        metadata: { subject: "Mathematics", gradeLevel: "VCE", difficulty: "easy", year: 2024 },
      },
      {
        qid: "q2",
        stem: "Differentiate x^2 + 3x with respect to x.",
        options: ["2x + 3", "2x", "x + 3", "3"],
        answer: "A",
        explanation: "Apply linearity of differentiation.",
        tags: ["calculus", "derivative"],
        metadata: { subject: "Mathematics", gradeLevel: "VCE", difficulty: "easy", year: 2025 },
      },
      {
        qid: "q3",
        stem: "Solve 2x + 5 = 11.",
        options: ["x=3", "x=2", "x=8", "x=6"],
        answer: "A",
        explanation: "Subtract 5 then divide by 2.",
        tags: ["algebra", "equation"],
        metadata: { subject: "Mathematics", gradeLevel: "VCE", difficulty: "easy", year: 2024 },
      },
      {
        qid: "q4",
        stem: "Find the derivative of x^2 + 3x.",
        options: ["2x + 3", "x + 3", "2x", "3x"],
        answer: "A",
        explanation: "Same as q1 (duplicate).",
        tags: ["calculus", "derivative"],
        metadata: { subject: "Mathematics", gradeLevel: "VCE", difficulty: "easy", year: 2026 },
      },
    ],
  });
  console.table(
    ingested.map((x) => ({
      qid: x.qid,
      dedup: x.dedup.status,
      matchedQid: x.dedup.matchedQid ?? "",
      score: x.dedup.score ?? "",
    }))
  );

  printSection("Retrieve by text");
  const retrieved = rag.retrieve({
    text: "Differentiate x squared plus 3x",
    filters: { subject: "Mathematics" },
    topN: 5,
  });
  console.log("Counts:", retrieved.counts);
  console.table(
    retrieved.results.map((r) => ({
      qid: r.qid,
      duplicateClass: r.duplicateClass,
      rerankScore: Number((r.rerankScore ?? 0).toFixed(4)),
      reason: r.reason,
    }))
  );

  printSection("Retrieve by questionId");
  const byId = rag.retrieve({ questionId: "q1", topN: 3 });
  console.table(
    byId.results.map((r) => ({
      qid: r.qid,
      rerankScore: Number((r.rerankScore ?? 0).toFixed(4)),
      duplicateClass: r.duplicateClass,
    }))
  );

  printSection("Evaluate");
  const metrics = rag.evaluate([
    { queryQid: "q1", relevantQids: ["q2"] },
    { queryQid: "q2", relevantQids: ["q1"] },
  ]);
  console.log(metrics);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
