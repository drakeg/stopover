-- Tests for owner replies to reviews. Run after the migration inside a transaction; always rolls back
-- (ends with 'ALL PASSED'). A = verified business owner, G = admin who wrote a review.
do $$
declare
  a uuid := 'dd16b9ef-cfda-4f26-9302-f59b2532c225';
  g uuid := 'd0913fc4-de12-4b99-ba3c-b833c7c1f378';
  rv uuid; far uuid; ok boolean; r record; n int;
begin
  insert into public.businesses (owner_id, status, name, lat, lng, osm_id) values (a, 'verified', 'Reply Test Camp', 36.2, -84.2, 'node/reply-test');
  insert into public.reviews (user_id, name, lat, lng, osm_id, rating, note) values (g, 'Reply Test Camp', 36.2, -84.2, 'node/reply-test', 3, 'Muddy sites') returning id into rv;
  insert into public.reviews (user_id, name, lat, lng, rating) values (g, 'Somewhere else', 40, -80, 4) returning id into far;

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', g, 'role', 'authenticated')::text, true);
  select * into r from public.place_reviews(36.2, -84.2, 'Reply Test Camp', 'node/reply-test') where id = rv;
  assert not r.can_reply, 'reviewer cannot reply to own review';
  ok := false; begin perform public.reply_to_review(rv, 'hi'); exception when others then ok := true; end;
  assert ok, 'non-owner cannot reply';

  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  select * into r from public.place_reviews(36.2, -84.2, 'Reply Test Camp', 'node/reply-test') where id = rv;
  assert r.can_reply and r.reply is null, 'owner can reply';
  perform public.reply_to_review(rv, '  Thanks — we regraded the sites in October.  ');
  ok := false; begin perform public.reply_to_review(far, 'spam'); exception when others then ok := true; end;
  assert ok, 'owner cannot reply to reviews of other places';
  ok := false; begin insert into public.review_replies (review_id, business_id, reply) select far, id, 'x' from public.businesses limit 1; exception when others then ok := true; end;
  assert ok, 'no direct writes';

  perform set_config('request.jwt.claims', json_build_object('sub', g, 'role', 'authenticated')::text, true);
  select * into r from public.place_reviews(36.2, -84.2, 'Reply Test Camp', 'node/reply-test') where id = rv;
  assert r.reply = 'Thanks — we regraded the sites in October.' and r.reply_from = 'Reply Test Camp', 'everyone sees the reply';
  update public.review_replies set reply = 'edited by reviewer' where review_id = rv;
  get diagnostics n = row_count;
  assert n = 0, 'reviewer cannot edit the reply';
  perform public.admin_set_reply_hidden(rv, true);
  select * into r from public.place_reviews(36.2, -84.2, 'Reply Test Camp', 'node/reply-test') where id = rv;
  assert r.reply is null, 'hidden replies disappear';

  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  ok := false; begin perform public.admin_set_reply_hidden(rv, false); exception when others then ok := true; end;
  assert ok, 'owner cannot un-hide';
  perform public.reply_to_review(rv, 'edited after hide');
  execute 'reset role';
  select count(*) into n from public.review_replies where review_id = rv and hidden;
  assert n = 1, 'editing keeps a hidden reply hidden';
  execute 'set local role authenticated';
  perform public.reply_to_review(rv, '');
  execute 'reset role';
  select count(*) into n from public.review_replies where review_id = rv;
  assert n = 0, 'empty reply removes it';

  raise exception 'ALL PASSED';
end $$;
