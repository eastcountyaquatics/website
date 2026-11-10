// Team list helpers (js/team-dir.js): which teams with their own ages fit an
// athlete, and where each team's page is.
import test from "node:test";
import assert from "node:assert/strict";
import { loadScript } from "../helpers/load.mjs";

const w = loadScript("js/team-dir.js");
// Arrays made inside the sandbox have a different prototype; compare plain copies.
const slugs = (list) => Array.from(list).map((t) => t.team_slug);
const teams = [
  { team_slug: "18u-coed", team_label: "18U Coed", age_min: 15, age_max: 18, team_gender: "coed" },
  { team_slug: "15u-girls", team_label: "15U Girls", age_min: 13, age_max: 15, team_gender: "girls" },
  { team_slug: "14u-boys", team_label: "14U Boys", age_min: null, age_max: null, team_gender: null },
];

test("a team with ages fits athletes inside the range, on both ends", () => {
  assert.deepEqual(slugs(w.ecaExtraTeams(teams, 15, "Male")), ["18u-coed"]);
  assert.deepEqual(slugs(w.ecaExtraTeams(teams, 18, "Male")), ["18u-coed"]);
  assert.deepEqual(slugs(w.ecaExtraTeams(teams, 19, "Male")), []);
  assert.deepEqual(slugs(w.ecaExtraTeams(teams, 14, "Male")), []);
});

test("boys/girls teams only take that sex; coed takes both", () => {
  assert.deepEqual(slugs(w.ecaExtraTeams(teams, 14, "Female")), ["15u-girls"]);
  assert.deepEqual(slugs(w.ecaExtraTeams(teams, 14, "Male")), []);
  assert.deepEqual(slugs(w.ecaExtraTeams(teams, 16, "Female")), ["18u-coed"]);
});

test("built-in teams without ages never match through the extra rule", () => {
  assert.deepEqual(slugs(w.ecaExtraTeams(teams, 14, "Male")), []);
  assert.deepEqual(slugs(w.ecaExtraTeams(teams, null, "Male")), []);
});

test("team pages", () => {
  assert.equal(w.ecaTeamPage({ team_slug: "14u-boys" }), "team-14u-boys.html");
  assert.equal(w.ecaTeamPage({ team_slug: "masters" }), "masters.html");
  assert.equal(w.ecaTeamPage({ team_slug: "18u-coed", page_url: "page.html?slug=team-18u-coed" }), "page.html?slug=team-18u-coed");
  assert.equal(w.ecaTeamPage({ team_slug: "unknown-team" }), "teams.html");
});
