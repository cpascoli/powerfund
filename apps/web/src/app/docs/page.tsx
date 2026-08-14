import type { Metadata } from "next";
import Link from "next/link";

import { PLAYBOOK_DOCS } from "@/lib/docs";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "Playbook",
  description:
    "Operating constitution — mandate, goals, themes, and the build plan.",
};

export default function PlaybookIndexPage() {
  return (
    <>
      <header className="page-header">
        <div>
          <h1>Playbook</h1>
          <p>
            The operating constitution, rendered from <code>docs/</code>. Edit
            the markdown; the app follows on the next deploy.
          </p>
        </div>
      </header>

      <ul className="list">
        {PLAYBOOK_DOCS.map((doc) => (
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
