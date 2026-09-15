-- Gender duplicated Sex (both Male/Female) for every place that actually
-- used it -- team auto-placement and tournament price-tier matching now
-- key off athletes.sex instead, so the column is dead weight. Shirt size
-- on the athlete profile was never used anywhere (tournaments collect
-- their own per-event shirt size separately via tournament_invites, which
-- is unrelated and stays).
alter table public.athletes
  drop column gender,
  drop column shirt_size;
