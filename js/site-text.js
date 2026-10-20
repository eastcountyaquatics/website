// Wording that page scripts build on the fly (team finder, pay steps, status
// messages), editable on Admin > Site Wording.
//
// Each entry's built-in text lives here and only here. Owners' changes are
// content_blocks rows on page "__site_text" (block_key = "ui-" + key), cached
// in localStorage so a repeat visit shows them instantly. Usage:
//   ecaT("tf.button")                       -> "Find my team"
//   ecaT("tf.cutoff", { year: 2027 })       -> fills {{year}}
//   ecaTextReady.then(render)               -> after saved wording loads
// Text may contain simple HTML (bold, links); fill-in values passed in vars
// must already be escaped by the caller.
(function () {
  var D = {
    // Team finder (Home and Teams pages)
    "tf.birthdate": { g: "Team finder", w: "Label above the birthdate box", t: "Athlete&rsquo;s birthdate" },
    "tf.team_legend": { g: "Team finder", w: "Label above Boys / Girls", t: "Team" },
    "tf.boys": { g: "Team finder", w: "Boys choice", t: "Boys" },
    "tf.girls": { g: "Team finder", w: "Girls choice", t: "Girls" },
    "tf.button": { g: "Team finder", w: "The search button", t: "Find my team" },
    "tf.need_birthdate": { g: "Team finder", w: "No birthdate entered", t: "Enter the athlete&rsquo;s birthdate." },
    "tf.bad_birthdate": { g: "Team finder", w: "Birthdate doesn't make sense", t: "Check the birthdate." },
    "tf.too_young": { g: "Team finder", w: "Athlete is under 5", t: "Splashball, our youngest program, starts at age 5. <a href=\"team-splashball.html\" style=\"color:#fff;text-decoration:underline;\">See Splashball</a>." },
    "tf.pick_sex": { g: "Team finder", w: "12U and up, no Boys/Girls picked", t: "From 12U up, teams are boys or girls &mdash; pick one." },
    "tf.looking": { g: "Team finder", w: "While it looks up sessions", t: "Looking up open sessions&hellip;" },
    "tf.kicker": { g: "Team finder", w: "Small line above the team name", t: "Your athlete&rsquo;s team this season" },
    "tf.none_open": { g: "Team finder", w: "No open session for that team", t: "No session is open for this team right now &mdash; the team page has the latest." },
    "tf.register_btn": { g: "Team finder", w: "Register button", t: "Register" },
    "tf.team_page_btn": { g: "Team finder", w: "Button to the team page", t: "Practice times &amp; coaches" },
    "tf.splashball_note": { g: "Team finder", w: "Note for athletes 8 and under", t: "New to the water? <a href=\"team-splashball.html\">Splashball</a> is our learn-to-play program for the youngest athletes." },
    "tf.trial_note": { g: "Team finder", w: "Note about the free trial", t: "New to ECA? <a href=\"signup.html?trial=1\">Try 2 weeks first</a>." },
    "tf.cutoff": { g: "Team finder", w: "Fine print about the age cutoff", v: ["year"], t: "Based on age on Aug 1, {{year}}, the USA Water Polo cutoff for this season." },

    // Team pages
    "tp.open": { g: "Team pages", w: "Tag on the bar under the header when a session is open", t: "Registration open" },
    "tp.register_btn": { g: "Team pages", w: "Register button on that bar", t: "Register" },

    // My Account: registering
    "rc.none_open": { g: "My Account — registering", w: "Nothing open at all", t: "No programs are open for registration right now &mdash; check back soon." },
    "rc.none_for_age": { g: "My Account — registering", w: "Nothing open for the family's age groups", t: "No programs are open for your athletes&rsquo; age groups right now &mdash; check back soon." },
    "rc.add_first": { g: "My Account — registering", w: "On a program card when the family has no athletes yet", t: "Add an athlete above first." },
    "rc.none_fit": { g: "My Account — registering", w: "On a program card when no athlete fits it", t: "None of your athletes are in this program&rsquo;s age group." },
    "rc.registered": { g: "My Account — registering", w: "An athlete already registered for that program", v: ["name"], t: "&#10003; {{name}} &mdash; Registered" },
    "rc.balance": { g: "My Account — registering", w: "Next to an athlete who part-paid on Zeffy", v: ["amount"], t: "{{amount}} balance due" },
    "rc.button": { g: "My Account — registering", w: "The program card button", t: "Register &amp; Pay" },
    "rc.select_one": { g: "My Account — registering", w: "Clicked the button without checking an athlete", t: "Select at least one athlete." },

    // My Account: paying on Zeffy
    "dz.title": { g: "My Account — paying on Zeffy", w: "Title of the pay box", v: ["session"], t: "Pay on Zeffy &mdash; {{session}}" },
    "dz.intro_set": { g: "My Account — paying on Zeffy", w: "Intro when the session has its own set-price form", t: "The club takes payments through Zeffy, which charges the club no fees. Each athlete has their own payment code &mdash; copy it, pick the ticket on Zeffy, and paste the code on that athlete&rsquo;s ticket." },
    "dz.intro_club": { g: "My Account — paying on Zeffy", w: "Intro on the club pay-what-you-want form", t: "The club takes payments through Zeffy, which charges the club no fees. On Zeffy, enter the <strong>amount</strong> shown below and paste the athlete&rsquo;s <strong>payment code</strong>." },
    "dz.intro_club_one": { g: "My Account — paying on Zeffy", w: "Same, when paying for one athlete", t: "The club takes payments through Zeffy, which charges the club no fees. On Zeffy, enter the <strong>amount</strong> shown below and paste the athlete&rsquo;s <strong>payment code</strong> &mdash; tap Copy Code &amp; Open Zeffy and the code is ready to paste." },
    "dz.multi_set": { g: "My Account — paying on Zeffy", w: "Paying for several athletes (set-price form)", t: "Add a ticket for each athlete, with each athlete&rsquo;s own code." },
    "dz.multi_club": { g: "My Account — paying on Zeffy", w: "Paying for several athletes (club form)", t: "Add a ticket for each athlete, each with that athlete&rsquo;s own amount and code." },
    "dz.pick_ticket": { g: "My Account — paying on Zeffy", w: "Under each athlete (set-price form)", v: ["amount"], t: "Pick the ticket for {{amount}}" },
    "dz.amount": { g: "My Account — paying on Zeffy", w: "Under each athlete (club form)", v: ["amount"], t: "Amount to enter: <strong>{{amount}}</strong>" },
    "dz.registered": { g: "My Account — paying on Zeffy", w: "Athlete free after a discount", t: "Registered &mdash; nothing to pay" },
    "dz.open_one": { g: "My Account — paying on Zeffy", w: "Main button, one athlete", t: "Copy Code &amp; Open Zeffy" },
    "dz.open": { g: "My Account — paying on Zeffy", w: "Main button, several athletes", t: "Open Zeffy" },

    // Tournament invite page
    "ti.free_title": { g: "Tournament invite — paying", w: "Heading when a discount covers it all", t: "You're registered!" },
    "ti.free": { g: "Tournament invite — paying", w: "Text when a discount covers it all", t: "Your discount code covered the full amount &mdash; nothing to pay." },
    "ti.set_title": { g: "Tournament invite — paying", w: "Pay box title (tournament's own set-price form)", t: "Pay on Zeffy" },
    "ti.intro_set": { g: "Tournament invite — paying", w: "Pay box intro (set-price form)", t: "The club takes payments through Zeffy, which charges the club no fees." },
    "ti.step_code": { g: "Tournament invite — paying", w: "Step 1 (set-price form)", t: "Your payment code &mdash; copy it" },
    "ti.step_ticket": { g: "Tournament invite — paying", w: "Step 2 (set-price form)", t: "On Zeffy, pick this ticket" },
    "ti.step_paste": { g: "Tournament invite — paying", w: "Step 3 (set-price form)", t: "Paste your code into <strong>&ldquo;Payment code&rdquo;</strong> on that ticket and pay." },
    "ti.open_set": { g: "Tournament invite — paying", w: "Button (set-price form)", t: "Open Zeffy" },
    "ti.multi": { g: "Tournament invite — paying", w: "Paying for several swimmers", t: "Paying for more than one swimmer? Add a ticket for each, with each swimmer&rsquo;s own code." },
    "ti.roster_set": { g: "Tournament invite — paying", w: "What happens next (set-price form)", v: ["athlete"], t: "{{athlete}} is added to the roster as soon as the payment comes in, and you'll get a confirmation email." },
    "ti.club_title": { g: "Tournament invite — paying", w: "Pay box title (club form)", v: ["amount"], t: "Pay {{amount}} on Zeffy" },
    "ti.intro_club": { g: "Tournament invite — paying", w: "Pay box intro (club form)", t: "The club takes payments through Zeffy, which charges the club no fees. Copy these two things, then open the payment page:" },
    "ti.step_amount": { g: "Tournament invite — paying", w: "Step 1 (club form)", t: "Amount to enter" },
    "ti.step_code_club": { g: "Tournament invite — paying", w: "Step 2 (club form)", t: "Payment code (paste into the &ldquo;Payment code&rdquo; question)" },
    "ti.open_club": { g: "Tournament invite — paying", w: "Button (club form)", t: "3. Open the Zeffy Payment Page" },
    "ti.roster_club": { g: "Tournament invite — paying", w: "What happens next (club form)", v: ["amount", "athlete"], t: "Enter exactly <strong>{{amount}}</strong> &mdash; {{athlete}} is added to the roster once the full amount comes in, and you'll get a confirmation email. Paid? This page updates within a minute or two." },
    "ti.check_btn": { g: "Tournament invite — paying", w: "Check-status button", t: "I've Paid &mdash; Check Status" },

    // Forms, sign-in and calculator messages
    "acc.signing_in": { g: "Sign in & accounts", w: "Sign In button while signing in", t: "Signing In..." },
    "acc.unconfirmed": { g: "Sign in & accounts", w: "Signing in before confirming the email (a \u201csend it again\u201d link follows)", t: "Your email address hasn&rsquo;t been confirmed yet. Check your inbox (and spam folder) for the confirmation link &mdash;" },
    "acc.resend_link": { g: "Sign in & accounts", w: "The \u201csend it again\u201d link", t: "send it again" },
    "acc.resent": { g: "Sign in & accounts", w: "After resending the confirmation email", t: "Confirmation email sent. Check your inbox, then sign in." },
    "acc.bad_login": { g: "Sign in & accounts", w: "Wrong email or password", t: "That email and password don&rsquo;t match an account. Check for typos, or use &ldquo;Forgot your password?&rdquo; below." },
    "acc.need_phone": { g: "Sign in & accounts", w: "Create Account: phone missing", t: "Please enter a phone number with area code." },
    "acc.pw_mismatch": { g: "Sign in & accounts", w: "Passwords don't match (Create Account and Set New Password)", t: "Passwords do not match." },
    "acc.pw_short": { g: "Sign in & accounts", w: "Password too short (Create Account and Set New Password)", t: "Please choose a password of at least 8 characters." },
    "acc.creating": { g: "Sign in & accounts", w: "Create Account button while working", t: "Creating Account..." },
    "acc.exists": { g: "Sign in & accounts", w: "Create Account with an email that already has an account", t: "There&rsquo;s already an account with this email. <a href=\"login.html\">Sign in</a> instead, or use <a href=\"forgot-password.html\">Forgot your password?</a> to set a new one." },
    "acc.created": { g: "Sign in & accounts", w: "Account created, waiting for email confirmation", t: "Account created! Check your email to confirm your address, then sign in. (Coaches: you&rsquo;ll fill out your coach registration right after you sign in.)" },
    "acc.sending": { g: "Sign in & accounts", w: "Send Reset Link button while working", t: "Sending..." },
    "acc.reset_sent": { g: "Sign in & accounts", w: "After asking for a reset link", t: "If an account exists for that email, a reset link is on its way." },
    "acc.coach_welcome_title": { g: "Sign in & accounts", w: "Set New Password page, opened from a coach invite: heading", t: "Welcome to ECA!" },
    "acc.coach_welcome_sub": { g: "Sign in & accounts", w: "Same page from a coach invite: line under the heading", t: "Create a password for your coach account. Next you&rsquo;ll fill out your coach registration." },
    "acc.coach_create_pw": { g: "Sign in & accounts", w: "Same page from a coach invite: button", t: "Create Password" },
    "acc.updating": { g: "Sign in & accounts", w: "Set New Password button while working", t: "Updating..." },
    "give.cancelled": { g: "Donate & sponsor forms", w: "Came back after cancelling card checkout", t: "Checkout was cancelled &mdash; no payment was made. You can try again below." },
    "give.min_amount": { g: "Donate & sponsor forms", w: "Sponsor amount below the level's minimum", v: ["amount"], t: "Enter an amount of at least {{amount}}." },
    "give.min_one": { g: "Donate & sponsor forms", w: "Donation amount missing or under $1", t: "Enter an amount of at least $1." },
    "give.submitting": { g: "Donate & sponsor forms", w: "Continue to Payment button while working", t: "Submitting..." },
    "give.failed": { g: "Donate & sponsor forms", w: "Something went wrong submitting", v: ["error"], t: "Could not submit: {{error}}" },
    "cr.bad_photo": { g: "Coach registration", w: "Headshot file couldn't be opened", t: "That photo couldn&rsquo;t be opened. Please choose a JPG or PNG (iPhone: share it as &ldquo;Most Compatible&rdquo; or take a screenshot of it)." },
    "cr.change_photo": { g: "Coach registration", w: "Photo button after a photo is picked", t: "Change Photo" },
    "cr.need_photo": { g: "Coach registration", w: "Submitted without a headshot", t: "Please add your headshot photo (About You, at the top)." },
    "cr.too_big": { g: "Coach registration", w: "An uploaded file is over 10MB", v: ["file"], t: "&ldquo;{{file}}&rdquo; is over 10MB. Please upload a smaller PDF or photo." },
    "cr.submitting": { g: "Coach registration", w: "Submit button while working", t: "Submitting..." },
    "adc.division": { g: "Age division calculator", w: "Result heading", v: ["division"], t: "Your Division: {{division}}" },
    "adc.eligible": { g: "Age division calculator", w: "Result line under it", v: ["division"], t: "Eligible for {{division}}" },
    "adc.too_old_title": { g: "Age division calculator", w: "Older than 18U: heading", t: "No Standard Youth Division" },
    "adc.too_old": { g: "Age division calculator", w: "Older than 18U: line under it", t: "Older than 18U &mdash; contact the club about Masters or adult play." },
    "adc.check_title": { g: "Age division calculator", w: "Birthdate after the cutoff: heading", t: "Check the Date" },
    "adc.check": { g: "Age division calculator", w: "Birthdate after the cutoff: line under it", v: ["year"], t: "That birthdate is after the {{year}} cutoff." },

    // Shared
    "zeffy.tip": { g: "Zeffy (shared)", w: "Note about Zeffy's optional tip, on every Zeffy pay screen", t: "Zeffy is free for the club because it runs on donations, so at checkout it suggests an optional tip to Zeffy (not the club). <strong>Feel free to set it to $0.</strong>" },
  };
  window.ECA_TEXT_DEFAULTS = D;

  var CACHE = "eca_site_text_v1";
  var over = {};
  try { over = JSON.parse(localStorage.getItem(CACHE) || "{}") || {}; } catch (e) { over = {}; }

  function clean(s) { return typeof sanitizeHtml === "function" ? sanitizeHtml(s) : s; }
  window.ecaT = function (key, vars) {
    var s = Object.prototype.hasOwnProperty.call(over, key) ? clean(over[key]) : (D[key] ? D[key].t : key);
    if (vars) s = s.replace(/\{\{\s*([a-z_]+)\s*\}\}/g, function (m, k) { return Object.prototype.hasOwnProperty.call(vars, k) ? String(vars[k]) : m; });
    return s;
  };
  // Plain-text version, for places that set textContent or a button label.
  window.ecaTPlain = function (key, vars) {
    var div = document.createElement("div");
    div.innerHTML = window.ecaT(key, vars);
    return div.textContent;
  };

  window.ecaTextReady = new Promise(function (resolve) {
    if (typeof supabaseClient === "undefined") return resolve();
    var done = false;
    setTimeout(function () { if (!done) { done = true; resolve(); } }, 2500);
    supabaseClient.from("content_blocks").select("block_key, content").eq("page_path", "__site_text").then(function (r) {
      if (r && r.data) {
        var next = {};
        r.data.forEach(function (row) { if (row.block_key.indexOf("ui-") === 0) next[row.block_key.slice(3)] = row.content; });
        over = next;
        try { localStorage.setItem(CACHE, JSON.stringify(next)); } catch (e) {}
      }
      if (!done) { done = true; resolve(); }
    }, function () { if (!done) { done = true; resolve(); } });
  });
})();
