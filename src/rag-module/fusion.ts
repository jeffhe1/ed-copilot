type RankedHit = {
  qid: string;
  score: number;
};

export function rrfFuse(rankings: RankedHit[][], rrfK: number): RankedHit[] {
  const merged = new Map<string, number>();

  for (const list of rankings) {
    for (let i = 0; i < list.length; i++) {
      const qid = list[i].qid;
      const add = 1 / (rrfK + i + 1);
      merged.set(qid, (merged.get(qid) ?? 0) + add);
    }
  }

  return Array.from(merged.entries())
    .map(([qid, score]) => ({ qid, score }))
    .sort((a, b) => b.score - a.score);
}
