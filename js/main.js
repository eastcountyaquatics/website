document.addEventListener("DOMContentLoaded", function () {
  // Header shrinks once the page is scrolled (css: .site-header.scrolled).
  var header = document.querySelector(".site-header");
  if (header) {
    var ticking = false;
    var setScrolled = function () {
      header.classList.toggle("scrolled", window.scrollY > 40);
      ticking = false;
    };
    window.addEventListener("scroll", function () {
      if (!ticking) { ticking = true; window.requestAnimationFrame(setScrolled); }
    }, { passive: true });
    setScrolled();
  }

  var toggle = document.querySelector(".nav-toggle");
  var nav = document.querySelector(".main-nav");
  if (toggle && nav) {
    toggle.addEventListener("click", function () {
      nav.classList.toggle("open");
      var expanded = nav.classList.contains("open");
      toggle.setAttribute("aria-expanded", expanded ? "true" : "false");
    });
    nav.addEventListener("click", function (e) {
      if (e.target.closest("a")) nav.classList.remove("open");
    });

    // Dropdown menus: click/tap a heading to open it (desktop also opens on
    // hover and keyboard focus through CSS). One open at a time; Escape or a
    // click elsewhere closes them.
    function closeMenus(except) {
      nav.querySelectorAll(".has-menu.open").forEach(function (li) {
        if (li !== except) {
          li.classList.remove("open");
          var b = li.querySelector(".nav-parent");
          if (b) b.setAttribute("aria-expanded", "false");
        }
      });
    }
    // Delegated, so menus added after load (the Account menu) work too.
    nav.addEventListener("click", function (e) {
      var btn = e.target.closest(".nav-parent");
      if (!btn || !nav.contains(btn)) return;
      e.stopPropagation();
      var li = btn.parentElement;
      var willOpen = !li.classList.contains("open");
      closeMenus(li);
      li.classList.toggle("open", willOpen);
      btn.setAttribute("aria-expanded", willOpen ? "true" : "false");
    });
    // Keep the centered crest on the page's center line: pad whichever side
    // of the menu is shorter (it changes when someone signs in).
    var crest = nav.querySelector(".nav-logo");
    var list = nav.querySelector(":scope > ul");
    if (crest && list) {
      var balance = function () {
        list.style.paddingLeft = list.style.paddingRight = "";
        if (!crest.offsetParent || window.innerWidth <= 1150) return;
        var items = Array.prototype.slice.call(list.children);
        var idx = items.indexOf(crest);
        var w = function (arr) {
          return arr.reduce(function (s, li) {
            var cs = getComputedStyle(li);
            return s + li.getBoundingClientRect().width + (parseFloat(cs.marginLeft) || 0) + (parseFloat(cs.marginRight) || 0);
          }, 0);
        };
        var diff = w(items.slice(idx + 1)) - w(items.slice(0, idx));
        if (diff > 0) list.style.paddingLeft = diff + "px"; else list.style.paddingRight = -diff + "px";
      };
      window.ecaNavBalance = balance;
      balance();
      window.addEventListener("resize", balance);
      window.addEventListener("load", balance);
      if (document.fonts && document.fonts.ready) document.fonts.ready.then(balance);
      var slot = document.getElementById("nav-auth-slot");
      if (slot && "MutationObserver" in window) new MutationObserver(balance).observe(slot, { childList: true });
    }

    document.addEventListener("click", function () { closeMenus(null); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeMenus(null); });
  }

  // Links like dashboard.html#free-trial: most pages fill in their content
  // after loading (athletes, programs, coaches...), which pushes the target
  // further down after the browser has already jumped to it. Keep the
  // target lined up while the page settles, until the visitor scrolls.
  if (window.location.hash.length > 1) {
    var target = document.getElementById(decodeURIComponent(window.location.hash.slice(1)));
    if (target) {
      var userMoved = false;
      ["wheel", "touchmove", "keydown", "mousedown"].forEach(function (evt) {
        window.addEventListener(evt, function () { userMoved = true; }, { once: true, passive: true });
      });
      [0, 300, 800, 1500, 2500, 4000].forEach(function (ms) {
        setTimeout(function () {
          if (!userMoved) target.scrollIntoView({ block: "start" });
        }, ms);
      });
    }
  }

  // Phone fields (every <input type="tel">, including ones added later)
  // format as (xxx)xxx-xxxx while typing. Deleting is left alone so
  // backspace works naturally; the full format is applied again on blur.
  document.addEventListener("input", function (e) {
    var el = e.target;
    if (!el || el.tagName !== "INPUT" || el.type !== "tel") return;
    if (e.inputType && e.inputType.indexOf("delete") === 0) return;
    el.value = formatPhoneNumber(el.value);
  });
  document.addEventListener("blur", function (e) {
    var el = e.target;
    if (el && el.tagName === "INPUT" && el.type === "tel" && el.value) el.value = formatPhoneNumber(el.value);
  }, true);

  var yearEl = document.getElementById("year");
  if (yearEl) {
    yearEl.textContent = new Date().getFullYear();
  }
});

// "6195551234", "619-555-1234", "+1 (619) 555 1234" -> "(619)555-1234".
// Partial numbers format as far as they go; anything that isn't a US
// number (more than 11 digits, or 11 not starting with 1) is left as typed.
function formatPhoneNumber(value) {
  var digits = String(value || "").replace(/\D/g, "");
  if (digits.length === 11 && digits.charAt(0) === "1") digits = digits.slice(1);
  if (digits.length > 10) return value;
  if (!digits.length) return "";
  if (digits.length <= 3) return "(" + digits;
  if (digits.length <= 6) return "(" + digits.slice(0, 3) + ")" + digits.slice(3);
  return "(" + digits.slice(0, 3) + ")" + digits.slice(3, 6) + "-" + digits.slice(6);
}
