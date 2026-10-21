// Applies what an owner arranged in Admin > Edit Website to this page:
//
//   page_layouts (newer): the order of the page's sections, which built-in
//   ones are hidden, and owner-added sections placed anywhere between them.
//   Built-in sections carry a permanent data-section key in the HTML
//   (e.g. data-section="masters-3"); a layout lists those keys in order,
//   plus added sections with their own content.
//
//   page_extras (older): one block of added content shown right before the
//   footer. Used only when the page has no layout yet.
//
// If nothing has been saved, or Supabase is slow or unreachable, the page
// renders exactly as built. The last layout is cached in this browser so a
// rearranged page doesn't visibly jump on the next visit.
(function () {
  const pagePath = window.ECA_PAGE_PATH || window.location.pathname.split("/").pop() || "index.html";
  const CACHE_KEY = "eca-layout:" + pagePath;

  function clean(html) {
    return typeof sanitizeHtml === "function" ? sanitizeHtml(html || "") : (html || "");
  }

  // Shared with admin-editor.html, which calls it on the page it's editing
  // (with { editing: true } so hidden sections stay visible, just marked).
  // Safe to call more than once: built-in sections are remembered on first
  // use, and previously added sections are rebuilt each time.
  function applyLayout(doc, sections, opts) {
    opts = opts || {};
    const win = doc.defaultView || window;
    if (!win.__ecaBuiltins) {
      win.__ecaBuiltins = Array.prototype.slice.call(doc.querySelectorAll("body > section[data-section]"));
    }
    const builtins = win.__ecaBuiltins;
    if (!builtins.length) return [];
    const byKey = {};
    builtins.forEach(function (el) { byKey[el.getAttribute("data-section")] = el; });

    doc.querySelectorAll("body > section.cms-added").forEach(function (el) { el.remove(); });
    builtins.forEach(function (el) { el.removeAttribute("data-layout-hidden"); });

    // The order asked for; any built-in section the layout doesn't mention
    // (e.g. added to the page after the layout was saved) goes right after
    // the section that originally came before it.
    const order = [];
    const placed = {};
    (sections || []).forEach(function (s) {
      if (s && s.key && byKey[s.key] && !placed[s.key]) {
        placed[s.key] = true;
        order.push({ el: byKey[s.key], hidden: !!s.hidden });
      } else if (s && s.added) {
        const sec = doc.createElement("section");
        sec.className = "cms-added" + (s.style === "alt" ? " alt" : s.style === "navy" ? " navy-block" : "");
        sec.setAttribute("data-section", "x-" + String(s.added).replace(/[^a-z0-9]/gi, ""));
        if (s.style) sec.setAttribute("data-style", s.style);
        const box = doc.createElement("div");
        box.className = "container cms-added-body";
        box.innerHTML = clean(s.html);
        sec.appendChild(box);
        order.push({ el: sec, added: true });
      }
    });
    builtins.forEach(function (el, i) {
      const key = el.getAttribute("data-section");
      if (placed[key]) return;
      let at = 0;
      for (let j = i - 1; j >= 0; j--) {
        const prevIdx = order.findIndex(function (o) { return o.el === builtins[j]; });
        if (prevIdx !== -1) { at = prevIdx + 1; break; }
      }
      order.splice(at, 0, { el: el });
      placed[key] = true;
    });

    // Lay them out where the page's sections start.
    const first = builtins[0];
    const parent = first.parentNode;
    if (!parent) return order;
    const marker = doc.createComment("sections");
    parent.insertBefore(marker, first);
    let cursor = marker;
    order.forEach(function (o) {
      parent.insertBefore(o.el, cursor.nextSibling);
      cursor = o.el;
      // Hidden by a stylesheet rule (below), not an inline style, so a
      // page script that shows its own section (e.g. a team schedule once
      // it loads) can't bring a hidden one back.
      if (o.hidden) o.el.setAttribute("data-layout-hidden", "1");
    });
    marker.remove();
    return order;
  }
  window.ecaApplyLayout = applyLayout;

  // admin-editor.html (?edit=1) arranges the page it's editing itself.
  if (/[?&]edit=1(&|$)/.test(window.location.search)) return;
  if (typeof supabaseClient === "undefined") return;

  const hideRule = document.createElement("style");
  hideRule.textContent = "[data-layout-hidden]{display:none !important;}";
  document.head.appendChild(hideRule);

  let cached = null;
  try { cached = JSON.parse(localStorage.getItem(CACHE_KEY) || "null"); } catch (e) {}
  if (cached && Array.isArray(cached)) applyLayout(document, cached);

  function appendLegacyExtras(html) {
    if (!html || !html.trim() || document.getElementById("cms-extra-content")) return;
    const section = document.createElement("section");
    section.id = "cms-extra-content";
    const container = document.createElement("div");
    container.className = "container";
    container.innerHTML = clean(html);
    section.appendChild(container);
    const footer = document.querySelector(".site-footer");
    if (footer && footer.parentNode) footer.parentNode.insertBefore(section, footer);
    else document.body.appendChild(section);
  }

  async function load() {
    try {
      const timeout = new Promise(function (resolve) { setTimeout(function () { resolve(null); }, 6000); });
      const result = await Promise.race([
        Promise.all([
          supabaseClient.from("page_layouts").select("sections").eq("page_path", pagePath).maybeSingle(),
          supabaseClient.from("page_extras").select("body_html").eq("page_path", pagePath).maybeSingle(),
        ]),
        timeout,
      ]);
      if (!result) return;
      const layoutRes = result[0], extrasRes = result[1];
      if (layoutRes.error) return;
      const layout = layoutRes.data && Array.isArray(layoutRes.data.sections) ? layoutRes.data.sections : null;
      if (layout) {
        if (JSON.stringify(layout) !== JSON.stringify(cached)) applyLayout(document, layout);
        try { localStorage.setItem(CACHE_KEY, JSON.stringify(layout)); } catch (e) {}
        return;
      }
      // No layout (any more): undo a stale cached one, then the older extras.
      if (cached) {
        applyLayout(document, []);
        try { localStorage.removeItem(CACHE_KEY); } catch (e) {}
      }
      appendLegacyExtras(extrasRes.data && extrasRes.data.body_html);
    } catch (e) {
      // The page still renders fine without it.
    }
  }

  load();
})();
