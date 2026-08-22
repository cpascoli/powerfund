import { describe, expect, it } from "vitest";

import { portfolioHref } from "./portfolio-href";

describe("portfolioHref", () => {
  it("omits default stats, chart, and section tab", () => {
    expect(
      portfolioHref({ stats: "book", chart: "nav", tab: "book" }),
    ).toBe("/portfolio");
  });

  it("keeps non-default panes shareable", () => {
    expect(
      portfolioHref({ stats: "score", chart: "pnl", tab: "queue" }),
    ).toBe("/portfolio?stats=score&chart=pnl&tab=queue");
  });
});
