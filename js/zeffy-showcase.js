// Cards for the Zeffy forms owners picked on Admin > Zeffy ("Show on
// website"): banner, title, date, short description, raised vs goal, and a
// button to the Zeffy page. From the zeffy-public-campaigns function.
// Markup: <section data-zeffy-section style="display:none"> ... <div data-zeffy-campaigns data-show="all|donation|event"></div></section>
// The section stays hidden when there's nothing to show.
(function () {
  var boxes = document.querySelectorAll("[data-zeffy-campaigns]");
  if (!boxes.length || typeof supabaseClient === "undefined") return;
  var T = function (k, v, d) { return typeof ecaT === "function" ? ecaT(k, v) : d; };
  function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
  function money(c) { return "$" + Math.round((c || 0) / 100).toLocaleString("en-US"); }
  function when(c) {
    if (!c.start) return "";
    var d = new Date(c.start * 1000);
    return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" }) +
      (d.getHours() || d.getMinutes() ? " · " + d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) : "");
  }
  function card(c) {
    var pct = c.goal_cents ? Math.min(100, Math.round((c.raised_cents || 0) * 100 / c.goal_cents)) : null;
    return '<article class="zc-card">' +
      (c.banner_url ? '<a class="zc-img" href="' + esc(c.url) + '" target="_blank" rel="noopener"><img src="' + esc(c.banner_url) + '" alt="" loading="lazy"></a>' : "") +
      '<div class="zc-body">' +
        (c.type === "event" && c.start ? '<span class="zc-when">' + esc(when(c)) + "</span>" : "") +
        "<h3>" + esc(c.title) + "</h3>" +
        (c.description ? '<p class="muted">' + esc(c.description) + (c.description.length >= 280 ? "&hellip;" : "") + "</p>" : "") +
        (pct !== null ? '<div class="zc-progress" aria-label="' + pct + '% of goal"><span style="width:' + pct + '%"></span></div>' +
          '<p class="zc-raised">' + T("zc.raised", { raised: money(c.raised_cents), goal: money(c.goal_cents) }, money(c.raised_cents) + " raised of " + money(c.goal_cents)) + "</p>" : "") +
        '<a class="btn ' + (c.type === "event" ? "btn-primary" : "btn-gold") + '" href="' + esc(c.url) + '" target="_blank" rel="noopener">' +
          (c.type === "event" ? T("zc.event_btn", null, "Get tickets") : T("zc.donate_btn", null, "Give on Zeffy")) + "</a>" +
      "</div></article>";
  }
  var ready = typeof ecaTextReady !== "undefined" ? ecaTextReady : Promise.resolve();
  Promise.all([supabaseClient.functions.invoke("zeffy-public-campaigns", { body: {} }), ready]).then(function (res) {
    var r = res[0];
    var list = (r && r.data && Array.isArray(r.data.campaigns)) ? r.data.campaigns : [];
    boxes.forEach(function (box) {
      var show = box.getAttribute("data-show") || "all";
      var items = list.filter(function (c) { return show === "all" || c.type === show; });
      if (!items.length) return;
      box.className = "zc-grid";
      box.innerHTML = items.map(card).join("");
      var sec = box.closest("[data-zeffy-section]");
      if (sec) sec.style.display = "";
    });
  }, function () {});
})();
