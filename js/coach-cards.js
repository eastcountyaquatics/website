// One coach card for the whole site (About Us staff, team pages): headshot
// or a placeholder, name and role; the bio slides up over the photo on
// hover or keyboard focus, and on a tap for phones.
(function () {
  function safePhoto(url) {
    return typeof url === "string" && (/^https:\/\//.test(url) || /^images\/[\w.\/-]+$/.test(url));
  }
  function initials(name) {
    var parts = String(name || "?").trim().split(/\s+/);
    return ((parts[0] || "?").charAt(0) + (parts.length > 1 ? parts[parts.length - 1].charAt(0) : "")).toUpperCase();
  }

  window.ecaCoachCard = function (c, roleOverride) {
    var card = document.createElement("article");
    card.className = "cc" + (c.bio ? " has-bio" : "");
    var photo = document.createElement("div");
    photo.className = "cc-photo";
    if (safePhoto(c.photo_url)) {
      var img = document.createElement("img");
      img.src = c.photo_url;
      img.alt = c.full_name || "Coach";
      img.loading = "lazy";
      photo.appendChild(img);
    } else {
      photo.classList.add("cc-placeholder");
      var ph = document.createElement("span");
      ph.className = "cc-initials";
      ph.setAttribute("aria-hidden", "true");
      ph.textContent = initials(c.full_name);
      photo.appendChild(ph);
    }
    if (c.bio) {
      var bio = document.createElement("div");
      bio.className = "cc-bio";
      var p = document.createElement("p");
      p.textContent = c.bio;
      bio.appendChild(p);
      photo.appendChild(bio);
      var hint = document.createElement("span");
      hint.className = "cc-hint";
      hint.setAttribute("aria-hidden", "true");
      hint.textContent = "Bio";
      photo.appendChild(hint);
      card.tabIndex = 0;
      card.setAttribute("role", "button");
      card.setAttribute("aria-expanded", "false");
      card.setAttribute("aria-label", (c.full_name || "Coach") + ", show bio");
      function toggle() {
        var open = !card.classList.contains("open");
        card.classList.toggle("open", open);
        card.setAttribute("aria-expanded", open ? "true" : "false");
      }
      card.addEventListener("click", toggle);
      card.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(); } });
    }
    card.appendChild(photo);
    var meta = document.createElement("div");
    meta.className = "cc-meta";
    var h = document.createElement("h3");
    h.textContent = c.full_name || "Coach";
    meta.appendChild(h);
    var role = document.createElement("span");
    role.className = "cc-role";
    role.textContent = roleOverride || c.role_title || "Coach";
    meta.appendChild(role);
    card.appendChild(meta);
    return card;
  };

  window.ecaCoachGrid = function (coaches, roleFor) {
    var grid = document.createElement("div");
    grid.className = "cc-grid";
    coaches.forEach(function (c) { grid.appendChild(window.ecaCoachCard(c, roleFor ? roleFor(c) : null)); });
    return grid;
  };
})();
