// "Registered" athletes: a paid session registration (last 6 months), an
// active 2-week free trial, or a current Masters membership -- see
// public.athlete_is_active. An athlete a family has only added sits in
// "Added, not registered yet" instead of on a team until then.
// Resolves to a Set of athlete ids (staff get everyone's, a family its own).
async function loadActiveAthleteIds() {
  const { data, error } = await supabaseClient.rpc("active_athlete_ids");
  if (error) {
    console.error("Could not load registered athletes", error);
    return new Set();
  }
  return new Set((data || []).map(function (row) {
    return typeof row === "string" ? row : row.active_athlete_ids;
  }));
}
