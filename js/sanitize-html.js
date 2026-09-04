// Strict allowlist sanitizer for admin-authored page content.
//
// Page HTML is written by owners and rendered to the public, so it must not
// be trusted blindly: a compromised admin account could otherwise inject a
// script that reads any signed-in visitor's Supabase session out of
// localStorage. Anything not on the allowlist below is dropped.
//
// The security property this must hold: no script execution, ever. CSS
// cannot execute script in modern browsers, so class/style are allowed
// (the site's own editable blocks are full of them) while every scripting
// vector -- tags, event handlers, javascript: URLs -- is stripped.
(function (global) {
  // Allowed on any allowed tag. Purely presentational; neither can run code.
  const GLOBAL_ATTRS = ["class", "style"];

  const ALLOWED_TAGS = {
    P: [], BR: [], STRONG: [], B: [], EM: [], I: [], U: [],
    H2: [], H3: [], H4: [],
    UL: [], OL: [], LI: [],
    BLOCKQUOTE: [], HR: [],
    // SPAN/DIV carry the site's own structure inside editable blocks --
    // e.g. <span class="info-icon">🍂</span><div class="muted">…</div>.
    // Dropping them silently destroyed the layout of ~95 list items across
    // the site the moment anyone edited one.
    SPAN: [], DIV: [],
    A: ["href", "title", "target", "rel"],
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

  // Inline CSS is kept for colors/weights/sizes the site's own content
  // uses, minus anything that can fetch or (on legacy engines) execute.
  function safeStyle(value) {
    const style = String(value || "").trim();
    if (!style) return null;
    if (/url\s*\(|expression\s*\(|javascript:|vbscript:|behaviou?r\s*:|@import|<|\\/i.test(style)) return null;
    return style;
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

      const tagAttrs = ALLOWED_TAGS[child.tagName];
      if (!tagAttrs) {
        // Unknown tag: keep its contents, drop the tag itself.
        //
        // Clean the subtree FIRST. The loop above iterates a snapshot taken
        // before this promotion, so anything moved up here is never revisited
        // -- without this, <foo><img src=x onerror=…></foo> (or any payload
        // wrapped in a tag that isn't on the allowlist) sailed straight
        // through with its event handler intact.
        clean(child);
        while (child.firstChild) node.insertBefore(child.firstChild, child);
        node.removeChild(child);
        return;
      }

      const allowedAttrs = tagAttrs.concat(GLOBAL_ATTRS);
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
        if (name === "style") {
          const style = safeStyle(attr.value);
          if (style === null) child.removeAttribute("style");
          else child.setAttribute("style", style);
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
