import type { CompanyQuoteMark } from "@/lib/market/company-quote";

type Props = {
  mark: CompanyQuoteMark;
};

function formatPrice(value: number): string {
  return `$${value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function directionPhrase(mark: CompanyQuoteMark): string {
  switch (mark.direction) {
    case "up":
      return "up from the prior close";
    case "down":
      return "down from the prior close";
    case "flat":
      return "unchanged from the prior close";
    default: {
      const _exhaustive: never = mark.direction;
      return _exhaustive;
    }
  }
}

export function CompanyQuote({ mark }: Props) {
  const tone =
    mark.direction === "up" ? "is-up" : mark.direction === "down" ? "is-down" : "";
  const label = [formatPrice(mark.price), directionPhrase(mark), mark.asOfLabel]
    .filter((part): part is string => part != null && part.length > 0)
    .join(", ");

  return (
    <div className="company-quote">
      <span className={`company-quote-price ${tone}`.trim()} aria-label={label}>
        {formatPrice(mark.price)}
        {mark.asOfLabel ? (
          <span className="company-quote-when" role="tooltip">
            {mark.asOfLabel}
          </span>
        ) : null}
      </span>
      <span className="company-quote-chip">{mark.label}</span>
    </div>
  );
}
