-- Follow-up to operator_role_and_lockdown (review finding SEC-3).
-- Revoking SELECT was not enough: anon still held INSERT, UPDATE, DELETE,
-- TRUNCATE, REFERENCES and TRIGGER on all 15 public tables -- including
-- app_users, where an INSERT would mean self-assigning the operator role.
-- This is Supabase's default `grant all to anon`, so the repo's earlier
-- `grant select ... to anon` was redundant rather than the source.
-- RLS blocked all of it (there are no anon policies), which made RLS a single
-- point of failure. anon needs no table access at all: sign-in goes through
-- GoTrue, not PostgREST.

revoke all privileges on all tables in schema public from anon;
revoke all privileges on all sequences in schema public from anon;
revoke all privileges on all routines in schema public from anon;

alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;
alter default privileges in schema public revoke all on routines from anon;
