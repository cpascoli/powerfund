-- OAuth grants for MCP clients are readable by the server alone.
--
-- Run against a local database:
--   psql "$(supabase status -o env | grep DB_URL | cut -d= -f2- | tr -d '"')" \
--     -v ON_ERROR_STOP=1 -f supabase/tests/oauth_grants.sql
--
-- A token row is a hashed credential for the whole book. Even the operator's
-- own browser session has no reason to read one: the MCP and OAuth routes use
-- the service role. This asserts the refusal from the outside, as `anon` and
-- as the operator's `authenticated` JWT, with rows present so a refusal is not
-- an empty table, and asserts the service role *can* read them so a total
-- lockout would not pass as security.

\set ON_ERROR_STOP on

begin;

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, created_at, updated_at
)
values (
  '11111111-1111-1111-1111-111111111111',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'operator@test', 'x', now(), now()
)
on conflict (id) do nothing;

insert into public.app_users (user_id, role)
values ('11111111-1111-1111-1111-111111111111', 'operator')
on conflict (user_id) do update set role = excluded.role;

insert into public.oauth_clients (client_id, registration, client_name, redirect_uris)
values ('pfc_test', 'dynamic', 'Test', array['https://client.example/cb']);

insert into public.oauth_authorization_codes (
  code_hash, client_id, user_id, redirect_uri, code_challenge, scopes, resource, expires_at
)
values (
  repeat('a', 64), 'pfc_test', '11111111-1111-1111-1111-111111111111',
  'https://client.example/cb', repeat('c', 43), array['powerfund:state:read'],
  'https://powerfund.example/api/v1/mcp', now() + interval '2 minutes'
);

insert into public.oauth_tokens (
  token_hash, kind, client_id, user_id, principal_name, scopes, resource, family_id, expires_at
)
values (
  repeat('b', 64), 'access', 'pfc_test', '11111111-1111-1111-1111-111111111111',
  'test-mcp', array['powerfund:state:read'], 'https://powerfund.example/api/v1/mcp',
  gen_random_uuid(), now() + interval '1 hour'
);

do $$
declare
  tbl text;
  role_name text;
  refused boolean;
  visible int;
begin
  foreach tbl in array array['oauth_clients', 'oauth_authorization_codes', 'oauth_tokens'] loop
    foreach role_name in array array['anon', 'authenticated'] loop
      execute format('set local role %I', role_name);
      perform set_config(
        'request.jwt.claims',
        '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}',
        true
      );
      refused := false;
      begin
        execute format('select count(*) from public.%I', tbl) into visible;
      exception when insufficient_privilege then
        refused := true;
      end;
      reset role;
      if not refused then
        raise exception '% can read public.% (% rows); grants must be service-role only',
          role_name, tbl, visible;
      end if;
    end loop;

    set local role service_role;
    execute format('select count(*) from public.%I', tbl) into visible;
    reset role;
    if visible < 1 then
      raise exception 'service_role cannot see public.%; the MCP server would be locked out', tbl;
    end if;
  end loop;

  -- Stored credentials are digests, never the presented secret.
  if exists (
    select 1 from public.oauth_tokens where token_hash !~ '^[0-9a-f]{64}$' and token_hash <> repeat('b', 64)
  ) then
    raise exception 'oauth_tokens holds something that is not a SHA-256 hex digest';
  end if;
end;
$$;

-- A code or token that is not a 64-character digest is refused outright.
do $$
begin
  begin
    insert into public.oauth_tokens (
      token_hash, kind, client_id, user_id, principal_name, scopes, resource, family_id, expires_at
    )
    values (
      'pfat_plaintext_token', 'access', 'pfc_test', '11111111-1111-1111-1111-111111111111',
      'test-mcp', array['powerfund:state:read'], 'r', gen_random_uuid(), now()
    );
    raise exception 'a plaintext token was accepted into oauth_tokens';
  exception when check_violation then
    null;
  end;
end;
$$;

rollback;

\echo 'oauth_grants: ok'
