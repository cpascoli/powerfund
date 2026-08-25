import type { Metadata } from "next";
import Link from "next/link";

import { PLAYBOOK_DOCS, PUBLIC_PLAYBOOK_DOCS } from "@/lib/docs";
import { getSessionUser } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Playbook",
  description:
    "Operating constitution — mandate, goals, and themes.",
};

export default async function PlaybookIndexPage() {
  const signedIn = (await getSessionUser()) != null;
  const docs = signedIn ? PLAYBOOK_DOCS : PUBLIC_PLAYBOOK_DOCS;

  return (
    <>
      <header className="page-header">
        <div>
          <h1>Playbook</h1>
          <p>
            The operating constitution: why Power Fund exists, the investment
            rules, and the theme map.
          </p>
        </div>
      </header>

      <ul className="list">
        {docs.map((doc) => (
          <li key={doc.slug}>
            <div>
              <strong>
                <Link href={`/docs/${doc.slug}`}>{doc.title}</Link>
              </strong>
              <div className="muted">{doc.description}</div>
            </div>
            <span className="tag">{doc.file}</span>
          </li>
        ))}
      </ul>
    </>
  );
}
