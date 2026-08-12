import type { PriceReturn } from "@/lib/market/returns";

type PriceReturnsRowProps = {
  returns: PriceReturn[];
};

function formatPct(value: number | null): string {
  if (value == null || Number.isNaN(value)) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}%`;
}

function toneClass(value: number | null): string {
  if (value == null || Number.isNaN(value) || value === 0) return "";
  return value > 0 ? "is-up" : "is-down";
}

export function PriceReturnsRow({ returns }: PriceReturnsRowProps) {
  return (
    <section className="return-row" aria-label="Price returns">
      {returns.map((row) => (
        <div className="return-stat" key={row.key}>
          <span>{row.label}</span>
          <strong className={toneClass(row.pct)}>{formatPct(row.pct)}</strong>
        </div>
      ))}
    </section>
  );
}
