-- RLS / permission tests for business listings. Runs inside a transaction and always rolls back
-- (the last statement raises 'ALL PASSED'). Users: A = ordinary account, G = admin.
do $$
declare
  a uuid := 'dd16b9ef-cfda-4f26-9302-f59b2532c225';
  g uuid := 'd0913fc4-de12-4b99-ba3c-b833c7c1f378';
  bid uuid; n int; ok boolean; r record;
begin
  -- act as A
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  insert into public.businesses (name, lat, lng, osm_id, phone, claimant_role)
  values ('Test Diner', 36.0, -84.5, 'node/stopover-test-1', '555-0100', 'Owner') returning id into bid;
  select status into r from public.businesses where id = bid;
  assert r.status = 'pending', 'claim starts pending';

  ok := false; begin insert into public.businesses (name, lat, lng, status) values ('Fake', 1, 1, 'verified'); exception when others then ok := true; end;
  assert ok, 'cannot insert already-verified';

  ok := false; begin update public.businesses set status = 'verified' where id = bid; exception when others then ok := true; end;
  assert ok, 'owner cannot verify self';

  update public.businesses set offer = '10% off', max_rig_ft = 45 where id = bid;
  select count(*) into n from public.businesses where id = bid and offer = '10% off';
  assert n = 1, 'owner can edit details';

  select * into r from public.business_at(36.0, -84.5, 'Test Diner', 'node/stopover-test-1');
  assert r.mine and r.status = 'pending', 'owner sees own pending listing';

  ok := false; begin perform public.admin_businesses('pending'); exception when others then ok := true; end;
  assert ok, 'non-admin cannot list claims';
  ok := false; begin perform public.admin_review_business(bid, 'verify'); exception when others then ok := true; end;
  assert ok, 'non-admin cannot verify';

  -- act as G (admin, not the owner)
  perform set_config('request.jwt.claims', json_build_object('sub', g, 'role', 'authenticated')::text, true);
  select count(*) into n from public.business_at(36.0, -84.5, 'Test Diner', 'node/stopover-test-1');
  assert n = 0, 'others cannot see a pending listing';
  select count(*) into n from public.businesses where id = bid;
  assert n = 0, 'table rows are private to the owner';

  ok := false; begin perform public.admin_feature_business(bid, 30); exception when others then ok := true; end;
  assert ok, 'cannot feature before verifying';

  ok := false; begin insert into public.businesses (name, lat, lng, osm_id) values ('Copy', 36, -84.5, 'node/stopover-test-1'); exception when unique_violation then ok := true; end;
  assert ok, 'one active claim per OSM place';

  select count(*) into n from public.admin_businesses('pending') where id = bid;
  assert n = 1, 'admin sees the claim';
  perform public.admin_review_business(bid, 'verify', 'Called them');
  assert public.admin_feature_business(bid, 30) > now() + interval '29 days', 'feature for 30 days';

  select * into r from public.business_at(36.0001, -84.5001, 'test diner', null);
  assert r.status = 'verified' and not r.mine and r.featured and r.offer = '10% off', 'verified listing is public (name match)';
  select count(*) into n from public.featured_businesses(35.9, 36.1, -84.6, -84.4) where id = bid;
  assert n = 1, 'featured within bbox';
  select count(*) into n from public.featured_businesses(40, 41, -84.6, -84.4) where id = bid;
  assert n = 0, 'not featured outside bbox';

  -- back to A
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  ok := false; begin update public.businesses set featured_until = now() + interval '1 year' where id = bid; exception when others then ok := true; end;
  assert ok, 'owner cannot extend featured';
  ok := false; begin update public.businesses set lat = 40 where id = bid; exception when others then ok := true; end;
  assert ok, 'owner cannot move the pin';
  select * into r from public.business_stats(bid);
  assert r.saved >= 0, 'owner reads stats';

  -- G can read stats as admin; and a stranger can't (simulate with a random uid)
  perform set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid(), 'role', 'authenticated')::text, true);
  ok := false; begin perform public.business_stats(bid); exception when others then ok := true; end;
  assert ok, 'strangers cannot read stats';

  execute 'reset role';
  execute 'set local role anon';
  ok := false; begin perform public.business_at(36.0, -84.5, 'Test Diner', null); exception when insufficient_privilege then ok := true; end;
  assert ok, 'anon cannot call business_at';
  execute 'reset role';

  raise exception 'ALL PASSED';
end $$;
