import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";

import { SiteFooter } from "@/components/site-footer";
import { getSessionRole } from "@/lib/auth/operator";
import { validateAuthorizationRequest } from "@/lib/oauth/authorize";
import { clientDisplayName } from "@/lib/oauth/clients";
import { isWriteScope, oauthUrls, publicOrigin } from "@/lib/oauth/config";
import { oauthStoreFromEnv } from "@/lib/oauth/http";
import { getSessionUser } from "@/lib/supabase/server";

import { decideAuthorization } from "./actions";
import styles from "./consent.module.css";
import { AUTHORIZE_PARAM_NAMES } from "./params";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Connect an agent",
  robots: { index: false, follow: false },
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const SCOPE_LABELS: Record<string, string> = {
  "powerfund:state:read": "Read fund state, flags and what is due",
  "powerfund:portfolio:read": "Read the private book: positions, cash, performance",
  "powerfund:dossier:read": "Read dossiers, versions and the research inbox",
  "powerfund:journal:read": "Read the decision journal and grades",
  "powerfund:deployment:read": "Read the deployment queue",
  "powerfund:reviews:read": "Read the review calendar and history",
  "powerfund:dossier:write": "Write dossiers (new versions)",
  "powerfund:journal:append": "Append journal decisions and grades",
  "powerfund:deployment:write": "Queue, revise, defer or cancel intended trades",
  "powerfund:reviews:write": "Create, update and complete review tasks",
  "powerfund:watchlist:write": "Add, archive or restore watchlist names",
};

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="auth-shell">
      <div className="auth-panel">
        <p className="auth-eyebrow">
          <Link href="/">Power Fund</Link>
        </p>
        {children}
      </div>
      <SiteFooter />
    </div>
  );
}

function Refusal({ title, message }: { title: string; message: string }) {
  return (
    <Shell>
      <h1>{title}</h1>
      <p className="form-error">{message}</p>
      <p className="muted">Nothing was shared and no connection was made.</p>
    </Shell>
  );
}

/**
 * OAuth consent for an MCP client (ChatGPT, MCP Inspector, …).
 *
 * Order matters. Sign-in and the operator check come before the client is
 * resolved, because resolving a metadata-document client fetches a URL taken
 * from the query string — an anonymous visitor must not be able to make this
 * server fetch anything. And a bad client or redirect URI renders an error
 * here rather than redirecting, so this page is never an open redirector.
 */
export default async function AuthorizePage({ searchParams }: { searchParams: SearchParams }) {
  const raw = await searchParams;
  const params: Record<string, string | undefined> = {};
  for (const name of AUTHORIZE_PARAM_NAMES) {
    const value = raw[name];
    if (typeof value === "string") params[name] = value;
  }

  const user = await getSessionUser();
  if (!user) {
    const query = new URLSearchParams(
      Object.entries(params).filter((entry): entry is [string, string] => entry[1] != null),
    );
    redirect(`/login?next=${encodeURIComponent(`/oauth/authorize?${query}`)}`);
  }
  if ((await getSessionRole()) !== "operator") {
    return (
      <Refusal
        title="Operator only"
        message="Only the PowerFund operator account can connect an agent to the book."
      />
    );
  }

  const urls = oauthUrls(publicOrigin(await headers()));
  const validation = await validateAuthorizationRequest(oauthStoreFromEnv(), urls, params);
  if (!validation.ok) {
    if (validation.kind === "redirect") redirect(validation.location);
    return <Refusal title="Cannot connect" message={validation.message} />;
  }

  const { client, redirectUri, scopes } = validation.request;
  const name = clientDisplayName(client);
  const redirectHost = new URL(redirectUri).host;
  const verified = client.registration === "metadata_document";
  const reads = scopes.filter((scope) => !isWriteScope(scope));
  const writes = scopes.filter((scope) => isWriteScope(scope));

  return (
    <Shell>
      <h1>Connect {name}?</h1>
      <p className="muted">
        {verified ? (
          <>
            Identified by a metadata document on <strong>{new URL(client.client_id).host}</strong>.
          </>
        ) : (
          <>
            <strong>Self-registered client.</strong> Its name is not verified — check the
            destination below before approving.
          </>
        )}
      </p>

      <dl className={styles.facts}>
        <dt>Sends you back to</dt>
        <dd>
          <code>{redirectHost}</code>
        </dd>
        <dt>Connects to</dt>
        <dd>
          <code>{urls.resource}</code>
        </dd>
      </dl>

      {reads.length > 0 ? (
        <section className={styles.scopes}>
          <h2>Read</h2>
          <ul>
            {reads.map((scope) => (
              <li key={scope}>{SCOPE_LABELS[scope] ?? scope}</li>
            ))}
          </ul>
        </section>
      ) : null}
      {writes.length > 0 ? (
        <section className={styles.scopes}>
          <h2>Write</h2>
          <ul>
            {writes.map((scope) => (
              <li key={scope}>{SCOPE_LABELS[scope] ?? scope}</li>
            ))}
          </ul>
        </section>
      ) : null}

      <p className="muted">
        No agent can book a fill, move cash or trade. You still confirm every fill in PowerFund.
        Revoke a connection by revoking its tokens (docs/gpt-to-plugin-migration.md).
      </p>

      <form action={decideAuthorization} className="auth-form">
        {AUTHORIZE_PARAM_NAMES.map((param) =>
          params[param] != null ? (
            <input key={param} type="hidden" name={param} value={params[param]} />
          ) : null,
        )}
        {writes.length > 0 ? (
          <button type="submit" name="decision" value="read_write">
            Allow read and write
          </button>
        ) : null}
        <button
          type="submit"
          name="decision"
          value="read_only"
          className={writes.length > 0 ? styles.secondary : undefined}
        >
          Allow read only
        </button>
        <button type="submit" name="decision" value="deny" className={styles.deny}>
          Deny
        </button>
      </form>
    </Shell>
  );
}
