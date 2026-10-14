// Small "alive" touches for the public pages: bubbles rising through the
// pool hero and navy headers, and sections easing in as they scroll into
// view. Off for visitors who ask for less motion, and in the site editor.
(function () {
  if (/[?&]edit=1(&|$)/.test(location.search)) return;
  if (window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  var root = document.documentElement;
  root.classList.add("fx");

  // ---- Bubbles ----
  function addBubbles(host, count) {
    if (!host || host.querySelector(".bubbles")) return;
    var layer = document.createElement("div");
    layer.className = "bubbles";
    layer.setAttribute("aria-hidden", "true");
    for (var i = 0; i < count; i++) {
      var b = document.createElement("span");
      var size = 6 + Math.random() * 22;                 // 6-28px
      b.style.width = b.style.height = size.toFixed(1) + "px";
      b.style.left = (Math.random() * 100).toFixed(1) + "%";
      b.style.setProperty("--dur", (9 + Math.random() * 10).toFixed(1) + "s");   // 9-19s to rise
      b.style.setProperty("--delay", (-Math.random() * 18).toFixed(1) + "s");  // start mid-way
      b.style.setProperty("--sway", (10 + Math.random() * 26).toFixed(0) + "px");
      b.style.setProperty("--alpha", (0.35 + Math.random() * 0.45).toFixed(2));
      layer.appendChild(b);
    }
    host.appendChild(layer);
  }
  var small = window.innerWidth < 700;
  addBubbles(document.querySelector(".hero-full"), small ? 10 : 18);
  document.querySelectorAll(".page-hero").forEach(function (h) { addBubbles(h, small ? 6 : 12); });
  addBubbles(document.querySelector(".trial-box"), small ? 5 : 9);

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
