alter table public.places
  add column city text,
  add column state text,
  add column country text;
comment on column public.places.state is 'State/province code, e.g. TN, ON (filled from reverse geocoding)';
comment on column public.places.country is 'ISO country code, e.g. US, CA';
create index places_user_state_idx on public.places(user_id, state);
