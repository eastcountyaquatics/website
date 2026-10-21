// The club's team list for public pages (Admin > Teams), from the
// team_directory() database function: name, page, and -- for teams that
// aren't built in -- the ages and boys/girls/coed it's for.
//
//   ecaTeams            -> Promise of [{ team_slug, team_label, page_url, age_min, age_max, team_gender }]
//   ecaTeamPage(t)      -> the team's page link
//   ecaExtraTeams(teams, age, sex) -> teams with their own age range that fit
//
// Built-in teams keep the built-in age rule (js/team-age.js); a team with
// its own age range is offered on top of that. If the database can't be
// reached the list is empty and pages fall back to their built-in teams.
(function () {
  var BUILT_IN = ["splashball", "8u-coed", "10u-coed", "12u-boys", "12u-girls", "14u-boys", "14u-girls",
    "16u-boys", "16u-girls", "18u-boys", "18u-girls", "masters"];

  window.ecaTeamPage = function (t) {
    if (t && t.page_url) return t.page_url;
    var slug = t && t.team_slug;
    if (slug === "masters") return "masters.html";
    return BUILT_IN.indexOf(slug) !== -1 ? "team-" + slug + ".html" : "teams.html";
  };

  window.ecaExtraTeams = function (teams, age, sex) {
    if (age === null || age === undefined) return [];
    var s = String(sex || "").toLowerCase();
    return (teams || []).filter(function (t) {
      if (t.age_min == null && t.age_max == null) return false;
      if (t.age_min != null && age < t.age_min) return false;
      if (t.age_max != null && age > t.age_max) return false;
      if (t.team_gender === "boys") return s === "male";
      if (t.team_gender === "girls") return s === "female";
      return true;
    });
  };

  window.ecaTeams = new Promise(function (resolve) {
    if (typeof supabaseClient === "undefined") return resolve([]);
    var done = false;
    setTimeout(function () { if (!done) { done = true; resolve([]); } }, 3000);
    supabaseClient.rpc("team_directory").then(function (r) {
      if (!done) { done = true; resolve((r && !r.error && Array.isArray(r.data)) ? r.data : []); }
    }, function () { if (!done) { done = true; resolve([]); } });
  });
})();
