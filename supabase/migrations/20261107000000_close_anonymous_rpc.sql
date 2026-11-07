-- Close the database functions to logged-out callers.
--
-- Postgres grants EXECUTE on every new function to PUBLIC, and the earlier
-- migrations granted functions to `authenticated` without revoking that
-- default. So anyone holding only the project's publishable key (the `anon`
-- role, no session) could call them. The wallet readers then let such a caller
-- through: with no session auth.uid() is null, so `p_uid <> auth.uid()` was
-- null rather than true and the guard never raised. A logged-out caller who
-- knew (or asked `sole_helper()` for) the helper's id could read her balance,
-- earnings, payouts and the household's outlook.
--
-- Nothing in this app is meant for logged-out callers, so:
--   1. the wallet guard refuses a missing session outright;
--   2. EXECUTE comes off PUBLIC and anon for every function in `public`, and
--      off new ones by default;
--   3. `authenticated` keeps exactly the functions it could call before.

create or replace function public.assert_can_read_wallet(p_uid uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null
     or p_uid is null
     or (p_uid is distinct from auth.uid() and not public.is_admin()) then
    raise exception 'not allowed to read this wallet' using errcode = '42501';
  end if;
end;
$$;

revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated, service_role;

-- These were never callable by signed-in users: keep them internal.
revoke execute on function public.handle_new_user() from authenticated;
revoke execute on function public.backfill_completion_prices() from authenticated;
revoke execute on function public.assert_can_read_wallet(uuid) from authenticated;

-- Functions created by later migrations start closed to logged-out callers too.
alter default privileges in schema public revoke execute on functions from public, anon;
alter default privileges in schema public grant execute on functions to authenticated, service_role;
