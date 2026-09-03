/**
 * Vendor smoke check for point-in-time fundamentals.
 *
 * Unit tests cover the selection logic; only a live call proves that SEC
 * companyfacts still carries `filed` per fact and that a quarter comes back
 * dated by the filing that first disclosed it rather than by a later
 * comparative. Run: pnpm --filter @powerfund/worker smoke:vintages -- NVDA
 */
import { fetchSecQuarterlyFundamentals } from "@powerfund/data-clients";

async function main(): Promise<void> {
  const symbol = (process.argv[2] ?? "NVDA").toUpperCase();
  const rows = await fetchSecQuarterlyFundamentals(symbol);

  const byPeriod = new Map<string, typeof rows>();
  for (const row of rows) {
    const list = byPeriod.get(row.periodEnd) ?? [];
    list.push(row);
    byPeriod.set(row.periodEnd, list);
  }

  const restated = [...byPeriod.values()].filter((list) => list.length > 1);
  console.log(
    `[smoke:vintages] ${symbol}: ${rows.length} vintages across ${byPeriod.size} periods; ${restated.length} periods were revised after first disclosure`,
  );

  const periods = [...byPeriod.keys()].sort().reverse().slice(0, 6);
  for (const period of periods) {
    const list = (byPeriod.get(period) ?? [])
      .slice()
      .sort((a, b) => (a.filedAt ?? "").localeCompare(b.filedAt ?? ""));
    console.log(`  ${period}`);
    for (const row of list) {
      const lag =
        row.filedAt == null
          ? "no filing date"
          : `${Math.round(
              (Date.parse(row.filedAt) - Date.parse(period)) / 86_400_000,
            )}d after period end`;
      console.log(
        `     filed ${row.filedAt ?? "-"} (${lag})  revenue ${row.revenue}  fcf ${row.freeCashFlow}`,
      );
    }
  }

  const noFiling = rows.filter((row) => row.filedAt == null).length;
  if (noFiling > 0) {
    console.warn(
      `[smoke:vintages] ${noFiling} vintage(s) have no filing date and will be dated by estimate`,
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
