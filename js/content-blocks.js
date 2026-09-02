// Swaps in owner-edited text for any [data-cms] block on this page.
//
// The original wording lives in the HTML and is what visitors see by
// default; a row in content_blocks only exists once someone has edited
// that block. If Supabase is slow or unreachable the page simply keeps
// its built-in text, so this can never leave a page blank.
(function () {
  const blocks = document.querySelectorAll("[data-cms]");
  if (!blocks.length || typeof supabaseClient === "undefined") return;

  const pagePath = window.location.pathname.split("/").pop() || "index.html";

  async function applyOverrides() {
    try {
      const result = await Promise.race([
        supabaseClient
          .from("content_blocks")
          .select("block_key, content")
          .eq("page_path", pagePath),
        new Promise(function (resolve) {
          setTimeout(function () { resolve({ data: null }); }, 6000);
        }),
      ]);

      const rows = result && result.data;
      if (!rows || rows.length === 0) return;

      const byKey = {};
      rows.forEach(function (r) { byKey[r.block_key] = r.content; });

      blocks.forEach(function (el) {
        const override = byKey[el.getAttribute("data-cms")];
        if (typeof override === "string") {
          el.innerHTML = typeof sanitizeHtml === "function" ? sanitizeHtml(override) : override;
        }
      });
    } catch (e) {
      // Built-in text stands.
    }
  }

  applyOverrides();
})();
