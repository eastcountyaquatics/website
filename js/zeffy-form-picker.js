// Admin > Registrations / Tournaments: pick the session's Zeffy form from a
// list of the club's Zeffy forms instead of pasting its link, then see its
// tickets and prices -- with a warning when no ticket matches the site's
// price. Uses the owner-only zeffy-campaigns function.
// Markup: <input id="..." data-zeffy-picker [data-price-input="#amount_dollars"]
//          [data-fill-name="#label"] [data-fill-cost="#t-cost-note"]
//          [data-fill-desc="#description"] [data-fill-start="#t-event-date"] [data-fill-end="#t-end-date"]>
// Picking a form fills the link, plus name, price, description and dates --
// only boxes that are still empty, so anything typed stays and all of it
// can be changed after.
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
    // Boxes to fill from the picked form, only when they're still empty.
    var nameEl = input.getAttribute("data-fill-name") ? document.querySelector(input.getAttribute("data-fill-name")) : null;
    var costEl = input.getAttribute("data-fill-cost") ? document.querySelector(input.getAttribute("data-fill-cost")) : null;
    var q = function (a) { return input.getAttribute(a) ? document.querySelector(input.getAttribute(a)) : null; };
    var descEl = q("data-fill-desc"), startEl = q("data-fill-start"), endEl = q("data-fill-end");
    // Unix seconds -> "YYYY-MM-DD" in local time, for <input type="date">.
    function day(ts) {
      if (!ts) return null;
      var d = new Date(ts * 1000);
      return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
    }
    function fillEmpty(el, v) {
      if (!el || el.value.trim() || v == null || v === "") return;
      el.value = v;
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    }
    sel.addEventListener("change", function () {
      var f = forms.find(function (c) { return c.id === sel.value; });
      if (f) {
        input.value = f.url; input.dispatchEvent(new Event("input", { bubbles: true }));
        fillEmpty(nameEl, f.title);
        detail(f.id).then(function (c) {
          if (c) {
            fillEmpty(descEl, c.description);
            // Event dates: the first and last day across its dates on Zeffy.
            var occ = (c.occurrences || []).filter(function (o) { return o.start; });
            var first = occ.length ? Math.min.apply(null, occ.map(function (o) { return o.start; })) : c.start_date;
            var last = occ.length ? Math.max.apply(null, occ.map(function (o) { return o.end || o.start; })) : c.end_date;
            var d1 = day(first), d2 = day(last);
            if (startEl && !startEl.value) fillEmpty(startEl, d1);
            if (endEl && !endEl.value && d2 && d1 && d2 > d1) {
              var rangeBtn = document.querySelector('[data-datemode="range"]');
              if (rangeBtn) rangeBtn.click();
              fillEmpty(endEl, d2);
            }
          }
          var fixed = ((c && c.rates) || []).filter(function (r) { return !r.is_pay_what_you_can && typeof r.amount === "number"; }).map(function (r) { return r.amount; });
          if (!fixed.length) return;
          var lo = Math.min.apply(null, fixed), hi = Math.max.apply(null, fixed);
          // One price: the session Amount. Tournaments' cost line shows the range.
          if (priceEl && lo === hi) fillEmpty(priceEl, (lo / 100).toFixed(2));
          if (costEl) fillEmpty(costEl, lo === hi ? money(lo) : money(lo) + " \u2013 " + money(hi));
          showTickets();
        });
      }
      showTickets();
    });
    input.addEventListener("change", showTickets);
    if (priceEl) priceEl.addEventListener("change", showTickets);
    // Editing a different session fills the box from code; re-check then.
    var last = input.value;
    setInterval(function () { if (input.value !== last) { last = input.value; showTickets(); } }, 700);
  });
})();
