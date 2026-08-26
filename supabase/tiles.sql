-- Pulse — tiles built by Claude through the connector (app/api/mcp)
--
-- Run this ONCE in your Supabase project (or via `supabase db query -f`).
-- Your dashboard reads this table on load and shows any tile it finds here, so
-- a tile made from Claude — on your laptop or your phone — appears without a
-- redeploy. A static file at public/tiles/<slot>.html still works; a row here
-- for the same slot wins (it's the live, editable copy).
--
-- SECURITY — this table is scoped PER ACCOUNT.
--
-- An earlier version of this file made the table `slot text primary key` with a
-- policy of `using (true) with check (true)` granted to `anon`. That was written
-- for a single-user personal board, and on a deployment with real accounts it
-- would let anyone holding the public anon key (it ships in the browser, by
-- design) read and overwrite every user's tiles — and a tile is raw HTML the
-- dashboard renders. The table is now keyed by (user_id, slot) with row-level
-- security, exactly like tile_data in sync.sql.

create table if not exists public.tiles (
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  slot       text not null,           -- train, fuel, vitals, vee, brand, peak, finance, walks
  name       text,                    -- optional display name
  html       text not null,           -- the sealed, self-contained tile HTML
  updated_at timestamptz not null default now(),
  primary key (user_id, slot)
);

alter table public.tiles enable row level security;

drop policy if exists "tiles open" on public.tiles;   -- the old permissive policy
drop policy if exists "own tiles" on public.tiles;
create policy "own tiles" on public.tiles
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Only signed-in requests may touch the table. Note that Supabase's default
-- privileges grant anon on every new table in `public`, so the revoke below is
-- required — granting only to `authenticated` is NOT enough on its own.
grant select, insert, update, delete on table public.tiles to authenticated;
revoke all on table public.tiles from anon;
