import { rrfFuse } from "../fusion";
import type { RAGConfig } from "../types";
import type { ScoreHit } from "./types";

function normalizeScoresByMax(rows: ScoreHit[]): Map<string, number> {
  const out = new Map<string, number>();
  if (!rows.length) return out;
  const maxScore = Math.max(...rows.map((r) => r.score));
  if (maxScore <= 0) return out;
  for (const row of rows) out.set(row.qid, row.score / maxScore);
  return out;
}

export function fuseHybridScores(
  bm25Hits: ScoreHit[],
  denseHits: ScoreHit[],
  imageHits: ScoreHit[],
  config: Pick<RAGConfig, "rrfK" | "sparseWeight" | "denseWeight" | "imageWeight" | "rrfWeight">
): ScoreHit[] {
  const bm25Norm = normalizeScoresByMax(bm25Hits);
  const denseNorm = normalizeScoresByMax(denseHits);
  const imageNorm = normalizeScoresByMax(imageHits);

  const rrf = rrfFuse([bm25Hits, denseHits, imageHits], config.rrfK);
  const rrfNorm = normalizeScoresByMax(rrf);

  const allQids = new Set<string>();
  for (const row of bm25Hits) allQids.add(row.qid);
  for (const row of denseHits) allQids.add(row.qid);
  for (const row of imageHits) allQids.add(row.qid);
  for (const row of rrf) allQids.add(row.qid);

  const out: ScoreHit[] = [];
  for (const qid of allQids) {
    const score =
      config.sparseWeight * (bm25Norm.get(qid) ?? 0) +
      config.denseWeight * (denseNorm.get(qid) ?? 0) +
      config.imageWeight * (imageNorm.get(qid) ?? 0) +
      config.rrfWeight * (rrfNorm.get(qid) ?? 0);

    if (score > 0) out.push({ qid, score });
  }

  out.sort((a, b) => b.score - a.score);
  return out;
}
