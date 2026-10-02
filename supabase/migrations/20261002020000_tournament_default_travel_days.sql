-- Travel days for coach pay used to be entered freehand by whoever logged
-- the hours, so the same tournament would get 2 travel days from one coach
-- and 3 from another. Setting it once on the tournament (the club already
-- knows whether it's out of county and how many nights the team is staying)
-- lets Tournament Coach Hours pre-fill it automatically instead -- still
-- editable per entry afterward, so a coach pay override before paying still
-- works exactly as before.
alter table public.tournaments add column travel_days integer check (travel_days is null or travel_days > 0);
