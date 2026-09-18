// Shows a published practice schedule for the current team page, fetched
// from Supabase, without touching any of the page's existing static
// content. Silently does nothing if there's no published schedule yet, or
// if Supabase can't be reached -- the static page is always the fallback.
(function () {
  var slug = window.TEAM_SLUG;
  if (!slug) return;

  function escapeHtml(str) {
    return String(str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  var DAYS_OF_WEEK = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  function formatTime12h(t) {
    if (!t) return "";
    var parts = t.split(":");
    var h = parseInt(parts[0], 10);
    var ampm = h >= 12 ? "pm" : "am";
    h = h % 12 || 12;
    return h + ":" + parts[1] + ampm;
  }
  function formatDateShort(d) {
    if (!d) return "";
    return new Date(d + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }
  function appleMapsUrl(address) { return "https://maps.apple.com/?q=" + encodeURIComponent(address); }
  function googleMapsUrl(address) { return "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(address); }

  // A practice line is either a plain string (saved before structured
  // fields existed) or a structured { day_of_week/date, start_time,
  // end_time, pool_name, pool_address } entry -- both render here.
  function lineToHtml(l) {
    if (typeof l === "string") return escapeHtml(l);
    if (l.legacy_text) return escapeHtml(l.legacy_text);
    var when = escapeHtml(l.date ? formatDateShort(l.date) : (l.day_of_week || ""));
    var time = (l.start_time && l.end_time) ? formatTime12h(l.start_time) + "–" + formatTime12h(l.end_time) : "";
    var text = [when, time, escapeHtml(l.pool_name || "")].filter(Boolean).join(", ");
    if (l.pool_address) {
      text += ' &middot; <a href="' + appleMapsUrl(l.pool_address) + '" target="_blank" rel="noopener">Apple Maps</a>' +
        ' &middot; <a href="' + googleMapsUrl(l.pool_address) + '" target="_blank" rel="noopener">Google Maps</a>';
    }
    return text;
  }

  function linesToHtml(arr) {
    if (!Array.isArray(arr) || arr.length === 0) return "";
    return (
      "<ul>" +
      arr.map(function (l) { return "<li>" + lineToHtml(l) + "</li>"; }).join("") +
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
