// Runs one of the site's browser scripts in a bare sandbox (no page, no
// network) and hands back what it put on `window`, so pure logic can be
// unit tested. Scripts that need a page are covered by the browser tests.
import vm from "node:vm";
import { read } from "./site.mjs";

export function loadScript(rel, extra = {}) {
  const win = { location: { search: "", pathname: "/index.html" }, ...extra };
  win.window = win;
  win.self = win;
  win.document = extra.document || { documentElement: { classList: { add() {} } }, querySelectorAll: () => [], addEventListener() {} };
  vm.runInNewContext(read(rel), win, { filename: rel });
  return win;
}
