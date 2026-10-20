#!/usr/bin/env python3
"""Gives every page button (<a class="btn ...">) a stable data-cms-link key so
owners can change its text and link in Edit Website. Skips the header/menu,
the footer, and buttons inside an editable text block (data-cms), whose
content is replaced as a whole. Safe to re-run: existing keys are kept and
new buttons get the next free number.
"""
import glob, re
from html.parser import HTMLParser

class Finder(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=False)
        self.stack = []; self.hits = []
    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        void = tag in ("img","br","hr","input","meta","link","source")
        blocked = any(t in ("header","footer","nav") or c for t, c in self.stack)
        if tag == "a" and "btn" in (a.get("class") or "").split() and not blocked and "data-cms-link" not in a and a.get("href"):
            self.hits.append(self.getpos())
        if not void:
            self.stack.append((tag, "data-cms" in a))
    def handle_endtag(self, tag):
        for i in range(len(self.stack) - 1, -1, -1):
            if self.stack[i][0] == tag:
                del self.stack[i:]; break

total = 0
for path in sorted(glob.glob("*.html")):
    src = open(path, encoding="utf-8").read()
    if "css/refresh.css" not in src and "js/link-blocks.js" not in src: continue
    page = path[:-5]
    used = [int(n) for n in re.findall(r'data-cms-link="%s-link(\d+)"' % re.escape(page), src)]
    nxt = max(used, default=0) + 1
    f = Finder(); f.feed(src)
    if not f.hits: continue
    lines = src.split("\n")
    starts = [0]
    for l in lines: starts.append(starts[-1] + len(l) + 1)
    offsets = sorted((starts[ln - 1] + col for ln, col in f.hits), reverse=True)
    for off in offsets:
        key = "%s-link%02d" % (page, nxt + len(offsets) - 1 - offsets.index(off))
        src = src[:off] + '<a data-cms-link="' + key + '"' + src[off + 2:]
    open(path, "w", encoding="utf-8").write(src)
    total += len(offsets); print(path, len(offsets))
print("tagged", total, "buttons")
