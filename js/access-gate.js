// A soft speed-bump in front of signup.html / login.html, not real access
// control -- this is plain client-side JS, so the code is visible to
// anyone who opens dev tools or views source. It exists to stop casual
// visitors from signing up or logging in while the club isn't ready for
// public accounts yet, with a quick way for staff/testers to get past it.
// Unlocking is remembered per browser (localStorage) so it only has to be
// entered once per device, and it applies to both gated pages since they
// share the same storage key.
(function () {
  var PASSWORD = "Waterpol#619";
  var STORAGE_KEY = "eca_access_gate_ok";

  function reveal() {
    var gate = document.getElementById("access-gate");
    var content = document.getElementById("auth-real-content");
    if (gate) gate.hidden = true;
    if (content) content.hidden = false;
  }

  var alreadyUnlocked = false;
  try {
    alreadyUnlocked = localStorage.getItem(STORAGE_KEY) === "1";
  } catch (e) {}

  if (alreadyUnlocked) {
    reveal();
    return;
  }

  var toggleBtn = document.getElementById("gate-toggle-btn");
  var codeBox = document.getElementById("gate-code-box");
  var codeInput = document.getElementById("gate-code-input");
  var unlockBtn = document.getElementById("gate-unlock-btn");
  var gateMsg = document.getElementById("gate-msg");
  if (!toggleBtn) return;

  toggleBtn.addEventListener("click", function () {
    codeBox.hidden = false;
    toggleBtn.hidden = true;
    codeInput.focus();
  });

  function tryUnlock() {
    if (codeInput.value === PASSWORD) {
      try {
        localStorage.setItem(STORAGE_KEY, "1");
      } catch (e) {}
      reveal();
      return;
    }
    gateMsg.className = "form-msg error";
    gateMsg.textContent = "That code isn't right.";
    codeInput.value = "";
    codeInput.focus();
  }

  unlockBtn.addEventListener("click", tryUnlock);
  codeInput.addEventListener("keydown", function (e) {
    if (e.key === "Enter") {
      e.preventDefault();
      tryUnlock();
    }
  });
})();
