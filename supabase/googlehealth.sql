-- Pulse — Google Health (Fitbit) connection tokens
--
-- Run this ONCE in your Supabase project, the same way as whoop.sql. It is only
-- needed if you connect a Fitbit through the Google Health API.
--
-- SECURITY — SERVER-ONLY, exactly like whoop_tokens. A row holds a live OAuth
-- access token and refresh token for someone's Google Health data. RLS is ON
-- with NO policies, so the browser (anon or signed-in) sees nothing; only the
-- service_role key on the server can touch these rows. The revokes are belt and
-- braces: Supabase grants anon and authenticated on every new table in `public`.
-- Do not add a policy "so the dashboard can check if it is connected" — ask the
-- server (/api/googlehealth/status), which returns a boolean and a date only.

create table if not exists public.googlehealth_tokens (
  user_id       uuid primary key references auth.users(id) on delete cascade,
  access_token  text not null,
  refresh_token text not null,
  -- The scopes Google actually granted; can be fewer if the person unticked some.
  scope         text,
  expires_at    timestamptz not null,
  connected_at  timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

alter table public.googlehealth_tokens enable row level security;

drop policy if exists "own googlehealth tokens" on public.googlehealth_tokens;

revoke all on table public.googlehealth_tokens from anon;
revoke all on table public.googlehealth_tokens from authenticated;
