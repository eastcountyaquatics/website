// "Which team is my athlete?" -- birthdate (+ boys/girls from 12U up) to
// the team, its page, and any session open for it right now with the
// price. Uses js/team-age.js, the same age rule the club uses everywhere
// (age on Aug 1 of the year after the season starts).
// Markup: <div data-team-finder></div>
(function () {
  var LABELS = {
    "8u-coed": "8U Coed", "10u-coed": "10U Coed", "12u-boys": "12U Boys", "12u-girls": "12U Girls",
    "14u-boys": "14U Boys", "14u-girls": "14U Girls", "16u-boys": "16U Boys", "16u-girls": "16U Girls",
    "18u-boys": "18U Boys", "18u-girls": "18U Girls", "masters": "Masters", "splashball": "Splashball"
  };
  function pageFor(slug) { return slug === "masters" ? "masters.html" : "team-" + slug + ".html"; }
  function esc(t) { return String(t == null ? "" : t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
  function money(c) { return "$" + (c / 100).toFixed(c % 100 ? 2 : 0); }

  var openOptions = null;
  function loadOptions() {
    if (openOptions) return Promise.resolve(openOptions);
    if (typeof supabaseClient === "undefined") return Promise.resolve([]);
    return supabaseClient.from("registration_options").select("label, amount_cents, team_slugs").eq("is_open", true)
      .order("sort_order", { ascending: true })
      .then(function (r) { openOptions = (r && r.data) || []; return openOptions; }, function () { return []; });
  }

  // Wording comes from js/site-text.js (Admin > Site Wording) when loaded.
  var T = typeof ecaT === "function" ? ecaT : function (k, v) { return k; };
  (typeof ecaTextReady !== "undefined" ? ecaTextReady : Promise.resolve()).then(function () {
  document.querySelectorAll("[data-team-finder]").forEach(function (box) {
    var id = "tf" + Math.random().toString(36).slice(2, 7);
    box.className = "tf";
    box.innerHTML =
      '<form class="tf-form" novalidate>' +
        '<div class="tf-field"><label for="' + id + '-dob">' + T("tf.birthdate") + '</label>' +
          '<input type="date" id="' + id + '-dob" required></div>' +
        '<fieldset class="tf-field tf-sex"><legend>' + T("tf.team_legend") + '</legend>' +
          '<label><input type="radio" name="' + id + '-sex" value="male"> ' + T("tf.boys") + '</label>' +
          '<label><input type="radio" name="' + id + '-sex" value="female"> ' + T("tf.girls") + '</label>' +
        '</fieldset>' +
        '<button type="submit" class="btn btn-gold">' + T("tf.button") + '</button>' +
      '</form>' +
      '<div class="tf-result" aria-live="polite"></div>';
    var form = box.querySelector("form");
    var out = box.querySelector(".tf-result");
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var dob = form.querySelector('input[type="date"]').value;
      var sexInput = form.querySelector('input[type="radio"]:checked');
      var sex = sexInput ? sexInput.value : "";
      if (!dob) { out.innerHTML = '<p class="tf-msg">' + T("tf.need_birthdate") + '</p>'; return; }
      var age = calcAge(dob);
      if (age === null || age < 3) { out.innerHTML = '<p class="tf-msg">' + T("tf.bad_birthdate") + '</p>'; return; }
      // Under 7: Splashball (age-group teams start at 7 -- see the Splashball
      // and team pages). 19+: Masters.
      if (age < 5) { out.innerHTML = '<p class="tf-msg">' + T("tf.too_young") + '</p>'; return; }
      var slug = age > 18 ? "masters" : age < 7 ? "splashball" : deriveTeamSlug(age, sex);
      if (!slug) { out.innerHTML = '<p class="tf-msg">' + T("tf.pick_sex") + '</p>'; return; }
      var also = age <= 8 && slug !== "splashball" ? "splashball" : null;
      out.innerHTML = '<p class="tf-msg">' + T("tf.looking") + '</p>';
      loadOptions().then(function (opts) {
        var open = opts.filter(function (o) { return (o.team_slugs || []).indexOf(slug) !== -1; });
        var html = '<div class="tf-card">' +
          '<span class="tf-kicker">' + T("tf.kicker") + '</span>' +
          '<strong class="tf-team">' + esc(LABELS[slug] || slug) + '</strong>' +
          (open.length
            ? '<ul class="tf-open">' + open.map(function (o) {
                return '<li><span>' + esc(o.label) + '</span><b>' + money(o.amount_cents) + '</b></li>';
              }).join("") + '</ul>'
            : '<p class="tf-note">' + T("tf.none_open") + '</p>') +
          '<div class="tf-actions">' +
            (open.length ? '<a class="btn btn-primary" href="dashboard.html">' + T("tf.register_btn") + '</a>' : "") +
            '<a class="btn btn-ghost" href="' + pageFor(slug) + '">' + T("tf.team_page_btn") + '</a>' +
          '</div>' +
          (also ? '<p class="tf-note">' + T("tf.splashball_note") + '</p>' : "") +
          (slug !== "masters" && slug !== "splashball" ? '<p class="tf-note">' + T("tf.trial_note") + '</p>' : "") +
          '<p class="tf-fine">' + T("tf.cutoff", { year: seasonYear() + 1 }) + '</p>' +
        '</div>';
        out.innerHTML = html;
      });
    });
    form.addEventListener("change", function (e) {
      if (e.target.type !== "date") return;
      var age = calcAge(e.target.value);
      // Boys/girls only matters from 12U up; hide it for younger athletes and adults.
      box.querySelector(".tf-sex").classList.toggle("tf-hide", age !== null && (age <= 10 || age > 18));
      out.innerHTML = "";
    });
  });
  });
})();
