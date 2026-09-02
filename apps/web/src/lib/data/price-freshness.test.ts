import { describe, expect, it } from "vitest";
import {
  lastCompletedCashSession,
  lastWeekdayOnOrBefore,
  priceDataStale,
} from "@powerfund/domain";

import { freshnessPayload } from "./price-freshness";

describe("lastWeekdayOnOrBefore", () => {
  it("returns Friday when the calendar date is Saturday", () => {
    expect(lastWeekdayOnOrBefore("2026-08-22")).toBe("2026-08-21");
  });

  it("returns Friday when the calendar date is Sunday", () => {
    expect(lastWeekdayOnOrBefore("2026-08-23")).toBe("2026-08-21");
  });

  it("keeps a weekday", () => {
    expect(lastWeekdayOnOrBefore("2026-08-21")).toBe("2026-08-21");
  });
});

describe("lastCompletedCashSession", () => {
  it("uses the prior weekday before the New York cash close", () => {
    expect(lastCompletedCashSession("2026-09-02T03:42:00.000Z")).toBe(
      "2026-09-01",
    );
    expect(lastCompletedCashSession("2026-09-02T19:59:00.000Z")).toBe(
      "2026-09-01",
    );
  });

  it("uses today's New York date once the cash session has closed", () => {
    expect(lastCompletedCashSession("2026-09-02T20:00:00.000Z")).toBe(
      "2026-09-02",
    );
  });

  it("treats a date-only asOf as the last weekday on or before that day", () => {
    expect(lastCompletedCashSession("2026-09-02")).toBe("2026-09-02");
    expect(lastCompletedCashSession("2026-08-22")).toBe("2026-08-21");
  });
});

describe("priceDataStale", () => {
  it("is stale when bars stop before the last weekday", () => {
    expect(priceDataStale("2026-08-19", "2026-08-22")).toBe(true);
  });

  it("is current when bars reach that weekday", () => {
    expect(priceDataStale("2026-08-21", "2026-08-22")).toBe(false);
  });

  it("is stale when there is no through date", () => {
    expect(priceDataStale(null, "2026-08-21")).toBe(true);
  });

  it("is current when the latest bar is yesterday and today's cash session has not closed", () => {
    expect(priceDataStale("2026-09-01", "2026-09-02T03:42:00.000Z")).toBe(false);
  });

  it("is stale after the cash close if today's bar is missing", () => {
    expect(priceDataStale("2026-09-01", "2026-09-02T20:00:00.000Z")).toBe(true);
  });
});

describe("freshnessPayload", () => {
  it("separates the last bar date from the response clock", () => {
    expect(freshnessPayload("2026-08-19", "2026-08-22T15:00:00.000Z")).toEqual({
      price_data_through: "2026-08-19",
      price_data_stale: true,
    });
    expect(freshnessPayload("2026-08-21", "2026-08-22T15:00:00.000Z")).toEqual({
      price_data_through: "2026-08-21",
      price_data_stale: false,
    });
  });

  it("does not treat a completed prior session as stale before the next cash open", () => {
    expect(freshnessPayload("2026-09-01", "2026-09-02T03:42:00.000Z")).toEqual({
      price_data_through: "2026-09-01",
      price_data_stale: false,
    });
  });

  it("judges a historical window against that window's end, not today", () => {
    expect(freshnessPayload("2026-08-19", "2026-08-19")).toEqual({
      price_data_through: "2026-08-19",
      price_data_stale: false,
    });
  });
});
