import { VectorIndex } from "../vector-index";
import type { ScoreHit } from "./types";

function maxMerge(a: ScoreHit[], b: ScoreHit[], topK: number): ScoreHit[] {
  const map = new Map<string, number>();
  for (const row of a) map.set(row.qid, Math.max(map.get(row.qid) ?? -1, row.score));
  for (const row of b) map.set(row.qid, Math.max(map.get(row.qid) ?? -1, row.score));
  return Array.from(map.entries())
    .map(([qid, score]) => ({ qid, score }))
    .sort((x, y) => y.score - x.score)
    .slice(0, topK);
}

export function scoreDense(
  stemIndex: VectorIndex,
  explanationIndex: VectorIndex,
  queryVector: number[],
  topK: number,
  allowedQids: Set<string>
): ScoreHit[] {
  if (!queryVector.length) return [];
  const stemRaw = stemIndex.search(queryVector, topK);
  const explanationRaw = explanationIndex.search(queryVector, topK);
  return maxMerge(stemRaw, explanationRaw, topK).filter((x) => allowedQids.has(x.qid));
}
