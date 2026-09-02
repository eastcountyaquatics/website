// Strict allowlist sanitizer for admin-authored page content.
//
// Page HTML is written by owners and rendered to the public, so it must not
// be trusted blindly: a compromised admin account could otherwise inject a
// script that reads any signed-in visitor's Supabase session out of
// localStorage. Anything not on the allowlist below is dropped.
(function (global) {
  const ALLOWED_TAGS = {
    P: [], BR: [], STRONG: [], B: [], EM: [], I: [], U: [],
    H2: [], H3: [], H4: [],
    UL: [], OL: [], LI: [],
    BLOCKQUOTE: [], HR: [],
    A: ["href", "title"],
    IMG: ["src", "alt"],
    TABLE: [], THEAD: [], TBODY: [], TR: [], TH: [], TD: [],
  };

  // Dropped outright, contents and all -- unwrapping these would leave
  // raw code sitting on the page as visible text.
  const DROP_ENTIRELY = {
    SCRIPT: true, STYLE: true, NOSCRIPT: true, TEMPLATE: true,
    IFRAME: true, OBJECT: true, EMBED: true, FORM: true, SVG: true, MATH: true,
  };

  function safeUrl(value, allowRelative) {
    const url = String(value || "").trim();
    if (!url) return null;
    if (/^https?:\/\//i.test(url) || /^mailto:/i.test(url) || /^tel:/i.test(url)) return url;
    // Relative links/images within the site are fine; everything else
    // (javascript:, data:, vbscript:, ...) is not.
    if (allowRelative && /^[a-z0-9._~\-/]/i.test(url) && url.indexOf(":") === -1) return url;
    return null;
  }

  function clean(node) {
    const children = Array.prototype.slice.call(node.childNodes);
    children.forEach(function (child) {
      if (child.nodeType === 3) return; // text is fine
      if (child.nodeType !== 1) {
        node.removeChild(child); // comments, etc.
        return;
      }

      if (DROP_ENTIRELY[child.tagName]) {
        node.removeChild(child);
        return;
      }

      const allowedAttrs = ALLOWED_TAGS[child.tagName];
      if (!allowedAttrs) {
        // Unknown tag: keep its text content, drop the tag itself.
        while (child.firstChild) node.insertBefore(child.firstChild, child);
        node.removeChild(child);
        return;
      }

      Array.prototype.slice.call(child.attributes).forEach(function (attr) {
        const name = attr.name.toLowerCase();
        if (allowedAttrs.indexOf(name) === -1) {
          child.removeAttribute(attr.name);
          return;
        }
        if (name === "href") {
          const href = safeUrl(attr.value, true);
          if (href === null) child.removeAttribute("href");
          else child.setAttribute("href", href);
        }
        if (name === "src") {
          const src = safeUrl(attr.value, true);
          if (src === null) child.removeAttribute("src");
          else child.setAttribute("src", src);
        }
      });

      if (child.tagName === "A" && child.getAttribute("href")) {
        child.setAttribute("rel", "noopener");
      }

      clean(child);
    });
  }

  global.sanitizeHtml = function (html) {
    // Parsed in an inert document so <img onerror> and friends never run.
    const doc = document.implementation.createHTMLDocument("sanitize");
    doc.body.innerHTML = String(html || "");
    clean(doc.body);
    return doc.body.innerHTML;
  };
})(window);
