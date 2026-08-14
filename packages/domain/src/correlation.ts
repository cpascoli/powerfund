export type PricePoint = {
  date: string;
  close: number;
};

export type CorrelationPair = {
  a: string;
  b: string;
  observations: number;
  correlation: number | null;
};

function logReturns(points: PricePoint[]): Array<{ date: string; ret: number }> {
  const out: Array<{ date: string; ret: number }> = [];
  for (let i = 1; i < points.length; i += 1) {
    const prev = points[i - 1]!;
    const next = points[i]!;
    if (prev.close <= 0 || next.close <= 0) continue;
    out.push({ date: next.date, ret: Math.log(next.close / prev.close) });
  }
  return out;
}

function pearson(xs: number[], ys: number[]): number | null {
  const n = xs.length;
  if (n < 20) return null;
  let sumX = 0;
  let sumY = 0;
  for (let i = 0; i < n; i += 1) {
    sumX += xs[i]!;
    sumY += ys[i]!;
  }
  const meanX = sumX / n;
  const meanY = sumY / n;
  let num = 0;
  let denX = 0;
  let denY = 0;
  for (let i = 0; i < n; i += 1) {
    const dx = xs[i]! - meanX;
    const dy = ys[i]! - meanY;
    num += dx * dy;
    denX += dx * dx;
    denY += dy * dy;
  }
  if (denX === 0 || denY === 0) return null;
  return num / Math.sqrt(denX * denY);
}

/** Pairwise Pearson of overlapping log-returns. Null when < 20 shared days. */
export function pairwiseCorrelations(
  series: Array<{ symbol: string; points: PricePoint[] }>,
): CorrelationPair[] {
  const returns = series.map((row) => ({
    symbol: row.symbol,
    byDate: new Map(logReturns(row.points).map((item) => [item.date, item.ret])),
  }));

  const pairs: CorrelationPair[] = [];
  for (let i = 0; i < returns.length; i += 1) {
    for (let j = i + 1; j < returns.length; j += 1) {
      const left = returns[i]!;
      const right = returns[j]!;
      const xs: number[] = [];
      const ys: number[] = [];
      for (const [date, ret] of left.byDate) {
        const other = right.byDate.get(date);
        if (other == null) continue;
        xs.push(ret);
        ys.push(other);
      }
      pairs.push({
        a: left.symbol,
        b: right.symbol,
        observations: xs.length,
        correlation: pearson(xs, ys),
      });
    }
  }
  return pairs;
}
