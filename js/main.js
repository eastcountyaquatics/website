document.addEventListener("DOMContentLoaded", function () {
  var toggle = document.querySelector(".nav-toggle");
  var nav = document.querySelector(".main-nav");
  if (toggle && nav) {
    toggle.addEventListener("click", function () {
      nav.classList.toggle("open");
      var expanded = nav.classList.contains("open");
      toggle.setAttribute("aria-expanded", expanded ? "true" : "false");
    });
    nav.querySelectorAll("a").forEach(function (link) {
      link.addEventListener("click", function () {
        nav.classList.remove("open");
      });
    });
  }

  // Links like dashboard.html#free-trial: most pages fill in their content
  // after loading (athletes, programs, coaches...), which pushes the target
  // further down after the browser has already jumped to it. Keep the
  // target lined up while the page settles, until the visitor scrolls.
  if (window.location.hash.length > 1) {
    var target = document.getElementById(decodeURIComponent(window.location.hash.slice(1)));
    if (target) {
      var userMoved = false;
      ["wheel", "touchmove", "keydown", "mousedown"].forEach(function (evt) {
        window.addEventListener(evt, function () { userMoved = true; }, { once: true, passive: true });
      });
      [0, 300, 800, 1500, 2500, 4000].forEach(function (ms) {
        setTimeout(function () {
          if (!userMoved) target.scrollIntoView({ block: "start" });
        }, ms);
      });
    }
  }

  var yearEl = document.getElementById("year");
  if (yearEl) {
    yearEl.textContent = new Date().getFullYear();
  }
});
