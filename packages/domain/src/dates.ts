import { utcDay } from "./performance";

/** Latest Mon–Fri UTC date on or before `date` (YYYY-MM-DD). Ignores exchange holidays. */
export function lastWeekdayOnOrBefore(date: string): string {
  let cursor = Date.parse(`${date}T00:00:00Z`);
  if (Number.isNaN(cursor)) return date;
  for (let i = 0; i < 7; i += 1) {
    const weekday = new Date(cursor).getUTCDay();
    if (weekday !== 0 && weekday !== 6) {
      return new Date(cursor).toISOString().slice(0, 10);
    }
    cursor -= 86_400_000;
  }
  return date;
}

/** True when bars do not reach the last weekday on or before `asOf`. */
export function priceDataStale(
  through: string | null,
  asOf: string = utcDay(new Date().toISOString()),
): boolean {
  if (through == null || through === "") return true;
  return through < lastWeekdayOnOrBefore(asOf);
}
