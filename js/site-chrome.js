// Owner-edited menu and footer (Admin > Menu & Footer, site_settings
// "site_nav" and "site_footer"). The built-in menu/footer in each page's
// HTML shows until the saved version loads, and stays if nothing is saved
// or Supabase can't be reached -- so a page is never left without one.
(function () {
  if (typeof supabaseClient === "undefined") return;
  function esc(t) { return String(t == null ? "" : t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
  function safeHref(v) {
    var u = String(v || "").trim();
    if (/^(https?:\/\/|mailto:|tel:)/i.test(u)) return u;
    if (/^#[\w-]*$/.test(u)) return u;
    if (/^[a-z0-9._~\-\/?=&#%]+$/i.test(u) && u.indexOf(":") === -1) return u;
    return null;
  }
  var here = window.location.pathname.split("/").pop() || "index.html";
  function pageOf(h) { return String(h || "").split("#")[0].split("?")[0]; }
  function ext(h) { return /^https?:\/\//i.test(h) ? ' target="_blank" rel="noopener"' : ""; }

  function renderNav(v) {
    var ul = document.querySelector(".main-nav > ul");
    if (!ul || !v || !Array.isArray(v.items) || !v.items.length) return;
    var crest = ul.querySelector(":scope > .nav-logo");
    var slot = document.getElementById("nav-auth-slot");
    var firstPage = ul.querySelector(":scope > [data-nav-page]");
    Array.prototype.slice.call(ul.children).forEach(function (li) {
      if (li === crest || li === slot || li.hasAttribute("data-nav-page")) return;
      li.remove();
    });
    var after = Math.max(0, Math.min(v.items.length, parseInt(v.crest_after, 10) || Math.ceil(v.items.length / 2)));
    v.items.forEach(function (it, i) {
      var li = document.createElement("li");
      var kids = Array.isArray(it.children) ? it.children.filter(function (c) { return c && c.label && safeHref(c.href); }) : [];
      if (kids.length) {
        var active = kids.some(function (c) { return pageOf(c.href) === here && c.href.indexOf("#") === -1; });
        li.className = "has-menu";
        li.innerHTML = '<button type="button" class="nav-parent' + (active ? " active" : "") + '" aria-expanded="false" aria-haspopup="true">' + esc(it.label) + "</button>" +
          '<ul class="nav-menu' + (kids.length > 8 ? " nav-menu-wide" : "") + '">' +
          kids.map(function (c) { var h = safeHref(c.href); return '<li><a href="' + esc(h) + '"' + ext(h) + ">" + esc(c.label) + "</a></li>"; }).join("") + "</ul>";
      } else {
        var h = safeHref(it.href);
        if (!it.label || !h) return;
        li.innerHTML = '<a href="' + esc(h) + '"' + ext(h) + (pageOf(h) === here ? ' class="active"' : "") + ">" + esc(it.label) + "</a>";
      }
      var before = i < after ? (crest || firstPage || slot) : (firstPage || slot);
      ul.insertBefore(li, before || null);
    });
    if (window.ecaNavBalance) window.ecaNavBalance();
  }

  function renderFooter(v) {
    var grid = document.querySelector(".site-footer .footer-grid");
    if (!grid || !v) return;
    var cols = grid.children;
    var first = cols[0];
    if (first) {
      var ps = first.querySelectorAll(":scope > p");
      if (v.about != null && ps[0]) ps[0].textContent = v.about;
      if (v.tagline != null && ps[1]) ps[1].textContent = v.tagline;
      if (v.founders != null && ps[2]) ps[2].textContent = v.founders;
      var social = first.querySelector(".social-row");
      if (social && v.social) {
        var links = [];
        if (safeHref(v.social.instagram)) links.push('<a href="' + esc(v.social.instagram) + '" target="_blank" rel="noopener" aria-label="Instagram">IG</a>');
        if (safeHref(v.social.facebook)) links.push('<a href="' + esc(v.social.facebook) + '" target="_blank" rel="noopener" aria-label="Facebook">f</a>');
        if (v.email) links.push('<a href="mailto:' + esc(v.email) + '" aria-label="Email">@</a>');
        social.innerHTML = links.join("");
      }
    }
    if (cols[1] && Array.isArray(v.links)) {
      var ul = cols[1].querySelector("ul");
      if (ul) ul.innerHTML = v.links.filter(function (l) { return l && l.label && safeHref(l.href); })
        .map(function (l) { var h = safeHref(l.href); return '<li><a href="' + esc(h) + '"' + ext(h) + ">" + esc(l.label) + "</a></li>"; }).join("");
    }
    if (cols[2]) {
      var cl = cols[2].querySelector("ul");
      if (cl && (v.email || v.location)) {
        cl.innerHTML = (v.email ? '<li><a href="mailto:' + esc(v.email) + '" style="color:inherit;">' + esc(v.email) + "</a></li>" : "") +
          (v.location ? "<li>" + esc(v.location) + "</li>" : "") +
          '<li><a href="contact.html">Full contact details &rarr;</a></li>';
      }
    }
  }

  Promise.race([
    supabaseClient.from("site_settings").select("key, value").in("key", ["site_nav", "site_footer"]),
    new Promise(function (resolve) { setTimeout(function () { resolve({ data: null }); }, 6000); })
  ]).then(function (res) {
    (res && res.data || []).forEach(function (r) {
      try { if (r.key === "site_nav") renderNav(r.value); else if (r.key === "site_footer") renderFooter(r.value); } catch (e) {}
    });
  }, function () {});
})();
