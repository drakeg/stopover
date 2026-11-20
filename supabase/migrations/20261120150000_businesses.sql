-- Sprint 10: business listings (SMB MVP).
-- A business owner claims a place; an admin verifies the claim; verified businesses get a public
-- profile with RV-specific facts and an offer; admins can mark a business "featured" (paid plan)
-- so it shows in trip planning for travelers whose routes pass nearby.

create table public.businesses (
  id              uuid primary key default gen_random_uuid(),
  owner_id        uuid not null default auth.uid() references auth.users(id) on delete cascade,
  status          text not null default 'pending' check (status in ('pending', 'verified', 'rejected')),
  -- which real place (same matching as reviews: OSM id, or spot + similar name)
  osm_id          text check (char_length(osm_id) <= 40),
  name            text not null check (char_length(name) between 1 and 120),
  lat             double precision not null check (lat between -90 and 90),
  lng             double precision not null check (lng between -180 and 180),
  category        text check (char_length(category) <= 40),
  description     text check (char_length(description) <= 1000),
  website         text check (website ~* '^https?://[^ ]+$' and char_length(website) <= 300),
  phone           text check (char_length(phone) <= 30),
  -- RV facts travelers ask about
  max_rig_ft      smallint check (max_rig_ft between 10 and 80),
  big_rig_parking boolean,
  hookups         text check (hookups in ('none', 'water-electric', '30a', '50a', 'full')),
  pets            boolean,
  offer           text check (char_length(offer) <= 140),
  -- claim details, visible to the owner and admins only
  claimant_role   text check (char_length(claimant_role) <= 80),
  claim_note      text check (char_length(claim_note) <= 1000),
  review_note     text check (char_length(review_note) <= 1000),
  -- paid plan (set by admins until checkout is automated)
  featured_until  timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index businesses_owner_idx on public.businesses(owner_id);
create index businesses_osm_idx on public.businesses(osm_id) where osm_id is not null;
create index businesses_latlng_idx on public.businesses(lat, lng);
-- one active (pending or verified) listing per OSM feature
create unique index businesses_one_per_osm on public.businesses(osm_id) where osm_id is not null and status <> 'rejected';

create trigger businesses_touch before update on public.businesses
  for each row execute function public.touch_updated_at();

-- Owners can't verify themselves, feature themselves or rewrite the admin's note.
create function private.guard_business_update() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if private.is_admin() then return new; end if;
  if new.status is distinct from old.status or new.featured_until is distinct from old.featured_until
     or new.review_note is distinct from old.review_note or new.owner_id is distinct from old.owner_id
     or new.lat is distinct from old.lat or new.lng is distinct from old.lng or new.osm_id is distinct from old.osm_id then
    raise exception 'Only Stopover admins can change verification, location or featured status.';
  end if;
  return new;
end;
$$;
create trigger businesses_guard before update on public.businesses
  for each row execute function private.guard_business_update();

alter table public.businesses enable row level security;
-- Owners manage their own listing; everyone else reads verified listings through the functions below.
create policy "own business read"   on public.businesses for select to authenticated using (owner_id = (select auth.uid()));
create policy "claim a business"    on public.businesses for insert to authenticated
  with check (owner_id = (select auth.uid()) and status = 'pending' and featured_until is null and review_note is null
              and not private.is_suspended((select auth.uid())));
create policy "own business edit"   on public.businesses for update to authenticated
  using (owner_id = (select auth.uid()) and not private.is_suspended((select auth.uid())))
  with check (owner_id = (select auth.uid()));
create policy "own business remove" on public.businesses for delete to authenticated using (owner_id = (select auth.uid()));

-- ---------- public reads (verified listings only; no owner identity) ----------
create function public.business_at(p_lat double precision, p_lng double precision, p_name text, p_osm text default null)
returns table (id uuid, name text, category text, description text, website text, phone text,
               max_rig_ft smallint, big_rig_parking boolean, hookups text, pets boolean, offer text,
               featured boolean, mine boolean, status text)
language sql stable security definer set search_path = '' as $$
  select b.id, b.name, b.category, b.description, b.website, b.phone, b.max_rig_ft, b.big_rig_parking, b.hookups, b.pets, b.offer,
         coalesce(b.featured_until > now(), false), b.owner_id = (select auth.uid()), b.status
  from public.businesses b
  where (select auth.uid()) is not null
    and (b.status = 'verified' and not private.is_suspended(b.owner_id) or b.owner_id = (select auth.uid()))
    and ((p_osm is not null and b.osm_id = p_osm)
         or (b.lat between p_lat - 0.01 and p_lat + 0.01 and b.lng between p_lng - 0.015 and p_lng + 0.015
             and private.same_place(p_lat, p_lng, p_name, p_osm, b.lat, b.lng, b.name, b.osm_id)))
  order by b.status = 'verified' desc, b.created_at
  limit 1;
$$;

-- Featured (paid, verified) businesses inside a bounding box; the app keeps those near the route.
create function public.featured_businesses(p_min_lat double precision, p_max_lat double precision,
                                           p_min_lng double precision, p_max_lng double precision)
returns table (id uuid, name text, category text, description text, website text, phone text, lat double precision, lng double precision,
               osm_id text, max_rig_ft smallint, big_rig_parking boolean, hookups text, pets boolean, offer text)
language sql stable security definer set search_path = '' as $$
  select b.id, b.name, b.category, b.description, b.website, b.phone, b.lat, b.lng, b.osm_id,
         b.max_rig_ft, b.big_rig_parking, b.hookups, b.pets, b.offer
  from public.businesses b
  where (select auth.uid()) is not null
    and b.status = 'verified' and b.featured_until > now() and not private.is_suspended(b.owner_id)
    and b.lat between p_min_lat and p_max_lat and b.lng between p_min_lng and p_max_lng
  limit 200;
$$;

-- Aggregate interest for the owner's dashboard: counts only, never who.
create function public.business_stats(p_business uuid)
returns table (saved bigint, visited bigint, here_now bigint, going bigint, reviews bigint, avg_rating numeric)
language plpgsql stable security definer set search_path = '' as $$
declare b public.businesses;
begin
  select * into b from public.businesses where id = p_business;
  if not found or (b.owner_id <> (select auth.uid()) and not private.is_admin()) then raise exception 'Not allowed'; end if;
  return query
    with p as (
      select pl.* from public.places pl
      where (b.osm_id is not null and pl.osm_id = b.osm_id)
         or (pl.lat between b.lat - 0.01 and b.lat + 0.01 and pl.lng between b.lng - 0.015 and b.lng + 0.015
             and private.same_place(b.lat, b.lng, b.name, b.osm_id, pl.lat, pl.lng, pl.name, pl.osm_id))
    ), c as (
      select ch.* from public.checkins ch
      where ch.ends_at > now() and (
        (b.osm_id is not null and ch.osm_id = b.osm_id)
        or (ch.lat between b.lat - 0.01 and b.lat + 0.01 and ch.lng between b.lng - 0.015 and b.lng + 0.015
            and private.same_place(b.lat, b.lng, b.name, b.osm_id, ch.lat, ch.lng, ch.name, ch.osm_id)))
    ), r as (
      select rv.* from public.reviews rv
      where not rv.hidden and not rv.approximate and (
        (b.osm_id is not null and rv.osm_id = b.osm_id)
        or (rv.lat between b.lat - 0.01 and b.lat + 0.01 and rv.lng between b.lng - 0.015 and b.lng + 0.015
            and private.same_place(b.lat, b.lng, b.name, b.osm_id, rv.lat, rv.lng, rv.name, rv.osm_id)))
    )
    select (select count(*) from p), (select count(*) from p where p.visited),
           (select count(*) from c where c.kind = 'here'), (select count(*) from c where c.kind = 'going'),
           (select count(*) from r), (select round(avg(r.rating)::numeric, 1) from r);
end;
$$;

-- ---------- admin ----------
create function public.admin_businesses(p_status text default 'pending')
returns table (id uuid, name text, status text, category text, lat double precision, lng double precision, osm_id text,
               website text, phone text, claimant_role text, claim_note text, review_note text,
               owner_name text, owner_email text, featured_until timestamptz, created_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_admin() then raise exception 'Not allowed'; end if;
  return query
    select b.id, b.name, b.status, b.category, b.lat, b.lng, b.osm_id, b.website, b.phone, b.claimant_role, b.claim_note, b.review_note,
           coalesce(p.display_name, private.first_name(b.owner_id)), u.email::text, b.featured_until, b.created_at
    from public.businesses b left join public.profiles p on p.id = b.owner_id left join auth.users u on u.id = b.owner_id
    where p_status = 'all' or b.status = p_status
    order by b.created_at desc
    limit 200;
end;
$$;

-- action: 'verify' | 'reject'
create function public.admin_review_business(p_business uuid, p_action text, p_note text default null) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_admin() then raise exception 'Not allowed'; end if;
  if p_action not in ('verify', 'reject') then raise exception 'Unknown action'; end if;
  update public.businesses
     set status = case when p_action = 'verify' then 'verified' else 'rejected' end,
         review_note = left(p_note, 1000),
         featured_until = case when p_action = 'reject' then null else featured_until end
   where id = p_business;
end;
$$;

-- Feature a verified business for N days from today (0 = stop featuring).
create function public.admin_feature_business(p_business uuid, p_days integer) returns timestamptz
language plpgsql security definer set search_path = '' as $$
declare until timestamptz;
begin
  if not private.is_admin() then raise exception 'Not allowed'; end if;
  if p_days < 0 or p_days > 400 then raise exception 'Days must be 0–400'; end if;
  update public.businesses
     set featured_until = case when p_days = 0 then null else greatest(coalesce(featured_until, now()), now()) + make_interval(days => p_days) end
   where id = p_business and status = 'verified'
  returning featured_until into until;
  if not found then raise exception 'Only verified businesses can be featured.'; end if;
  return until;
end;
$$;

revoke all on function public.business_at(double precision, double precision, text, text),
  public.featured_businesses(double precision, double precision, double precision, double precision),
  public.business_stats(uuid), public.admin_businesses(text), public.admin_review_business(uuid, text, text),
  public.admin_feature_business(uuid, integer) from public, anon;
grant execute on function public.business_at(double precision, double precision, text, text),
  public.featured_businesses(double precision, double precision, double precision, double precision),
  public.business_stats(uuid), public.admin_businesses(text), public.admin_review_business(uuid, text, text),
  public.admin_feature_business(uuid, integer) to authenticated;
