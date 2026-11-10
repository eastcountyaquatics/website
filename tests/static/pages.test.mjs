// Checks every HTML page without a browser: scripts parse, local files exist,
// editable keys are unique, and a script that appears on many pages carries
// the same version tag everywhere (a stale tag is how an old cached copy of a
// fix keeps running in browsers).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { ROOT, read, htmlPages } from "../helpers/site.mjs";

test("every inline <script> parses", () => {
  const bad = [];
  for (const f of htmlPages()) {
    for (const m of read(f).matchAll(/<script>([\s\S]*?)<\/script>/g)) {
      try { new Function(m[1]); } catch (e) { bad.push(f + ": " + e.message); }
    }
  }
  assert.deepEqual(bad, []);
});

test("every JS file under js/ parses", () => {
  const bad = [];
  for (const f of fs.readdirSync(path.join(ROOT, "js")).filter((x) => x.endsWith(".js"))) {
    try { new Function(read("js/" + f)); } catch (e) { bad.push(f + ": " + e.message); }
  }
  assert.deepEqual(bad, []);
});

test("every local href/src/srcset points at a file that exists", () => {
  const missing = new Set();
  for (const f of htmlPages()) {
    const s = read(f);
    const refs = [...s.matchAll(/(?:href|src)="([^"#?]+)(?:[?#][^"]*)?"/g)].map((m) => m[1]);
    for (const m of s.matchAll(/srcset="([^"]+)"/g)) m[1].split(",").forEach((p) => refs.push(p.trim().split(" ")[0]));
    for (const u of refs) {
      if (!u || /^(https?:|mailto:|tel:|data:|javascript:|\/\/)/.test(u) || /[{}'+$]/.test(u)) continue;
      if (!fs.existsSync(path.join(ROOT, u))) missing.add(u + "  <-  " + f);
    }
  }
  assert.deepEqual([...missing], []);
});

test("data-cms and data-section keys are unique on each page", () => {
  const dup = [];
  for (const f of htmlPages()) {
    for (const attr of ["data-cms", "data-cms-img", "data-cms-link", "data-section"]) {
      const seen = new Set();
      for (const m of read(f).matchAll(new RegExp(`\\s${attr}="([^"]+)"`, "g"))) {
        if (seen.has(m[1])) dup.push(`${f}: ${attr}="${m[1]}"`);
        seen.add(m[1]);
      }
    }
  }
  assert.deepEqual(dup, []);
});

test("each shared script has one version tag across all pages", () => {
  const versions = {};
  for (const f of htmlPages()) {
    for (const m of read(f).matchAll(/(?:src|href)="((?:js|css)\/[\w.-]+\.(?:js|css))(?:\?v=([\w]+))?"/g)) {
      (versions[m[1]] ||= new Map()).set(m[2] || "(none)", f);
    }
  }
  const mixed = Object.entries(versions).filter(([, v]) => v.size > 1).map(([k, v]) => k + " -> " + [...v.keys()].join(", "));
  assert.deepEqual(mixed, []);
});

test("every real page links the stylesheet and theme script (redirect stubs excluded)", () => {
  const bad = htmlPages().filter((f) => {
    const s = read(f);
    if (/http-equiv="refresh"/.test(s)) return false; // coaches.html / programs.html just forward visitors
    return !/css\/styles\.css/.test(s) || !/js\/theme\.js/.test(s);
  });
  assert.deepEqual(bad, []);
});

test("no page loads a script from an unexpected host", () => {
  const ok = /^(https:\/\/(fonts\.googleapis\.com|cdn\.jsdelivr\.net|unpkg\.com|cdnjs\.cloudflare\.com)\/)/;
  const bad = [];
  for (const f of htmlPages()) for (const m of read(f).matchAll(/<script[^>]+src="(https?:[^"]+)"/g)) if (!ok.test(m[1])) bad.push(f + ": " + m[1]);
  assert.deepEqual(bad, []);
});
