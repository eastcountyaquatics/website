// The flows that matter most, end to end in a real browser: a family
// registering for a Zeffy session, live sections, the team tools, emails,
// designs, and the Zeffy form picker.
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { start, rows } from "../helpers/browser.mjs";

let env;
before(async () => { env = await start(); });
after(async () => { await env.stop(); });

const TEAMS = ["splashball", "8u-coed", "10u-coed", "12u-boys", "12u-girls", "14u-boys", "14u-girls", "16u-boys", "16u-girls", "18u-boys", "18u-girls"]
  .map((slug, i) => ({ id: "s" + i, team_slug: slug, team_label: slug.replace("-", " ").toUpperCase(), sort_order: i + 1, is_active: true }));

test("family: registers an athlete for a Zeffy session and sees the payment code, amount and copy button", async () => {
  const page = await env.page({
    seed: {
      registration_options: [{ id: "o1", label: "14U Boys Winter", amount_cents: 39500, team_slugs: ["14u-boys"], payment_provider: "zeffy", zeffy_form_url: "https://www.zeffy.com/en-US/ticketing/x", is_open: true, sort_order: 0 }],
      athletes: [{ id: "a1", parent_id: "owner1", full_name: "Max Smith", birthdate: "2013-03-01", sex: "Male", team_slug: "14u-boys", school: "X", uswp_number: "1", emergency_contact_name: "M", emergency_contact_relationship: "Parent", emergency_contact_phone1: "6195550000" }],
      profiles: [{ id: "owner1", full_name: "Jordan", role: "parent", email: "j@x.com", phone: "6195551234" }],
    },
    mock: `window.__called=[];supabaseClient.functions.invoke=function(n,o){window.__called.push([n,o&&o.body]);return Promise.resolve({data:{set_price:true,discount_code:null,form_url:'https://www.zeffy.com/en-US/ticketing/x',option_label:'14U Boys Winter',amount_cents:39500,codes:[{athlete_id:'a1',athlete_name:'Max Smith',code:'ECA-KCGW6Q',amount_due_cents:39500,paid_cents:0,balance_cents:39500,status:'open'}]}});};`,
  });
  await page.goto(env.url + "/dashboard.html");
  await page.waitForSelector("#registration-options input[type=checkbox]");
  await page.check("#registration-options input[type=checkbox]");
  await page.click("#registration-options button[data-checkout]");
  // Required consent boxes block Continue until all are ticked.
  await page.click("#consent-continue-btn");
  assert.match(await page.textContent("#consent-msg"), /check all of the boxes/i);
  await page.$$eval("[data-consent-required]", (els) => els.forEach((e) => (e.checked = true)));
  if (await page.$("#consent-phone")) await page.fill("#consent-phone", "6195551234");
  await page.click("#consent-continue-btn");
  await page.waitForSelector("#zeffy-reg-overlay .consent-modal", { state: "visible" });
  const text = await page.textContent("#zeffy-reg-overlay .consent-modal");
  assert.match(text, /ECA-KCGW6Q/);
  assert.match(text, /Max Smith/);
  assert.match(text, /Feel free to set it to \$0/);
  assert.equal(await page.evaluate(() => window.__called[0][0]), "create-zeffy-registration");
  assert.deepEqual(page.errors, []);
});

test("family: an athlete who already paid shows as Registered and can't be picked again", async () => {
  const page = await env.page({
    seed: {
      registration_options: [{ id: "o1", label: "14U Boys Winter", amount_cents: 39500, team_slugs: ["14u-boys"], payment_provider: "zeffy", is_open: true, sort_order: 0 }],
      athletes: [{ id: "a1", parent_id: "owner1", full_name: "Max Smith", birthdate: "2013-03-01", sex: "Male", team_slug: "14u-boys" }],
      purchases: [{ athlete_id: "a1", registration_option_id: "o1", status: "paid" }],
      profiles: [{ id: "owner1", full_name: "Jordan", role: "parent" }],
    },
  });
  await page.goto(env.url + "/dashboard.html");
  await page.waitForSelector("#registration-options .card");
  const card = await page.textContent("#registration-options .card");
  assert.match(card, /Max Smith.*Registered/s);
  assert.equal(await page.$("#registration-options input[type=checkbox]"), null);
});

test("sponsor form: owners' edited dropdown choices appear for visitors", async () => {
  const page = await env.page({ signedOut: true, seed: { content_blocks: [{ page_path: "sponsor.html", block_key: "sponsor-opt-amounts", content: "20\n40\n80" }] } });
  await page.goto(env.url + "/sponsor.html");
  await page.waitForTimeout(900);
  const opts = await page.$$eval("#dn-amount-choice option", (o) => o.map((x) => x.value));
  assert.deepEqual(opts, ["20", "40", "80", "other"]);
});

test("owner edits to words, buttons, tab title and Site Wording all show on the live pages", async () => {
  const page = await env.page({
    signedOut: true,
    seed: {
      content_blocks: [
        { page_path: "index.html", block_key: "index-meta-title", content: "ECA Test Title" },
        { page_path: "signup.html", block_key: "signup-0001", content: "EDITED HEADING" },
        { page_path: "__site_text", block_key: "ui-tf.button", content: "Show my team" },
        { page_path: "login.html", block_key: "login-btn01", content: "Log me in" },
      ],
    },
  });
  await page.goto(env.url + "/index.html");
  await page.waitForTimeout(900);
  assert.equal(await page.title(), "ECA Test Title");
  assert.equal(await page.textContent("[data-team-finder] button[type=submit]"), "Show my team");
  await page.goto(env.url + "/signup.html");
  await page.waitForTimeout(700);
  assert.equal(await page.textContent('[data-cms="signup-0001"]'), "EDITED HEADING");
  await page.goto(env.url + "/login.html");
  await page.waitForTimeout(700);
  assert.equal(await page.textContent("#submit-btn"), "Log me in");
});

test("live sections fill from club data on the site, and stay placeholders in the editor", async () => {
  const body = '<h2>Teams</h2><div class="eca-live eca-live--teams"></div><div class="eca-live eca-live--sessions"></div><div class="eca-live eca-live--tournaments"></div><div class="eca-live eca-live--countdown">2999-01-01 Big day</div>';
  const seed = {
    pages: [{ slug: "demo", title: "Demo", nav_label: "Demo", body_html: body, is_published: true }],
    schedules: TEAMS,
    registration_options: [{ label: "Winter", amount_cents: 39500, is_open: true, sort_order: 0 }],
    tournaments: [{ name: "Finest", event_date: "2999-01-09", is_published: true }],
  };
  const page = await env.page({ signedOut: true, seed });
  await page.goto(env.url + "/page.html?slug=demo");
  await page.waitForSelector(".live-card");
  const txt = await page.textContent("#page-body");
  assert.match(txt, /14U BOYS/);
  assert.match(txt, /\$395/);
  assert.match(txt, /Finest/);
  assert.match(txt, /days until Big day/);
  const edit = await env.page({ seed });
  await edit.goto(env.url + "/page.html?slug=demo&edit=1");
  await edit.waitForTimeout(800);
  assert.ok(await edit.evaluate(() => document.documentElement.classList.contains("eca-edit")));
  assert.equal(await edit.$(".live-card"), null, "editor must not render live data (it would be saved)");
});

test("admin teams: add a team with ages, then the finder offers it, then retire it", async () => {
  const admin = await env.page({ seed: { schedules: TEAMS, pages: [] } });
  await admin.goto(env.url + "/admin-teams.html");
  await admin.waitForSelector(".tm-row");
  await admin.fill("#add-name", "18U Coed");
  await admin.fill("#add-min", "15");
  await admin.fill("#add-max", "18");
  await admin.click("#add-btn");
  await admin.waitForFunction(() => /Added 18U Coed/.test(document.getElementById("add-msg").textContent));
  const team = (await rows(admin, "schedules")).find((t) => t.team_slug === "18u-coed");
  assert.equal(team.age_min, 15);
  assert.equal(team.page_url, "page.html?slug=team-18u-coed");
  assert.equal((await rows(admin, "pages")).length, 1);
  const nav = (await rows(admin, "site_settings")).find((r) => r.key === "site_nav").value;
  assert.ok(nav.items.find((i) => /team/i.test(i.label)).children.some((c) => c.label === "18U Coed"));
  // The public team finder now suggests it for a 17-year-old girl.
  const home = await env.page({ signedOut: true, seed: { schedules: [...TEAMS, team] } });
  await home.goto(env.url + "/index.html");
  await home.waitForSelector("[data-team-finder] input[type=date]");
  await home.fill("[data-team-finder] input[type=date]", "2010-03-01");
  await home.check("[data-team-finder] input[value=female]");
  await home.click("[data-team-finder] button[type=submit]");
  await home.waitForSelector(".tf-card");
  assert.match(await home.textContent(".tf-result"), /also join:.*18U Coed/);
  // Retire it: it leaves the menu.
  admin.on("dialog", (d) => d.accept());
  const row = admin.locator(".tm-row", { has: admin.locator("h4", { hasText: "18U Coed" }) });
  await row.locator("[data-toggle]").click();
  await row.locator("[data-retire]").click();
  await admin.waitForTimeout(500);
  const after = (await rows(admin, "site_settings")).find((r) => r.key === "site_nav").value;
  assert.ok(!after.items.find((i) => /team/i.test(i.label)).children.some((c) => c.label === "18U Coed"));
});

test("admin emails: edit wording, see it saved, reset to the built-in text", async () => {
  const page = await env.page();
  page.on("dialog", (d) => d.accept());
  await page.goto(env.url + "/admin-emails.html");
  await page.waitForSelector(".em-card");
  const card = '.em-card[data-key="team_message"]';
  await page.click(card + " .em-head");
  await page.fill(card + ' [data-f="subject"]', "Heads up: {{subject}}");
  await page.click(card + " [data-save]");
  await page.waitForFunction(() => document.querySelector('.em-card[data-key="team_message"] .em-pill').textContent === "Customized");
  assert.equal((await rows(page, "email_templates"))[0].subject, "Heads up: {{subject}}");
  await page.click(card + " [data-reset]");
  await page.waitForFunction(() => document.querySelector('.em-card[data-key="team_message"] .em-pill').textContent !== "Customized");
  assert.equal((await rows(page, "email_templates")).length, 0);
});

test("site look: pick a ready-made design, save your own, and it is stored", async () => {
  const page = await env.page();
  page.on("dialog", (d) => d.accept());
  await page.goto(env.url + "/admin-site-look.html");
  await page.waitForSelector(".sl-preset");
  await page.click('[data-preset="sunset"]');
  assert.equal(await page.inputValue('[data-color-text="navy"]'), "#5a1630");
  await page.fill("#sl-design-name", "Holiday");
  await page.click("#sl-design-save");
  await page.waitForSelector(".sl-mine-row");
  const saved = (await rows(page, "site_settings")).find((r) => r.key === "site_designs").value.designs;
  assert.equal(saved[0].name, "Holiday");
  await page.click("#sl-save");
  await page.waitForTimeout(400);
  assert.equal((await rows(page, "site_settings")).find((r) => r.key === "theme").value.colors.navy, "#5a1630");
});

test("zeffy picker: choosing a form fills link, name, price, description and dates, and checks the price", async () => {
  const unix = (d) => Math.floor(new Date(d).getTime() / 1000);
  const mock = `supabaseClient.functions.invoke=function(n,o){var b=(o&&o.body)||{};
   if(n==='zeffy-campaigns'&&b.id)return Promise.resolve({data:{campaign:{id:b.id,title:'Finest Tournament',description:'Two days of games.',occurrences:[{start:${unix("2026-11-14T08:00:00")},end:${unix("2026-11-14T18:00:00")}},{start:${unix("2026-11-15T08:00:00")},end:${unix("2026-11-15T17:00:00")}}],rates:[{title:'12U',amount:18500},{title:'14U',amount:25000}]}}});
   if(n==='zeffy-campaigns')return Promise.resolve({data:{campaigns:[{id:'f1',title:'Finest Tournament',url:'https://www.zeffy.com/en-US/ticketing/finest',type:'ticketing',is_archived:false}]}});
   return Promise.resolve({data:null});};`;
  const page = await env.page({ mock, seed: { schedules: TEAMS } });
  await page.goto(env.url + "/admin-tournaments.html");
  await page.waitForSelector("#t-zeffy-url-wrap select option[value=f1]", { state: "attached" });
  await page.selectOption("#t-zeffy-url-wrap select", "f1");
  await page.waitForFunction(() => document.getElementById("t-end-date").value !== "");
  assert.equal(await page.inputValue("#t-zeffy-url"), "https://www.zeffy.com/en-US/ticketing/finest");
  assert.equal(await page.inputValue("#t-name"), "Finest Tournament");
  assert.equal(await page.inputValue("#t-description"), "Two days of games.");
  assert.equal(await page.inputValue("#t-event-date"), "2026-11-14");
  assert.equal(await page.inputValue("#t-end-date"), "2026-11-15");
  assert.match(await page.inputValue("#t-cost-note"), /\$185\.00.*\$250\.00/);
  await page.fill("#t-name", "My own name");
  assert.equal(await page.inputValue("#t-name"), "My own name", "auto-filled boxes stay editable");
});

test("band links: one row per group, in age order, 12U shared, 16U and 18U girls separate", async () => {
  const slugs = [["splashball", "Splashball"], ["8u-coed", "8U Team"], ["10u-coed", "10U Team"], ["12u-boys", "12U CoEd"], ["12u-girls", "12U CoEd"], ["14u-boys", "14U Boys"], ["14u-girls", "14U Girls"], ["16u-boys", "16U Boys"], ["16u-girls", "HS Girls"], ["18u-boys", "18U Boys"], ["18u-girls", "HS Girls"], ["masters", "Masters"]];
  const page = await env.page({ seed: { band_links: slugs.map(([team_slug, label]) => ({ team_slug, label, url: label === "12U CoEd" ? "https://band.us/n/c" : null })) } });
  await page.goto(env.url + "/admin-band-links.html");
  await page.waitForSelector(".band-row");
  assert.deepEqual(await page.$$eval(".band-row label", (l) => l.map((x) => x.textContent)),
    ["Splashball", "8U", "10U", "12U CoEd", "14U Girls", "14U Boys", "16U Girls", "16U Boys", "18U Girls", "18U Boys", "Masters"]);
  await page.fill(".band-row:nth-child(4) input", "https://band.us/n/NEW");
  await page.click(".band-row:nth-child(4) .band-save-btn");
  await page.waitForTimeout(400);
  const r = await rows(page, "band_links");
  assert.equal(r.find((x) => x.team_slug === "12u-boys").url, "https://band.us/n/NEW");
  assert.equal(r.find((x) => x.team_slug === "12u-girls").url, "https://band.us/n/NEW");
  assert.equal(r.find((x) => x.team_slug === "16u-girls").label, "16U Girls");
  assert.equal(r.find((x) => x.team_slug === "18u-girls").label, "18U Girls");
});

test("credits: importing the spreadsheet CSV gives the right totals", async () => {
  const csv = "OUTSTANDING CREDITS DUE,,,,,,Code Issued\nDate,Player,Reason,,Amount,Balance,CODE,Session/Tournament\n1/21/2026,Abby,Credit,,30,30,,\n2/18/2026,Mrozek,Cancelled,,185,35,Mrozek,$150 - Cal State\n,,,,,,,\n";
  const page = await env.page();
  await page.goto(env.url + "/admin-credits.html");
  await page.click("#btn-import");
  await page.fill("#import-text", csv);
  await page.click("#import-go");
  await page.waitForFunction(() => document.getElementById("st-total").textContent !== "$0.00");
  assert.deepEqual(await page.$$eval(".cr-stat b", (b) => b.map((x) => x.textContent)), ["$65.00", "$150.00", "2", "$215.00"]);
});

test("a section scheduled for the future or the past stays hidden; one in its window shows", async () => {
  const day = 86400000, iso = (d) => new Date(Date.now() + d).toISOString();
  const page = await env.page({
    seed: {
      page_layouts: [{ page_path: "about-us.html", sections: [
        { key: "about-us-1" },
        { key: "about-us-2", from: iso(day) },
        { key: "about-us-3", until: iso(-day) },
        { added: "w1", html: "<h2>InWindow</h2>", from: iso(-day), until: iso(day) },
      ] }],
    },
  });
  await page.goto(env.url + "/about-us.html");
  await page.waitForSelector('[data-section="about-us-1"]');
  await page.waitForFunction(() => document.querySelector('[data-section="about-us-2"]')?.hasAttribute("data-layout-hidden"));
  const state = await page.evaluate(() => ({
    future: document.querySelector('[data-section="about-us-2"]').hasAttribute("data-layout-hidden"),
    past: document.querySelector('[data-section="about-us-3"]').hasAttribute("data-layout-hidden"),
    open: document.querySelector('[data-section="about-us-1"]').hasAttribute("data-layout-hidden"),
    inWindow: document.querySelector(".cms-added")?.hasAttribute("data-layout-hidden"),
  }));
  assert.deepEqual(state, { future: true, past: true, open: false, inWindow: false });
});

test("a page scheduled for later shows a 'not available' note; one in its window shows normally", async () => {
  const future = new Date(Date.now() + 86400000).toISOString();
  const closed = await env.page({ seed: { site_settings: [{ key: "page_windows", value: { "about-us.html": { from: future, until: null } } }] } });
  await closed.goto(env.url + "/about-us.html");
  await closed.waitForSelector("text=isn’t available right now");
  const open = await env.page({ seed: { site_settings: [{ key: "page_windows", value: { "about-us.html": { from: null, until: future } } }] } });
  await open.goto(env.url + "/about-us.html");
  await open.waitForSelector('[data-section="about-us-1"]');
  await open.waitForTimeout(300);
  assert.equal(await open.locator("text=isn’t available right now").count(), 0);
});

test("approved team photos are spread between sections, not one block", async () => {
  const photos = Array.from({ length: 12 }, (_, i) => ({ id: "p" + i, status: "approved", team_slug: "14u-boys", public_url: "https://x.test/p" + i + ".webp", public_thumb_url: "https://x.test/t" + i + ".webp", alt: "a" }));
  photos.push({ id: "px", status: "review", team_slug: "14u-boys", public_url: "https://x.test/no.webp", public_thumb_url: "https://x.test/no-t.webp" });
  const page = await env.page({ seed: { photo_library: photos } });
  await page.goto(env.url + "/team-14u-boys.html");
  await page.waitForSelector(".team-photo-band", { timeout: 8000 });
  const r = await page.evaluate(() => ({ bands: document.querySelectorAll(".team-photo-band").length, imgs: document.querySelectorAll(".team-photo-row img").length, unapproved: document.querySelectorAll('img[src*="no-t"]').length }));
  assert.ok(r.bands >= 2, "photos should be in several places: " + JSON.stringify(r));
  assert.equal(r.unapproved, 0);
});

test("family with no athletes sees no programs, just a prompt to add an athlete", async () => {
  const page = await env.page({
    seed: {
      registration_options: [{ id: "o1", label: "14U Boys Winter", amount_cents: 39500, team_slugs: ["14u-boys"], payment_provider: "zeffy", is_open: true, sort_order: 0 }],
      profiles: [{ id: "owner1", full_name: "Jordan", role: "parent" }],
    },
  });
  await page.goto(env.url + "/dashboard.html");
  await page.waitForSelector("#reg-add-athlete");
  assert.equal(await page.locator("#registration-options [data-checkout]").count(), 0);
  await page.click("#reg-add-athlete");
  await page.waitForSelector("#athlete-form", { state: "visible" });
});

test("tournaments: Duplicate copies the settings into a new, unpublished tournament with dates cleared", async () => {
  const page = await env.page({
    seed: {
      tournaments: [{ id: "t1", name: "Winter Classic", event_date: "2026-12-05", status: "live", teams: ["14u-boys"], is_published: true, payment_provider: "zeffy", zeffy_form_url: "https://www.zeffy.com/en-US/ticketing/x", location: "Grossmont High" }],
      schedules: TEAMS,
    },
  });
  await page.goto(env.url + "/admin-tournaments.html");
  await page.waitForSelector("[data-clone]");
  await page.click("[data-clone]");
  assert.equal(await page.inputValue("#t-name"), "Winter Classic (copy)");
  assert.equal(await page.inputValue("#t-id"), "");
  assert.equal(await page.inputValue("#t-event-date"), "");
  assert.equal(await page.inputValue("#t-location"), "Grossmont High");
  assert.equal(await page.isChecked("#t-published"), false);
});

test("alumni: a visitor joins from the public page and the owner sees them in the right group", async () => {
  const page = await env.page({});
  await page.goto(env.url + "/alumni.html");
  await page.fill("#al-first", "Jamie");
  await page.fill("#al-last", "Lee");
  await page.fill("#al-email", "jamie@example.com");
  await page.selectOption("#al-segment", "parent");
  await page.click("#alumni-submit");
  await page.waitForSelector("text=Thank you, Jamie");
  assert.match(await page.inputValue("#alumni-card input"), /alumni\.html/);
  assert.equal((await rows(page, "alumni_contacts"))[0].segment, "parent");
  await page.goto(env.url + "/admin-alumni.html");
  await page.waitForSelector("text=Jamie Lee");
  assert.equal(await page.textContent("#st-parent"), "1");
  assert.equal(await page.textContent("#st-player"), "0");
});

test("coaches hub: filters by age group, embeds a YouTube video on click, and only managers see Edit", async () => {
  const seed = { coach_resources: [
    { id: "r1", kind: "drill", title: "Eggbeater ladder", body: "Hold for 30s.", age_groups: ["8U", "10U"], video_url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ", sort_order: 0 },
    { id: "r2", kind: "drill", title: "Shooting circuit", body: "Five shots.", age_groups: ["16U"], video_url: null, sort_order: 1 },
  ] };
  const page = await env.page({ seed });
  await page.goto(env.url + "/admin-coach-hub.html");
  await page.click('#ch-tabs [data-kind="drill"]');
  await page.waitForSelector("text=Eggbeater ladder");
  await page.selectOption("#ch-age", "16U");
  assert.equal(await page.locator(".ch-item").count(), 1);
  await page.selectOption("#ch-age", "8U");
  await page.click("text=Watch video");
  assert.match(await page.getAttribute(".ch-video iframe", "src"), /^https:\/\/www\.youtube-nocookie\.com\/embed\/dQw4w9WgXcQ$/);
  assert.ok(await page.locator("text=Edit").count() >= 1);
});

test("team groups: one click adds A, B and C squads", async () => {
  const page = await env.page({ seed: { schedules: TEAMS, team_subgroups: [{ id: "g1", team_slug: "14u-boys", name: "A Team" }] } });
  await page.goto(env.url + "/admin-team-groups.html");
  await page.selectOption("#team-pick", "14u-boys");
  await page.waitForSelector("#grp-abc");
  await page.click("#grp-abc");
  await page.waitForFunction(() => document.querySelectorAll("#grp-list .grp-row").length === 3);
  const names = (await rows(page, "team_subgroups")).map((g) => g.name).sort();
  assert.deepEqual(names, ["A Team", "B Team", "C Team"]);
});

test("tournament invite for a deleted athlete shows as unavailable instead of a database error", async () => {
  const page = await env.page({
    seed: {
      athletes: [{ id: "a1", parent_id: "owner1", full_name: "Max Smith", birthdate: "2013-03-01", sex: "Male", team_slug: "14u-boys" }],
      profiles: [{ id: "owner1", full_name: "Jordan", role: "parent" }],
      notifications: [
        { id: "n1", type: "tournament_invite", title: "Invited: Winter Classic", body: "", data: { tournament_id: "t1", athlete_id: "gone-athlete" }, read_at: null, actioned_at: null, created_at: "2026-11-01T00:00:00Z" },
        { id: "n2", type: "tournament_invite", title: "Invited: Spring Cup", body: "", data: { tournament_id: "t2", athlete_id: "a1" }, read_at: null, actioned_at: null, created_at: "2026-11-02T00:00:00Z" },
      ],
    },
  });
  await page.goto(env.url + "/dashboard.html");
  await page.waitForSelector("text=no longer on your account");
  assert.equal(await page.locator('[data-notif-response]').count(), 2); // only the live invite (a1) keeps Yes/No
});

test("alumni CRM: importing a CSV adds new people, skips duplicates and bad rows, and keeps the Group column", async () => {
  const page = await env.page({ seed: { alumni_contacts: [{ id: "x1", first_name: "Old", last_name: "Timer", email: "old@example.com", segment: "player", wants_email: true, created_at: "2026-01-01T00:00:00Z" }] } });
  await page.goto(env.url + "/admin-alumni.html");
  await page.waitForSelector("text=Old Timer");
  const csv = "First name,Last name,Email,Phone,Group,Last year,OK to email,Notes\n" +
    "Jamie,Lee,jamie@example.com,619-555-0100,Player,2022,yes,\n" +
    "Sam,Kim,sam@example.com,,Parent,,no,helps with events\n" +
    "Old,Timer,OLD@example.com,,Player,,yes,\n" +
    "Bad,Row,not-an-email,,Player,,yes,\n";
  await page.setInputFiles("#al-file", { name: "alumni.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });
  await page.waitForSelector("#al-imp-summary");
  assert.match(await page.textContent("#al-imp-summary"), /2 new, 1 already on the list \(skipped\), 1 with problems/);
  await page.click("#imp-go");
  await page.waitForSelector("text=Sam Kim");
  const all = await rows(page, "alumni_contacts");
  assert.equal(all.length, 3);
  assert.equal(all.find((r) => r.email === "sam@example.com").segment, "parent");
  assert.equal(all.find((r) => r.email === "sam@example.com").wants_email, false);
});
