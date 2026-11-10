// Owner-edited dropdown choices (js/option-blocks.js): one per line.
import test from "node:test";
import assert from "node:assert/strict";
import { loadScript } from "../helpers/load.mjs";

const w = loadScript("js/option-blocks.js");

test("amounts become $ choices and ignore junk lines", () => {
  const html = w.ecaOptionsFromLines("amounts", "25\n  50 \n$1,000\nnope\n0\n");
  assert.match(html, /<option value="25">\$25<\/option>/);
  assert.match(html, /<option value="50">\$50<\/option>/);
  assert.match(html, /<option value="1000">\$1,000<\/option>/);
  assert.equal((html.match(/<option/g) || []).length, 3);
});

test("sponsor levels: name | minimum | label", () => {
  const html = w.ecaOptionsFromLines("tiers", "Gold | 2500 | Gold Sponsorship: $2,500+");
  assert.match(html, /<option value="Gold" data-min="2500">Gold Sponsorship: \$2,500\+<\/option>/);
});

test("plain choices are HTML-escaped", () => {
  const html = w.ecaOptionsFromLines("text", '<img src=x onerror=alert(1)>\nA & B "quoted"');
  assert.ok(!html.includes("<img"), html);
  assert.match(html, /A &amp; B &quot;quoted&quot;/);
});
