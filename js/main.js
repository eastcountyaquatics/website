document.addEventListener("DOMContentLoaded", function () {
  var toggle = document.querySelector(".nav-toggle");
  var nav = document.querySelector(".main-nav");
  if (toggle && nav) {
    toggle.addEventListener("click", function () {
      nav.classList.toggle("open");
      var expanded = nav.classList.contains("open");
      toggle.setAttribute("aria-expanded", expanded ? "true" : "false");
    });
    nav.querySelectorAll("a").forEach(function (link) {
      link.addEventListener("click", function () {
        nav.classList.remove("open");
      });
    });
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
