-- Moderation: reporting reviews, an admin role, hiding reviews and suspending accounts.

-- Admins live in their own table with no API policies: nobody can read or change it from the app.
create table public.admins (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.admins enable row level security;

create table public.suspensions (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  reason     text check (char_length(reason) <= 1000),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.suspensions enable row level security;

alter table public.reviews add column hidden boolean not null default false;

alter table public.reports
  add column review_id   uuid references public.reviews(id) on delete set null,
  add column status      text not null default 'open' check (status in ('open', 'dismissed', 'actioned')),
  add column resolution  text check (char_length(resolution) <= 1000),
  add column resolved_by uuid references auth.users(id) on delete set null,
  add column resolved_at timestamptz;
create index reports_status_idx on public.reports(status, created_at desc);

create function private.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.admins where user_id = (select auth.uid()));
$$;
create function private.is_suspended(uid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.suspensions where user_id = uid);
$$;
grant execute on function private.is_admin(), private.is_suspended(uuid) to authenticated;

-- ---------- suspended accounts can't post ----------
drop policy "own reviews add" on public.reviews;
drop policy "own reviews edit" on public.reviews;
create policy "own reviews add" on public.reviews for insert to authenticated
  with check (user_id = (select auth.uid()) and not private.is_suspended((select auth.uid())));
-- authors can't un-hide a review a moderator hid
create policy "own reviews edit" on public.reviews for update to authenticated
  using (user_id = (select auth.uid()) and not private.is_suspended((select auth.uid())))
  with check (user_id = (select auth.uid()) and not hidden);

drop policy "own checkins add" on public.checkins;
create policy "own checkins add" on public.checkins for insert to authenticated
  with check (user_id = (select auth.uid()) and not private.is_suspended((select auth.uid())));

drop policy "send allowed messages" on public.messages;
create policy "send allowed messages" on public.messages for insert to authenticated
  with check (sender_id = (select auth.uid()) and not private.is_suspended((select auth.uid())) and private.can_contact(recipient_id));

-- ---------- ...and their content stops showing to others ----------
create or replace function private.can_see_checkin(owner uuid, vis text) returns boolean
language sql stable security definer set search_path = '' as $$
  select (select auth.uid()) is not null and (
    owner = (select auth.uid())
    or (not private.is_suspended(owner) and not private.is_blocked(owner, (select auth.uid())) and (
          vis = 'everyone' or (vis = 'friends' and private.are_friends(owner, (select auth.uid()))))));
$$;

create or replace function private.can_contact(other uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select (select auth.uid()) is not null and other <> (select auth.uid())
    and not private.is_suspended(other)
    and not private.is_blocked((select auth.uid()), other)
    and (
      private.are_friends((select auth.uid()), other)
      or exists (select 1 from public.checkins c where c.user_id = other and c.ends_at > now() and private.can_see_checkin(c.user_id, c.visibility))
      or exists (select 1 from public.messages m where m.sender_id = other and m.recipient_id = (select auth.uid()))
    );
$$;

-- Reviews: hidden ones and those by suspended accounts only show to their author (marked hidden).
drop function public.place_reviews(double precision, double precision, text, text);
create function public.place_reviews(p_lat double precision, p_lng double precision, p_name text, p_osm text default null)
returns table (id uuid, rating smallint, parking text, cost text, note text, visited_on date,
               created_at timestamptz, reviewer text, mine boolean, hidden boolean)
language sql stable security definer set search_path = '' as $$
  select r.id, r.rating, r.parking, r.cost, r.note, r.visited_on, r.created_at,
         coalesce(nullif(split_part(trim(p.display_name), ' ', 1), ''), 'Traveler'),
         r.user_id = (select auth.uid()),
         r.hidden or private.is_suspended(r.user_id)
  from public.reviews r
  left join public.profiles p on p.id = r.user_id
  where (select auth.uid()) is not null
    and (r.user_id = (select auth.uid()) or (not r.approximate and not r.hidden and not private.is_suspended(r.user_id)))
    and (
      (p_osm is not null and r.osm_id = p_osm)
      or (r.lat between p_lat - 0.01 and p_lat + 0.01
          and r.lng between p_lng - 0.015 and p_lng + 0.015
          and private.same_place(p_lat, p_lng, p_name, p_osm, r.lat, r.lng, r.name, r.osm_id))
    )
  order by r.user_id = (select auth.uid()) desc, r.created_at desc
  limit 50;
$$;

create or replace function public.review_summaries(p_places jsonb)
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
      on (r.user_id = (select auth.uid()) or (not r.approximate and not r.hidden and not private.is_suspended(r.user_id)))
     and ((q.osm is not null and r.osm_id = q.osm)
          or (r.lat between q.lat - 0.01 and q.lat + 0.01
              and r.lng between q.lng - 0.015 and q.lng + 0.015
              and private.same_place(q.lat, q.lng, q.name, q.osm, r.lat, r.lng, r.name, r.osm_id)))
    group by q.k;
end;
$$;

-- ---------- reporting ----------
-- Report a review without the app ever learning who wrote it.
create function public.report_review(p_review uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare author uuid; me uuid := (select auth.uid());
begin
  if me is null then raise exception 'Not signed in'; end if;
  select user_id into author from public.reviews where id = p_review;
  if author is null then raise exception 'That review no longer exists.'; end if;
  if author = me then raise exception 'That’s your own review.'; end if;
  if exists (select 1 from public.reports where reporter_id = me and review_id = p_review and status = 'open') then return; end if;
  if (select count(*) from public.reports where reporter_id = me and created_at > now() - interval '1 day') >= 30 then
    raise exception 'You’ve sent a lot of reports today. Please try again tomorrow.';
  end if;
  insert into public.reports (reporter_id, reported_id, review_id, reason) values (me, author, p_review, left(trim(p_reason), 1000));
end;
$$;

-- What the app needs to know about the signed-in account.
create function public.my_account_status()
returns table (is_admin boolean, suspended boolean, suspended_reason text)
language sql stable security definer set search_path = '' as $$
  select private.is_admin(), s.user_id is not null, s.reason
  from (select 1) one left join public.suspensions s on s.user_id = (select auth.uid())
  where (select auth.uid()) is not null;
$$;

-- ---------- admin tools (every function checks is_admin) ----------
create function public.admin_reports(p_status text default 'open')
returns table (id uuid, kind text, status text, reason text, created_at timestamptz,
               reporter text, reported_id uuid, reported_name text, reported_email text, reported_suspended boolean,
               reports_against bigint, content text, review_id uuid, review_hidden boolean, resolution text, resolved_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_admin() then raise exception 'Not allowed'; end if;
  return query
    select r.id,
           case when r.review_id is not null then 'review' when r.message_id is not null then 'message' when r.checkin_id is not null then 'check-in' else 'person' end,
           r.status, r.reason, r.created_at,
           private.first_name(r.reporter_id),
           r.reported_id, coalesce(pr.display_name, private.first_name(r.reported_id)), u.email::text,
           private.is_suspended(r.reported_id),
           (select count(*) from public.reports x where x.reported_id = r.reported_id),
           coalesce(
             (select rv.rating || '★ ' || rv.name || coalesce(' — ' || rv.note, '') from public.reviews rv where rv.id = r.review_id),
             (select m.body from public.messages m where m.id = r.message_id),
             (select c.name || coalesce(' — ' || c.note, '') from public.checkins c where c.id = r.checkin_id)),
           r.review_id, (select rv.hidden from public.reviews rv where rv.id = r.review_id),
           r.resolution, r.resolved_at
    from public.reports r
    left join public.profiles pr on pr.id = r.reported_id
    left join auth.users u on u.id = r.reported_id
    where p_status = 'all' or r.status = p_status or (p_status = 'resolved' and r.status <> 'open')
    order by r.created_at desc
    limit 200;
end;
$$;

-- action: 'dismiss' | 'hide-review' | 'suspend' (suspend also hides the reported review, if any)
create function public.admin_resolve_report(p_report uuid, p_action text, p_note text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare rep public.reports;
begin
  if not private.is_admin() then raise exception 'Not allowed'; end if;
  select * into rep from public.reports where id = p_report for update;
  if not found then raise exception 'Report not found'; end if;
  if p_action not in ('dismiss', 'hide-review', 'suspend') then raise exception 'Unknown action'; end if;
  if p_action in ('hide-review', 'suspend') and rep.review_id is not null then
    update public.reviews set hidden = true where id = rep.review_id;
  end if;
  if p_action = 'suspend' then
    if exists (select 1 from public.admins where user_id = rep.reported_id) then raise exception 'Admins can’t be suspended here.'; end if;
    insert into public.suspensions (user_id, reason, created_by) values (rep.reported_id, coalesce(p_note, rep.reason), (select auth.uid()))
      on conflict (user_id) do nothing;
    -- end their current check-ins so they disappear right away
    update public.checkins set ends_at = greatest(now(), starts_at + interval '1 millisecond') where user_id = rep.reported_id and ends_at > now();
  end if;
  -- resolve this report and any other open ones about the same thing
  update public.reports set status = case when p_action = 'dismiss' then 'dismissed' else 'actioned' end,
         resolution = coalesce(left(p_note, 1000), p_action), resolved_by = (select auth.uid()), resolved_at = now()
   where status = 'open'
     and (id = p_report
          or (p_action <> 'dismiss' and rep.review_id is not null and review_id = rep.review_id)
          or (p_action = 'suspend' and reported_id = rep.reported_id));
end;
$$;

create function public.admin_suspended()
returns table (user_id uuid, name text, email text, reason text, created_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_admin() then raise exception 'Not allowed'; end if;
  return query
    select s.user_id, coalesce(p.display_name, private.first_name(s.user_id)), u.email::text, s.reason, s.created_at
    from public.suspensions s left join public.profiles p on p.id = s.user_id left join auth.users u on u.id = s.user_id
    order by s.created_at desc;
end;
$$;

create function public.admin_unsuspend(p_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_admin() then raise exception 'Not allowed'; end if;
  delete from public.suspensions where user_id = p_user;
end;
$$;

create function public.admin_set_review_hidden(p_review uuid, p_hidden boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_admin() then raise exception 'Not allowed'; end if;
  update public.reviews set hidden = p_hidden where id = p_review;
end;
$$;

revoke all on function public.report_review(uuid, text), public.my_account_status(), public.admin_reports(text),
  public.admin_resolve_report(uuid, text, text), public.admin_suspended(), public.admin_unsuspend(uuid),
  public.admin_set_review_hidden(uuid, boolean), public.place_reviews(double precision, double precision, text, text)
  from public, anon;
grant execute on function public.report_review(uuid, text), public.my_account_status(), public.admin_reports(text),
  public.admin_resolve_report(uuid, text, text), public.admin_suspended(), public.admin_unsuspend(uuid),
  public.admin_set_review_hidden(uuid, boolean), public.place_reviews(double precision, double precision, text, text)
  to authenticated;
