/**
 * Lint for `dossier.source`, which the website renders as Markdown.
 *
 * The canonical shape is a short prose lead-in followed by a list of
 * `[Descriptive document title](https://…)` entries. Two failures made source
 * lists non-clickable in practice, and both are detectable without guessing:
 *
 * - a bare URL (`https://…` or `<https://…>`) outside Markdown-link syntax;
 * - a list entry (`-`, `*`, `+`, `•`, `1.`) with no link: in `source` a list
 *   entry *is* a source reference, so one without a URL cannot be followed.
 *   Entries citing PowerFund's own inputs ("PowerFund market data", a
 *   "Market-price input: $X close on …" line) are exempt: they have no URL.
 *
 * Prose lines are deliberately not checked ("Key Q2 figures: …", "Valuation
 * reference: …"): telling a sentence that mentions a filing from a citation
 * that omits its URL needs judgement, and a false positive would block a
 * legitimate write. The lint never rewrites anything and never invents a URL.
 *
 * Calibrated on the 53 production dossiers of 1 Oct 2026: 39 pass (all link
 * their documents), 14 fail, and every flagged line was a real unlinked
 * document or MU's naked URL.
 */

export type DossierSourceIssue = {
  kind: "bare_url" | "unlinked_list_entry" | "research_sources_not_rendered";
  /** 1-based line number in `source`; 0 for issues about the whole field. */
  line: number;
  text: string;
  message: string;
};

const MARKDOWN_LINK = /\[[^\]\n]+\]\(\s*<?https?:\/\/[^\s)>]+>?(?:\s+"[^"]*")?\s*\)/g;
const BARE_URL = /<?https?:\/\/[^\s)>\]]+>?/;
const LIST_ITEM = /^\s*(?:[-*+•]|\d+[.)])\s+(.*)$/;
// Internal inputs (PowerFund estimates, the stored market close) have no
// external URL; a list entry citing one is not a missing link.
const INTERNAL_SOURCE = /\bPowerFund\b|\bmarket[- ]price input\b|\bmarket data\b/i;
const FORMAT_HINT = "Source links must use descriptive Markdown syntax: [Document title](https://...).";

function clip(text: string): string {
  const trimmed = text.trim();
  return trimmed.length > 120 ? `${trimmed.slice(0, 117)}…` : trimmed;
}

export function lintDossierSource(
  source: string,
  options: { researchSources?: readonly string[] } = {},
): DossierSourceIssue[] {
  const issues: DossierSourceIssue[] = [];
  const lines = source.split(/\r?\n/);
  let inFence = false;

  lines.forEach((raw, index) => {
    if (/^\s*```/.test(raw)) {
      inFence = !inFence;
      return;
    }
    if (inFence) return;
    const withoutLinks = raw.replace(MARKDOWN_LINK, "");
    const bare = BARE_URL.exec(withoutLinks);
    if (bare) {
      issues.push({
        kind: "bare_url",
        line: index + 1,
        text: clip(raw),
        message: `Bare URL ${bare[0]}. ${FORMAT_HINT}`,
      });
      return;
    }
    const item = LIST_ITEM.exec(raw);
    if (item && item[1]!.trim().length > 0 && withoutLinks === raw && !INTERNAL_SOURCE.test(raw)) {
      issues.push({
        kind: "unlinked_list_entry",
        line: index + 1,
        text: clip(raw),
        message: `Source entry names a document but has no link. ${FORMAT_HINT} Do not list a document whose URL you do not have.`,
      });
    }
  });

  // URLs supplied only as research_sources never reach the page, which
  // renders `source`. Say so when the field also has unlinked entries, which
  // is the exact pattern that produced the non-clickable dossiers.
  const supplied = (options.researchSources ?? []).filter((url) => /^https?:\/\//.test(url.trim()));
  const missing = supplied.filter((url) => !source.includes(url.trim()));
  if (missing.length > 0 && issues.some((issue) => issue.kind === "unlinked_list_entry")) {
    issues.push({
      kind: "research_sources_not_rendered",
      line: 0,
      text: missing.slice(0, 3).join(", ") + (missing.length > 3 ? ", …" : ""),
      message:
        "These URLs were supplied in research_sources but are not linked in source. research_sources is not rendered on the website; put each URL in source as [title](URL).",
    });
  }
  return issues;
}
