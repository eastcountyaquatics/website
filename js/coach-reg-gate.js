// Coaches fill out the Coach Registration questionnaire as part of getting
// set up -- nobody has to send them a link. Any coach-role account
// (coach, head coach, assistant coach) without a registration on file
// under their login email is sent to coach-registration.html, which comes
// back to `returnTo` once it's submitted. The Manager role is exempt.
async function requireCoachRegistration(role, returnTo) {
  if (["coach", "head_coach", "assistant_coach"].indexOf(role) === -1) return true;
  const { data, error } = await supabaseClient.rpc("my_coach_registration");
  if (error || data) return true; // on file (or can't tell -- never lock a coach out)
  window.location.href = "coach-registration.html?required=1&return=" + encodeURIComponent(returnTo || "admin.html");
  return false;
}
