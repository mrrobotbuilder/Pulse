-- Pulse — WHOOP connection tokens
--
-- Run this ONCE in your Supabase project, the same way as sync.sql and
-- tiles.sql. It is only needed if you connect a WHOOP band.
--
-- SECURITY — this table is SERVER-ONLY. It is not like tile_data or tiles.
--
-- A row here holds a live OAuth access token and refresh token for someone's
-- WHOOP account: whoever holds them can read that person's sleep, recovery,
-- heart rate and workouts until the grant is revoked. The browser must never
-- be able to read this table, not even the row belonging to the signed-in
-- user, because the anon key ships inside the page by design.
--
-- So: RLS is ON and there are NO policies at all. With RLS on and no policy,
-- every ordinary request matches nothing and sees nothing. Only the
-- service_role key -- which lives in the server environment and is never sent
-- to a browser -- bypasses RLS and can touch these rows. The revokes below are
-- belt and braces on top of that, because Supabase's default privileges grant
-- anon and authenticated on every new table in `public`.

create table if not exists public.whoop_tokens (
  user_id       uuid primary key references auth.users(id) on delete cascade,
  access_token  text not null,
  refresh_token text not null,
  -- The scopes WHOOP actually granted, which can be fewer than the ones asked
  -- for if the person unticked something on the consent screen.
  scope         text,
  -- When the access token dies. The sync refreshes ahead of this.
  expires_at    timestamptz not null,
  connected_at  timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

alter table public.whoop_tokens enable row level security;

-- Deliberately no policy. Do not add one "so the dashboard can check if it is
-- connected" -- ask the server instead (/api/whoop/status), which reads with
-- the service role and returns only a boolean and a date, never a token.
drop policy if exists "own whoop tokens" on public.whoop_tokens;

revoke all on table public.whoop_tokens from anon;
revoke all on table public.whoop_tokens from authenticated;
