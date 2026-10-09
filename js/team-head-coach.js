// Coaches on a team page, from Admin > Manage Coaches: every active coach
// whose Team Group includes this page's team is listed, and each "Head
// Coach" with a public contact email gets a card with a mailto link.
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

  // The page's "Team Coaches" list is typed-in text; once Manage Coaches has
  // anyone for this team, show that list instead so the two never drift.
  // Assigning a coach to a team on Admin > Coaches (Team Group) is all it
  // takes to list them here -- Head Coach first, then A-Z by first name.
  function renderCoachList(coaches) {
    var list = document.querySelector("#head-coach-contact ~ ul.donor-columns") ||
      document.querySelector("section.alt ul.donor-columns");
    if (!list) return;
    var rank = { "Head Coach": 0, "Coach": 1, "Assistant Coach": 2 };
    coaches = coaches.slice().sort(function (a, b) {
      var r = (rank[a.role_title] != null ? rank[a.role_title] : 3) - (rank[b.role_title] != null ? rank[b.role_title] : 3);
      return r !== 0 ? r : (a.full_name || "").localeCompare(b.full_name || "", undefined, { sensitivity: "base" });
    });
    list.innerHTML = "";
    coaches.forEach(function (c) {
      var li = document.createElement("li");
      li.textContent = c.full_name + (c.role_title === "Head Coach" ? " (Head Coach)" : c.role_title === "Assistant Coach" ? " (Assistant Coach)" : "");
      list.appendChild(li);
    });
  }

  supabaseClient
    .from("coaches")
    .select("full_name, role_title, team_group, contact_email, sort_order")
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
    .then(function (res) {
      var coaches = (res.data || []).filter(coachesThisTeam);
      if (coaches.length) renderCoachList(coaches);
      var heads = coaches.filter(function (c) { return c.role_title === "Head Coach" && c.contact_email; });
      if (heads.length) render(heads);
    });
})();
