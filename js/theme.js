// The club's site look from Admin > Site Look: colors, fonts and logo
// (site_settings key "theme"). Loaded in every page's <head>, so the last
// look this browser saw is in place before the page shows; once the page
// has loaded it checks Supabase for changes. With nothing saved, the
// stylesheet's built-in look is used.
//
//   { colors: { navy, blue, gold, ink, muted, foam }, heading_font, body_font, logo_url }
(function () {
  var CACHE_KEY = "eca-theme";

  // Font choices offered in Site Look -> CSS font stacks. Anything not in
  // this list is ignored, so a saved value can never inject CSS.
  var FONTS = {
    "Bitter": '"Bitter",Georgia,serif',
    "Roboto": '"Roboto","Segoe UI",Helvetica,Arial,sans-serif',
    "Montserrat": '"Montserrat",Helvetica,Arial,sans-serif',
    "Oswald": '"Oswald","Arial Narrow",sans-serif',
    "Poppins": '"Poppins",Helvetica,Arial,sans-serif',
    "Lato": '"Lato",Helvetica,Arial,sans-serif',
    "Open Sans": '"Open Sans",Helvetica,Arial,sans-serif',
    "Inter": '"Inter",Helvetica,Arial,sans-serif',
    "Raleway": '"Raleway",Helvetica,Arial,sans-serif',
    "Nunito": '"Nunito",Helvetica,Arial,sans-serif',
    "Merriweather": '"Merriweather",Georgia,serif',
    "Playfair Display": '"Playfair Display",Georgia,serif',
    "Roboto Slab": '"Roboto Slab",Georgia,serif',
    "Source Sans 3": '"Source Sans 3",Helvetica,Arial,sans-serif',
  };
  var BUILT_IN_FONTS = { "Bitter": true, "Roboto": true }; // already linked by every page
  var COLORS = ["navy", "blue", "gold", "ink", "muted", "foam"];

  function hex(v) { return typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v) ? v : null; }
  function safeUrl(v) { return typeof v === "string" && /^https:\/\/[^\s"'()<>\\]+$/i.test(v) ? v : null; }

  function cssFor(t) {
    var vars = [];
    var c = (t && t.colors) || {};
    COLORS.forEach(function (name) {
      var v = hex(c[name]);
      if (v) vars.push("--" + name + ":" + v);
    });
    if (hex(c.blue)) vars.push("--aqua:" + c.blue);
    if (t && FONTS[t.heading_font]) vars.push("--font-heading:" + FONTS[t.heading_font]);
    if (t && FONTS[t.body_font]) vars.push("--font-body:" + FONTS[t.body_font]);
    return vars.length ? ":root{" + vars.join(";") + "}" : "";
  }

  function fontLink(t) {
    var names = [];
    [t && t.heading_font, t && t.body_font].forEach(function (f) {
      if (f && FONTS[f] && !BUILT_IN_FONTS[f] && names.indexOf(f) === -1) names.push(f);
    });
    if (!names.length) return null;
    return "https://fonts.googleapis.com/css2?" + names.map(function (n) {
      return "family=" + encodeURIComponent(n).replace(/%20/g, "+") + ":wght@400;500;600;700;800";
    }).join("&") + "&display=swap";
  }

  function swapLogos(doc, url) {
    var imgs = doc.querySelectorAll("img.logo-mark, img.footer-logo, img.nav-logo");
    Array.prototype.forEach.call(imgs, function (img) {
      if (!img.hasAttribute("data-orig-src")) {
        img.setAttribute("data-orig-src", img.getAttribute("src") || "");
        if (img.hasAttribute("srcset")) img.setAttribute("data-orig-srcset", img.getAttribute("srcset"));
      }
      if (url) {
        img.removeAttribute("srcset");
        if (img.getAttribute("src") !== url) img.setAttribute("src", url);
        img.style.objectFit = "contain";
      } else {
        img.setAttribute("src", img.getAttribute("data-orig-src"));
        if (img.hasAttribute("data-orig-srcset")) img.setAttribute("srcset", img.getAttribute("data-orig-srcset"));
      }
    });
  }

  // Also used by admin-site-look.html for its live preview.
  function applyTheme(t, doc) {
    doc = doc || document;
    var head = doc.head || doc.getElementsByTagName("head")[0];
    if (!head) return;
    var style = doc.getElementById("eca-theme-style");
    if (!style) {
      style = doc.createElement("style");
      style.id = "eca-theme-style";
      head.appendChild(style);
    }
    style.textContent = cssFor(t);

    var href = fontLink(t);
    var link = doc.getElementById("eca-theme-fonts");
    if (href) {
      if (!link) {
        link = doc.createElement("link");
        link.id = "eca-theme-fonts";
        link.rel = "stylesheet";
        head.appendChild(link);
      }
      if (link.getAttribute("href") !== href) link.setAttribute("href", href);
    } else if (link) {
      link.remove();
    }

    var logo = safeUrl(t && t.logo_url);
    if (doc.readyState === "loading") {
      doc.addEventListener("DOMContentLoaded", function () { swapLogos(doc, logo); });
    } else {
      swapLogos(doc, logo);
    }
  }
  window.ecaApplyTheme = applyTheme;
  window.ecaThemeFonts = Object.keys(FONTS);

  var cached = null;
  try { cached = JSON.parse(localStorage.getItem(CACHE_KEY) || "null"); } catch (e) {}
  if (cached) applyTheme(cached);

  // Site Look's preview frame sets its own look; don't fight it.
  if (/[?&]theme-preview=1(&|$)/.test(window.location.search)) return;

  window.addEventListener("DOMContentLoaded", function () {
    if (typeof supabaseClient === "undefined") return;
    supabaseClient.from("site_settings").select("value").eq("key", "theme").maybeSingle().then(function (res) {
      if (!res || res.error) return;
      var t = res.data && res.data.value ? res.data.value : null;
      if (JSON.stringify(t) === JSON.stringify(cached)) return;
      applyTheme(t || {});
      try {
        if (t) localStorage.setItem(CACHE_KEY, JSON.stringify(t));
        else localStorage.removeItem(CACHE_KEY);
      } catch (e) {}
    });
  });
})();
