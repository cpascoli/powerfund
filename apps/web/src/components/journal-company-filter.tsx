"use client";

import { useRouter } from "next/navigation";

export type JournalCompanyOption = {
  symbol: string;
  name: string;
};

export function JournalCompanyFilter({
  companies,
  value,
}: {
  companies: JournalCompanyOption[];
  value: string;
}) {
  const router = useRouter();

  return (
    <label>
      Company
      <select
        aria-label="Filter journal by company"
        value={value}
        onChange={(event) => {
          const next = event.target.value;
          router.push(
            next ? `/decisions?symbol=${encodeURIComponent(next)}` : "/decisions",
          );
        }}
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
