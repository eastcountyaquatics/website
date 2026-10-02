// Head coach contact on a team page: every coach whose Role / Title is
// "Head Coach" and whose Team Group includes this page's team shows up
// with a mailto link. Managed entirely from Admin > Manage Coaches.
(function () {
  var slug = window.TEAM_SLUG;
  if (!slug || typeof supabaseClient === "undefined") return;

  // "12u-boys" -> "12U Boys", "splashball" -> "Splashball" -- the same
  // labels the Team Group checkboxes on admin-coaches.html save.
  var teamLabel = slug.split("-").map(function (part) {
    return /^\d+u$/.test(part) ? part.toUpperCase() : part.charAt(0).toUpperCase() + part.slice(1);
  }).join(" ");

  function coachesThisTeam(coach) {
    return String(coach.team_group || "")
      .split("&")
      .map(function (s) { return s.trim().toLowerCase(); })
      .indexOf(teamLabel.toLowerCase()) !== -1;
  }

  function render(coaches) {
    var target = document.getElementById("head-coach-contact");
    if (!target) {
      // Pages without a Coaches section get their own small one up top.
      var section = document.createElement("section");
      section.className = "section-tight";
      section.innerHTML = '<div class="container"><div id="head-coach-contact"></div></div>';
      var anchor = document.getElementById("dynamic-schedule-section");
      if (!anchor) return;
      anchor.parentNode.insertBefore(section, anchor);
      target = document.getElementById("head-coach-contact");
    }

    var card = document.createElement("div");
    card.className = "head-coach-card";
    var label = document.createElement("span");
    label.className = "kicker";
    label.textContent = coaches.length > 1 ? "Head Coaches" : "Head Coach";
    card.appendChild(label);

    coaches.forEach(function (c) {
      var row = document.createElement("div");
      row.className = "head-coach-row";
      var name = document.createElement("strong");
      name.textContent = c.full_name;
      row.appendChild(name);
      var link = document.createElement("a");
      link.href = "mailto:" + c.contact_email;
      link.textContent = c.contact_email;
      row.appendChild(link);
      card.appendChild(row);
    });
    target.appendChild(card);
  }

  supabaseClient
    .from("coaches")
    .select("full_name, team_group, contact_email, sort_order")
    .eq("role_title", "Head Coach")
    .not("contact_email", "is", null)
    .order("sort_order", { ascending: true })
    .then(function (res) {
      var coaches = (res.data || []).filter(coachesThisTeam);
      if (coaches.length) render(coaches);
    });
})();
