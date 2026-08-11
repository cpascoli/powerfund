-- RLS policies alone are not enough: roles need table privileges.
-- Without these GRANTs, authenticated requests fail with
-- "permission denied for table ...".

grant usage on schema public to anon, authenticated, service_role;

grant select, insert, update, delete on all tables in schema public
  to authenticated, service_role;

grant select on all tables in schema public to anon;

grant usage, select, update on all sequences in schema public
  to authenticated, service_role;

grant execute on all functions in schema public
  to anon, authenticated, service_role;

alter default privileges in schema public
  grant select, insert, update, delete on tables
  to authenticated, service_role;

alter default privileges in schema public
  grant select on tables to anon;

alter default privileges in schema public
  grant usage, select, update on sequences
  to authenticated, service_role;
