import { VectorIndex } from "../vector-index";
import type { ScoreHit } from "./types";

function remapImageHits(
  hits: ScoreHit[],
  imageOwner: Map<string, string>,
  allowedQids: Set<string>
): ScoreHit[] {
  const byQuestion = new Map<string, number>();
  for (const hit of hits) {
    const qid = imageOwner.get(hit.qid);
    if (!qid || !allowedQids.has(qid)) continue;
    byQuestion.set(qid, Math.max(byQuestion.get(qid) ?? -1, hit.score));
  }
  return Array.from(byQuestion.entries())
    .map(([qid, score]) => ({ qid, score }))
    .sort((a, b) => b.score - a.score);
}

export function scoreImage(
  imageIndex: VectorIndex,
  imageOwner: Map<string, string>,
  imageVector: number[] | undefined,
  topK: number,
  allowedQids: Set<string>
): ScoreHit[] {
  if (!imageVector?.length) return [];
  const imageRaw = imageIndex.search(imageVector, topK);
  return remapImageHits(imageRaw, imageOwner, allowedQids);
}
