# PowerFundAgent GPT → PowerFund plugin: migration runbook

How to move the PowerFundAgent custom GPT onto a PowerFund plugin without
losing access to the book. The design is in
[mcp-architecture.md](./mcp-architecture.md) and the tools in
[mcp-tools.md](./mcp-tools.md).

**Do not press "Migrate to plugin" until phase H is done.** Migration is one-way:
the GPT becomes read-only, and every later fix has to happen in the plugin.

## What happens to the GPT

| | After migration |
|---|---|
| GPT instructions | Become a **skill** in the new plugin, from the **published** version of the GPT |
| Knowledge files | Copied into the plugin's reference files |
| Connected apps | Added to the plugin as apps |
| **Custom Actions (the agent API)** | **Do not migrate.** The plugin has no access to the book until the PowerFund MCP server is attached |
| Selected model, conversation history | Do not carry over |
| The GPT itself | Read-only, still usable until OpenAI retires GPTs. Announced 11 September 2026; Enterprise GPTs are reported to stop running on 11 December 2026. Confirm the date for this account |

The REST agent API (`/api/v1/agent/*`) is untouched throughout and stays the
fallback afterwards.

## Status

| Phase | What | Status |
|-------|------|--------|
| A | Audit GPT behaviour and the agent API | Done: [architecture § audit](./mcp-architecture.md#the-existing-agent-api-audited) |
| B | Build the MCP server in parallel | Done: `/api/v1/mcp`, 22 tools, OAuth |
| C | Test with MCP Inspector | Done locally, CLI and real server (below) |
| D | Deploy a preview endpoint | Migration pushed; PR #1 preview live and unauthenticated checks pass. Review fixes (read-only previews, trigger preview) need a push |
| E | ChatGPT Developer Mode | **Operator** |
| F | Staging plugin (skill + MCP) | Package built: `plugins/powerfund/build.sh --staging` |
| G | Regression suite vs the legacy GPT | **Operator**: [evals/mcp](../evals/mcp/README.md) |
| H | Resolve differences | — |
| I | Publish + back up the GPT | **Operator** |
| J | Migrate | **Operator** |
| K | Attach MCP to the migrated plugin, reconcile skills | **Operator** |
| L | Regression suite against the migrated plugin | **Operator** |

## Before anything leaves this machine

1. **Apply the migration to production:** `supabase db push`. It adds three
   service-role-only tables (`oauth_clients`, `oauth_authorization_codes`,
   `oauth_tokens`) and touches nothing else. Previews read the production
   database, so this must happen before phase D. It has been applied to an
   empty database after every existing migration (the CI job does the same).
2. **Push the branch** and open a PR. The PR's Deploy Preview is the phase-D
   endpoint: `https://deploy-preview-<n>--powerfund.netlify.app/api/v1/mcp`.
   A push to `main` is a production deploy. Merging can wait until phase E has
   passed on the preview.
3. Nothing to set in Netlify. Each deployment takes its canonical origin from
   its own build (`URL` for production, `DEPLOY_PRIME_URL` for a preview), and
   only the production build allows MCP writes.

## Local testing

The local stack needs Docker. `supabase start` from the repo uses the default
ports. If another project's local Supabase already holds them, copy
`supabase/` elsewhere, change `project_id` and the ports in its
`config.toml`, and run `supabase start` there.

```bash
supabase start                          # applies every migration + seed.sql
# Create a local operator (the first account becomes operator):
curl -X POST "$API_URL/auth/v1/admin/users" -H "apikey: $SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SERVICE_ROLE_KEY" -H 'content-type: application/json' \
  -d '{"email":"operator@local.test","password":"local-test-password-1","email_confirm":true}'

# Point the app at the LOCAL stack. Shell variables override apps/web/.env.local,
# which holds production credentials.
export NEXT_PUBLIC_SUPABASE_URL=$API_URL SUPABASE_URL=$API_URL
export NEXT_PUBLIC_SUPABASE_ANON_KEY=$ANON_KEY SUPABASE_SERVICE_ROLE_KEY=$SERVICE_ROLE_KEY
export POWERFUND_MCP_ALLOW_WRITES=true   # local stack only: off Netlify, MCP is read-only by default
export POWERFUND_AGENT_API_KEYS='[{"name":"local-writer","secret":"pf_local_writer_key_0001","role":"write"},{"name":"local-reader","secret":"pf_local_reader_key_0001","role":"read"}]'
pnpm --filter @powerfund/web exec next dev --port 3100
```

`$API_URL`, `$ANON_KEY` and `$SERVICE_ROLE_KEY` come from `supabase status`.
Check that the dev server is on the local stack before writing anything: a
write tool writes to whatever `SUPABASE_URL` says.

### MCP Inspector

**CLI, with an agent key:** no browser, good for smoke tests.

```bash
I="npx -y @modelcontextprotocol/inspector@latest --cli http://localhost:3100/api/v1/mcp --transport http"
$I --header "Authorization: Bearer pf_local_reader_key_0001" --method tools/list
$I --header "Authorization: Bearer pf_local_reader_key_0001" --method tools/call --tool-name get_fund_state
$I --header "Authorization: Bearer pf_local_reader_key_0001" --method tools/call --tool-name get_dossier --tool-arg symbol=CLS
# A write on a read key must come back INSUFFICIENT_SCOPE, with nothing written:
$I --header "Authorization: Bearer pf_local_reader_key_0001" --method tools/call --tool-name set_watchlist_archived --tool-arg symbol=CLS archived=true
```

**UI, with OAuth:** this exercises the full ChatGPT-style flow.

```bash
npx -y @modelcontextprotocol/inspector@latest
```

Choose Streamable HTTP with URL `http://localhost:3100/api/v1/mcp`, **no**
header, then Connect. Inspector gets the 401, reads the protected-resource
metadata, registers itself (DCR), and opens `/oauth/authorize`. Sign in as the
local operator. The consent page labels Inspector as self-registered.
Approve **read only** first.

Verify:

- [ ] `initialize` returns the server instructions; no `Mcp-Session-Id`
- [ ] `tools/list` shows 22 tools with annotations and `securitySchemes`
- [ ] every read tool answers; `get_review_context` returns all six sections
- [ ] a write tool on the read-only grant returns `INSUFFICIENT_SCOPE`, and nothing changes in the database
- [ ] invalid arguments (bad UUID, unknown field) return a readable `isError` without calling PowerFund
- [ ] an unknown symbol returns `UNKNOWN_SYMBOL` from `powerfund_api`
- [ ] reconnect read-write, then `record_decision` twice with identical arguments: one row, same id

What was verified on 28 September, against local Supabase: the 2025-era and
2026-07-28 protocol paths, CLI Inspector, DCR, consent, a forged cross-site
consent POST refused, PKCE, code replay revoking tokens, refresh rotation and
reuse revocation, hashed-only storage, idempotent replay, version-conflict
errors, and scope refusal. `transactions` was unchanged throughout.

## Phase D: Deploy Preview

With the migration pushed and the PR open:

```bash
P=https://deploy-preview-<n>--powerfund.netlify.app
curl -s $P/.well-known/oauth-authorization-server | jq .issuer        # the preview origin
curl -s $P/.well-known/oauth-protected-resource/api/v1/mcp | jq .resource
curl -si -X POST $P/api/v1/mcp -H 'content-type: application/json' \
  -H 'accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | grep -i www-authenticate
```

Then repeat the Inspector checks against `$P/api/v1/mcp`: CLI with a real read
key, then the UI OAuth flow signed in as the production operator.

> **The preview reads the production database, and cannot write to it through
> MCP.** Every write tool returns `WRITES_DISABLED`, the consent page offers
> read-only only, and the principal is cut to read scopes. Its tokens are bound
> to the preview URL and do not work in production. Write cases are tested on a
> local stack, or after merge against production.

## Phase E: ChatGPT Developer Mode

1. ChatGPT → **Settings → Security and login → Developer mode** on.
2. **Plugins → +**. Name "PowerFund (preview)", URL
   `https://deploy-preview-<n>--powerfund.netlify.app/api/v1/mcp` (with the
   `/api/v1/mcp` path), auth **OAuth**. ChatGPT identifies itself by its
   client metadata document (CIMD); no client id or secret is entered.
3. Consent: the page names **ChatGPT**, identified by chatgpt.com, and sends you
   back to `chatgpt.com`. Choose **Allow read only** for the first pass.
4. Review the discovered tools: 22 tools, read tools unmarked, writes marked as
   such.
5. In a new conversation, run the `writes: none` cases from
   [evals/mcp](../evals/mcp/README.md). For each, inspect the tool chosen, the
   arguments, the output, and that nothing asked to write.
6. Also try a write prompt on the preview: ChatGPT should pick the right tool
   and ask for approval, and the call should come back `WRITES_DISABLED` with
   nothing changed. This tests the model's tool choice without risk. Real write
   cases run after merge, against production, declining at least one approval
   prompt to confirm nothing lands without it.
7. After changing tools on the server: redeploy, then **Refresh** the connection,
   then start a **new** conversation.

## Phase F: staging plugin

```bash
plugins/powerfund/build.sh --staging https://deploy-preview-<n>--powerfund.netlify.app/api/v1/mcp
# → plugins/dist/powerfund-staging/ and plugins/dist/powerfund-staging.zip
```

The package is `plugin.json` + `mcp.json` + `skills/powerfund/` (SKILL.md, the
tool map, and the operating docs copied from `docs/`). Its name is
`powerfund-staging`, so it cannot shadow the real plugin. Install it as a local
plugin (add it to a local marketplace, then install it from the Plugins
Directory) and run the suite with the skill in play. This is phase G.

## Phase G–H: parity

Run every case in [evals/mcp](../evals/mcp/README.md) against **both** the
staging plugin and the legacy PowerFundAgent GPT. Record them in
`evals/mcp/results/`. Resolve every `fail` and explain every material
difference in conclusion. Differences usually come from the skill; the tools are
already tested. **Gate: zero fails.**

## Phase I: pre-migration checklist

Migration uses the GPT's **published** version. Before migrating:

- [ ] The GPT's latest desired instructions are **published**, not just saved
- [ ] Backed up to `docs/reviews/gpt-backup-YYYY-MM-DD/` (or somewhere safe):
  - [ ] instructions (copied verbatim)
  - [ ] knowledge files (download each)
  - [ ] Actions configuration: server URL, auth type (API key / Bearer), privacy policy URL
  - [ ] the OpenAPI schema: `curl -s https://powerfund.netlify.app/api/v1/agent/openapi.json > openapi.json`
  - [ ] conversation starters
  - [ ] the regression results from phase G
- [ ] Note which agent API key the GPT uses (by **name**, never the secret). It keeps working after migration until the GPT is retired
- [ ] The MCP branch is merged and deployed, and production's `/.well-known/oauth-authorization-server` names `https://powerfund.netlify.app` as issuer
- [ ] ChatGPT Developer Mode has passed the suite against **production** `https://powerfund.netlify.app/api/v1/mcp`, read-only at least

## Phase J: migrate

Use OpenAI's **Migrate to plugin** flow on PowerFundAgent. Expect a plugin
holding a skill made from the published instructions, plus the knowledge
files. It will have **no** PowerFund tools.

## Phase K: attach and reconcile

1. Add the PowerFund MCP server to the migrated plugin: streamable HTTP,
   `https://powerfund.netlify.app/api/v1/mcp`, OAuth. This is the same
   `mcp.json` as `plugins/powerfund/mcp.json`. No credentials go in it.
2. Connect. Consent for ChatGPT, read-write if this plugin is to be the primary
   interface.
3. Reconcile the migrated skill with `plugins/powerfund/skills/powerfund/SKILL.md`.
   The migrated instructions name REST operations (`getFundState`, …); add the
   tool map (`references/tool-map.md`) or rewrite the names. Keep the migrated
   skill's judgement and wording where it differs. The staging skill is a
   translation, not a replacement for what the GPT had learned. Do not change
   investment-process semantics here.

## Phase L: verify the migrated plugin

Re-run the whole suite against the migrated plugin on production. Zero fails
before treating it as the primary interface. Keep the legacy GPT pinned as a
read-only fallback until it is retired.

## Rollback and fallback

| When | Rollback |
|------|----------|
| Before phase J | Keep using PowerFundAgent. Nothing about it has changed. The MCP endpoint can be left deployed or removed; the REST API does not depend on it |
| After phase J | The GPT is read-only but still works against the REST API (its Actions and key are untouched) until OpenAI retires GPTs. Fix problems in the plugin: skill text in the plugin, tool behaviour by redeploying the MCP server |
| MCP server misbehaving | Revoke its grants (below). The REST API and the GPT are unaffected. Redeploy a fix; ChatGPT picks it up on **Refresh** |
| After GPT retirement | The REST agent API remains: any HTTP client with an agent key, or a re-attached MCP connection |

## Operations

**Stop all MCP writes without a code change:** set `POWERFUND_MCP_READ_ONLY=true`
for the Production context in Netlify, and redeploy. Reads keep working.

**Revoke a connection:** `POST /oauth/revoke` with its refresh token revokes the
grant. To revoke every MCP grant at once, the operator runs in SQL:

```sql
update public.oauth_tokens set revoked_at = now() where revoked_at is null;
```

Demoting the operator account in `app_users` also cuts its grants on the next
request.

**Find a failure:** Netlify function log, filter `mcp.request` / `mcp.tool`.
`request_id` matches the response's `X-Request-Id`. `error_source` says whether
PowerFund, the adapter or authorization failed. Tokens, arguments and payloads
are never logged.

**Change a tool:** edit `apps/web/src/lib/mcp/tools.ts`, run `pnpm test`
(schemas, parity, annotations, catalog), regenerate the catalog
(`UPDATE_MCP_CATALOG=1 pnpm test -- catalog`), deploy, **Refresh** in ChatGPT,
and re-run the affected eval cases.
