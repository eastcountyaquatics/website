-- Two more fields families fill in when adding an athlete: swimwear
-- (jammer/Speedo) size and self-reported water polo experience level.

alter table public.athletes
  add column jammer_size text,
  add column experience_level text;
