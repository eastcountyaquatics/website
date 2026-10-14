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
  document.querySelectorAll("[data-gallery]").forEach(function (el) {
    var track = document.createElement("div");
    track.className = "gallery-track";
    // Two copies back to back so the loop is seamless; the second is hidden
    // from screen readers.
    track.innerHTML = [0, 1].map(function (copy) {
      return PHOTOS.map(function (p) {
        return '<img src="images/' + p[0] + '" alt="' + (copy ? "" : esc(p[1])) + '" loading="lazy"' + (copy ? ' aria-hidden="true"' : "") + ">";
      }).join("");
    }).join("");
    el.appendChild(track);
  });
})();
