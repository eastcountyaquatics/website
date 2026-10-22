// Admin > Registrations / Tournaments: pick the session's Zeffy form from a
// list of the club's Zeffy forms instead of pasting its link, then see its
// tickets and prices -- with a warning when no ticket matches the site's
// price. Uses the owner-only zeffy-campaigns function.
// Markup: <input id="..." data-zeffy-picker [data-price-input="#amount_dollars"]>
(function () {
  var inputs = document.querySelectorAll("input[data-zeffy-picker]");
  if (!inputs.length || typeof supabaseClient === "undefined") return;
  function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
  function money(c) { return "$" + ((c || 0) / 100).toFixed(2); }
  var listP = null;
  function list() {
    if (!listP) listP = supabaseClient.functions.invoke("zeffy-campaigns", { body: {} }).then(function (r) {
      return (r && r.data && r.data.campaigns) || [];
    }, function () { return []; });
    return listP;
  }
  var detailCache = {};
  function detail(id) {
    if (!detailCache[id]) detailCache[id] = supabaseClient.functions.invoke("zeffy-campaigns", { body: { id: id } }).then(function (r) {
      return (r && r.data && r.data.campaign) || null;
    }, function () { return null; });
    return detailCache[id];
  }
  function sameUrl(a, b) {
    var n = function (u) { return String(u || "").replace(/^https?:\/\/(www\.)?/, "").replace(/\/(en|fr)-[A-Z]{2}\//, "/").replace(/[?#].*$/, "").replace(/\/$/, "").toLowerCase(); };
    return !!a && !!b && n(a) === n(b);
  }

  inputs.forEach(function (input) {
    var sel = document.createElement("select");
    sel.style.marginBottom = "8px";
    sel.innerHTML = '<option value="">Loading your Zeffy forms&hellip;</option>';
    input.parentNode.insertBefore(sel, input);
    var info = document.createElement("div");
    info.className = "muted";
    info.style.cssText = "font-size:12.5px;margin-top:6px;";
    input.parentNode.insertBefore(info, input.nextSibling);
    var priceEl = input.getAttribute("data-price-input") ? document.querySelector(input.getAttribute("data-price-input")) : null;
    var forms = [];

    function showTickets() {
      var f = forms.find(function (c) { return sameUrl(c.url, input.value); });
      sel.value = f ? f.id : "";
      if (!input.value.trim()) { info.innerHTML = ""; return; }
      if (!f) { info.innerHTML = forms.length ? "This link isn&rsquo;t one of your Zeffy forms &mdash; double-check it." : ""; return; }
      info.textContent = "Checking the form’s tickets…";
      detail(f.id).then(function (c) {
        if (!c) { info.textContent = ""; return; }
        var rates = c.rates || [];
        if (!rates.length) { info.innerHTML = "<strong>This form has no tickets.</strong> Add one on Zeffy at the session&rsquo;s price."; return; }
        var want = priceEl && priceEl.value ? Math.round(parseFloat(priceEl.value) * 100) : null;
        var match = want == null ? true : rates.some(function (r) { return !r.is_pay_what_you_can && r.amount === want; });
        info.innerHTML = "Tickets on this form: " + rates.map(function (r) {
          return esc(r.title) + " &mdash; " + (r.is_pay_what_you_can ? "pay what you want" : money(r.amount));
        }).join(" &middot; ") +
          (want != null ? (match
            ? ' <span style="color:#1f6b35;font-weight:700;">&#10003; matches ' + money(want) + "</span>"
            : '<br><span style="color:#a12626;font-weight:700;">No ticket is ' + money(want) + " &mdash; families would pay a different price. Fix the ticket on Zeffy or the Amount here.</span>") : "") +
          "<br>Each ticket needs the required question &ldquo;Payment code (from ECA)&rdquo;.";
      });
    }

    list().then(function (all) {
      forms = all.filter(function (c) { return !c.is_archived && c.url && (!c.type || c.type === "ticketing"); });
      sel.innerHTML = '<option value="">' + (forms.length ? "Pick one of your Zeffy event forms&hellip;" : "No Zeffy event forms found &mdash; paste a link below") + "</option>" +
        forms.map(function (c) { return '<option value="' + esc(c.id) + '">' + esc(c.title || c.url) + "</option>"; }).join("");
      showTickets();
    });
    sel.addEventListener("change", function () {
      var f = forms.find(function (c) { return c.id === sel.value; });
      if (f) { input.value = f.url; input.dispatchEvent(new Event("input", { bubbles: true })); }
      showTickets();
    });
    input.addEventListener("change", showTickets);
    if (priceEl) priceEl.addEventListener("change", showTickets);
    // Editing a different session fills the box from code; re-check then.
    var last = input.value;
    setInterval(function () { if (input.value !== last) { last = input.value; showTickets(); } }, 700);
  });
})();
