-- Same class of bug as contacts_email_unique_fix, caught before shipping:
-- admin-schedules.html's "Other / Add Location" upserts pool_locations
-- with onConflict:"name", which needs a real unique constraint on the
-- literal `name` column -- the functional index on lower(name) doesn't
-- satisfy that.
alter table public.pool_locations add constraint pool_locations_name_key unique (name);
drop index public.pool_locations_name_idx;
