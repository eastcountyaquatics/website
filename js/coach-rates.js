// Effective-dated coach pay rates (coach_rate_history). A rate change asks
// the Manager which date it starts -- today, or backfilled to an earlier
// date -- and pay is then figured per session at the rate in effect on
// that session's date. coach_pay_rates keeps the current rate for display.

// { coach_id: [{ from: "YYYY-MM-DD", cents }] } sorted oldest first.
async function loadCoachRateHistory() {
  const { data } = await supabaseClient
    .from("coach_rate_history")
    .select("coach_id, effective_from, hourly_rate_cents")
    .order("effective_from", { ascending: true });
  const byCoach = {};
  (data || []).forEach(function (r) {
    (byCoach[r.coach_id] = byCoach[r.coach_id] || []).push({ from: r.effective_from, cents: r.hourly_rate_cents });
  });
  return byCoach;
}

// Rate for one session. Falls back to the coach's current rate when they
// have no history (or the session predates all of it).
function rateInEffect(history, coachId, sessionDate, fallbackCents) {
  const entries = history[coachId] || [];
  let cents = null;
  for (let i = 0; i < entries.length; i++) {
    if (entries[i].from <= sessionDate) cents = entries[i].cents;
  }
  if (cents != null) return cents;
  return fallbackCents != null ? fallbackCents : 0;
}

function todayIso() {
  return new Date().toLocaleDateString("en-CA");
}

function rateMoney(cents) {
  return "$" + (cents / 100).toFixed(2);
}

// Popup: "Change X's rate from $A to $B -- starting when?" Resolves to a
// YYYY-MM-DD date, or null if cancelled.
function askRateEffectiveDate(coachName, oldCents, newCents) {
  return new Promise(function (resolve) {
    const overlay = document.createElement("div");
    overlay.className = "rate-modal-overlay";
    overlay.innerHTML =
      '<div class="rate-modal" role="dialog" aria-modal="true" aria-labelledby="rate-modal-title">' +
      '<h3 id="rate-modal-title">When does the new rate start?</h3>' +
      '<p class="rate-modal-change"></p>' +
      '<label class="rate-modal-option"><input type="radio" name="rate-start" value="today" checked> Starting today</label>' +
      '<label class="rate-modal-option"><input type="radio" name="rate-start" value="date"> Backfill &mdash; starting from:</label>' +
      '<input type="date" class="rate-modal-date" disabled>' +
      '<p class="muted rate-modal-hint">Hours logged on or after this date are paid at the new rate. Earlier hours keep the old rate.</p>' +
      '<div class="rate-modal-actions">' +
      '<button type="button" class="btn btn-primary" data-rate-ok>Save Rate</button>' +
      '<button type="button" class="btn btn-outline-dark" data-rate-cancel>Cancel</button>' +
      "</div></div>";
    overlay.querySelector(".rate-modal-change").textContent =
      (coachName || "This coach") + ": " + rateMoney(oldCents) + "/hr → " + rateMoney(newCents) + "/hr";
    const dateInput = overlay.querySelector(".rate-modal-date");
    dateInput.value = todayIso();
    dateInput.max = todayIso();
    overlay.querySelectorAll('input[name="rate-start"]').forEach(function (radio) {
      radio.addEventListener("change", function () {
        dateInput.disabled = overlay.querySelector('input[name="rate-start"]:checked').value !== "date";
        if (!dateInput.disabled) dateInput.focus();
      });
    });
    function close(result) {
      overlay.remove();
      resolve(result);
    }
    overlay.querySelector("[data-rate-cancel]").addEventListener("click", function () { close(null); });
    overlay.querySelector("[data-rate-ok]").addEventListener("click", function () {
      const useDate = overlay.querySelector('input[name="rate-start"]:checked').value === "date";
      if (useDate && !dateInput.value) {
        dateInput.focus();
        return;
      }
      close(useDate ? dateInput.value : todayIso());
    });
    document.body.appendChild(overlay);
  });
}

// Saves a rate for a coach with a login. If the rate actually changed,
// asks for the start date first; returns { ok, cancelled, error }.
async function saveCoachRate(profileId, coachName, newCents) {
  const { data: current } = await supabaseClient
    .from("coach_pay_rates").select("hourly_rate_cents").eq("coach_id", profileId).maybeSingle();
  const oldCents = current ? current.hourly_rate_cents : null;
  if (oldCents === newCents) return { ok: true };

  const { data: existingHistory } = await supabaseClient
    .from("coach_rate_history").select("id").eq("coach_id", profileId).limit(1);

  let effectiveFrom = "2000-01-01"; // a first-ever rate applies to all hours
  if (oldCents != null) {
    effectiveFrom = await askRateEffectiveDate(coachName, oldCents, newCents);
    if (!effectiveFrom) return { ok: false, cancelled: true };
    // Coaches whose rate predates rate history: pin the old rate as the
    // starting point so hours before the change keep it.
    if (!existingHistory || !existingHistory.length) {
      const base = await supabaseClient.from("coach_rate_history").upsert(
        { coach_id: profileId, effective_from: "2000-01-01", hourly_rate_cents: oldCents },
        { onConflict: "coach_id,effective_from" }
      );
      if (base.error) return { ok: false, error: base.error };
    }
  }

  const hist = await supabaseClient.from("coach_rate_history").upsert(
    { coach_id: profileId, effective_from: effectiveFrom, hourly_rate_cents: newCents },
    { onConflict: "coach_id,effective_from" }
  );
  if (hist.error) return { ok: false, error: hist.error };

  const cur = await supabaseClient.from("coach_pay_rates").upsert(
    { coach_id: profileId, hourly_rate_cents: newCents },
    { onConflict: "coach_id" }
  );
  if (cur.error) return { ok: false, error: cur.error };
  return { ok: true, effectiveFrom: effectiveFrom };
}

async function clearCoachRate(profileId) {
  await supabaseClient.from("coach_pay_rates").delete().eq("coach_id", profileId);
  await supabaseClient.from("coach_rate_history").delete().eq("coach_id", profileId);
}
