-- Coaches Hub: skills, drills and vocabulary by age group, with optional video links.
-- All staff can read; the Manager and Head Coaches add and edit.
create table if not exists public.coach_resources (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('skill', 'drill', 'vocabulary')),
  title text not null check (length(btrim(title)) between 1 and 200),
  body text check (body is null or length(body) <= 4000),
  -- Age groups it is for, e.g. {8U,10U}; {All} means every age.
  age_groups text[] not null default '{All}',
  video_url text check (video_url is null or video_url ~ '^https://'),
  sort_order integer not null default 0,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists coach_resources_kind_idx on public.coach_resources (kind, sort_order);
alter table public.coach_resources enable row level security;

create policy "Staff read coach resources" on public.coach_resources
  for select to authenticated
  using (public.current_user_role() in ('owner', 'head_coach', 'assistant_coach', 'coach'));

create policy "Manager and head coaches manage coach resources" on public.coach_resources
  for all to authenticated
  using (public.current_user_role() in ('owner', 'head_coach'))
  with check (public.current_user_role() in ('owner', 'head_coach'));

-- Starter vocabulary (editable). Skills and drills are added by the coaches.
insert into public.coach_resources (kind, title, body, age_groups) values
  ('vocabulary', 'Eggbeater', 'The rotating leg kick (alternating circles) that keeps a player high in the water and hands free.', '{All}'),
  ('vocabulary', 'Ball-side / Help-side', 'Ball-side is the defender or area closest to the ball; help-side is away from the ball, ready to help.', '{All}'),
  ('vocabulary', 'Counterattack', 'A fast break right after a turnover or steal, before the defense is set.', '{All}'),
  ('vocabulary', 'Drive', 'An attacker swimming hard toward the goal or past a defender to receive the ball.', '{All}'),
  ('vocabulary', 'Pick', 'An attacker blocking a defender''s path with their body so a teammate can get open.', '{All}'),
  ('vocabulary', 'Wet pass', 'A pass placed in the water in front of a teammate so they can catch it and shoot in one motion.', '{All}'),
  ('vocabulary', 'Dry pass', 'A pass thrown to a teammate''s hand, in the air, so they can catch and shoot quickly.', '{All}'),
  ('vocabulary', 'Center / Hole set', 'The attacker positioned in front of the goal, who the offense tries to get the ball to.', '{All}'),
  ('vocabulary', 'Perimeter', 'The attackers set up around the outside of the defense, away from the center.', '{All}'),
  ('vocabulary', 'Extra-man (6 on 5)', 'The advantage when a defender is ejected: the offense has one more player for 20 seconds.', '{All}'),
  ('vocabulary', 'Ejection', 'A player who commits a major foul leaves the water for 20 seconds.', '{All}'),
  ('vocabulary', 'Penalty shot (5 meters)', 'A one-on-one shot at the goalkeeper from the 5-meter line, awarded for certain fouls.', '{All}'),
  ('vocabulary', 'Shot clock', 'The time limit (30 seconds) the team with the ball has to take a shot.', '{All}'),
  ('vocabulary', 'Swim-off', 'The sprint at the start of each period where both teams race for the ball.', '{All}'),
  ('vocabulary', 'Block', 'Raising a hand or arm in the path of a shot to stop or deflect it.', '{All}');
