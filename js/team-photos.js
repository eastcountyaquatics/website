// Team page photos: owner-approved photos from Admin > Photo Library that are
// tagged with this team. Only rows with status "approved" are readable by the
// public (database policy), so nothing unreviewed can show up here.
// The best photos are woven into the page between its sections; the rest
// fill a "More photos" grid above the footer.
(function () {
  // Paused for now: set to true to show photo bands and the photo grid on team pages again.
  var ENABLED = false;
  if (!ENABLED) return;
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
  supabaseClient.from("photo_library").select("public_url, public_thumb_url, alt, caption, featured, width, height")
    .eq("status", "approved").eq("team_slug", slug).limit(48).then(function (r) {
      var rows = ((r && r.data) || []).filter(function (p) { return safe(p.public_url) && safe(p.public_thumb_url); });
      if (!rows.length) return;
      var foot = document.querySelector("footer.site-footer");
      if (!foot) return;
      // Featured first, and landscape shots ahead of portrait ones for the wide bands.
      rows.sort(function (a, b) {
        return (b.featured ? 1 : 0) - (a.featured ? 1 : 0) ||
          ((b.width || 0) >= (b.height || 0) ? 1 : 0) - ((a.width || 0) >= (a.height || 0) ? 1 : 0);
      });
      // Visible sections after the hero are the gaps the bands go into.
      var secs = Array.prototype.filter.call(document.querySelectorAll("main section, body > section"), function (s) {
        return !s.classList.contains("page-hero") && s.style.display !== "none" && !s.classList.contains("team-photo-band");
      });
      // Bands of 3, 3, then 2 photos after the first sections (the last one, the contact block, stays last).
      var sizes = [3, 3, 2], used = 0, slots = Math.max(0, Math.min(sizes.length, secs.length - 1));
      for (var i = 0; i < slots && used < rows.length; i++) {
        var n = Math.min(sizes[i], rows.length - used);
        if (n < 2) break;
        var s = secs[i];
        s.parentNode.insertBefore(band(rows.slice(used, used + n)), s.nextSibling);
        used += n;
      }
      var rest = rows.slice(used);
      if (!rest.length) return;
      var sec = document.createElement("section");
      sec.className = "section team-photos";
      var wrap = document.createElement("div");
      wrap.className = "container";
      var h = document.createElement("h2");
      h.textContent = "More photos";
      var grid = document.createElement("div");
      grid.className = "live-photos";
      rest.forEach(function (p) { grid.appendChild(link(p)); });
      wrap.appendChild(h); wrap.appendChild(grid); sec.appendChild(wrap);
      foot.parentNode.insertBefore(sec, foot);
    }, function () {});
})();
