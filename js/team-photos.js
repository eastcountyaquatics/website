// Team page photos: owner-approved photos from Admin > Photo Library that are
// tagged with this team. Only rows with status "approved" are readable by the
// public (database policy), so nothing unreviewed can show up here.
// The best photos are woven into the page between its sections; the rest
// fill a "More photos" grid above the footer.
(function () {
  if (typeof supabaseClient === "undefined") return;
  var slug = window.TEAM_SLUG || (/masters\.html/.test(location.pathname) ? "masters" : "");
  if (!slug) return;
  function safe(u) { return typeof u === "string" && /^https:\/\//.test(u); }
  function link(p) {
    var a = document.createElement("a");
    a.href = p.public_url; a.target = "_blank"; a.rel = "noopener";
    var img = document.createElement("img");
    img.src = p.public_thumb_url; img.loading = "lazy";
    img.alt = p.alt || p.caption || "ECA team photo";
    a.appendChild(img);
    return a;
  }
  function band(photos) {
    var sec = document.createElement("section");
    sec.className = "team-photo-band";
    var wrap = document.createElement("div");
    wrap.className = "container";
    var row = document.createElement("div");
    row.className = "photo-band-row photo-band-" + photos.length;
    photos.forEach(function (p) { row.appendChild(link(p)); });
    wrap.appendChild(row); sec.appendChild(wrap);
    return sec;
  }
  // Spread through the page: a short row of photos between sections, not one
  // block at the bottom. Run after the page's own layout (js/page-extras.js)
  // has put the sections in order.
  var PER_BAND = 4, MAX_BANDS = 8;
  function bandOf(list) {
    var sec = document.createElement("section");
    sec.className = "team-photo-band";
    var wrap = document.createElement("div");
    wrap.className = "container";
    var grid = document.createElement("div");
    grid.className = "team-photo-row";
    list.forEach(function (p) {
      var a = document.createElement("a");
      a.href = p.public_url; a.target = "_blank"; a.rel = "noopener";
      var img = document.createElement("img");
      img.src = p.public_thumb_url; img.loading = "lazy";
      img.alt = p.alt || p.caption || "ECA team photo";
      a.appendChild(img);
      grid.appendChild(a);
    });
    wrap.appendChild(grid); sec.appendChild(wrap);
    return sec;
  }
  function place(rows) {
    var secs = Array.prototype.slice.call(document.querySelectorAll("body > section[data-section]")).slice(1);
    if (!secs.length) { // no sections to spread between: one band above the footer
      var foot = document.querySelector("footer.site-footer");
      if (foot) foot.parentNode.insertBefore(bandOf(rows.slice(0, PER_BAND * 2)), foot);
      return;
    }
    var bands = Math.min(secs.length, MAX_BANDS, Math.ceil(rows.length / PER_BAND));
    // every gap-th section gets a band after it, so they spread evenly down the page
    var gap = secs.length / bands;
    for (var b = 0; b < bands; b++) {
      var after = secs[Math.min(secs.length - 1, Math.floor(gap * (b + 1)) - 1)];
      after.parentNode.insertBefore(bandOf(rows.slice(b * PER_BAND, (b + 1) * PER_BAND)), after.nextSibling);
    }
  }
  supabaseClient.from("photo_library").select("public_url, public_thumb_url, alt, caption")
    .eq("status", "approved").eq("team_slug", slug).limit(MAX_BANDS * PER_BAND).then(function (r) {
      var rows = ((r && r.data) || []).filter(function (p) { return safe(p.public_url) && safe(p.public_thumb_url); });
      if (!rows.length) return;
      var go = function () { setTimeout(function () { place(rows); }, 900); };
      if (document.readyState === "complete") go(); else window.addEventListener("load", go);
    }, function () {});
})();
