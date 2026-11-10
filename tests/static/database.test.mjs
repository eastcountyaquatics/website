// Checks the SQL migrations without a database: names are ordered and
// unique, every new table turns row-level security on, and tables that
// hold private data are never readable by "anyone".
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { ROOT, read } from "../helpers/site.mjs";

const dir = path.join(ROOT, "supabase", "migrations");
const files = fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
const all = files.map((f) => ({ f, sql: fs.readFileSync(path.join(dir, f), "utf8") }));

test("migration files are named YYYYMMDDHHMMSS_name.sql with unique timestamps", () => {
  const bad = files.filter((f) => !/^\d{14}_[a-z0-9_]+\.sql$/.test(f));
  assert.deepEqual(bad, []);
  const stamps = files.map((f) => f.slice(0, 14));
  const dup = stamps.filter((s, i) => stamps.indexOf(s) !== i);
  assert.deepEqual(dup, []);
});

test("every table created in a migration has row-level security enabled", () => {
  const joined = all.map((x) => x.sql).join("\n").toLowerCase();
  const created = [...joined.matchAll(/create table (?:if not exists )?public\.([a-z_0-9]+)/g)].map((m) => m[1]);
  const missing = [...new Set(created)].filter((t) => !new RegExp(`alter table (?:only )?public\\.${t}\\s+enable row level security`).test(joined));
  assert.deepEqual(missing, []);
});

test("security-definer functions pin their search_path", () => {
  const bad = [];
  for (const { f, sql } of all) {
    // Everything from one "create function" to the next belongs to that function.
    for (const m of sql.matchAll(/create (?:or replace )?function\s+public\.(\w+)([\s\S]*?)(?=create (?:or replace )?function|$)/gi)) {
      const body = m[2].toLowerCase();
      if (body.includes("security definer") && !/set search_path/.test(body)) bad.push(f + ": " + m[1]);
    }
  }
  // Older functions predate this rule; the list must only ever shrink.
  const KNOWN = new Set(JSON.parse(read("tests/static/known-definer-gaps.json")));
  const fresh = bad.filter((b) => !KNOWN.has(b));
  assert.deepEqual(fresh, [], "new security-definer function without 'set search_path'");
});

test("private-data tables have no 'using (true)' read policy", () => {
  const PRIVATE = ["athletes", "profiles", "purchases", "coach_hours", "coach_reimbursements", "family_credits", "family_credit_uses", "email_templates", "webhook_events", "zeffy_unmatched", "coach_registrations"];
  const bad = [];
  for (const { f, sql } of all) {
    for (const m of sql.matchAll(/create policy [^;]*?on public\.(\w+)\s+for select\s+(?:to \w+\s+)?using \(\s*true\s*\)/gis)) {
      if (PRIVATE.includes(m[1])) bad.push(f + ": " + m[1]);
    }
  }
  assert.deepEqual(bad, []);
});
