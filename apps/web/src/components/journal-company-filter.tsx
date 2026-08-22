"use client";

export type JournalCompanyOption = {
  symbol: string;
  name: string;
};

export function JournalCompanyFilter({
  companies,
  value,
  onChange,
}: {
  companies: JournalCompanyOption[];
  value: string;
  onChange: (symbol: string) => void;
}) {
  return (
    <label>
      <select
        aria-label="Filter journal by company"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">All companies</option>
        {companies.map((company) => (
          <option key={company.symbol} value={company.symbol}>
            {company.symbol} — {company.name}
          </option>
        ))}
      </select>
    </label>
  );
}
