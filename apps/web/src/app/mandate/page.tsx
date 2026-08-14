import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Metadata } from "next";
import Link from "next/link";

import { renderMarkdown } from "@/lib/markdown";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "Mandate",
  description: "The investment mandate — risk rules, deployment ladder, and process.",
};

// Rendered at build time from the repo doc, so the app can never silently drift
// from docs/mandate.md. Netlify's ignore rule includes docs/ so edits redeploy.
async function loadMandate(): Promise<string> {
  const candidates = [
    join(process.cwd(), "..", "..", "docs", "mandate.md"),
    join(process.cwd(), "docs", "mandate.md"),
  ];
  for (const path of candidates) {
    try {
      return await readFile(path, "utf8");
    } catch {
      // try the next candidate
    }
  }
  throw new Error("Could not locate docs/mandate.md to render the Mandate page");
}

export default async function MandatePage() {
  const markdown = await loadMandate();

  return (
    <>
      <header className="page-header">
        <div>
          <h1>Mandate</h1>
          <p>
            The investment constitution — rendered from <code>docs/mandate.md</code>,
            the single source of truth. Live compliance against these rules is on
            the <Link href="/portfolio?tab=mandate">Portfolio → Mandate</Link> tab.
          </p>
        </div>
      </header>

      <article className="doc">{renderMarkdown(markdown)}</article>
    </>
  );
}
