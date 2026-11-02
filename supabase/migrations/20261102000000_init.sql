-- Places a user wants to visit someday
create table public.places (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 200),
  notes       text,
  category    text,
  address     text,
  lat         double precision not null check (lat between -90 and 90),
  lng         double precision not null check (lng between -180 and 180),
  url         text,
  visited     boolean not null default false,
  visited_at  timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index places_user_id_idx on public.places(user_id);

-- Saved trip plans
create table public.trips (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name          text not null,
  start_label   text not null,
  start_lat     double precision not null,
  start_lng     double precision not null,
  end_label     text not null,
  end_lat       double precision not null,
  end_lng       double precision not null,
  max_detour_mi numeric not null default 25,
  created_at    timestamptz not null default now()
);
create index trips_user_id_idx on public.trips(user_id);

create or replace function public.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end $$;
create trigger places_touch before update on public.places
  for each row execute function public.touch_updated_at();

alter table public.places enable row level security;
alter table public.trips  enable row level security;

create policy "own places select" on public.places for select to authenticated using ((select auth.uid()) = user_id);
create policy "own places insert" on public.places for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "own places update" on public.places for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "own places delete" on public.places for delete to authenticated using ((select auth.uid()) = user_id);

create policy "own trips select" on public.trips for select to authenticated using ((select auth.uid()) = user_id);
create policy "own trips insert" on public.trips for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "own trips update" on public.trips for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "own trips delete" on public.trips for delete to authenticated using ((select auth.uid()) = user_id);
