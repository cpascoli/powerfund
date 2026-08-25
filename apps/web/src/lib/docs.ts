import { readFile } from "node:fs/promises";
import { join } from "node:path";

export type PlaybookDoc = {
  slug: string;
  file: string;
  title: string;
  description: string;
};

/** Operator-facing docs rendered in the app. Engineering docs (ux, deploy) stay in the repo. */
export const PLAYBOOK_DOCS: readonly PlaybookDoc[] = [
  {
    slug: "goals",
    file: "goals.md",
    title: "Goals",
    description: "Why Power Fund exists and what success looks like.",
  },
  {
    slug: "mandate",
    file: "mandate.md",
    title: "Mandate",
    description:
      "The investment constitution — risk rules, deployment ladder, and process.",
  },
  {
    slug: "themes",
    file: "themes.md",
    title: "Themes",
    description:
      "The supercycle map — why the four themes are one transformation, exit signals, and why labels are not diversification.",
  },
  {
    slug: "plan",
    file: "plan.md",
    title: "Plan",
    description: "Phased build plan from operating discipline to optional scale.",
  },
] as const;

/** Investing constitution. The build plan stays operator-only. */
export const PUBLIC_PLAYBOOK_DOCS: readonly PlaybookDoc[] = PLAYBOOK_DOCS.filter(
  (doc) => doc.slug !== "plan",
);

const SLUGS = new Set(PLAYBOOK_DOCS.map((doc) => doc.slug));

export function getPlaybookDoc(slug: string): PlaybookDoc | null {
  return PLAYBOOK_DOCS.find((doc) => doc.slug === slug) ?? null;
}

export function isPlaybookSlug(slug: string): boolean {
  return SLUGS.has(slug);
}

/** Map a relative markdown href (./goals.md) onto an in-app Playbook route. */
export function playbookHref(href: string): string | null {
  const hashIndex = href.indexOf("#");
  const path = hashIndex >= 0 ? href.slice(0, hashIndex) : href;
  const hash = hashIndex >= 0 ? href.slice(hashIndex) : "";
  const match = /^(?:\.\/)?([a-z0-9-]+)\.md$/i.exec(path.trim());
  if (!match) return null;
  const slug = match[1]!.toLowerCase();
  if (!SLUGS.has(slug)) return null;
  return `/docs/${slug}${hash}`;
}

export async function loadPlaybookMarkdown(file: string): Promise<string> {
  const candidates = [
    join(process.cwd(), "..", "..", "docs", file),
    join(process.cwd(), "docs", file),
  ];
  for (const path of candidates) {
    try {
      return await readFile(path, "utf8");
    } catch {
      // try the next candidate
    }
  }
  throw new Error(`Could not locate docs/${file} to render the Playbook page`);
}
