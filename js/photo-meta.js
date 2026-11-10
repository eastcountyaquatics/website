// Works out a photo's team and album from where it was dropped and the
// manifest that came with it (Admin > Photo Library). Pure functions, no
// page needed, so they are unit tested.
//
//   PhotoMeta.teamFromPath("10U/ECA_10U_2023-10_..._pack_01/x.jpg")  -> "10u-coed"
//   PhotoMeta.albumFromPack("ECA_10U_2023-10_Pacific_Fall_Classic_pack_01-of-04") -> { album, taken }
//   PhotoMeta.sha256(arrayBuffer) -> Promise of hex
(function (global) {
  // "14U_Girls", "14U Boys", "12U_CoED", "Coaches_from_14U_Boys" ... -> a team slug (or null).
  function teamFromText(text) {
    var t = String(text || "").toLowerCase().replace(/[^a-z0-9]+/g, " ");
    if (/\bcoach/.test(t)) return null; // an album category, not a team
    if (/\bsplash/.test(t)) return "splashball";
    if (/\bmasters\b/.test(t)) return "masters";
    var m = /\b(8|10|12|14|16|18) ?u\b/.exec(t);
    if (!m) return null;
    var n = m[1];
    if (n === "8" || n === "10") return n + "u-coed";
    if (/\bgirls?\b/.test(t)) return n + "u-girls";
    if (/\bboys?\b/.test(t)) return n + "u-boys";
    return null; // e.g. "12U CoED": ECA has no such team page, so an owner tags it
  }
  function teamFromPath(path) {
    var parts = String(path || "").split("/");
    // The outermost folder that names a team wins ("10U/..." even if a pack folder also says 10U).
    for (var i = 0; i < parts.length - 1; i++) { var t = teamFromText(parts[i]); if (t) return t; }
    return null;
  }
  var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  // "ECA_16U_Boys_2026-02-14_SPA_Blk_v_Elite_pack_03-of-04" -> album "SPA Blk v Elite", taken "Feb 14, 2026"
  function albumFromPack(pack) {
    var s = String(pack || "").replace(/_pack_\d+-of-\d+$/i, "");
    var taken = "", rest = s;
    var range = /(\d{4})-(\d{4})(?!\d)/.exec(s);
    var m = !range && /(\d{4})-(0[1-9]|1[0-2])(?:-(\d{2}))?(?!\d)/.exec(s);
    if (range) { taken = range[1] + "\u2013" + range[2]; rest = s.replace(range[0], ""); }
    else if (m) { taken = MONTHS[parseInt(m[2], 10) - 1] + (m[3] ? " " + parseInt(m[3], 10) + "," : "") + " " + m[1]; rest = s.replace(m[0], ""); }
    rest = rest.replace(/^ECA_/i, "").replace(/_/g, " ").replace(/\s+/g, " ").trim();
    rest = rest.replace(/^(?:8U|10U|12U|14U|16U|18U) ?(?:Boys|Girls|CoED)? ?/i, "").trim();
    if (/coaches/i.test(s)) rest = "Coaches";
    if (/\bmixed\b/i.test(rest)) rest = "Mixed";
    rest = rest.replace(/^\d+ ?photos?$/i, "").trim();
    return { album: rest, taken: taken };
  }
  function sha256(buf) {
    return global.crypto.subtle.digest("SHA-256", buf).then(function (d) {
      return Array.prototype.map.call(new Uint8Array(d), function (b) { return ("0" + b.toString(16)).slice(-2); }).join("");
    });
  }
  global.PhotoMeta = { teamFromText: teamFromText, teamFromPath: teamFromPath, albumFromPack: albumFromPack, sha256: sha256 };
})(typeof window !== "undefined" ? window : globalThis);
