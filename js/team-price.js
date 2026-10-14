// Team pages: show any registration session open for this team right now,
// with its price and a Register button, right under the page header.
(function () {
  var slug = window.TEAM_SLUG;
  if (!slug || typeof supabaseClient === "undefined") return;
  function esc(t) { return String(t == null ? "" : t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
  function money(c) { return "$" + (c / 100).toFixed(c % 100 ? 2 : 0); }
  supabaseClient.from("registration_options").select("label, description, amount_cents, team_slugs").eq("is_open", true)
    .order("sort_order", { ascending: true })
    .then(function (r) {
      var open = ((r && r.data) || []).filter(function (o) { return (o.team_slugs || []).indexOf(slug) !== -1; });
      if (!open.length) return;
      var hero = document.querySelector(".page-hero");
      if (!hero) return;
      var sec = document.createElement("section");
      sec.className = "open-now";
      sec.innerHTML = '<div class="container"><div class="open-now-bar">' +
        '<span class="store-status open">Registration open</span>' +
        '<ul>' + open.map(function (o) {
          return '<li><strong>' + esc(o.label) + '</strong>' + (o.description ? '<span>' + esc(o.description) + '</span>' : "") + '<b>' + money(o.amount_cents) + '</b></li>';
        }).join("") + '</ul>' +
        '<a class="btn btn-primary" href="dashboard.html">Register</a>' +
        '</div></div>';
      hero.parentNode.insertBefore(sec, hero.nextSibling);
    }, function () {});
})();
