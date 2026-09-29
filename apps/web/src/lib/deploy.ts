/**
 * Which deployment this is, from values no request can influence.
 *
 * Netlify sets CONTEXT, URL and DEPLOY_PRIME_URL during the build only; they
 * are not in the function runtime. next.config.ts copies them into the server
 * bundle under POWERFUND_DEPLOY_*, and the literal `process.env.X` reads below
 * are what Next inlines. Do not read them dynamically (`env[key]`): that is
 * not inlined and would silently see nothing in production.
 *
 * POWERFUND_PUBLIC_ORIGIN, POWERFUND_MCP_READ_ONLY and POWERFUND_MCP_ALLOW_WRITES
 * are ordinary runtime variables (Netlify UI, or the shell locally).
 */
export type DeployEnv = {
  /** production | deploy-preview | branch-deploy | dev; empty off Netlify. */
  context: string;
  /** The site's main URL (Netlify `URL`). */
  siteUrl: string;
  /** This deploy's own URL (Netlify `DEPLOY_PRIME_URL`), e.g. a Deploy Preview. */
  deployUrl: string;
  publicOriginOverride: string;
  mcpReadOnly: string;
  mcpAllowWrites: string;
  oauthAllowDcr: string;
};

export function deployEnv(): DeployEnv {
  return {
    context: process.env.POWERFUND_DEPLOY_CONTEXT ?? "",
    siteUrl: process.env.POWERFUND_SITE_URL ?? "",
    deployUrl: process.env.POWERFUND_DEPLOY_PRIME_URL ?? "",
    publicOriginOverride: process.env.POWERFUND_PUBLIC_ORIGIN ?? "",
    mcpReadOnly: process.env.POWERFUND_MCP_READ_ONLY ?? "",
    mcpAllowWrites: process.env.POWERFUND_MCP_ALLOW_WRITES ?? "",
    oauthAllowDcr: process.env.POWERFUND_OAUTH_ALLOW_DCR ?? "",
  };
}

export type McpWriteMode = {
  enabled: boolean;
  reason:
    | "production"
    | "kill_switch"
    | "explicit_opt_in"
    | "non_production_deployment";
};

/**
 * Whether MCP write tools may run here. Fails closed: only the production
 * build writes by default. A Deploy Preview reads and writes the production
 * database, so it must not be one mistaken consent click away from changing
 * the book.
 *
 * - POWERFUND_MCP_READ_ONLY=true turns writes off anywhere, production
 *   included: a kill switch that needs no code change.
 * - POWERFUND_MCP_ALLOW_WRITES=true turns them on for a non-production
 *   deployment. Use it for a local stack on a local database, never on a
 *   preview that points at production.
 */
export function mcpWriteMode(env: DeployEnv = deployEnv()): McpWriteMode {
  if (env.mcpReadOnly === "true") return { enabled: false, reason: "kill_switch" };
  if (env.context === "production") return { enabled: true, reason: "production" };
  if (env.mcpAllowWrites === "true") return { enabled: true, reason: "explicit_opt_in" };
  return { enabled: false, reason: "non_production_deployment" };
}

/**
 * Whether OAuth dynamic client registration is open here.
 *
 * Only on a local stack (no Netlify context, or `netlify dev`) by default.
 * ChatGPT and Claude identify themselves with Client ID Metadata Documents,
 * so no real client needs DCR. Anywhere else it would let anonymous callers
 * insert rows into the production database, since Deploy Previews share it,
 * with nothing but a per-instance rate limit in the way. Where it is closed,
 * consent also refuses any dynamically registered client that already exists.
 * MCP Inspector against a deployed site uses an agent key instead.
 * POWERFUND_OAUTH_ALLOW_DCR=true opens it deliberately.
 */
export function dynamicRegistrationEnabled(env: DeployEnv = deployEnv()): boolean {
  if (env.oauthAllowDcr === "true") return true;
  return env.context === "" || env.context === "dev";
}
