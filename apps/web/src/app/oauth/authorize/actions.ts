"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { getSessionRole } from "@/lib/auth/operator";
import { dynamicRegistrationEnabled, mcpWriteMode } from "@/lib/deploy";
import {
  deniedRedirect,
  grantedScopes,
  issueAuthorizationCode,
  validateAuthorizationRequest,
  type ConsentChoice,
} from "@/lib/oauth/authorize";
import { oauthUrls, publicOrigin } from "@/lib/oauth/config";
import { oauthStoreFromEnv } from "@/lib/oauth/http";
import { getSessionUser } from "@/lib/supabase/server";

import { AUTHORIZE_PARAM_NAMES } from "./params";

/**
 * The operator's decision on the consent page.
 *
 * Nothing from the rendered page is trusted: the hidden fields are just the
 * original query string, re-validated here exactly as the page validated
 * them, and the session is re-checked. Next.js refuses server actions whose
 * Origin does not match the host, which is the CSRF protection; the session
 * cookie is SameSite=Lax as a second layer.
 */
export async function decideAuthorization(formData: FormData): Promise<void> {
  const decision = String(formData.get("decision") ?? "");
  const params: Record<string, string | undefined> = {};
  for (const name of AUTHORIZE_PARAM_NAMES) {
    const value = formData.get(name);
    if (typeof value === "string" && value.length > 0) params[name] = value;
  }

  const user = await getSessionUser();
  if (!user || (await getSessionRole()) !== "operator") {
    throw new Error("Only the PowerFund operator can approve a connection.");
  }

  const store = oauthStoreFromEnv();
  const urls = oauthUrls(publicOrigin(await headers()));
  const validation = await validateAuthorizationRequest(store, urls, params, {
    allowDynamicClients: dynamicRegistrationEnabled(),
  });
  if (!validation.ok) {
    if (validation.kind === "redirect") redirect(validation.location);
    throw new Error(validation.message);
  }

  if (decision === "deny") {
    redirect(deniedRedirect(urls, validation.request));
  }
  if (decision !== "read_write" && decision !== "read_only") {
    throw new Error("Unknown consent decision.");
  }
  // A read-only deployment never grants write scopes, whatever was posted.
  const choice: ConsentChoice = mcpWriteMode().enabled ? (decision as ConsentChoice) : "read_only";
  const location = await issueAuthorizationCode(store, urls, validation.request, {
    userId: user.id,
    scopes: grantedScopes(validation.request.scopes, choice),
  });
  redirect(location);
}
