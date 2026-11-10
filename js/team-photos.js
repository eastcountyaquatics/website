// Team page photos: owner-approved photos from Admin > Photo Library that are
// tagged with this team. Only rows with status "approved" are readable by the
// public (database policy), so nothing unreviewed can show up here.
(function () {
  if (typeof supabaseClient === "undefined") return;
  var slug = window.TEAM_SLUG || (/masters\.html/.test(location.pathname) ? "masters" : "");
  if (!slug) return;
  function safe(u) { return typeof u === "string" && /^https:\/\//.test(u); }
  supabaseClient.from("photo_library").select("public_url, public_thumb_url, alt, caption")
    .eq("status", "approved").eq("team_slug", slug).limit(48).then(function (r) {
      var rows = ((r && r.data) || []).filter(function (p) { return safe(p.public_url) && safe(p.public_thumb_url); });
      if (!rows.length) return;
      var foot = document.querySelector("footer.site-footer");
      if (!foot) return;
      var sec = document.createElement("section");
      sec.className = "section team-photos";
      var wrap = document.createElement("div");
      wrap.className = "container";
      var h = document.createElement("h2");
      h.textContent = "Photos";
      var grid = document.createElement("div");
      grid.className = "live-photos";
      rows.forEach(function (p) {
        var a = document.createElement("a");
        a.href = p.public_url; a.target = "_blank"; a.rel = "noopener";
        var img = document.createElement("img");
        img.src = p.public_thumb_url; img.loading = "lazy";
        img.alt = p.alt || p.caption || "ECA team photo";
        a.appendChild(img);
        grid.appendChild(a);
      });
      wrap.appendChild(h); wrap.appendChild(grid); sec.appendChild(wrap);
      foot.parentNode.insertBefore(sec, foot);
    }, function () {});
})();
