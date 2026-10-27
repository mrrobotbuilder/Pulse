-- Pulse — caps on AI board builds (docs/PLAN.md, Stage 5)
--
-- Every AI build is billed to the owner's Anthropic key, so the server counts
-- them here and refuses past the limits. Run this ONCE in your Supabase project,
-- the same way as sync.sql and whoop.sql. Without it the AI builder stays off
-- (the route fails closed) and everyone gets the rule-based board.
--
-- SECURITY — SERVER-ONLY, like whoop_tokens: RLS on, NO policies, and the
-- grants revoked, so the anon key in the page can neither read nor bump these
-- rows. Only the service_role key (server env, never sent to a browser) can.
--
-- No raw IP is ever stored: `ip_hash` is sha256 of a server-side salt plus the
-- IP, so a leaked table cannot be mapped back to visitors.

create table if not exists public.ai_usage (
  ip_hash text not null,
  day     date not null,
  builds  int  not null default 0,
  primary key (ip_hash, day)
);

alter table public.ai_usage enable row level security;
revoke all on table public.ai_usage from anon;
revoke all on table public.ai_usage from authenticated;

-- One row per follow-up ticket that has been spent, so the second call of a
-- build (the one after the follow-up questions) can run once and only once
-- without counting as a second build.
create table if not exists public.ai_tickets (
  id         text primary key,
  created_at timestamptz not null default now()
);

alter table public.ai_tickets enable row level security;
revoke all on table public.ai_tickets from anon;
revoke all on table public.ai_tickets from authenticated;

-- Check both caps and take one build, atomically. Returns 'ok', 'ip' (this
-- visitor is out for today) or 'day' (everyone together is out for today).
-- The advisory lock serialises callers for the day, so two requests at once
-- cannot both slip under the limit. Days are UTC.
create or replace function public.ai_usage_take(p_ip_hash text, p_ip_limit int, p_day_limit int)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  d date := (now() at time zone 'utc')::date;
  used_all int;
  used_ip int;
begin
  perform pg_advisory_xact_lock(hashtext('ai_usage:' || d::text));
  select coalesce(sum(builds), 0) into used_all from public.ai_usage where day = d;
  if used_all >= p_day_limit then return 'day'; end if;
  select coalesce(max(builds), 0) into used_ip from public.ai_usage where ip_hash = p_ip_hash and day = d;
  if used_ip >= p_ip_limit then return 'ip'; end if;
  insert into public.ai_usage (ip_hash, day, builds) values (p_ip_hash, d, 1)
    on conflict (ip_hash, day) do update set builds = public.ai_usage.builds + 1;
  return 'ok';
end;
$$;

revoke all on function public.ai_usage_take(text, int, int) from public;
revoke all on function public.ai_usage_take(text, int, int) from anon;
revoke all on function public.ai_usage_take(text, int, int) from authenticated;
grant execute on function public.ai_usage_take(text, int, int) to service_role;
