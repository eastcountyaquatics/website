// Swaps in owner-edited button text and links for any [data-cms-link] on
// this page (Admin > Edit Website, "Edit button"). The built-in button is
// what visitors see by default and if Supabase is slow or unreachable.
(function () {
  if (/[?&]edit=1(&|$)/.test(window.location.search)) return; // the editor applies these itself
  var links = document.querySelectorAll("[data-cms-link]");
  if (!links.length || typeof supabaseClient === "undefined") return;
  var pagePath = window.ECA_PAGE_PATH || window.location.pathname.split("/").pop() || "index.html";

  window.ecaSafeHref = window.ecaSafeHref || function (value) {
    var url = String(value || "").trim();
    if (!url) return null;
    if (/^(https?:\/\/|mailto:|tel:)/i.test(url)) return url;
    if (/^#[\w-]*$/.test(url)) return url;
    if (/^[a-z0-9._~\-\/?=&#%]+$/i.test(url) && url.indexOf(":") === -1) return url; // a page on this site
    return null;
  };

  Promise.race([
    supabaseClient.from("link_blocks").select("block_key, label, href").eq("page_path", pagePath),
    new Promise(function (resolve) { setTimeout(function () { resolve({ data: null }); }, 6000); })
  ]).then(function (res) {
    var rows = (res && res.data) || [];
    if (!rows.length) return;
    var byKey = {};
    rows.forEach(function (r) { byKey[r.block_key] = r; });
    links.forEach(function (el) {
      var o = byKey[el.getAttribute("data-cms-link")];
      if (!o) return;
      if (o.label) el.textContent = o.label;
      var href = window.ecaSafeHref(o.href);
      if (href) {
        el.setAttribute("href", href);
        // Links to other sites open in a new tab.
        if (/^https?:\/\//i.test(href) && href.indexOf(location.host) === -1) { el.target = "_blank"; el.rel = "noopener"; }
        else { el.removeAttribute("target"); }
      }
    });
  }, function () {});
})();
