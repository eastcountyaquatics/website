// Tournament-only team groupings. Some tournaments take a combined team
// that isn't one of the club's regular teams (we sometimes send a 12U
// coed team) -- the tournament is tagged with that combined slug, and
// athletes on any of the listed regular teams are treated as on it.
var TOURNAMENT_ONLY_TEAMS = [
  { team_slug: "12u-coed", team_label: "12U Coed", includes: ["12u-boys", "12u-girls"], after: "12u-girls" },
  // Adult players (19+ as of the Aug 1 cutoff) -- Masters tournaments are
  // invited and RSVP'd the same way as youth ones.
  { team_slug: "masters", team_label: "Masters", includes: [], after: "18u-girls" },
];

// An athlete's team for tournament purposes: the staff-assigned team, else
// the one their birthdate/sex puts them on (js/team-age.js); adults 19+
// are Masters. Mirrors public.athlete_team_slug in the database.
function athleteTournamentTeam(a) {
  if (a.team_slug) return a.team_slug;
  var age = calcAge(a.birthdate);
  if (age !== null && age > 18) return "masters";
  return deriveTeamSlug(age, a.sex);
}

// Is this athlete on any of these tournament teams?
function athleteOnTournamentTeams(a, tournamentSlugs) {
  var mine = tournamentTeamSlugsFor(athleteTournamentTeam(a));
  return (tournamentSlugs || []).some(function (s) { return mine.indexOf(s) !== -1; });
}

// Regular teams (from the schedules table) plus the tournament-only ones,
// each slotted in right after the team named by `after`.
function withTournamentTeams(teams) {
  var out = (teams || []).slice();
  TOURNAMENT_ONLY_TEAMS.forEach(function (extra) {
    if (out.some(function (t) { return t.team_slug === extra.team_slug; })) return;
    var idx = out.findIndex(function (t) { return t.team_slug === extra.after; });
    var row = { team_slug: extra.team_slug, team_label: extra.team_label };
    if (idx === -1) out.push(row); else out.splice(idx + 1, 0, row);
  });
  return out;
}

// Every tournament team slug an athlete on `teamSlug` belongs to.
function tournamentTeamSlugsFor(teamSlug) {
  var slugs = teamSlug ? [teamSlug] : [];
  TOURNAMENT_ONLY_TEAMS.forEach(function (extra) {
    if (extra.includes.indexOf(teamSlug) !== -1) slugs.push(extra.team_slug);
  });
  return slugs;
}

// The regular team slugs whose athletes make up a tournament's team.
function regularTeamSlugsIn(tournamentTeamSlug) {
  var extra = TOURNAMENT_ONLY_TEAMS.find(function (t) { return t.team_slug === tournamentTeamSlug; });
  return extra ? extra.includes.slice() : [tournamentTeamSlug];
}
