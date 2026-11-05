-- Ratings & notes after visiting, shared with every Stopover user.
-- Places are per-list rows, so reviews are matched to "the same real place" by
-- OpenStreetMap id when known, otherwise by being at the same spot with a similar name.

create extension if not exists pg_trgm with schema extensions;

-- OSM id of a place picked from the nearby suggestions, e.g. "node/123", "way/456"
alter table public.places add column osm_id text check (char_length(osm_id) <= 40);
create index places_osm_idx on public.places(osm_id) where osm_id is not null;

create table public.reviews (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  place_id    uuid references public.places(id) on delete set null, -- the reviewer's own copy of the place
  -- snapshot used for matching, so a review outlives the place being deleted from a list
  osm_id      text check (char_length(osm_id) <= 40),
  name        text not null check (char_length(name) between 1 and 200),
  lat         double precision not null check (lat between -90 and 90),
  lng         double precision not null check (lng between -180 and 180),
  approximate boolean not null default false, -- pin is where they were, not the place: kept private
  rating      smallint not null check (rating between 1 and 5),
  parking     text check (parking in ('big-rig', 'some-rv', 'tight', 'none')),
  cost        text check (char_length(cost) <= 60),
  note        text check (char_length(note) <= 2000),
  visited_on  date,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create unique index reviews_user_place_idx on public.reviews(user_id, place_id) where place_id is not null;
create index reviews_osm_idx on public.reviews(osm_id) where osm_id is not null;
create index reviews_latlng_idx on public.reviews(lat, lng);

create trigger reviews_touch before update on public.reviews
  for each row execute function public.touch_updated_at();

alter table public.reviews enable row level security;
-- Direct table access is your own reviews only; others' reviews come through place_reviews(),
-- which returns just the fields meant to be public (no user ids, no exact private pins).
create policy "own reviews read"   on public.reviews for select to authenticated using (user_id = (select auth.uid()));
create policy "own reviews add"    on public.reviews for insert to authenticated with check (user_id = (select auth.uid()));
create policy "own reviews edit"   on public.reviews for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own reviews remove" on public.reviews for delete to authenticated using (user_id = (select auth.uid()));

-- ---------- matching ----------
create function private.miles(lat1 double precision, lng1 double precision, lat2 double precision, lng2 double precision)
returns double precision language sql immutable set search_path = '' as $$
  select 3958.8 * 2 * asin(sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2) +
    cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2)));
$$;

-- Same real-world place? Same OSM feature, or within ~1/3 mile with a similar name,
-- or practically the same spot with some name overlap.
create function private.same_place(
  lat1 double precision, lng1 double precision, name1 text, osm1 text,
  lat2 double precision, lng2 double precision, name2 text, osm2 text)
returns boolean language sql immutable set search_path = '' as $$
  select (osm1 is not null and osm1 = osm2)
      or (private.miles(lat1, lng1, lat2, lng2) <= 0.3 and extensions.similarity(lower(name1), lower(name2)) >= 0.35)
      or (private.miles(lat1, lng1, lat2, lng2) <= 0.05 and extensions.similarity(lower(name1), lower(name2)) >= 0.2);
$$;

grant execute on function private.miles(double precision, double precision, double precision, double precision),
  private.same_place(double precision, double precision, text, text, double precision, double precision, text, text) to authenticated;

-- ---------- reading reviews ----------
-- Everyone's reviews of a place (reviewer shown by first name only).
create function public.place_reviews(p_lat double precision, p_lng double precision, p_name text, p_osm text default null)
returns table (id uuid, rating smallint, parking text, cost text, note text, visited_on date,
               created_at timestamptz, reviewer text, mine boolean)
language sql stable security definer set search_path = '' as $$
  select r.id, r.rating, r.parking, r.cost, r.note, r.visited_on, r.created_at,
         coalesce(nullif(split_part(trim(p.display_name), ' ', 1), ''), 'Traveler'),
         r.user_id = (select auth.uid())
  from public.reviews r
  left join public.profiles p on p.id = r.user_id
  where (select auth.uid()) is not null
    and (r.user_id = (select auth.uid()) or not r.approximate)
    and (
      (p_osm is not null and r.osm_id = p_osm)
      or (r.lat between p_lat - 0.01 and p_lat + 0.01
          and r.lng between p_lng - 0.015 and p_lng + 0.015
          and private.same_place(p_lat, p_lng, p_name, p_osm, r.lat, r.lng, r.name, r.osm_id))
    )
  order by r.user_id = (select auth.uid()) desc, r.created_at desc
  limit 50;
$$;

-- Average rating + count for many places at once (for lists and trip stops).
-- p_places: [{"key": "...", "lat": 0, "lng": 0, "name": "...", "osm": null}, ...] (max 500)
create function public.review_summaries(p_places jsonb)
returns table (key text, avg_rating numeric, review_count bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null then raise exception 'Not signed in'; end if;
  if jsonb_array_length(p_places) > 500 then raise exception 'Too many places'; end if;
  return query
    with q as (
      select x->>'key' as k, (x->>'lat')::float8 as lat, (x->>'lng')::float8 as lng, x->>'name' as name, nullif(x->>'osm', '') as osm
      from jsonb_array_elements(p_places) x
    )
    select q.k, round(avg(r.rating)::numeric, 1), count(r.id)
    from q
    join public.reviews r
      on (r.user_id = (select auth.uid()) or not r.approximate)
     and ((q.osm is not null and r.osm_id = q.osm)
          or (r.lat between q.lat - 0.01 and q.lat + 0.01
              and r.lng between q.lng - 0.015 and q.lng + 0.015
              and private.same_place(q.lat, q.lng, q.name, q.osm, r.lat, r.lng, r.name, r.osm_id)))
    group by q.k;
end;
$$;

revoke all on function public.place_reviews(double precision, double precision, text, text), public.review_summaries(jsonb) from public, anon;
grant execute on function public.place_reviews(double precision, double precision, text, text), public.review_summaries(jsonb) to authenticated;
