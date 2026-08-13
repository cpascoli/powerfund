/** Neutral grey for an unknown value, so "no data" never reads as flat. */
const NEUTRAL: [number, number, number] = [154, 167, 181];
const POSITIVE: [number, number, number] = [11, 127, 117];
const NEGATIVE: [number, number, number] = [155, 44, 44];

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function mix(
  from: readonly [number, number, number],
  to: readonly [number, number, number],
  t: number,
): string {
  const [fromR, fromG, fromB] = from;
  const [toR, toG, toB] = to;
  const channel = (a: number, b: number) => Math.round(a + (b - a) * t);
  return `rgb(${channel(fromR, toR)} ${channel(fromG, toG)} ${channel(fromB, toB)})`;
}

/**
 * Maps a percentage onto the red-grey-green heat scale shared by the treemaps.
 * `scale` is the percentage at which colour saturates, so the same number reads
 * consistently everywhere it is drawn.
 */
export function colorForPct(pct: number | null, scale: number): string {
  if (pct == null || Number.isNaN(pct)) return "#9aa7b5";
  const t = clamp(pct / scale, -1, 1);
  return t >= 0 ? mix(NEUTRAL, POSITIVE, t) : mix(NEUTRAL, NEGATIVE, -t);
}
