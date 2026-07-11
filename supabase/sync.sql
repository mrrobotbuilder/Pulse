-- Pulse — cloud backup for tile data
--
-- Run this ONCE in your Supabase project (Dashboard → SQL Editor → paste → Run).
-- It creates the single table that holds each tile's saved data, scoped to your
-- own signed-in account: Row Level Security means no other account can ever
-- read or write your rows, even though the anon key is public in the browser.

create table if not exists public.tile_data (
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  tile_id    text not null,
  data       jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, tile_id)
);

alter table public.tile_data enable row level security;

drop policy if exists "own rows only" on public.tile_data;
create policy "own rows only" on public.tile_data
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Only signed-in requests may touch the table at all — no grant to "anon".
grant select, insert, update, delete on table public.tile_data to authenticated;
