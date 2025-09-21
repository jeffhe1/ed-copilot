// lib/stats.ts

/**
 * Compute Wilson score interval for a binomial proportion.
 * @param c number of successes
 * @param n number of trials
 * @param z z-score (default 1.96 ≈ 95% confidence)
 */
export function wilson(c: number, n: number, z = 1.96) {
  if (n === 0) return { low: 0, high: 1, p: 0 };

  const phat = c / n;
  const denom = 1 + (z ** 2) / n;
  const centre = phat + (z ** 2) / (2 * n);
  const adj = z * Math.sqrt((phat * (1 - phat) + (z ** 2) / (4 * n)) / n);

  const low = (centre - adj) / denom;
  const high = (centre + adj) / denom;

  return {
    low: Math.max(0, low),
    high: Math.min(1, high),
    p: phat,
  };
}
