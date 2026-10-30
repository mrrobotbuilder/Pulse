-- Pulse: hourly follower counts for the Brand tile
--
-- Run this ONCE in your Supabase project, the same way as sync.sql and
-- tiles.sql. scripts/set-x-token.ps1 copies this file to the clipboard together
-- with the two Vault secrets the hourly job needs.
--
-- SERVER-ONLY, like whoop_tokens: RLS is on with no policies and the grants are
-- revoked, so only the service_role key can touch these rows. The board sees
-- them through the `brand` row in tile_data, which the collector keeps merged.
-- This table is the archive; that row is the thinned copy the tile draws.

create table if not exists public.brand_snapshots (
  user_id   uuid not null references auth.users(id) on delete cascade,
  platform  text not null,
  handle    text not null,
  t         timestamptz not null default now(),
  followers bigint not null check (followers >= 0),
  views     bigint,
  posts     bigint,
  -- One row per account per clock hour, so a double run cannot add a second one.
  hour      timestamp generated always as (date_trunc('hour', t at time zone 'utc')) stored,
  unique (user_id, platform, handle, hour)
);

create index if not exists brand_snapshots_newest on public.brand_snapshots (user_id, t desc);

alter table public.brand_snapshots enable row level security;

revoke all on table public.brand_snapshots from anon;
revoke all on table public.brand_snapshots from authenticated;

-- The hourly tick. Vercel's free plan allows one cron a day, so Supabase calls
-- the collector instead. The URL and the secret live in Vault and are read at
-- run time, so neither is written into the job text. Calling cron.schedule
-- again with the same name replaces the job.
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'brand-collect-hourly',
  '0 * * * *',
  $job$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'brand_collect_url'),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'brand_cron_secret')
    ),
    timeout_milliseconds := 30000
  );
  $job$
);
