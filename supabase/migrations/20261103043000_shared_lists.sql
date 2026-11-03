-- Shared lists: places belong to a list; lists can have several members.

-- Helpers live in a schema the API doesn't expose.
create schema if not exists private;
grant usage on schema private to authenticated;

create table public.lists (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (char_length(name) between 1 and 80),
  owner_id   uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index lists_owner_idx on public.lists(owner_id);

create table public.list_members (
  list_id   uuid not null references public.lists(id) on delete cascade,
  user_id   uuid not null references auth.users(id) on delete cascade,
  role      text not null default 'editor' check (role in ('owner', 'editor')),
  joined_at timestamptz not null default now(),
  primary key (list_id, user_id)
);
create index list_members_user_idx on public.list_members(user_id);

-- Single-use invite links, valid 7 days. Code is 64 hex chars (two UUIDs' worth of randomness).
create table public.list_invites (
  id         uuid primary key default gen_random_uuid(),
  list_id    uuid not null references public.lists(id) on delete cascade,
  code       text not null unique default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  created_by uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '7 days',
  used_by    uuid references auth.users(id) on delete set null,
  used_at    timestamptz
);
create index list_invites_list_idx on public.list_invites(list_id);

create function private.is_list_member(lid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.list_members m where m.list_id = lid and m.user_id = (select auth.uid()));
$$;

create function private.is_list_owner(lid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.lists l where l.id = lid and l.owner_id = (select auth.uid()));
$$;

grant execute on function private.is_list_member(uuid), private.is_list_owner(uuid) to authenticated;

-- Whoever creates a list is automatically its owner-member.
create function private.add_owner_membership() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.list_members (list_id, user_id, role) values (new.id, new.owner_id, 'owner')
  on conflict (list_id, user_id) do update set role = 'owner';
  return new;
end;
$$;
create trigger lists_add_owner after insert on public.lists
  for each row execute function private.add_owner_membership();

-- ---------- Move existing places into a personal list per user ----------
insert into public.lists (name, owner_id) select 'My places', u.id from auth.users u;

alter table public.places add column list_id uuid references public.lists(id) on delete cascade;
update public.places p set list_id = l.id from public.lists l where l.owner_id = p.user_id;
alter table public.places alter column list_id set not null;
create index places_list_idx on public.places(list_id);

-- user_id now means "added by"; keep the place if that person deletes their account
alter table public.places alter column user_id drop not null;
alter table public.places drop constraint places_user_id_fkey;
alter table public.places add constraint places_user_id_fkey
  foreign key (user_id) references auth.users(id) on delete set null;

drop policy "own places select" on public.places;
drop policy "own places insert" on public.places;
drop policy "own places update" on public.places;
drop policy "own places delete" on public.places;
create policy "list members read places"   on public.places for select to authenticated using (private.is_list_member(list_id));
create policy "list members add places"    on public.places for insert to authenticated with check (private.is_list_member(list_id));
create policy "list members edit places"   on public.places for update to authenticated using (private.is_list_member(list_id)) with check (private.is_list_member(list_id));
create policy "list members remove places" on public.places for delete to authenticated using (private.is_list_member(list_id));

alter table public.profiles add column active_list_id uuid references public.lists(id) on delete set null;

-- ---------- Row-level security for the new tables ----------
alter table public.lists        enable row level security;
alter table public.list_members enable row level security;
alter table public.list_invites enable row level security;

-- owner_id check lets the creator read the row back before the membership trigger has run
create policy "members see lists"   on public.lists for select to authenticated using (owner_id = (select auth.uid()) or private.is_list_member(id));
create policy "create own lists"    on public.lists for insert to authenticated with check (owner_id = (select auth.uid()));
create policy "owner renames list"  on public.lists for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy "owner deletes list"  on public.lists for delete to authenticated using (owner_id = (select auth.uid()));

create policy "members see members" on public.list_members for select to authenticated using (private.is_list_member(list_id));
-- leave a list (not as owner), or the owner removes someone else
create policy "leave or remove"     on public.list_members for delete to authenticated using (
  (user_id = (select auth.uid()) and role <> 'owner') or (private.is_list_owner(list_id) and user_id <> (select auth.uid()))
);
-- (joining happens only through accept_invite)

create policy "members see invites"    on public.list_invites for select to authenticated using (private.is_list_member(list_id));
create policy "members create invites" on public.list_invites for insert to authenticated with check (private.is_list_member(list_id) and created_by = (select auth.uid()));
create policy "members revoke invites" on public.list_invites for delete to authenticated using (private.is_list_member(list_id));

-- ---------- Invite functions ----------
-- What an invite is for, shown before joining. Reveals only the list name, inviter's name and place count.
create function public.invite_info(p_code text)
returns table (list_id uuid, list_name text, inviter text, place_count bigint, status text)
language plpgsql stable security definer set search_path = '' as $$
declare inv public.list_invites;
begin
  if (select auth.uid()) is null then raise exception 'Not signed in'; end if;
  select * into inv from public.list_invites where code = p_code;
  if not found then
    return query select null::uuid, null::text, null::text, null::bigint, 'invalid'::text; return;
  end if;
  return query
    select l.id, l.name,
           coalesce(nullif(p.display_name, ''), split_part(u.email, '@', 1))::text,
           (select count(*) from public.places pl where pl.list_id = l.id),
           case
             when exists (select 1 from public.list_members m where m.list_id = l.id and m.user_id = (select auth.uid())) then 'member'
             when inv.used_at is not null then 'used'
             when inv.expires_at < now() then 'expired'
             else 'ok'
           end
    from public.lists l
    left join public.profiles p on p.id = inv.created_by
    left join auth.users u on u.id = inv.created_by
    where l.id = inv.list_id;
end;
$$;

create function public.accept_invite(p_code text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare inv public.list_invites; uid uuid := (select auth.uid());
begin
  if uid is null then raise exception 'Not signed in'; end if;
  select * into inv from public.list_invites where code = p_code for update;
  if not found then raise exception 'This invite link isn''t valid.'; end if;
  if exists (select 1 from public.list_members where list_id = inv.list_id and user_id = uid) then return inv.list_id; end if;
  if inv.used_at is not null then raise exception 'This invite link has already been used. Ask for a new one.'; end if;
  if inv.expires_at < now() then raise exception 'This invite link has expired. Ask for a new one.'; end if;
  insert into public.list_members (list_id, user_id, role) values (inv.list_id, uid, 'editor');
  update public.list_invites set used_by = uid, used_at = now() where id = inv.id;
  return inv.list_id;
end;
$$;

-- Members of a list with names, for the people on that list only.
create function public.list_members_named(p_list uuid)
returns table (user_id uuid, role text, display_name text, email text, joined_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_list_member(p_list) then raise exception 'Not a member of this list'; end if;
  return query
    select m.user_id, m.role, p.display_name, u.email::text, m.joined_at
    from public.list_members m
    left join public.profiles p on p.id = m.user_id
    left join auth.users u on u.id = m.user_id
    where m.list_id = p_list
    order by m.role = 'owner' desc, m.joined_at;
end;
$$;

revoke all on function public.invite_info(text), public.accept_invite(text), public.list_members_named(uuid) from public, anon;
grant execute on function public.invite_info(text), public.accept_invite(text), public.list_members_named(uuid) to authenticated;

-- ---------- Account deletion keeps shared lists alive ----------
create or replace function public.delete_my_account()
returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'Not signed in'; end if;
  -- Hand shared lists to the longest-standing other member
  update public.lists l
     set owner_id = (select m.user_id from public.list_members m
                     where m.list_id = l.id and m.user_id <> uid order by m.joined_at limit 1)
   where l.owner_id = uid
     and exists (select 1 from public.list_members m where m.list_id = l.id and m.user_id <> uid);
  update public.list_members m set role = 'owner'
    from public.lists l where l.id = m.list_id and l.owner_id = m.user_id and m.role <> 'owner';
  -- Lists only this user had go with the account (places cascade); places they added to shared lists stay.
  delete from auth.users where id = uid;
end;
$$;

-- Live updates to places for everyone on a list (Realtime applies the policies above).
alter publication supabase_realtime add table public.places;
