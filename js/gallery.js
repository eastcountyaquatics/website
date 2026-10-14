// Scrolling photo strip: <section class="gallery" data-gallery></section>
// One list of photos for every page that shows it. (Planned: owners manage
// this list from Admin; until then edit PHOTOS here.)
(function () {
  var PHOTOS = [
    ["jo/jo-03.jpg", "ECA girls team in matching pink shirts"],
    ["accomplishments/acc-26.jpg", "ECA athletes with their medals"],
    ["jo/jo-16.jpg", "ECA boys team in blue shirts"],
    ["accomplishments/acc-23.jpg", "ECA athletes celebrating together in the pool"],
    ["jo/jo-05.jpg", "An ECA team in front of a painted mural"],
    ["accomplishments/acc-11.jpg", "An ECA athlete with a championship trophy"],
    ["jo/jo-13.jpg", "An ECA team at a tournament"],
    ["accomplishments/acc-19.jpg", "ECA athletes with their medals at the pool"],
    ["jo/jo-01.jpg", "ECA athletes in teal shirts"],
    ["accomplishments/acc-10.jpg", "ECA athletes in teal shirts at Junior Olympics"],
    ["accomplishments/acc-08.jpg", "ECA team with their championship banner"],
    ["jo/jo-04.jpg", "An ECA team lined up at the pool"]
  ];
  function esc(t) { return String(t).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;"); }
  function safe(url) { return typeof url === "string" && (/^https:\/\//.test(url) || /^images\/[\w.\/-]+$/.test(url)); }
  // Built-in photos use their small WebP copy; owner photos are used as uploaded.
  function srcOf(p) { return /^images\//.test(p.url) && /\.jpg$/.test(p.url) ? p.url.replace(/^images\//, "images/thumbs/").replace(/\.jpg$/, ".webp") : p.url; }

  function render(list) {
    document.querySelectorAll("[data-gallery]").forEach(function (el) {
      el.innerHTML = "";
      if (!list.length) { el.style.display = "none"; return; }
      el.style.display = "";
      var track = document.createElement("div");
      track.className = "gallery-track";
      // Two copies back to back so the loop is seamless; the second is
      // hidden from screen readers.
      track.innerHTML = [0, 1].map(function (copy) {
        return list.map(function (p) {
          return '<img src="' + esc(srcOf(p)) + '" alt="' + (copy ? "" : esc(p.alt || "")) + '" loading="lazy"' + (copy ? ' aria-hidden="true"' : "") + ">";
        }).join("");
      }).join("");
      // Short lists still need to fill the strip: keep the loop speed per photo.
      track.style.animationDuration = Math.max(30, list.length * 6) + "s";
      el.appendChild(track);
    });
  }

  var builtIn = PHOTOS.map(function (p) { return { url: "images/" + p[0], alt: p[1] }; });
  window.ECA_GALLERY_DEFAULTS = builtIn;
  if (!document.querySelector("[data-gallery]")) return;
  // Owners manage the list on Admin > Photo Gallery (site_settings
  // "gallery_photos"); until they do, or if Supabase is slow, the built-in
  // photos show.
  var done = false;
  function finish(list) { if (done) return; done = true; render(list); }
  setTimeout(function () { finish(builtIn); }, 2500);
  if (typeof supabaseClient === "undefined") { finish(builtIn); return; }
  supabaseClient.from("site_settings").select("value").eq("key", "gallery_photos").maybeSingle().then(function (res) {
    var v = res && res.data && res.data.value;
    var list = v && Array.isArray(v.photos) ? v.photos.filter(function (p) { return p && safe(p.url); }) : null;
    finish(list ? list : builtIn);
  }, function () { finish(builtIn); });
})();
