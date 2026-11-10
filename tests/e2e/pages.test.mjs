// Every page opens in a real browser without a single script error.
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { start } from "../helpers/browser.mjs";
import { htmlPages } from "../helpers/site.mjs";

let env;
before(async () => { env = await start(); });
after(async () => { await env.stop(); });

test("all pages load with no script errors (signed in as an owner)", async () => {
  const bad = [];
  for (const f of htmlPages()) {
    const page = await env.page();
    await page.goto(`${env.url}/${f}`);
    await page.waitForTimeout(600);
    if (page.errors.length) bad.push(f + ": " + [...new Set(page.errors)].join(" | "));
    await page.context().close();
  }
  assert.deepEqual(bad, []);
});

test("public pages load with no script errors when signed out", async () => {
  const bad = [];
  for (const f of htmlPages().filter((x) => !x.startsWith("admin-"))) {
    const page = await env.page({ signedOut: true });
    await page.goto(`${env.url}/${f}`);
    await page.waitForTimeout(400);
    if (page.errors.length) bad.push(f + ": " + [...new Set(page.errors)].join(" | "));
    await page.context().close();
  }
  assert.deepEqual(bad, []);
});

test("no public page scrolls sideways on a phone", async () => {
  const wide = [];
  for (const f of ["index.html", "teams.html", "support.html", "contact.html", "masters.html", "login.html", "signup.html"]) {
    const page = await env.page({ viewport: { width: 390, height: 844 }, signedOut: true });
    await page.goto(`${env.url}/${f}`);
    await page.waitForTimeout(500);
    const w = await page.evaluate(() => document.documentElement.scrollWidth);
    if (w > 392) wide.push(`${f} is ${w}px wide`);
    await page.context().close();
  }
  assert.deepEqual(wide, []);
});
