-- Meet-ups: "I'm here" / "I'm going" check-ins at places, friends, in-app messages, blocks and reports.
-- Check-ins are always tied to a place (an attraction), never to live GPS tracking.

-- ---------- preferences ----------
alter table public.profiles
  add column presence_visibility text not null default 'friends'
    check (presence_visibility in ('no-one', 'friends', 'everyone')),
  add column rig text check (char_length(rig) <= 40);

-- ---------- friends ----------
create table public.friendships (
  user_a     uuid not null references auth.users(id) on delete cascade,
  user_b     uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_a, user_b),
  check (user_a < user_b)
);
create index friendships_b_idx on public.friendships(user_b);

create table public.friend_invites (
  id         uuid primary key default gen_random_uuid(),
  code       text not null unique default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  created_by uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '7 days',
  used_by    uuid references auth.users(id) on delete set null,
  used_at    timestamptz
);

create table public.blocks (
  blocker_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  blocked_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

-- ---------- check-ins ----------
create table public.checkins (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind       text not null check (kind in ('here', 'going')),
  place_id   uuid references public.places(id) on delete set null,
  osm_id     text check (char_length(osm_id) <= 40),
  name       text not null check (char_length(name) between 1 and 200),
  lat        double precision not null check (lat between -90 and 90),
  lng        double precision not null check (lng between -180 and 180),
  visit_date date,                       -- the day, for "going"
  starts_at  timestamptz not null default now(),
  ends_at    timestamptz not null,       -- "here": now + 4 h; "going": end of that day (user's time zone)
  note       text check (char_length(note) <= 140),
  visibility text not null check (visibility in ('no-one', 'friends', 'everyone')),
  created_at timestamptz not null default now(),
  check (ends_at > starts_at),
  check (ends_at <= starts_at + interval '2 days'),
  check (starts_at <= now() + interval '400 days')
);
create index checkins_ends_idx on public.checkins(ends_at);
create index checkins_user_idx on public.checkins(user_id);
create index checkins_osm_idx on public.checkins(osm_id) where osm_id is not null;
create index checkins_latlng_idx on public.checkins(lat, lng);

-- ---------- messages & reports ----------
create table public.messages (
  id           uuid primary key default gen_random_uuid(),
  sender_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  recipient_id uuid not null references auth.users(id) on delete cascade,
  checkin_id   uuid references public.checkins(id) on delete set null, -- what the conversation started from
  body         text not null check (char_length(body) between 1 and 1000),
  created_at   timestamptz not null default now(),
  read_at      timestamptz,
  check (sender_id <> recipient_id)
);
create index messages_recipient_idx on public.messages(recipient_id, created_at desc);
create index messages_sender_idx on public.messages(sender_id, created_at desc);

create table public.reports (
  id          uuid primary key default gen_random_uuid(),
  reporter_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  reported_id uuid not null references auth.users(id) on delete cascade,
  message_id  uuid references public.messages(id) on delete set null,
  checkin_id  uuid references public.checkins(id) on delete set null,
  reason      text check (char_length(reason) <= 1000),
  created_at  timestamptz not null default now()
);

-- ---------- helpers (not exposed through the API) ----------
create function private.first_name(uid uuid) returns text
language sql stable security definer set search_path = '' as $$
  select coalesce((select nullif(split_part(trim(p.display_name), ' ', 1), '') from public.profiles p where p.id = uid), 'Traveler');
$$;

-- Friends = an accepted friend invite, or sharing a list.
create function private.are_friends(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select a <> b and (
    exists (select 1 from public.friendships f where f.user_a = least(a, b) and f.user_b = greatest(a, b))
    or exists (select 1 from public.list_members m1 join public.list_members m2 on m1.list_id = m2.list_id
               where m1.user_id = a and m2.user_id = b));
$$;

create function private.is_blocked(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.blocks x where (x.blocker_id = a and x.blocked_id = b) or (x.blocker_id = b and x.blocked_id = a));
$$;

create function private.can_see_checkin(owner uuid, vis text) returns boolean
language sql stable security definer set search_path = '' as $$
  select (select auth.uid()) is not null and (
    owner = (select auth.uid())
    or (not private.is_blocked(owner, (select auth.uid())) and (
          vis = 'everyone' or (vis = 'friends' and private.are_friends(owner, (select auth.uid()))))));
$$;

-- You may message someone who is your friend, whose current check-in you can see, or who has messaged you.
create function private.can_contact(other uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select (select auth.uid()) is not null and other <> (select auth.uid())
    and not private.is_blocked((select auth.uid()), other)
    and (
      private.are_friends((select auth.uid()), other)
      or exists (select 1 from public.checkins c where c.user_id = other and c.ends_at > now() and private.can_see_checkin(c.user_id, c.visibility))
      or exists (select 1 from public.messages m where m.sender_id = other and m.recipient_id = (select auth.uid()))
    );
$$;

grant execute on function private.first_name(uuid), private.are_friends(uuid, uuid), private.is_blocked(uuid, uuid),
  private.can_see_checkin(uuid, text), private.can_contact(uuid) to authenticated;

-- Spam brakes
create function private.limit_messages() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (select count(*) from public.messages where sender_id = new.sender_id and created_at > now() - interval '1 hour') >= 60 then
    raise exception 'You’re sending messages too quickly. Please wait a bit.';
  end if;
  if not exists (select 1 from public.messages where sender_id = new.recipient_id and recipient_id = new.sender_id)
     and (select count(distinct recipient_id) from public.messages
          where sender_id = new.sender_id and created_at > now() - interval '1 day'
            and not exists (select 1 from public.messages r where r.sender_id = messages.recipient_id and r.recipient_id = new.sender_id)) >= 20 then
    raise exception 'You’ve started a lot of new conversations today. Please try again tomorrow.';
  end if;
  return new;
end;
$$;
create trigger messages_limit before insert on public.messages for each row execute function private.limit_messages();

create function private.limit_checkins() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (select count(*) from public.checkins where user_id = new.user_id and ends_at > now()) >= 30 then
    raise exception 'You have a lot of upcoming check-ins already. Remove some first.';
  end if;
  return new;
end;
$$;
create trigger checkins_limit before insert on public.checkins for each row execute function private.limit_checkins();

-- ---------- row-level security ----------
alter table public.friendships    enable row level security;
alter table public.friend_invites enable row level security;
alter table public.blocks         enable row level security;
alter table public.checkins       enable row level security;
alter table public.messages       enable row level security;
alter table public.reports        enable row level security;

create policy "see own friendships"    on public.friendships for select to authenticated using ((select auth.uid()) in (user_a, user_b));
create policy "end own friendships"    on public.friendships for delete to authenticated using ((select auth.uid()) in (user_a, user_b));

create policy "own friend invites"     on public.friend_invites for select to authenticated using (created_by = (select auth.uid()));
create policy "make friend invites"    on public.friend_invites for insert to authenticated with check (created_by = (select auth.uid()));
create policy "revoke friend invites"  on public.friend_invites for delete to authenticated using (created_by = (select auth.uid()));

create policy "own blocks read"        on public.blocks for select to authenticated using (blocker_id = (select auth.uid()));
create policy "own blocks add"         on public.blocks for insert to authenticated with check (blocker_id = (select auth.uid()));
create policy "own blocks remove"      on public.blocks for delete to authenticated using (blocker_id = (select auth.uid()));

-- Others' check-ins only through the functions below (first name + rig, no ids beyond what's needed to message).
create policy "own checkins read"      on public.checkins for select to authenticated using (user_id = (select auth.uid()));
create policy "own checkins add"       on public.checkins for insert to authenticated with check (user_id = (select auth.uid()));
create policy "own checkins edit"      on public.checkins for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own checkins remove"    on public.checkins for delete to authenticated using (user_id = (select auth.uid()));

create policy "own conversations"      on public.messages for select to authenticated
  using (sender_id = (select auth.uid()) or recipient_id = (select auth.uid()));
create policy "send allowed messages"  on public.messages for insert to authenticated
  with check (sender_id = (select auth.uid()) and private.can_contact(recipient_id));

create policy "file reports"           on public.reports for insert to authenticated with check (reporter_id = (select auth.uid()));
create policy "own reports"            on public.reports for select to authenticated using (reporter_id = (select auth.uid()));

-- ---------- functions the app calls ----------
create function public.who_is_at(p_lat double precision, p_lng double precision, p_name text, p_osm text default null)
returns table (checkin_id uuid, user_id uuid, first_name text, rig text, kind text, visit_date date,
               starts_at timestamptz, ends_at timestamptz, note text, is_friend boolean, mine boolean)
language sql stable security definer set search_path = '' as $$
  select c.id, c.user_id, private.first_name(c.user_id), p.rig, c.kind, c.visit_date, c.starts_at, c.ends_at, c.note,
         private.are_friends(c.user_id, (select auth.uid())), c.user_id = (select auth.uid())
  from public.checkins c
  left join public.profiles p on p.id = c.user_id
  where c.ends_at > now()
    and private.can_see_checkin(c.user_id, c.visibility)
    and ((p_osm is not null and c.osm_id = p_osm)
         or (c.lat between p_lat - 0.01 and p_lat + 0.01 and c.lng between p_lng - 0.015 and p_lng + 0.015
             and private.same_place(p_lat, p_lng, p_name, p_osm, c.lat, c.lng, c.name, c.osm_id)))
  order by c.kind = 'here' desc, c.starts_at
  limit 100;
$$;

-- Counts of others here now / going, for many places at once (badges in lists).
create function public.presence_summaries(p_places jsonb)
returns table (key text, here_count bigint, going_count bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null then raise exception 'Not signed in'; end if;
  if jsonb_array_length(p_places) > 500 then raise exception 'Too many places'; end if;
  return query
    with q as (
      select x->>'key' as k, (x->>'lat')::float8 as lat, (x->>'lng')::float8 as lng, x->>'name' as name, nullif(x->>'osm', '') as osm
      from jsonb_array_elements(p_places) x
    )
    select q.k, count(*) filter (where c.kind = 'here'), count(*) filter (where c.kind = 'going')
    from q
    join public.checkins c
      on c.ends_at > now() and c.user_id <> (select auth.uid())
     and private.can_see_checkin(c.user_id, c.visibility)
     and ((q.osm is not null and c.osm_id = q.osm)
          or (c.lat between q.lat - 0.01 and q.lat + 0.01 and c.lng between q.lng - 0.015 and q.lng + 0.015
              and private.same_place(q.lat, q.lng, q.name, q.osm, c.lat, c.lng, c.name, c.osm_id)))
    group by q.k;
end;
$$;

-- What your friends are up to (current and upcoming), anywhere.
create function public.friends_plans()
returns table (checkin_id uuid, user_id uuid, first_name text, rig text, kind text, place_name text,
               lat double precision, lng double precision, osm_id text, visit_date date, starts_at timestamptz, ends_at timestamptz, note text)
language sql stable security definer set search_path = '' as $$
  select c.id, c.user_id, private.first_name(c.user_id), p.rig, c.kind, c.name, c.lat, c.lng, c.osm_id, c.visit_date, c.starts_at, c.ends_at, c.note
  from public.checkins c
  left join public.profiles p on p.id = c.user_id
  where c.ends_at > now()
    and c.user_id <> (select auth.uid())
    and private.are_friends(c.user_id, (select auth.uid()))
    and private.can_see_checkin(c.user_id, c.visibility)
  order by c.starts_at
  limit 200;
$$;

create function public.my_friends()
returns table (user_id uuid, first_name text, rig text, via_invite boolean, shared_lists text[])
language sql stable security definer set search_path = '' as $$
  with me as (select (select auth.uid()) as id),
  people as (
    select case when f.user_a = me.id then f.user_b else f.user_a end as uid from public.friendships f, me where me.id in (f.user_a, f.user_b)
    union
    select m2.user_id from public.list_members m1 join public.list_members m2 on m1.list_id = m2.list_id, me
    where m1.user_id = me.id and m2.user_id <> me.id
  )
  select pe.uid, private.first_name(pe.uid), pr.rig,
         exists (select 1 from public.friendships f, me where f.user_a = least(me.id, pe.uid) and f.user_b = greatest(me.id, pe.uid)),
         array(select l.name from public.lists l join public.list_members a on a.list_id = l.id join public.list_members b on b.list_id = l.id, me
               where a.user_id = me.id and b.user_id = pe.uid order by l.name)
  from people pe left join public.profiles pr on pr.id = pe.uid
  where not private.is_blocked((select auth.uid()), pe.uid)
  order by 2;
$$;

create function public.friend_invite_info(p_code text)
returns table (inviter text, status text)
language plpgsql stable security definer set search_path = '' as $$
declare inv public.friend_invites; me uuid := (select auth.uid());
begin
  if me is null then raise exception 'Not signed in'; end if;
  select * into inv from public.friend_invites where code = p_code;
  if not found then return query select null::text, 'invalid'::text; return; end if;
  return query select private.first_name(inv.created_by),
    case when inv.created_by = me then 'self'
         when private.are_friends(inv.created_by, me) then 'friends'
         when inv.used_at is not null then 'used'
         when inv.expires_at < now() then 'expired'
         else 'ok' end;
end;
$$;

create function public.accept_friend_invite(p_code text) returns text
language plpgsql security definer set search_path = '' as $$
declare inv public.friend_invites; me uuid := (select auth.uid());
begin
  if me is null then raise exception 'Not signed in'; end if;
  select * into inv from public.friend_invites where code = p_code for update;
  if not found then raise exception 'This invite link isn''t valid.'; end if;
  if inv.created_by = me then raise exception 'That’s your own invite link — send it to a friend.'; end if;
  if exists (select 1 from public.friendships where user_a = least(me, inv.created_by) and user_b = greatest(me, inv.created_by)) then
    return private.first_name(inv.created_by);
  end if;
  if inv.used_at is not null then raise exception 'This invite link has already been used. Ask for a new one.'; end if;
  if inv.expires_at < now() then raise exception 'This invite link has expired. Ask for a new one.'; end if;
  insert into public.friendships (user_a, user_b) values (least(me, inv.created_by), greatest(me, inv.created_by));
  update public.friend_invites set used_by = me, used_at = now() where id = inv.id;
  -- becoming friends lifts any block between you
  delete from public.blocks where (blocker_id = me and blocked_id = inv.created_by) or (blocker_id = inv.created_by and blocked_id = me);
  return private.first_name(inv.created_by);
end;
$$;

create function public.remove_friend(p_other uuid) returns void
language sql security definer set search_path = '' as $$
  delete from public.friendships
  where user_a = least((select auth.uid()), p_other) and user_b = greatest((select auth.uid()), p_other);
$$;

create function public.my_conversations()
returns table (other_id uuid, first_name text, rig text, last_body text, last_at timestamptz,
               last_from_me boolean, unread bigint, can_reply boolean)
language sql stable security definer set search_path = '' as $$
  with me as (select (select auth.uid()) as id),
  mine as (
    select m.*, case when m.sender_id = me.id then m.recipient_id else m.sender_id end as other
    from public.messages m, me where me.id in (m.sender_id, m.recipient_id)
  ),
  latest as (select distinct on (other) other, body, created_at, sender_id from mine order by other, created_at desc)
  select l.other, private.first_name(l.other), p.rig, l.body, l.created_at, l.sender_id = (select id from me),
         (select count(*) from mine x where x.other = l.other and x.recipient_id = (select id from me) and x.read_at is null),
         private.can_contact(l.other)
  from latest l left join public.profiles p on p.id = l.other
  where not exists (select 1 from public.blocks b where b.blocker_id = (select id from me) and b.blocked_id = l.other)
  order by l.created_at desc;
$$;

create function public.traveler(p_other uuid)
returns table (first_name text, rig text, is_friend boolean, can_message boolean)
language sql stable security definer set search_path = '' as $$
  select private.first_name(p_other), p.rig, private.are_friends(p_other, (select auth.uid())), private.can_contact(p_other)
  from (select 1) one left join public.profiles p on p.id = p_other
  where (select auth.uid()) is not null;
$$;

create function public.mark_read(p_other uuid) returns void
language sql security definer set search_path = '' as $$
  update public.messages set read_at = now()
  where recipient_id = (select auth.uid()) and sender_id = p_other and read_at is null;
$$;

create function public.blocked_people()
returns table (user_id uuid, first_name text, blocked_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select b.blocked_id, private.first_name(b.blocked_id), b.created_at from public.blocks b
  where b.blocker_id = (select auth.uid()) order by b.created_at desc;
$$;

revoke all on function public.who_is_at(double precision, double precision, text, text), public.presence_summaries(jsonb),
  public.friends_plans(), public.my_friends(), public.friend_invite_info(text), public.accept_friend_invite(text),
  public.remove_friend(uuid), public.my_conversations(), public.traveler(uuid), public.mark_read(uuid), public.blocked_people()
  from public, anon;
grant execute on function public.who_is_at(double precision, double precision, text, text), public.presence_summaries(jsonb),
  public.friends_plans(), public.my_friends(), public.friend_invite_info(text), public.accept_friend_invite(text),
  public.remove_friend(uuid), public.my_conversations(), public.traveler(uuid), public.mark_read(uuid), public.blocked_people()
  to authenticated;

-- Live chat (Realtime applies the policies above: you only receive your own conversations).
alter publication supabase_realtime add table public.messages;
