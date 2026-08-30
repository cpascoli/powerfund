import { describe, expect, it } from "vitest";

import { applySectionTabToSearch, parseMapColor, parseVizTab, portfolioHref } from "./portfolio-href";

describe("portfolioHref", () => {
  it("omits default stats, chart, viz, and section tab", () => {
    expect(
      portfolioHref({
        stats: "book",
        viz: "map",
        chart: "nav",
        tab: "book",
        map: "day",
      }),
    ).toBe("/portfolio");
  });

  it("keeps non-default panes shareable", () => {
    expect(
      portfolioHref({ stats: "score", chart: "pnl", tab: "queue" }),
    ).toBe("/portfolio?stats=score&chart=pnl&tab=queue");
    expect(portfolioHref({ map: "week" })).toBe("/portfolio?map=week");
    expect(portfolioHref({ viz: "nav" })).toBe("/portfolio?viz=nav");
  });
});

describe("parseVizTab", () => {
  it("defaults to the position map", () => {
    expect(parseVizTab(undefined)).toBe("map");
    expect(parseVizTab("nav")).toBe("nav");
    expect(parseVizTab("nope")).toBe("map");
  });
});

describe("parseMapColor", () => {
  it("defaults to daily change", () => {
    expect(parseMapColor(undefined)).toBe("day");
    expect(parseMapColor("pnl")).toBe("pnl");
    expect(parseMapColor("nope")).toBe("day");
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
