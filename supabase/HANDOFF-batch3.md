# Handoff: owner requests, batch 3

Apply, in order:
1. `20261113000000_alumni.sql` (`alumni_contacts`; anyone can add themselves, owners manage)
2. `20261113010000_coach_hub.sql` (`coach_resources` + starter vocabulary; staff read, Manager/Head Coach edit)

Check: signed out, `select` on `alumni_contacts` returns nothing and an insert of a plain row works;
signed-in coach can read `coach_resources` but not insert; Manager can.
