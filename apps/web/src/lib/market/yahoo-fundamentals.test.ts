import { describe, expect, it } from "vitest";

import { fundamentalsFromYahooRow } from "@powerfund/data-clients";

describe("fundamentalsFromYahooRow", () => {
  it("reads unprefixed Yahoo keys used by foreign issuers", () => {
    const row = fundamentalsFromYahooRow({
      date: "2026-06-30T00:00:00.000Z",
      totalRevenue: 1_270_381_000_000,
      operatingRevenue: 1_270_381_000_000,
      freeCashFlow: 287_363_000_000,
      capitalExpenditure: -496_002_000_000,
      totalDebt: 1_000,
      cashAndCashEquivalents: 200,
      shareIssued: 25_932_370_067,
    });

    expect(row?.revenue).toBe(1_270_381_000_000);
    expect(row?.freeCashFlow).toBe(287_363_000_000);
    expect(row?.capex).toBe(496_002_000_000);
    expect(row?.netDebt).toBe(800);
    expect(row?.sharesDiluted).toBe(25_932_370_067);
  });

  it("still reads quarterly-prefixed keys", () => {
    const row = fundamentalsFromYahooRow({
      date: "2026-04-30",
      quarterlyTotalRevenue: 100,
      quarterlyFreeCashFlow: 10,
      quarterlyCapitalExpenditure: -4,
    });

    expect(row?.periodEnd).toBe("2026-04-30");
    expect(row?.revenue).toBe(100);
    expect(row?.freeCashFlow).toBe(10);
    expect(row?.capex).toBe(4);
  });
});
