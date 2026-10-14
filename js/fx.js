// Small "alive" touches for the public pages: bubbles rising through the
// pool hero and navy headers, and sections easing in as they scroll into
// view. Off for visitors who ask for less motion, and in the site editor.
(function () {
  if (/[?&]edit=1(&|$)/.test(location.search)) return;
  if (window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  var root = document.documentElement;
  root.classList.add("fx");

  // ---- Bubbles: a single whoosh up through the header when the page
  // loads (and through the trial box when it scrolls into view). ----
  function whoosh(host, count) {
    if (!host || host.querySelector(".bubbles")) return;
    var layer = document.createElement("div");
    layer.className = "bubbles";
    layer.setAttribute("aria-hidden", "true");
    var h = host.getBoundingClientRect().height || 500;
    var longest = 0;
    for (var i = 0; i < count; i++) {
      var b = document.createElement("span");
      b.className = "burst";
      var size = 5 + Math.random() * 24;                       // 5-29px
      var dur = 1.6 + Math.random() * 1.6;                     // 1.6-3.2s
      var delay = Math.random() * 0.9;                         // all within the first second
      longest = Math.max(longest, dur + delay);
      b.style.width = b.style.height = size.toFixed(1) + "px";
      b.style.left = (Math.random() * 100).toFixed(1) + "%";
      b.style.setProperty("--dur", dur.toFixed(2) + "s");
      b.style.setProperty("--delay", delay.toFixed(2) + "s");
      b.style.setProperty("--sway", ((Math.random() - 0.5) * 70).toFixed(0) + "px");
      b.style.setProperty("--rise", "-" + Math.round(h * (0.75 + Math.random() * 0.45)) + "px");
      b.style.setProperty("--alpha", (0.45 + Math.random() * 0.45).toFixed(2));
      layer.appendChild(b);
    }
    host.appendChild(layer);
    setTimeout(function () { layer.remove(); }, (longest + 0.3) * 1000);
  }
  var small = window.innerWidth < 700;
  whoosh(document.querySelector(".hero-full"), small ? 26 : 46);
  document.querySelectorAll(".page-hero").forEach(function (h) { whoosh(h, small ? 18 : 32); });
  var trial = document.querySelector(".trial-box");
  if (trial && "IntersectionObserver" in window) {
    var tio = new IntersectionObserver(function (es) {
      if (es[0].isIntersecting) { whoosh(trial, small ? 14 : 22); tio.disconnect(); }
    }, { threshold: 0.4 });
    tio.observe(trial);
  }

  // ---- Reveal on scroll ----
  if (!("IntersectionObserver" in window)) return;
  var targets = document.querySelectorAll(
    "main section .container > *, body > section:not(.hero-full):not(.page-hero) .container > *, .tile, .card, .gallery"
  );
  var seen = new Set();
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); }
    });
  }, { rootMargin: "0px 0px -8% 0px", threshold: 0.08 });
  targets.forEach(function (el) {
    if (seen.has(el) || el.closest(".hero-full, .page-hero, .site-header, .site-footer")) return;
    seen.add(el);
    // Already on screen at load: show at once, no flash.
    var r = el.getBoundingClientRect();
    if (r.top < window.innerHeight && r.bottom > 0) { el.classList.add("in"); return; }
    el.classList.add("reveal");
    io.observe(el);
  });
  // Stagger cards/tiles that sit side by side.
  document.querySelectorAll(".tiles, .grid").forEach(function (g) {
    Array.prototype.forEach.call(g.children, function (c, i) { c.style.setProperty("--stagger", (i % 4) * 90 + "ms"); });
  });
  // Safety net: never leave anything hidden.
  setTimeout(function () { document.querySelectorAll(".reveal:not(.in)").forEach(function (el) { el.classList.add("in"); }); }, 6000);
})();
