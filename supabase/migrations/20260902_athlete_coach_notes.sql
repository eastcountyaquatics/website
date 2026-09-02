-- Staff-facing notes on an athlete, kept separate from the parent-entered
-- medical/allergy notes so a coach's observations don't overwrite them.
alter table public.athletes add column coach_notes text;
