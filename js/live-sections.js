// Live sections: blocks an owner adds from Edit Website > Add Section that
// fill themselves from the club's own data, so they never go stale.
//
// A live section is an empty <div class="eca-live eca-live--KIND"></div>.
// Plain CSS classes are the marker because the page sanitizer strips every
// other attribute from added sections. Options live in extra classes
// (eca-live-n-6 = show 6) or, for the few kinds that need a value, in the
// div's own text (a date, a video link, an address).
//
// In Edit Website the section is NOT rendered: the editor shows a labeled
// placeholder, so saving a page never freezes a snapshot of today's data.
//
//   teams      the club's teams (Admin > Teams), each linking to its page
//   sessions   open registration sessions with prices and a Register button
//   tournaments upcoming published tournaments
//   coaches    active coaches with photos
//   gallery    the Photo Gallery (Admin > Photo Gallery) as a grid
//   zeffy      Zeffy forms ticked "Show on website" (js/zeffy-showcase.js)
//   countdown  text "2026-12-05 Winter season starts" -> days left
//   video      text = a YouTube or Vimeo link
//   map        text = an address
(function () {
  var edit = /[?&]edit=1(&|$)/.test(window.location.search);
  if (edit) { document.documentElement.classList.add("eca-edit"); return; }
  if (typeof supabaseClient === "undefined") return;

  function esc(t) { return String(t == null ? "" : t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
  function money(c) { return "$" + (c / 100).toFixed(c % 100 ? 2 : 0); }
  function count(el, dflt) { var m = /\beca-live-n-(\d{1,2})\b/.exec(el.className); return m ? parseInt(m[1], 10) : dflt; }
  function safeImg(u) { return typeof u === "string" && (/^https:\/\//.test(u) || /^images\/[\w.\/-]+$/.test(u)); }
  function fmtDate(iso) { return new Date(iso + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }); }
  function empty(el, text) { el.innerHTML = '<p class="muted live-empty">' + esc(text) + "</p>"; }
  var BUILT_IN = ["splashball", "8u-coed", "10u-coed", "12u-boys", "12u-girls", "14u-boys", "14u-girls", "16u-boys", "16u-girls", "18u-boys", "18u-girls", "masters"];
  function teamPage(t) {
    if (t.page_url) return t.page_url;
    if (t.team_slug === "masters") return "masters.html";
    return BUILT_IN.indexOf(t.team_slug) !== -1 ? "team-" + t.team_slug + ".html" : "teams.html";
  }
  function safeHref(u) { return /^(https:\/\/|[a-z0-9._-]+\.html)/i.test(u) ? u : "teams.html"; }

  var R = {
    teams: function (el) {
      return supabaseClient.rpc("team_directory").then(function (r) {
        var teams = (r && Array.isArray(r.data)) ? r.data.slice(0, count(el, 24)) : [];
        if (!teams.length) return empty(el, "Teams are coming soon.");
        el.innerHTML = '<div class="live-grid">' + teams.map(function (t) {
          var ages = t.age_min != null || t.age_max != null ? " · ages " + (t.age_min != null ? t.age_min : "") + "–" + (t.age_max != null ? t.age_max : "") : "";
          return '<a class="card live-card" href="' + esc(safeHref(teamPage(t))) + '"><h3>' + esc(t.team_label) + '</h3><p class="muted">Schedule, coaches and registration' + esc(ages) + " &rarr;</p></a>";
        }).join("") + "</div>";
      });
    },
    sessions: function (el) {
      return supabaseClient.from("registration_options").select("label, description, amount_cents, season").eq("is_open", true)
        .order("sort_order", { ascending: true }).then(function (r) {
          var rows = ((r && r.data) || []).slice(0, count(el, 8));
          if (!rows.length) return empty(el, "No sessions are open right now — check back soon.");
          el.innerHTML = '<div class="live-grid">' + rows.map(function (o) {
            return '<div class="card live-card"><h3>' + esc(o.label) + "</h3>" + (o.description ? '<p class="muted">' + esc(o.description) + "</p>" : "") +
              '<p class="live-price">' + money(o.amount_cents) + '</p><a class="btn btn-primary" href="dashboard.html">Register</a></div>';
          }).join("") + "</div>";
        });
    },
    tournaments: function (el) {
      var today = new Date().toISOString().slice(0, 10);
      return supabaseClient.from("tournaments").select("name, event_date, end_date, location, description").eq("is_published", true)
        .gte("event_date", today).order("event_date", { ascending: true }).limit(count(el, 6)).then(function (r) {
          var rows = (r && r.data) || [];
          if (!rows.length) return empty(el, "No upcoming tournaments posted yet.");
          el.innerHTML = '<ul class="live-list">' + rows.map(function (t) {
            return "<li><strong>" + esc(t.name) + '</strong><span class="muted">' + esc(fmtDate(t.event_date)) +
              (t.end_date && t.end_date !== t.event_date ? " – " + esc(fmtDate(t.end_date)) : "") + (t.location ? " · " + esc(t.location) : "") + "</span></li>";
          }).join("") + "</ul>";
        });
    },
    coaches: function (el) {
      return supabaseClient.from("coaches").select("full_name, role_title, team_group, bio, photo_url, sort_order").eq("is_active", true)
        .order("sort_order", { ascending: true }).then(function (r) {
          var rows = ((r && r.data) || []).filter(function (c) { return !/^(manager|finance|club founders)$/i.test((c.team_group || "").trim()); }).slice(0, count(el, 12));
          if (!rows.length) return empty(el, "Our coaching staff will be posted soon.");
          el.innerHTML = '<div class="live-grid">' + rows.map(function (c) {
            return '<div class="card live-card live-person">' + (safeImg(c.photo_url) ? '<img src="' + esc(c.photo_url) + '" alt="" loading="lazy">' : '<span class="live-initial">' + esc((c.full_name || "?").charAt(0)) + "</span>") +
              "<h3>" + esc(c.full_name) + '</h3><p class="muted">' + esc(c.role_title || "Coach") + "</p></div>";
          }).join("") + "</div>";
        });
    },
    gallery: function (el) {
      var list = window.ECA_GALLERY_DEFAULTS || [];
      return supabaseClient.from("site_settings").select("value").eq("key", "gallery_photos").maybeSingle().then(function (r) {
        var v = r && r.data && r.data.value;
        var photos = (v && Array.isArray(v.photos) && v.photos.length ? v.photos : list).filter(function (p) { return p && safeImg(p.url || p[0] && ("images/" + p[0])); });
        photos = photos.slice(0, count(el, 12));
        if (!photos.length) return empty(el, "Photos coming soon.");
        el.innerHTML = '<div class="live-photos">' + photos.map(function (p) {
          var u = p.url || ("images/" + p[0]);
          return '<img src="' + esc(u) + '" alt="' + esc(p.alt || p[1] || "") + '" loading="lazy">';
        }).join("") + "</div>";
      });
    },
    countdown: function (el) {
      var m = /(\d{4}-\d{2}-\d{2})\s*(.*)/.exec(el.textContent.trim());
      if (!m) return;
      var days = Math.ceil((new Date(m[1] + "T00:00:00") - new Date()) / 86400000);
      el.innerHTML = '<div class="live-countdown">' + (days > 0
        ? '<strong>' + days + "</strong><span>" + (days === 1 ? "day" : "days") + " until " + esc(m[2] || fmtDate(m[1])) + "</span>"
        : '<span>' + esc(m[2] || "It’s here!") + (days === 0 ? " — today!" : "") + "</span>") + "</div>";
    },
    video: function (el) {
      var u = el.textContent.trim(), id;
      var yt = /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([\w-]{11})/.exec(u);
      var vm = /vimeo\.com\/(\d{6,12})/.exec(u);
      var src = yt ? "https://www.youtube-nocookie.com/embed/" + yt[1] : vm ? "https://player.vimeo.com/video/" + vm[1] : null;
      if (!src) return;
      el.innerHTML = '<div class="live-embed"><iframe src="' + src + '" title="Video" loading="lazy" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe></div>';
    },
    map: function (el) {
      var a = el.textContent.trim().slice(0, 200);
      if (!a) return;
      el.innerHTML = '<div class="live-embed"><iframe src="https://www.google.com/maps?q=' + encodeURIComponent(a) + '&output=embed" title="Map" loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe></div>' +
        '<p class="muted" style="margin-top:8px;">' + esc(a) + "</p>";
    },
  };

  function run(root) {
    (root || document).querySelectorAll(".eca-live:not([data-live-done])").forEach(function (el) {
      var m = /\beca-live--([a-z]+)\b/.exec(el.className);
      if (!m) return;
      if (m[1] === "zeffy") { el.setAttribute("data-live-done", "1"); el.setAttribute("data-zeffy-campaigns", ""); el.setAttribute("data-show", "all"); 
        if (window.ecaZeffyShowcase) window.ecaZeffyShowcase();
        else { var sc = document.createElement("script"); sc.src = "js/zeffy-showcase.js?v=20261022"; document.body.appendChild(sc); }
        return; }
      var fn = R[m[1]];
      if (!fn) return;
      el.setAttribute("data-live-done", "1");
      try { var p = fn(el); if (p && p.catch) p.catch(function () {}); } catch (e) { /* the section stays empty */ }
    });
  }
  run();
  // Added sections appear after the page's layout is applied; draw them when they do.
  if (window.MutationObserver) {
    var pending = false;
    new MutationObserver(function () {
      if (pending) return; pending = true;
      setTimeout(function () { pending = false; run(); }, 50);
    }).observe(document.body, { childList: true, subtree: true });
  }
})();
