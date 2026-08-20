// Shows a published practice schedule for the current team page, fetched
// from Supabase, without touching any of the page's existing static
// content. Silently does nothing if there's no published schedule yet, or
// if Supabase can't be reached -- the static page is always the fallback.
(function () {
  var slug = window.TEAM_SLUG;
  if (!slug) return;

  function escapeHtml(str) {
    var div = document.createElement("div");
    div.textContent = str || "";
    return div.innerHTML;
  }

  function linesToHtml(arr) {
    if (!Array.isArray(arr) || arr.length === 0) return "";
    return (
      "<ul>" +
      arr.map(function (l) { return "<li>" + escapeHtml(l) + "</li>"; }).join("") +
      "</ul>"
    );
  }

  async function loadTeamSchedule() {
    try {
      var result = await Promise.race([
        supabaseClient
          .from("schedules")
          .select("*")
          .eq("team_slug", slug)
          .eq("is_published", true)
          .maybeSingle(),
        new Promise(function (resolve) {
          setTimeout(function () { resolve({ data: null, error: null, timedOut: true }); }, 8000);
        }),
      ]);

      var data = result && result.data;
      if (!data) return;

      var hasContent =
        data.season_label ||
        data.date_range ||
        data.requirements ||
        (data.practice_lines && data.practice_lines.length) ||
        (data.notes && data.notes.length);
      if (!hasContent) return;

      var wrap = document.getElementById("dynamic-schedule-section");
      if (!wrap) return;

      wrap.innerHTML =
        '<div class="container">' +
        '<div class="section-head">' +
        '<span class="kicker">Practice Schedule</span>' +
        "<h2>" + escapeHtml(data.season_label || "Current Schedule") + "</h2>" +
        (data.date_range ? '<p class="muted">' + escapeHtml(data.date_range) + "</p>" : "") +
        "</div>" +
        (data.practice_lines && data.practice_lines.length
          ? '<div class="card" style="max-width:600px;margin:0 auto 16px;">' + linesToHtml(data.practice_lines) + "</div>"
          : "") +
        (data.requirements
          ? '<p class="muted" style="text-align:center;font-style:italic;">' + escapeHtml(data.requirements) + "</p>"
          : "") +
        (data.notes && data.notes.length
          ? '<div class="muted" style="max-width:600px;margin:16px auto 0;">' + linesToHtml(data.notes) + "</div>"
          : "") +
        "</div>";
      wrap.style.display = "";

      var placeholderNotice = document.getElementById("no-schedule-yet-notice");
      if (placeholderNotice) placeholderNotice.style.display = "none";
    } catch (e) {
      // Static page content is the fallback -- fail silently.
    }
  }

  loadTeamSchedule();
})();
