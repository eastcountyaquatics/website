-- School and gender on the athlete record. Gender drives which age-group
-- team an athlete lines up with (12U Boys vs 12U Girls, etc.); school is
-- useful for coaches coordinating carpools and high-school season overlap.

alter table public.athletes
  add column school text,
  add column gender text;
