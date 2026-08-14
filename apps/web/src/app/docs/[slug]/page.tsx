import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import {
  getPlaybookDoc,
  loadPlaybookMarkdown,
  PLAYBOOK_DOCS,
} from "@/lib/docs";
import { renderMarkdown } from "@/lib/markdown";

export const dynamic = "force-static";
export const dynamicParams = false;

type Params = { slug: string };

export function generateStaticParams(): Params[] {
  return PLAYBOOK_DOCS.map((doc) => ({ slug: doc.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { slug } = await params;
  const doc = getPlaybookDoc(slug);
  if (!doc) {
    return { title: "Playbook" };
  }
  return { title: doc.title, description: doc.description };
}

export default async function PlaybookDocPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { slug } = await params;
  const doc = getPlaybookDoc(slug);
  if (!doc) {
    notFound();
  }

  const markdown = await loadPlaybookMarkdown(doc.file);

  return (
    <>
      <header className="page-header">
        <div>
          <h1>{doc.title}</h1>
          <p>
            {doc.description} Rendered from <code>docs/{doc.file}</code>.
            {slug === "mandate" ? (
              <>
                {" "}
                Live compliance is on the{" "}
                <Link href="/portfolio?tab=mandate">Portfolio → Mandate</Link>{" "}
                tab.
              </>
            ) : null}
          </p>
        </div>
      </header>

      <nav className="doc-switch" aria-label="Playbook">
        {PLAYBOOK_DOCS.map((entry) => (
          <Link
            key={entry.slug}
            href={`/docs/${entry.slug}`}
            className={entry.slug === slug ? "is-active" : undefined}
            aria-current={entry.slug === slug ? "page" : undefined}
          >
            {entry.title}
          </Link>
        ))}
      </nav>

      <article className="doc">{renderMarkdown(markdown)}</article>
    </>
  );
}
