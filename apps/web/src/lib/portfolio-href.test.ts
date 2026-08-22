import { describe, expect, it } from "vitest";

import { applySectionTabToSearch, portfolioHref } from "./portfolio-href";

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

describe("applySectionTabToSearch", () => {
  it("drops form params and omits the default book tab", () => {
    const next = applySectionTabToSearch(
      new URLSearchParams("tab=queue&confirm=abc&stats=score"),
      "book",
    );
    expect(next.toString()).toBe("stats=score");
  });

  it("sets a non-default section without carrying a sell form", () => {
    const next = applySectionTabToSearch(
      new URLSearchParams("sell=1&chart=pnl"),
      "mandate",
    );
    expect(next.get("tab")).toBe("mandate");
    expect(next.get("sell")).toBeNull();
    expect(next.get("chart")).toBe("pnl");
  });
});
