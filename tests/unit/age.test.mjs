// The club's age rule, in one place (js/team-age.js): age on Aug 1 of the
// year AFTER the season starts, 8U/10U coed, 12U+ boys/girls, 19+ Masters.
import test from "node:test";
import assert from "node:assert/strict";
import { loadScript } from "../helpers/load.mjs";

const w = loadScript("js/team-age.js");
const day = (y, m, d) => new Date(y, m - 1, d);

test("season year: a season runs Aug 1 to Jul 31", () => {
  assert.equal(w.seasonYear(day(2026, 10, 22)), 2026);
  assert.equal(w.seasonYear(day(2026, 8, 1)), 2026);
  assert.equal(w.seasonYear(day(2026, 7, 31)), 2025);
});

test("age is measured on Aug 1 of the year after the season starts", () => {
  const today = day(2026, 10, 22); // Fall 2026 -> cutoff Aug 1, 2027
  assert.equal(w.calcAge("2013-08-01", today), 14); // birthday on the cutoff counts
  assert.equal(w.calcAge("2013-08-02", today), 13); // a day later does not
  assert.equal(w.calcAge("2008-01-01", today), 19);
  assert.equal(w.calcAge("", today), null);
});

test("age brackets", () => {
  const cases = [[5, "8u"], [8, "8u"], [9, "10u"], [10, "10u"], [11, "12u"], [12, "12u"], [14, "14u"], [16, "16u"], [18, "18u"], [19, null]];
  for (const [age, want] of cases) assert.equal(w.ageBracket(age), want, "age " + age);
});

test("team slugs: 8U/10U coed, 12U and up by sex, adults none", () => {
  assert.equal(w.deriveTeamSlug(8, "male"), "8u-coed");
  assert.equal(w.deriveTeamSlug(10, "female"), "10u-coed");
  assert.equal(w.deriveTeamSlug(12, "male"), "12u-boys");
  assert.equal(w.deriveTeamSlug(15, "Female"), "14u-girls".replace("14", "16"));
  assert.equal(w.deriveTeamSlug(18, "female"), "18u-girls");
  assert.equal(w.deriveTeamSlug(13, ""), null); // needs a sex on file
  assert.equal(w.deriveTeamSlug(19, "male"), null);
});

test("team labels", () => {
  assert.equal(w.deriveTeamLabel(14, "male"), "14U Boys");
  assert.equal(w.deriveTeamLabel(9, "female"), "10U Coed");
  assert.equal(w.deriveTeamLabel(30, "male"), "Masters (19+)");
  assert.equal(w.deriveTeamLabel(null, "male"), "Needs birthdate");
});
