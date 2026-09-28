-- OAuth 2.1 for the PowerFund MCP server.
--
-- ChatGPT connects to MCP servers with OAuth (or not at all); it cannot send
-- the static agent keys the REST API uses. PowerFund is therefore its own
-- small authorization server: the operator signs in with the existing Supabase
-- session, approves a client on a consent page, and the client receives
-- tokens carrying the same `powerfund:*` scope strings the agent API already
-- checks. See docs/mcp-architecture.md.
--
-- Nothing secret is stored in the clear. Codes and tokens are random 256-bit
-- values shown to the client once; only their SHA-256 is kept, so a read of
-- these tables (or a backup) cannot be replayed as a credential.
--
-- Every table is service-role only, like agent_idempotency_keys: the MCP and
-- OAuth routes use the admin client, and no browser or viewer has any business
-- reading grants.

create table public.oauth_clients (
  id uuid primary key default gen_random_uuid(),
  -- For a dynamically registered client, an opaque id we minted. For a
  -- Client ID Metadata Document client (ChatGPT), the HTTPS URL of that
  -- document; the row is a cache of what the URL said when last fetched.
  client_id text not null unique,
  registration text not null,
  client_name text,
  redirect_uris text[] not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  refreshed_at timestamptz not null default timezone('utc', now()),
  constraint oauth_clients_registration check (registration in ('dynamic', 'metadata_document')),
  constraint oauth_clients_redirects_nonempty check (cardinality(redirect_uris) > 0)
);

create table public.oauth_authorization_codes (
  code_hash text primary key,
  client_id text not null references public.oauth_clients (client_id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  redirect_uri text not null,
  code_challenge text not null,
  scopes text[] not null,
  -- RFC 8707: the MCP server this code may be exchanged for. A preview
  -- deploy and production share one database; binding the resource is what
  -- stops a grant approved on one from working on the other.
  resource text not null,
  expires_at timestamptz not null,
  -- Set once, by the exchange. A second exchange is a replay and revokes
  -- everything the first one issued (OAuth 2.1 §4.1.3).
  used_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  constraint oauth_codes_hash_nonempty check (char_length(code_hash) = 64),
  constraint oauth_codes_scopes_nonempty check (cardinality(scopes) > 0)
);

create table public.oauth_tokens (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  kind text not null,
  client_id text not null references public.oauth_clients (client_id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  -- Attribution the agent API stamps on writes made with this token.
  principal_name text not null,
  scopes text[] not null,
  resource text not null,
  -- One authorization, followed through every refresh rotation. Reuse of a
  -- rotated refresh token revokes the whole family: either the client or an
  -- attacker holds a stale copy, and we cannot tell which.
  family_id uuid not null,
  code_hash text,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  last_used_at timestamptz,
  constraint oauth_tokens_kind check (kind in ('access', 'refresh')),
  constraint oauth_tokens_hash_nonempty check (char_length(token_hash) = 64),
  constraint oauth_tokens_scopes_nonempty check (cardinality(scopes) > 0)
);

create index oauth_tokens_family_idx on public.oauth_tokens (family_id);
create index oauth_tokens_code_idx on public.oauth_tokens (code_hash) where code_hash is not null;
create index oauth_tokens_user_idx on public.oauth_tokens (user_id, created_at desc);
create index oauth_codes_expires_idx on public.oauth_authorization_codes (expires_at);

alter table public.oauth_clients enable row level security;
alter table public.oauth_authorization_codes enable row level security;
alter table public.oauth_tokens enable row level security;

revoke all on public.oauth_clients from anon, authenticated;
revoke all on public.oauth_authorization_codes from anon, authenticated;
revoke all on public.oauth_tokens from anon, authenticated;

grant select, insert, update on public.oauth_clients to service_role;
grant select, insert, update on public.oauth_authorization_codes to service_role;
grant select, insert, update on public.oauth_tokens to service_role;

comment on table public.oauth_tokens is
  'MCP OAuth tokens, hashed. Revoke everything with: update public.oauth_tokens set revoked_at = now() where revoked_at is null;';
