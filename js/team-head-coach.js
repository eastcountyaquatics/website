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
  // anyone for this team, show them instead -- as cards with each coach's
  // photo (or initial) and bio, so the two never drift. Assigning a coach to
  // a team on Admin > Coaches (Team Group) is all it takes to list them
  // here -- Head Coach first, then A-Z by first name. Returns false when the
  // page has no Team Coaches list to replace.
  function renderCoachList(coaches) {
    var list = document.querySelector("#head-coach-contact ~ ul.donor-columns") ||
      document.querySelector("section.alt ul.donor-columns");
    if (!list) return false;
    var grid = document.createElement("div");
    grid.className = "grid grid-3";
    grid.style.marginTop = "8px";
    sortCoaches(coaches).forEach(function (c) { grid.appendChild(coachCard(c)); });
    list.parentNode.replaceChild(grid, list);
    // The bios are right here now, so drop the "Full bios on the Coaches
    // page" pointer under the old name list.
    var pointer = grid.parentNode.querySelector('a[href^="about-us.html#coaches"]');
    if (pointer && pointer.closest("p")) pointer.closest("p").remove();
    return true;
  }

  // A full https link (an uploaded photo) or a photo that ships with the
  // site ("images/coach-preston.jpg") -- nothing else goes in an <img>.
  function safePhoto(url) {
    return typeof url === "string" && (/^https:\/\//.test(url) || /^images\/[\w.\/-]+$/.test(url));
  }

  function sortCoaches(coaches) {
    var rank = { "Head Coach": 0, "Coach": 1, "Assistant Coach": 2 };
    return coaches.slice().sort(function (a, b) {
      var r = (rank[a.role_title] != null ? rank[a.role_title] : 3) - (rank[b.role_title] != null ? rank[b.role_title] : 3);
      return r !== 0 ? r : (a.full_name || "").localeCompare(b.full_name || "", undefined, { sensitivity: "base" });
    });
  }

  // Same look as the About Us coaches: photo (or first initial), name, role,
  // then the bio when the coach has one.
  function coachCard(c) {
    var card = document.createElement("div");
    card.className = "coach-card";
    var photo = document.createElement("div");
    photo.className = "coach-photo";
    if (safePhoto(c.photo_url)) {
      var img = document.createElement("img");
      img.src = c.photo_url;
      img.alt = c.full_name;
      img.loading = "lazy";
      photo.appendChild(img);
    } else {
      photo.textContent = (c.full_name || "?").charAt(0);
    }
    card.appendChild(photo);
    var body = document.createElement("div");
    var name = document.createElement("h3");
    name.textContent = c.full_name;
    body.appendChild(name);
    var role = document.createElement("span");
    role.className = "coach-role";
    role.textContent = c.role_title || "Coach";
    body.appendChild(role);
    if (c.bio) {
      var bio = document.createElement("p");
      bio.className = "muted";
      bio.style.whiteSpace = "pre-line";
      bio.style.fontSize = "14px";
      bio.textContent = c.bio;
      body.appendChild(bio);
    }
    card.appendChild(body);
    return card;
  }

  // Bios and headshots of this team's coaches, as the last section of the
  // page (photo/bio come from each coach's own registration/profile).
  function renderBios(coaches) {
    var footer = document.querySelector("footer.site-footer");
    if (!footer || document.getElementById("team-coach-bios")) return;
    var rank = { "Head Coach": 0, "Coach": 1, "Assistant Coach": 2 };
    var sorted = coaches.slice().sort(function (a, b) {
      var r = (rank[a.role_title] != null ? rank[a.role_title] : 3) - (rank[b.role_title] != null ? rank[b.role_title] : 3);
      return r !== 0 ? r : (a.full_name || "").localeCompare(b.full_name || "", undefined, { sensitivity: "base" });
    });
    var section = document.createElement("section");
    section.id = "team-coach-bios";
    section.className = "alt";
    var container = document.createElement("div");
    container.className = "container";
    var head = document.createElement("div");
    head.className = "section-head";
    head.innerHTML = '<span class="kicker">Meet the Coaches</span><h2></h2>';
    head.querySelector("h2").textContent = teamLabel + " Coaching Staff";
    container.appendChild(head);
    var grid = document.createElement("div");
    grid.className = "grid grid-3";
    sorted.forEach(function (c) {
      var card = document.createElement("div");
      card.className = "card";
      card.style.textAlign = "center";
      if (safePhoto(c.photo_url)) {
        var img = document.createElement("img");
        img.src = c.photo_url;
        img.alt = c.full_name;
        img.loading = "lazy";
        img.style.cssText = "width:140px;height:140px;object-fit:cover;border-radius:50%;margin:0 auto 12px;display:block;";
        card.appendChild(img);
      }
      var name = document.createElement("h3");
      name.textContent = c.full_name;
      card.appendChild(name);
      if (c.role_title) {
        var role = document.createElement("p");
        role.className = "muted";
        role.style.fontWeight = "700";
        role.textContent = c.role_title;
        card.appendChild(role);
      }
      if (c.bio) {
        var bio = document.createElement("p");
        bio.className = "muted";
        bio.style.whiteSpace = "pre-line";
        bio.textContent = c.bio;
        card.appendChild(bio);
      }
      grid.appendChild(card);
    });
    container.appendChild(grid);
    section.appendChild(container);
    footer.parentNode.insertBefore(section, footer);
  }

  supabaseClient
    .from("coaches")
    .select("full_name, role_title, team_group, contact_email, sort_order, bio, photo_url")
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
    .then(function (res) {
      var coaches = (res.data || []).filter(coachesThisTeam);
      // Pages with a Team Coaches list get the cards there; pages without
      // one get a "Meet the Coaches" section at the bottom instead.
      var listed = coaches.length ? renderCoachList(coaches) : false;
      var withProfile = coaches.filter(function (c) { return c.bio || c.photo_url; });
      if (!listed && withProfile.length) renderBios(withProfile);
      var heads = coaches.filter(function (c) { return c.role_title === "Head Coach" && c.contact_email; });
      if (heads.length) render(heads);
    });
})();
