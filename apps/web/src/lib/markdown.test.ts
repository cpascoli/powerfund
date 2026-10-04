import { createElement, Fragment } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { headingId, renderMarkdown } from "./markdown";

const html = (markdown: string) =>
  renderToStaticMarkup(createElement(Fragment, null, renderMarkdown(markdown)));

describe("renderMarkdown", () => {
  it("gives headings GitHub-style ids, so in-page links land", () => {
    const out = html(
      "# Title\n\nSee the [gate](#historical-review-gate).\n\n## Historical review gate\n\n### 8. Dossier / data-integrity gate",
    );
    expect(out).toContain('<h2 id="historical-review-gate">');
    expect(out).toContain('<a href="#historical-review-gate">gate</a>');
    expect(out).toContain('<h3 id="8-dossier--data-integrity-gate">');
  });

  it("disambiguates repeated headings the way GitHub does", () => {
    const out = html("## Steps\n\n## Steps");
    expect(out).toContain('id="steps"');
    expect(out).toContain('id="steps-1"');
  });

  it("renders fenced code verbatim instead of folding it into a paragraph", () => {
    const out = html("Fetch:\n\n```bash\n# last five reviews\ncurl -s \"$ORIGIN/x?a=1&b=2\"\n```\n\nAfter.");
    expect(out).toContain("<pre><code># last five reviews\ncurl -s &quot;$ORIGIN/x?a=1&amp;b=2&quot;</code></pre>");
    expect(out).toContain("<p>After.</p>");
    // A comment inside a fence is code, not a heading.
    expect(out).not.toContain("<h1");
  });

  it("strips markup from heading ids", () => {
    expect(headingId("`getRiskSnapshot` and **risk**")).toBe("getrisksnapshot-and-risk");
  });
});
