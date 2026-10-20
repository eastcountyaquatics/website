// Swaps in owner-edited text for any [data-cms] block on this page.
//
// The original wording lives in the HTML and is what visitors see by
// default; a row in content_blocks only exists once someone has edited
// that block. If Supabase is slow or unreachable the page simply keeps
// its built-in text, so this can never leave a page blank.
(function () {
  // admin-editor.html loads pages with ?edit=1 and applies overrides (and
  // click-to-edit) itself, authoritatively -- if this ran too, its async
  // fetch could land after an edit already in progress and silently
  // clobber it back to the saved value mid-keystroke.
  if (/[?&]edit=1(&|$)/.test(window.location.search)) return;

  const blocks = document.querySelectorAll("[data-cms]");
  if (typeof supabaseClient === "undefined") return;

  const pagePath = window.location.pathname.split("/").pop() || "index.html";
  // Tab title and Google description, set on Edit Website > Tab & Google Text.
  const metaPrefix = pagePath.replace(/\.html$/, "") + "-meta-";
  function applyMeta(r) {
    if (r.block_key === metaPrefix + "title") {
      document.title = r.content;
      document.querySelectorAll('meta[property="og:title"], meta[name="twitter:title"]').forEach(function (m) { m.setAttribute("content", r.content); });
    } else if (r.block_key === metaPrefix + "desc") {
      document.querySelectorAll('meta[name="description"], meta[property="og:description"], meta[name="twitter:description"]').forEach(function (m) { m.setAttribute("content", r.content); });
    }
  }

  async function applyOverrides() {
    try {
      const result = await Promise.race([
        supabaseClient
          .from("content_blocks")
          .select("block_key, content, tag")
          .eq("page_path", pagePath),
        new Promise(function (resolve) {
          setTimeout(function () { resolve({ data: null }); }, 6000);
        }),
      ]);

      const rows = result && result.data;
      if (!rows || rows.length === 0) return;

      const byKey = {};
      rows.forEach(function (r) {
        byKey[r.block_key] = r;
        if (typeof r.content === "string" && r.block_key.indexOf(metaPrefix) === 0) applyMeta(r);
      });

      blocks.forEach(function (el) {
        const override = byKey[el.getAttribute("data-cms")];
        if (!override || typeof override.content !== "string") return;
        const html = typeof sanitizeHtml === "function" ? sanitizeHtml(override.content) : override.content;
        // A tag override (e.g. a paragraph promoted to a Heading) means
        // swapping the element itself -- a tag name can't be changed on an
        // existing node -- carrying its attributes (data-cms included, so
        // future lookups still find it) onto a freshly made replacement.
        if (override.tag && override.tag !== el.tagName.toLowerCase()) {
          const replacement = document.createElement(override.tag);
          Array.prototype.forEach.call(el.attributes, function (attr) {
            replacement.setAttribute(attr.name, attr.value);
          });
          replacement.innerHTML = html;
          el.replaceWith(replacement);
        } else {
          el.innerHTML = html;
        }
      });
    } catch (e) {
      // Built-in text stands.
    }
  }

  applyOverrides();
})();
