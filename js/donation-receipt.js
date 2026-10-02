// Printable donation/sponsorship receipt shown right after Stripe Checkout
// sends the donor back (sponsor.html and donate.html). Stripe appends the
// Checkout Session id to the success URL; get-donation-receipt checks it
// with Stripe and returns what was actually charged, so this page never
// trusts its own query string for the amount.
//
// Usage: showDonationReceipt(elementToReplace) -- returns true when it took
// over (a session_id was present), false to let the page fall back to its
// plain thank-you message.
function showDonationReceipt(target) {
  const sessionId = new URLSearchParams(window.location.search).get("session_id");
  if (!sessionId || !target) return false;

  const wrap = document.createElement("div");
  wrap.id = "donation-receipt";
  wrap.innerHTML =
    '<div class="notice receipt-thanks no-print">' +
    "<strong>Thank you for your support!</strong> Loading your receipt&hellip;</div>";
  target.replaceWith(wrap);

  loadReceipt(sessionId, wrap, 0);
  return true;
}

async function loadReceipt(sessionId, wrap, attempt) {
  const { data, error } = await supabaseClient.functions.invoke("get-donation-receipt", {
    body: { session_id: sessionId },
  });

  if (error || !data || data.error) {
    // Stripe can take a moment to mark a card payment "paid" after the
    // redirect -- retry a few times before giving up.
    if (attempt < 4) {
      setTimeout(function () { loadReceipt(sessionId, wrap, attempt + 1); }, 2000);
      return;
    }
    const message = await functionErrorMessage(error, data, "We couldn't load your receipt.");
    wrap.innerHTML = "";
    const notice = document.createElement("div");
    notice.className = "notice receipt-thanks";
    notice.innerHTML = "<strong>Thank you for your support!</strong> Your payment went through. ";
    notice.appendChild(document.createTextNode(
      message + " Email eastcountyaquatics@gmail.com and we'll send you a copy for your tax records."
    ));
    wrap.appendChild(notice);
    return;
  }

  renderReceipt(wrap, data);
}

function renderReceipt(wrap, r) {
  const money = (r.amount_cents / 100).toLocaleString("en-US", { style: "currency", currency: r.currency || "USD" });
  const date = new Date(r.paid_at).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  const kind = r.is_donation ? "Donation" : "Sponsorship" + (r.tier ? " (" + r.tier + ")" : "");

  wrap.innerHTML =
    '<div class="notice receipt-thanks no-print">' +
    "<strong>Thank you for your support!</strong> Your receipt is below &mdash; print it or save it as a PDF for your tax records.</div>" +
    '<div class="receipt-card">' +
    '  <div class="receipt-head">' +
    '    <img src="images/eca-logo.png" alt="" class="receipt-logo">' +
    '    <div><h2 class="receipt-title"></h2><div class="receipt-sub"></div></div>' +
    "  </div>" +
    '  <h3 class="receipt-heading"></h3>' +
    '  <table class="receipt-table"><tbody></tbody></table>' +
    '  <p class="receipt-statement"></p>' +
    '  <p class="receipt-sign">With gratitude,<br><span class="receipt-org-sign"></span></p>' +
    "</div>" +
    '<div class="receipt-actions no-print">' +
    '  <button type="button" class="btn btn-primary" id="receipt-print">Print / Save as PDF</button>' +
    '  <a href="index.html" class="btn btn-outline-dark">Back to Home</a>' +
    "</div>";

  wrap.querySelector(".receipt-title").textContent = r.org.name;
  wrap.querySelector(".receipt-sub").textContent =
    "501(c)(3) Non-Profit · EIN " + r.org.ein + " · " + r.org.address + " · " + r.org.email;
  wrap.querySelector(".receipt-heading").textContent =
    r.is_donation ? "Donation Receipt" : "Sponsorship Receipt";
  wrap.querySelector(".receipt-org-sign").textContent = r.org.name;

  const rows = [
    ["Receipt #", r.receipt_number],
    ["Date", date],
    [r.is_donation ? "Donor" : "Sponsor", r.donor_name],
  ];
  if (!r.is_donation && r.contact_name && r.contact_name !== r.donor_name) rows.push(["Contact", r.contact_name]);
  if (r.org_name) rows.push(["Organization", r.org_name]);
  if (r.email) rows.push(["Email", r.email]);
  rows.push(["Type", kind]);
  rows.push(["Amount", money]);

  const tbody = wrap.querySelector(".receipt-table tbody");
  rows.forEach(function (row) {
    const tr = document.createElement("tr");
    const th = document.createElement("th");
    const td = document.createElement("td");
    th.textContent = row[0];
    td.textContent = row[1];
    tr.appendChild(th);
    tr.appendChild(td);
    tbody.appendChild(tr);
  });

  wrap.querySelector(".receipt-statement").textContent = r.is_donation
    ? r.org.name + " is a tax-exempt organization under Section 501(c)(3) of the Internal Revenue Code (EIN " +
      r.org.ein + "). No goods or services were provided in exchange for this contribution. " +
      "Your gift is tax-deductible to the extent allowed by law. Please keep this receipt for your tax records."
    : r.org.name + " is a tax-exempt organization under Section 501(c)(3) of the Internal Revenue Code (EIN " +
      r.org.ein + "). In exchange for this sponsorship, the club provides recognition/advertising benefits; " +
      "the deductible amount may be reduced by the fair market value of those benefits. " +
      "Please consult your tax advisor and keep this receipt for your records.";

  document.getElementById("receipt-print").addEventListener("click", function () {
    window.print();
  });
}
