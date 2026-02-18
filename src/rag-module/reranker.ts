import { textToDeterministicEmbedding } from "./embedding";
import { clamp01, tokenize } from "./utils";

function tokenOverlap(a: string, b: string): number {
  const ta = new Set(tokenize(a));
  const tb = new Set(tokenize(b));
  if (!ta.size || !tb.size) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  return inter / Math.min(ta.size, tb.size);
}

export function rerankPairScore(queryText: string, docText: string, denseScore: number, dim: number): number {
  const overlap = tokenOverlap(queryText, docText);
  const qv = textToDeterministicEmbedding(queryText, dim);
  const dv = textToDeterministicEmbedding(docText, dim);
  let cos = 0;
  for (let i = 0; i < qv.length; i++) cos += qv[i] * dv[i];

  // Placeholder cross-encoder style blended scoring.
  const score = 0.5 * overlap + 0.3 * clamp01((cos + 1) / 2) + 0.2 * clamp01((denseScore + 1) / 2);
  return clamp01(score);
}
