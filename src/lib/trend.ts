// lib/trend.ts
type Attempt = { correct:boolean; createdAt:string; };
export function buildRollingAccuracySeries(attempts: Attempt[], window=25) {
  const pts:{date:string; accuracy:number}[] = [];
  let c = 0, n = 0, q:boolean[] = [];
  const sorted = [...attempts].sort((a,b)=> +new Date(a.createdAt) - +new Date(b.createdAt));
  for (const a of sorted) {
    q.push(a.correct); n += 1; if (a.correct) c += 1;
    if (q.length > window) { if (q.shift()) c -= 1; n -= 1; }
    pts.push({ date: new Date(a.createdAt).toISOString().slice(0,10), accuracy: Math.round(100*c/Math.max(n,1)) });
  }
  return pts;
}
