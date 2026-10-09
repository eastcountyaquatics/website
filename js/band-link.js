// The team's BAND group invite link (Admin > BAND Links, band_links table)
// on its team page, in two places: a highlighted bar right under the page
// header, and a button in the "Stay Connected" block at the bottom.
// BAND groups get recreated each session, so the link lives in Supabase,
// not in this file -- silently does nothing if there's no link on file
// yet, or if Supabase can't be reached.
(function () {
  var slug = window.TEAM_SLUG;
  if (!slug) return;

  document.addEventListener("DOMContentLoaded", function () {
    supabaseClient
      .from("band_links")
      .select("url")
      .eq("team_slug", slug)
      .maybeSingle()
      .then(function (result) {
        var url = result && result.data && result.data.url;
        if (!url) return;

        // Bottom "Stay Connected" block (navy background -> light button).
        var slot = document.getElementById("band-link-slot");
        if (slot) {
          var a = document.createElement("a");
          a.href = url;
          a.target = "_blank";
          a.rel = "noopener";
          a.className = "btn btn-outline";
          a.style.marginLeft = "10px";
          a.textContent = "Join BAND Group";
          slot.appendChild(a);
        }

        // Highlighted bar under the page header.
        var hero = document.querySelector(".page-hero");
        if (hero && !document.getElementById("band-bar")) {
          var teamName = (document.querySelector(".page-hero .breadcrumb") || {}).textContent || "";
          teamName = teamName.split("·").pop().trim();
          var bar = document.createElement("section");
          bar.id = "band-bar";
          bar.className = "band-bar";
          bar.innerHTML =
            '<div class="container band-bar-inner">' +
            '<div><strong>Join the ' + (teamName ? "<span></span> " : "") + 'BAND group</strong>' +
            '<div class="band-bar-sub">Practice updates, schedule changes and team announcements.</div></div>' +
            '<a class="btn btn-primary" target="_blank" rel="noopener">Join BAND Group</a>' +
            "</div>";
          if (teamName) bar.querySelector("strong span").textContent = teamName;
          bar.querySelector("a").href = url;
          hero.parentNode.insertBefore(bar, hero.nextSibling);
        }
      })
      .catch(function () {});
  });
})();
