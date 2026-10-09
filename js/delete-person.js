// One "Delete" for a person, used by Admin > Coaches and Team Access. A
// step-through box:
//   1. What will happen (looked up first: their login, athletes, hours,
//      pay, Masters membership, Coaches page profile)
//   2. Type DELETE to confirm
//   3. Done -- their records are saved in Team Access > Deleted Accounts
//
// Deleting completely removes their Coaches page profile AND their login,
// so they can sign up again later as a brand-new person. Everything they
// had is saved to the deleted_accounts log first (by the delete-user
// function for people with a login; here in the browser for a coach
// profile that never had one).
//
//   openDeletePerson({ name, email, userId, coachRecord, onArchive })
//     -> Promise<boolean>  (true if deleted)
// userId: their login (profiles.id), or null.
// coachRecord: their row from the coaches table, or null.
// onArchive: optional -- shows "Archive instead" (Coaches page).
(function (global) {
  var css =
    ".dp-overlay{position:fixed;inset:0;background:rgba(10,20,60,.55);z-index:1000;display:flex;align-items:center;justify-content:center;padding:16px;}" +
    ".dp-box{background:#fff;border-radius:14px;box-shadow:0 20px 50px rgba(0,0,0,.3);width:100%;max-width:460px;padding:24px;}" +
    ".dp-steps{display:flex;gap:6px;margin-bottom:14px;}" +
    ".dp-steps span{flex:1;height:4px;border-radius:2px;background:#e3e6f0;}" +
    ".dp-steps span.on{background:#c0392b;}" +
    ".dp-box h3{margin:0 0 6px;font-size:20px;}" +
    ".dp-box .dp-sub{margin:0 0 14px;color:#5b6075;font-size:14px;}" +
    ".dp-list{margin:0 0 16px;padding:0;list-style:none;font-size:14.5px;}" +
    ".dp-list li{display:flex;gap:10px;padding:7px 0;border-bottom:1px solid #f0f2f7;}" +
    ".dp-list li:last-child{border-bottom:0;}" +
    ".dp-ico{flex:0 0 22px;text-align:center;}" +
    ".dp-actions{display:flex;gap:10px;justify-content:flex-end;flex-wrap:wrap;margin-top:6px;}" +
    ".dp-danger{background:#c0392b !important;border-color:#c0392b !important;color:#fff !important;}" +
    ".dp-danger:disabled{opacity:.45;cursor:not-allowed;}" +
    ".dp-box input.dp-type{width:100%;padding:11px 12px;border:2px solid #e3c0bb;border-radius:8px;font-size:16px;letter-spacing:.08em;margin:4px 0 14px;}" +
    ".dp-err{background:#fdecec;color:#a12626;border:1px solid #f5c2c2;border-radius:8px;padding:10px 12px;font-size:14px;margin-bottom:12px;}" +
    ".dp-done{text-align:center;padding:6px 0;}" +
    ".dp-actions.dp-center{justify-content:center;}" +
    ".dp-actions.dp-center .btn{min-width:140px;}" +
    ".dp-done .dp-check{width:54px;height:54px;border-radius:50%;background:#1c7a3a;color:#fff;font-size:28px;display:flex;align-items:center;justify-content:center;margin:0 auto 12px;}";

  function injectCss() {
    if (document.getElementById("delete-person-css")) return;
    var st = document.createElement("style");
    st.id = "delete-person-css";
    st.textContent = css;
    document.head.appendChild(st);
  }

  function esc(v) {
    return String(v == null ? "" : v).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function plural(n, one, many) { return n + " " + (n === 1 ? one : many); }

  function openDeletePerson(opts) {
    injectCss();
    var name = opts.name || opts.email || "this person";
    return new Promise(function (resolve) {
      var overlay = document.createElement("div");
      overlay.className = "dp-overlay";
      overlay.innerHTML = '<div class="dp-box" role="dialog" aria-modal="true"></div>';
      document.body.appendChild(overlay);
      var box = overlay.querySelector(".dp-box");
      var deleted = false;

      function close() {
        document.removeEventListener("keydown", onKey);
        overlay.remove();
        resolve(deleted);
      }
      function onKey(e) { if (e.key === "Escape" && !box.dataset.busy) close(); }
      document.addEventListener("keydown", onKey);

      function steps(n) {
        return '<div class="dp-steps"><span class="on"></span><span class="' + (n >= 2 ? "on" : "") + '"></span><span class="' + (n >= 3 ? "on" : "") + '"></span></div>';
      }

      // ---- Step 1: what will happen ----
      box.innerHTML = steps(1) + "<h3>Delete " + esc(name) + "?</h3><p class=\"dp-sub\">Checking what&rsquo;s attached&hellip;</p>";
      var lookup = opts.userId
        ? supabaseClient.functions.invoke("delete-user", { body: { action: "preview", user_id: opts.userId } })
        : Promise.resolve({ data: { ok: true, linked: {} } });

      lookup.then(async function (res) {
        var data = res && res.data;
        if (res.error || !data || !data.ok) {
          var why = await functionErrorMessage(res.error, data, "Could not look up this account.");
          box.innerHTML = steps(1) + "<h3>Delete " + esc(name) + "?</h3><div class=\"dp-err\">" + esc(why) + "</div>" +
            '<div class="dp-actions"><button type="button" class="btn btn-outline-dark" data-dp-close>Close</button></div>';
          box.querySelector("[data-dp-close]").onclick = close;
          return;
        }
        var l = data.linked || {};
        var items = [];
        if (opts.coachRecord || l.coach_profiles) items.push(["&#128100;", "Removed from the Coaches page (and every team page)."]);
        if (opts.userId) items.push(["&#128274;", "Their login <strong>" + esc(opts.email || "") + "</strong> is deleted. They can sign up again later as a new person."]);
        if (l.live_masters) items.push(["&#128179;", "Their Masters membership is canceled in Stripe &mdash; no more charges."]);
        if (l.athletes) items.push(["&#127946;", plural(l.athletes, "athlete is", "athletes are") + " removed from Registered Athletes."]);
        var saved = [];
        if (l.coach_hours) saved.push(plural(l.coach_hours, "hour entry", "hour entries"));
        if (l.coach_payments) saved.push(plural(l.coach_payments, "coach payment", "coach payments"));
        if (l.athletes) saved.push(plural(l.athletes, "athlete", "athletes"));
        if (l.masters_subscriptions) saved.push("Masters membership");
        items.push(["&#128190;", "Saved to <strong>Team Access &rarr; Deleted Accounts</strong>" +
          (saved.length ? ": " + esc(saved.join(", ")) : "") + " &mdash; under their name and email, with a download."]);
        if (l.purchases) items.push(["&#129534;", "Their payments stay in Sign-Ups and the QuickBooks export."]);

        box.innerHTML = steps(1) +
          "<h3>Delete " + esc(name) + "?</h3>" +
          '<p class="dp-sub">Here&rsquo;s what will happen:</p>' +
          '<ul class="dp-list">' + items.map(function (i) { return '<li><span class="dp-ico">' + i[0] + "</span><span>" + i[1] + "</span></li>"; }).join("") + "</ul>" +
          '<div class="dp-actions">' +
          '<button type="button" class="btn btn-outline-dark" data-dp-close>Cancel</button>' +
          (opts.onArchive ? '<button type="button" class="btn btn-outline-dark" data-dp-archive>Archive instead</button>' : "") +
          '<button type="button" class="btn btn-primary dp-danger" data-dp-next>Continue</button>' +
          "</div>";
        box.querySelector("[data-dp-close]").onclick = close;
        if (opts.onArchive) box.querySelector("[data-dp-archive]").onclick = function () { close(); opts.onArchive(); };
        box.querySelector("[data-dp-next]").onclick = confirmStep;
        box.querySelector("[data-dp-next]").focus();
      });

      // ---- Step 2: type DELETE ----
      function confirmStep(errorText) {
        box.innerHTML = steps(2) +
          "<h3>Confirm delete</h3>" +
          '<p class="dp-sub">This can&rsquo;t be undone. Type <strong>DELETE</strong> to permanently delete ' + esc(name) + ".</p>" +
          (typeof errorText === "string" ? '<div class="dp-err">' + esc(errorText) + "</div>" : "") +
          '<input type="text" class="dp-type" autocomplete="off" autocapitalize="characters" placeholder="DELETE" aria-label="Type DELETE to confirm">' +
          '<div class="dp-actions">' +
          '<button type="button" class="btn btn-outline-dark" data-dp-close>Cancel</button>' +
          '<button type="button" class="btn btn-primary dp-danger" data-dp-go disabled>Delete ' + esc(name) + "</button>" +
          "</div>";
        var input = box.querySelector(".dp-type");
        var go = box.querySelector("[data-dp-go]");
        input.oninput = function () { go.disabled = input.value.trim().toUpperCase() !== "DELETE"; };
        input.onkeydown = function (e) { if (e.key === "Enter" && !go.disabled) go.click(); };
        box.querySelector("[data-dp-close]").onclick = close;
        go.onclick = run;
        input.focus();
      }

      // ---- Step 3: do it ----
      async function run() {
        box.dataset.busy = "1";
        box.innerHTML = steps(3) + "<h3>Deleting " + esc(name) + "&hellip;</h3><p class=\"dp-sub\">Saving their records, then removing everything.</p>";
        var problem = null;
        try {
          if (opts.userId) {
            // Login + everything on it, Coaches page profile included.
            var res = await supabaseClient.functions.invoke("delete-user", {
              body: { action: "delete", user_id: opts.userId, force: true },
            });
            if (res.error || !res.data || !res.data.ok) problem = await functionErrorMessage(res.error, res.data, "Could not delete this account.");
          }
          if (!problem && opts.coachRecord && !opts.userId) {
            // Coach profile with no login: save it to the log, then remove it.
            var rec = opts.coachRecord;
            var rate = await supabaseClient.from("coach_record_rates").select("*").eq("coach_record_id", rec.id);
            var log = await supabaseClient.from("deleted_accounts").insert({
              user_id: null,
              email: rec.invite_email || rec.contact_email || null,
              full_name: rec.full_name,
              role: rec.role_title || "coach",
              forced: false,
              records: { coach_profiles: [rec], coach_record_rates: rate.data || [] },
            });
            if (log.error) problem = "Could not save their records, so nothing was deleted: " + log.error.message;
            else {
              var del = await supabaseClient.from("coaches").delete().eq("id", rec.id);
              if (del.error) problem = "Could not delete: " + del.error.message;
            }
          }
        } catch (err) {
          problem = err && err.message ? err.message : String(err);
        }
        delete box.dataset.busy;
        if (problem) { confirmStep(problem); return; }

        deleted = true;
        box.innerHTML = steps(3) +
          '<div class="dp-done"><div class="dp-check">&#10003;</div>' +
          "<h3>" + esc(name) + " was deleted</h3>" +
          '<p class="dp-sub">Their records are saved in <strong>Team Access &rarr; Deleted Accounts</strong>.' +
          (opts.userId ? " They can sign up again any time with " + esc(opts.email || "the same email") + "." : "") + "</p></div>" +
          '<div class="dp-actions dp-center"><button type="button" class="btn btn-primary" data-dp-close>Done</button></div>';
        box.querySelector("[data-dp-close]").onclick = close;
        box.querySelector("[data-dp-close]").focus();
      }
    });
  }

  global.openDeletePerson = openDeletePerson;
})(window);
