-- tournament_rsvp_create_invite() only makes sense as a trigger body (it
-- reads NEW/OLD, which don't exist outside trigger context) but Postgres
-- grants EXECUTE to PUBLIC by default, which PostgREST then exposes as
-- /rest/v1/rpc/tournament_rsvp_create_invite to anon and authenticated.
-- Calling it directly would just error out, but there's no reason to leave
-- it reachable at all -- revoke it the same way any other internal-only
-- function should be.
revoke execute on function public.tournament_rsvp_create_invite() from public, anon, authenticated;
