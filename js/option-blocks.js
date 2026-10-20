// Owner-edited dropdown choices (Edit Website > click a dropdown).
// <select data-cms-options="key" data-options-kind="amounts|tiers|text">
// The saved row (content_blocks, page = this page, block_key = key) holds
// one choice per line:
//   amounts: 25            -> <option value="25">$25</option>
//   tiers:   Bronze | 500 | Bronze Sponsor: $500-$1,249
//                          -> <option value="Bronze" data-min="500">label</option>
//   text:    Social Media  -> <option value="Social Media">Social Media</option>
// A first "Select..." placeholder (value "") and a last "other" choice are
// kept as they are. No saved row = the built-in choices stand.
(function () {
  function esc(t) { return String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
  window.ecaOptionsFromLines = function (kind, text) {
    return String(text || "").split("\n").map(function (l) { return l.trim(); }).filter(Boolean).map(function (l) {
      if (kind === "amounts") {
        var n = parseFloat(l.replace(/[$,\s]/g, ""));
        if (!(n > 0)) return "";
        var v = String(Math.round(n * 100) / 100);
        return '<option value="' + esc(v) + '">$' + esc(Number(v).toLocaleString("en-US")) + "</option>";
      }
      if (kind === "tiers") {
        var p = l.split("|").map(function (x) { return x.trim(); });
        var min = parseFloat((p[1] || "").replace(/[$,\s]/g, ""));
        return '<option value="' + esc(p[0]) + '"' + (min > 0 ? ' data-min="' + min + '"' : "") + ">" + esc(p[2] || p[0]) + "</option>";
      }
      return '<option value="' + esc(l) + '">' + esc(l) + "</option>";
    }).join("");
  };
  window.ecaLinesFromSelect = function (sel) {
    var kind = sel.getAttribute("data-options-kind") || "text";
    return Array.prototype.filter.call(sel.options, function (o) { return o.value !== "" && o.value !== "other"; }).map(function (o) {
      if (kind === "amounts") return o.value;
      if (kind === "tiers") return o.value + " | " + (o.getAttribute("data-min") || "") + " | " + o.textContent;
      return o.textContent;
    }).join("\n");
  };
  window.ecaApplyOptions = function (sel, text) {
    var kind = sel.getAttribute("data-options-kind") || "text";
    var html = window.ecaOptionsFromLines(kind, text);
    if (!html) return;
    var first = sel.options[0] && sel.options[0].value === "" ? sel.options[0].outerHTML : "";
    var last = sel.options.length && sel.options[sel.options.length - 1].value === "other" ? sel.options[sel.options.length - 1].outerHTML : "";
    var keep = sel.value;
    sel.innerHTML = first + html + last;
    if (Array.prototype.some.call(sel.options, function (o) { return o.value === keep; })) sel.value = keep;
    sel.dispatchEvent(new Event("change", { bubbles: true }));
  };

  if (/[?&]edit=1(&|$)/.test(window.location.search)) return;
  var sels = document.querySelectorAll("select[data-cms-options]");
  if (!sels.length || typeof supabaseClient === "undefined") return;
  var page = window.location.pathname.split("/").pop() || "index.html";
  var keys = Array.prototype.map.call(sels, function (s) { return s.getAttribute("data-cms-options"); });
  supabaseClient.from("content_blocks").select("block_key, content").eq("page_path", page).in("block_key", keys).then(function (r) {
    (r && r.data || []).forEach(function (row) {
      var sel = document.querySelector('select[data-cms-options="' + row.block_key + '"]');
      if (sel) window.ecaApplyOptions(sel, row.content);
    });
  }, function () {});
})();
