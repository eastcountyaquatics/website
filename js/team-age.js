// Single source of truth for the club's domestic-eligibility age rule and
// the team it implies. Before this, admin-athletes.html and
// admin-attendance.html each had their own copy of the same rule (in sync
// today, but nothing stopped that from drifting), and the rule itself had
// a real bug: it used age as of August 1 of the CURRENT season year,
// instead of August 1 of the year AFTER the season starts.
//
// The site's own FAQ has always described the correct rule: "the age
// group for Fall 2026 depends on age as of August 1, 2027." A season that
// starts in the fall of year Y uses year Y+1's August 1 as its cutoff --
// the code just never matched that. Fixed here, once, for everywhere this
// matters: the Roster page, roll-call team filtering, and any future
// caller (e.g. tournament invites, registration defaults).
//
// Deliberately NOT used for tournament pricing -- that's a different,
// intentional rule (age as of the tournament's own event date), kept in
// create-tournament-checkout/get-tournament-invite.
(function (global) {
  // Which season (named by its starting year) "today" falls in. Aug 1 is
  // the rough start of a season; before that date we're still in the
  // previous season that runs through the summer.
  function seasonYear(today) {
    var now = today || new Date();
    var aug1 = new Date(now.getFullYear(), 7, 1);
    return now >= aug1 ? now.getFullYear() : now.getFullYear() - 1;
  }

  // The actual domestic-eligibility cutoff: August 1 of the year AFTER
  // the season starts (see module comment).
  function eligibilityCutoff(today) {
    return new Date(seasonYear(today) + 1, 7, 1);
  }

  function calcAge(birthdate, today) {
    if (!birthdate) return null;
    var dob = new Date(birthdate + "T00:00:00");
    var cutoff = eligibilityCutoff(today);
    var age = cutoff.getFullYear() - dob.getFullYear();
    var hadBirthdayByCutoff =
      cutoff.getMonth() > dob.getMonth() ||
      (cutoff.getMonth() === dob.getMonth() && cutoff.getDate() >= dob.getDate());
    if (!hadBirthdayByCutoff) age--;
    return age;
  }

  // The bracket alone, independent of sex or naming style -- '8u'..'18u',
  // or null once someone has aged out (19+) or has no birthdate on file.
  function ageBracket(age) {
    if (age === null || age === undefined) return null;
    if (age <= 8) return "8u";
    if (age <= 10) return "10u";
    if (age <= 12) return "12u";
    if (age <= 14) return "14u";
    if (age <= 16) return "16u";
    if (age <= 18) return "18u";
    return null;
  }

  // 8U and 10U are coed; 12U and up split by sex, matching the site's
  // actual team pages/slugs (team-14u-girls.html, etc.).
  function deriveTeamSlug(age, sex) {
    var bracket = ageBracket(age);
    if (!bracket) return null;
    if (bracket === "8u" || bracket === "10u") return bracket + "-coed";
    var s = (sex || "").toLowerCase();
    if (s === "male") return bracket + "-boys";
    if (s === "female") return bracket + "-girls";
    return null; // needs a sex on file to pick boys/girls
  }

  // Same bracket logic, formatted the way it's shown to a person (e.g.
  // "14U Girls") instead of as a URL-safe slug.
  function deriveTeamLabel(age, sex) {
    if (age === null || age === undefined) return "Needs birthdate";
    var bracket = ageBracket(age);
    if (!bracket) return "Aged out (19+)";
    var upper = bracket.toUpperCase();
    if (bracket === "8u" || bracket === "10u") return upper + " Coed";
    var s = (sex || "").toLowerCase();
    if (s === "male") return upper + " Boys";
    if (s === "female") return upper + " Girls";
    return upper + " — needs sex";
  }

  global.seasonYear = seasonYear;
  global.calcAge = calcAge;
  global.ageBracket = ageBracket;
  global.deriveTeamSlug = deriveTeamSlug;
  global.deriveTeamLabel = deriveTeamLabel;
})(window);
