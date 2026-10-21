# Hand-off: turn on Admin → Teams

**For an agent with access to the ECA Supabase project `kdlkkucvdqmcaujhvrwq`.**
Code: this repo, branch `claude/sd-east-county-aquatics-tv13qz` (latest).

> **Status (Oct 21, 2026): done.** Migration applied: all 5 `schedules` columns and `pages.team_slug` exist.
> `team_directory()` returns all 12 teams (all active, none with custom ages/pages yet), including for
> signed-out visitors. Redeployed create-checkout-session v19 and create-zeffy-registration v3 (JWT on).

## 1. Apply the migration (needed before owners use Admin → Teams)
`supabase/migrations/20261021010000_teams_manager.sql`:
- `schedules`: adds `page_url`, `age_min`, `age_max`, `team_gender`, `is_active`
- `pages`: adds `team_slug`
- creates `public.team_directory()` (security definer, callable by anon) — the public team list

## 2. Redeploy 2 functions (JWT verification **on**, the default)
- `create-checkout-session`
- `create-zeffy-registration`

Both now also accept an athlete for a session whose team has its own age range
(set on Admin → Teams), matching My Account. Until they're redeployed, a session for
a brand-new team shows on My Account but checkout refuses the athlete.

## 3. Check
```sql
select column_name from information_schema.columns
where table_name = 'schedules' and column_name in ('page_url','age_min','age_max','team_gender','is_active');  -- 5 rows
select * from public.team_directory() limit 3;   -- built-in teams, is_active true
```

## Don't
Change other RLS policies, delete data, or touch Stripe.
