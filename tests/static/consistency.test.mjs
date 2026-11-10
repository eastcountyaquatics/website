// Keeps copies of the same thing in step. Several places hold the same facts
// (an email's built-in wording lives in the Admin > Emails catalog AND in the
// server function that sends it; Site Wording defaults live in one file but
// are used by name from many pages). A typo or rename in one place used to be
// found by a family; now it fails here.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { ROOT, read, htmlPages } from "../helpers/site.mjs";
import { loadScript } from "../helpers/load.mjs";

const functions = fs.readdirSync(path.join(ROOT, "supabase", "functions")).filter((d) => fs.existsSync(path.join(ROOT, "supabase", "functions", d, "index.ts")));
const fnSource = Object.fromEntries(functions.map((d) => [d, read(`supabase/functions/${d}/index.ts`)]));

// A string literal (or "a" + "b" pieces) from source text -> the string it makes.
function literal(src) {
  const parts = [...src.matchAll(/"((?:[^"\\]|\\.)*)"|`((?:[^`\\]|\\.)*)`/g)].map((m) => JSON.parse('"' + (m[1] ?? m[2]).replace(/"/g, '\\"').replace(/\n/g, "\\n") + '"'));
  return parts.join("");
}

test("every email in the Admin > Emails catalog is sent by the function it names, with the same built-in wording", () => {
  const catalog = loadScript("js/email-catalog.js").ECA_EMAILS;
  assert.ok(catalog.length >= 10);
  const problems = [];
  for (const e of catalog) {
    const fns = e.fn.split(",").map((x) => x.trim());
    let found = false;
    for (const fn of fns) {
      const src = fnSource[fn];
      if (!src) { problems.push(`${e.key}: function ${fn} does not exist`); continue; }
      const at = src.indexOf(`"${e.key}"`);
      if (at === -1) continue;
      found = true;
      // The fallback object follows the key: { subject: "...", body: "..." }
      const chunk = src.slice(at, at + 4000);
      const subj = /subject:\s*((?:"(?:[^"\\]|\\.)*"|`(?:[^`\\]|\\.)*`)(?:\s*\+\s*(?:"(?:[^"\\]|\\.)*"|`(?:[^`\\]|\\.)*`))*)/.exec(chunk);
      if (subj && literal(subj[1]) !== e.subject && !/\{\{/.test("")) {
        // Subjects with computed parts (e.g. team_message's "{{subject}}") are identical text too.
        problems.push(`${e.key} (${fn}): subject differs\n   catalog: ${e.subject}\n   server:  ${literal(subj[1])}`);
      }
    }
    if (!found) problems.push(`${e.key}: no function in "${e.fn}" uses this key`);
  }
  assert.deepEqual(problems, []);
});

test("every {{fill-in}} used in a catalog email is documented", () => {
  const catalog = loadScript("js/email-catalog.js").ECA_EMAILS;
  const problems = [];
  for (const e of catalog) {
    const used = new Set([...(e.subject + " " + e.body).matchAll(/\{\{\s*([a-z_]+)\s*\}\}/g)].map((m) => m[1]));
    for (const u of used) if (!(u in e.vars)) problems.push(`${e.key}: {{${u}}} is used but not listed in vars`);
    // (A fill-in offered to owners but unused by the built-in wording is fine: they can add it.)
  }
  assert.deepEqual(problems, []);
});

test("every Site Wording key used in the code has a default, and every default is used", () => {
  const defaults = Object.keys(loadScript("js/site-text.js").ECA_TEXT_DEFAULTS);
  const used = new Set();
  const files = [...htmlPages(), ...fs.readdirSync(path.join(ROOT, "js")).filter((f) => f.endsWith(".js")).map((f) => "js/" + f)];
  for (const f of files) {
    if (f === "js/site-text.js") continue;
    const src = read(f);
    // A key may sit inside a conditional (ecaT(a ? "x.one" : "x.two")), so count any
    // string that is a default's key, plus anything passed straight to ecaT/T.
    for (const k of defaults) if (src.includes('"' + k + '"')) used.add(k);
    for (const m of src.matchAll(/\b(?:ecaT|ecaTPlain|T)\(\s*"([a-z]+\.[a-z0-9_]+)"/g)) used.add(m[1]);
    for (const m of src.matchAll(/data-t="([a-z]+\.[a-z0-9_]+)"/g)) used.add(m[1]);
  }
  const missing = [...used].filter((k) => !defaults.includes(k));
  assert.deepEqual(missing, [], "used in code but missing from js/site-text.js");
  const unused = defaults.filter((k) => !used.has(k));
  assert.deepEqual(unused, [], "defined in js/site-text.js but never used (delete it or wire it up)");
});

test("every edge function the pages call exists in supabase/functions", () => {
  const called = new Set();
  for (const f of [...htmlPages(), ...fs.readdirSync(path.join(ROOT, "js")).filter((x) => x.endsWith(".js")).map((x) => "js/" + x)]) {
    for (const m of read(f).matchAll(/functions\.invoke\(\s*"([a-z0-9-]+)"/g)) called.add(m[1]);
  }
  const missing = [...called].filter((n) => !functions.includes(n));
  assert.deepEqual(missing, []);
});

test("every function the pages call by name (rpc) is created by a migration", () => {
  const sql = fs.readdirSync(path.join(ROOT, "supabase", "migrations")).map((f) => read("supabase/migrations/" + f)).join("\n").toLowerCase();
  const called = new Set();
  for (const f of [...htmlPages(), ...fs.readdirSync(path.join(ROOT, "js")).filter((x) => x.endsWith(".js")).map((x) => "js/" + x)]) {
    for (const m of read(f).matchAll(/\.rpc\(\s*"([a-z0-9_]+)"/g)) called.add(m[1]);
  }
  const missing = [...called].filter((n) => !new RegExp(`function\\s+(?:public\\.)?${n}\\b`).test(sql));
  assert.deepEqual(missing, []);
});
