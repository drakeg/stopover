alter table public.places
  add column near text,
  add column approximate boolean not null default false;
comment on column public.places.near is 'Free-text location hint from the road, e.g. "I-40 exit 356"';
comment on column public.places.approximate is 'Saved quickly from GPS while driving; pin may need fine-tuning';
