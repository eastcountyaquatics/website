// Inserts a "Join BAND Group" button into the current team page's Stay
// Connected section, using the current BAND invite link on file for
// window.TEAM_SLUG. BAND groups get recreated each session so the link
// itself lives in Supabase (admin-band-links.html), not in this file --
// silently does nothing if there's no link on file yet, or if Supabase
// can't be reached.
(function () {
  var slug = window.TEAM_SLUG;
  if (!slug) return;

  document.addEventListener("DOMContentLoaded", function () {
    var slot = document.getElementById("band-link-slot");
    if (!slot) return;

    supabaseClient
      .from("band_links")
      .select("url")
      .eq("team_slug", slug)
      .maybeSingle()
      .then(function (result) {
        var url = result && result.data && result.data.url;
        if (!url) return;
        var a = document.createElement("a");
        a.href = url;
        a.target = "_blank";
        a.rel = "noopener";
        a.className = "btn btn-outline-dark";
        a.style.marginLeft = "10px";
        a.textContent = "Join BAND Group";
        slot.appendChild(a);
      })
      .catch(function () {});
  });
})();
