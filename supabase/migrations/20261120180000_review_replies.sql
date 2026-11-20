-- Sprint 10: verified business owners can publicly reply to reviews of their place.
-- Replies live in their own table (written only through reply_to_review) so reviewers can't edit them
-- and owners can't touch the review itself.

create table public.review_replies (
  review_id   uuid primary key references public.reviews(id) on delete cascade,
  business_id uuid not null references public.businesses(id) on delete cascade,
  reply       text not null check (char_length(reply) between 1 and 500),
  hidden      boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index review_replies_business_idx on public.review_replies(business_id);
alter table public.review_replies enable row level security;  -- no policies: read via place_reviews, write via reply_to_review

-- The verified, unsuspended business the current user owns at this review's place (or null).
create function private.my_business_for_review(p_review uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select b.id
  from public.reviews r
  join public.businesses b
    on b.owner_id = (select auth.uid()) and b.status = 'verified' and not private.is_suspended(b.owner_id)
   and ((b.osm_id is not null and r.osm_id = b.osm_id)
        or (r.lat between b.lat - 0.01 and b.lat + 0.01 and r.lng between b.lng - 0.015 and b.lng + 0.015
            and private.same_place(b.lat, b.lng, b.name, b.osm_id, r.lat, r.lng, r.name, r.osm_id)))
  where r.id = p_review and not r.approximate
  limit 1;
$$;

-- Reply, edit a reply, or remove it (empty text).
create function public.reply_to_review(p_review uuid, p_reply text) returns void
language plpgsql security definer set search_path = '' as $$
declare biz uuid := private.my_business_for_review(p_review);
begin
  if biz is null then raise exception 'Only the verified owner of this place can reply.'; end if;
  if coalesce(trim(p_reply), '') = '' then
    delete from public.review_replies where review_id = p_review;
  else
    insert into public.review_replies (review_id, business_id, reply)
    values (p_review, biz, left(trim(p_reply), 500))
    on conflict (review_id) do update
      set reply = excluded.reply, business_id = excluded.business_id, updated_at = now();  -- stays hidden if a moderator hid it
  end if;
end;
$$;

drop function public.place_reviews(double precision, double precision, text, text);
create function public.place_reviews(p_lat double precision, p_lng double precision, p_name text, p_osm text default null)
returns table (id uuid, rating smallint, parking text, cost text, note text, visited_on date, created_at timestamptz,
               reviewer text, mine boolean, hidden boolean,
               reply text, reply_at timestamptz, reply_from text, can_reply boolean)
language sql stable security definer set search_path = '' as $$
  select r.id, r.rating, r.parking, r.cost, r.note, r.visited_on, r.created_at,
         coalesce(nullif(split_part(trim(p.display_name), ' ', 1), ''), 'Traveler'),
         r.user_id = (select auth.uid()),
         r.hidden or private.is_suspended(r.user_id),
         case when rr.review_id is not null and not rr.hidden and b.status = 'verified' and not private.is_suspended(b.owner_id) then rr.reply end,
         case when rr.review_id is not null and not rr.hidden and b.status = 'verified' and not private.is_suspended(b.owner_id) then rr.updated_at end,
         case when rr.review_id is not null and not rr.hidden and b.status = 'verified' and not private.is_suspended(b.owner_id) then b.name end,
         r.user_id <> (select auth.uid()) and private.my_business_for_review(r.id) is not null
  from public.reviews r
  left join public.profiles p on p.id = r.user_id
  left join public.review_replies rr on rr.review_id = r.id
  left join public.businesses b on b.id = rr.business_id
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

-- Admins can hide an inappropriate reply.
create function public.admin_set_reply_hidden(p_review uuid, p_hidden boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_admin() then raise exception 'Not allowed'; end if;
  update public.review_replies set hidden = p_hidden where review_id = p_review;
end;
$$;

revoke all on function private.my_business_for_review(uuid) from public, anon;
revoke all on function public.place_reviews(double precision, double precision, text, text),
  public.reply_to_review(uuid, text), public.admin_set_reply_hidden(uuid, boolean) from public, anon;
grant execute on function private.my_business_for_review(uuid) to authenticated;
grant execute on function public.place_reviews(double precision, double precision, text, text),
  public.reply_to_review(uuid, text), public.admin_set_reply_hidden(uuid, boolean) to authenticated;
