// Swaps in an owner-uploaded replacement image for any [data-cms-img]
// element on this page -- the image equivalent of js/content-blocks.js.
//
// Two kinds of elements can carry data-cms-img: a plain <img> (swap its
// src/alt), or an element marked data-cms-bg="1" that shows its image via
// a CSS background-image instead (the homepage hero photo is the only
// one of these right now). The original image is what visitors see by
// default; a row in image_blocks only exists once an owner has replaced
// that image. If Supabase is slow or unreachable the page simply keeps
// its built-in image, so this can never leave a page broken.
(function () {
  // See the matching guard in js/content-blocks.js -- admin-editor.html
  // (?edit=1) applies image overrides itself, authoritatively.
  if (/[?&]edit=1(&|$)/.test(window.location.search)) return;

  const blocks = document.querySelectorAll("[data-cms-img]");
  if (!blocks.length || typeof supabaseClient === "undefined") return;

  const pagePath = window.location.pathname.split("/").pop() || "index.html";

  // Owner-only write access (see the image_blocks RLS policy) already
  // keeps this out of reach of a random visitor, but a URL still ends up
  // directly in the DOM -- reject anything that isn't a plain http(s) or
  // site-relative path, same allowlist js/sanitize-html.js uses for
  // src/href, as a second layer in case an owner account is ever
  // compromised.
  function safeImageUrl(url) {
    const u = String(url || "").trim();
    if (!u) return null;
    if (/^https?:\/\//i.test(u)) return u;
    if (/^[a-z0-9._~\-/]/i.test(u) && u.indexOf(":") === -1) return u;
    return null;
  }

  async function applyOverrides() {
    try {
      const result = await Promise.race([
        supabaseClient
          .from("image_blocks")
          .select("block_key, image_url, alt_text")
          .eq("page_path", pagePath),
        new Promise(function (resolve) {
          setTimeout(function () { resolve({ data: null }); }, 6000);
        }),
      ]);

      const rows = result && result.data;
      if (!rows || rows.length === 0) return;

      const byKey = {};
      rows.forEach(function (r) { byKey[r.block_key] = r; });

      blocks.forEach(function (el) {
        const override = byKey[el.getAttribute("data-cms-img")];
        if (!override) return;
        const url = safeImageUrl(override.image_url);
        if (!url) return;
        if (el.hasAttribute("data-cms-bg")) {
          el.style.backgroundImage = "url('" + url.replace(/'/g, "%27") + "')";
        } else {
          el.src = url;
        }
        if (override.alt_text) el.setAttribute("alt", override.alt_text);
      });
    } catch (e) {
      // Built-in image stands.
    }
  }

  applyOverrides();
})();
