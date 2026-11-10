// Browser tests run the real pages in a real browser against an in-memory
// stand-in for Supabase (tests/helpers/fakedb.js), so they need no accounts
// and can never touch the live club. Nothing leaves the machine: every
// request that is not to the local test server is answered with an empty body.
import fs from "node:fs";
import { ROOT, serve } from "./site.mjs";

const fakeDb = () => fs.readFileSync(new URL("./fakedb.js", import.meta.url), "utf8");

export async function start() {
  const { chromium } = await import("playwright");
  const { server, url } = await serve();
  const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined });
  return {
    url, browser,
    // A fresh browser context with its own fake database. `seed` is the starting
    // content of tables; `mock` is extra script run after the fake client loads
    // (e.g. to stub a server function's answer).
    async page({ seed = {}, mock = "", viewport = { width: 1280, height: 900 }, signedOut = false } = {}) {
      const ctx = await browser.newContext({ viewport });
      await ctx.route("**/*", (route) => {
        const u = route.request().url();
        if (u.startsWith(url)) return route.fallback();
        return route.fulfill({ status: 200, contentType: "text/plain", body: "" });
      });
      await ctx.route("**/js/supabase-client.js*", (route) =>
        route.fulfill({ contentType: "text/javascript", body: fakeDb() + ';window.SUPABASE_URL="https://test.invalid";' + (signedOut ? "window.__nosession=true;" : "") + mock }));
      await ctx.addInitScript((s) => { if (!localStorage.getItem("__fakedb")) localStorage.setItem("__fakedb", JSON.stringify(s)); }, seed);
      const page = await ctx.newPage();
      page.errors = [];
      page.on("pageerror", (e) => page.errors.push(e.message));
      return page;
    },
    async stop() { await browser.close(); server.close(); },
  };
}

export const rows = (page, table) => page.evaluate((t) => (JSON.parse(localStorage.getItem("__fakedb") || "{}")[t] || []), table);
