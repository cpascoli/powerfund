import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import {
  getPlaybookDoc,
  loadPlaybookMarkdown,
  PLAYBOOK_DOCS,
  PUBLIC_PLAYBOOK_DOCS,
} from "@/lib/docs";
import { renderMarkdown } from "@/lib/markdown";
import { getSessionUser } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
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
  const signedIn = (await getSessionUser()) != null;
  const doc = getPlaybookDoc(slug);
  if (!doc) {
    notFound();
  }

  const playbookDocs = signedIn ? PLAYBOOK_DOCS : PUBLIC_PLAYBOOK_DOCS;
  const markdown = await loadPlaybookMarkdown(doc.file);

  return (
    <>
      <header className="page-header">
        <div>
          <h1>{doc.title}</h1>
          <p>
            {doc.description}
            {signedIn && slug === "mandate" ? (
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
        {playbookDocs.map((entry) => (
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
