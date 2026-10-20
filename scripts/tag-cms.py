#!/usr/bin/env python3
"""Makes the rest of a page owner-editable in Edit Website.

Adds stable keys to built-in content that doesn't have one yet:
  - text blocks (headings, paragraphs, list items, labels, small notes,
    hero kickers) -> data-cms="<page>-NNNN"
  - photos -> data-cms-img="<page>-imgNNNN"
  - top-level <section>s -> data-section="<page>-N" (move / hide / add)
Skips the header/menu and footer (those are edited on Admin > Menu &
Footer), anything inside an already-editable block, anything a script fills
in (elements with their own id, or text like "Loading..."), and blocks that
hold form fields or other blocks. Safe to re-run: existing keys are kept and new
items get the next free number.

Usage: python3 scripts/tag-cms.py page1.html [page2.html ...]
"""
import re, sys
from html.parser import HTMLParser

TEXT = {"h1","h2","h3","h4","h5","h6","p","li","label","dt","dd","figcaption","blockquote","td","th","small","summary","span","div","strong","em"}
BLOCKISH = {"p","div","ul","ol","li","h1","h2","h3","h4","h5","h6","table","section","form","header","footer","nav","blockquote","dl","figure","select","input","textarea","button","iframe","canvas","video"}
VOID = {"img","br","hr","input","meta","link","source","area","wbr","col","embed","track","param"}
SKIP = {"script","style","noscript","template","svg"}

class Node:
    def __init__(s, tag, attrs, pos, parent):
        s.tag, s.attrs, s.pos, s.parent = tag, attrs, pos, parent
        s.kids, s.text = [], ""
    def ancestors(s):
        p = s.parent
        while p: yield p; p = p.parent

class P(HTMLParser):
    def __init__(s):
        super().__init__(convert_charrefs=False)
        s.root = Node("#root", {}, (0, 0), None); s.cur = s.root; s.skip = 0; s.imgs = []; s.sections = []
    def handle_starttag(s, tag, attrs):
        a = dict(attrs)
        if s.skip: 
            if tag in SKIP: s.skip += 1
            return
        if tag in SKIP: s.skip += 1; return
        n = Node(tag, a, s.getpos(), s.cur); s.cur.kids.append(n)
        if tag == "img": s.imgs.append(n)
        if tag == "section" and s.cur.tag == "body": s.sections.append(n)
        if tag not in VOID: s.cur = n
    def handle_startendtag(s, tag, attrs):
        s.handle_starttag(tag, attrs)
        if tag not in VOID and s.cur.tag == tag: s.cur = s.cur.parent
    def handle_endtag(s, tag):
        if tag in SKIP and s.skip: s.skip -= 1; return
        if s.skip: return
        n = s.cur
        while n is not s.root and n.tag != tag: n = n.parent
        if n is not s.root: s.cur = n.parent
    def handle_data(s, d):
        if not s.skip: s.cur.text += d
    def handle_entityref(s, name):
        if not s.skip: s.cur.text += "&" + name + ";"
    def handle_charref(s, name):
        if not s.skip: s.cur.text += "&#" + name + ";"

def all_text(n):
    return n.text + "".join(all_text(k) for k in n.kids)

def blocked(n):
    for a in n.ancestors():
        if a.tag in ("header", "footer", "nav", "head", "select", "button", "option"): return True
        # text inside a plain link is the link's own label; a card/tile link
        # (one that wraps a photo or blocks) can still have editable text
        if a.tag == "a" and not any(k.tag == "img" or k.tag in BLOCKISH or k.tag == "span" for k in a.kids): return True
        if "data-cms" in a.attrs or "data-cms-html" in a.attrs: return True
    return False

def has_block_desc(n):
    for k in n.kids:
        if k.tag in BLOCKISH or has_block_desc(k): return True
    return False

def risky_desc(n):
    # a child a script fills in (has an id) or that's editable on its own
    for k in n.kids:
        if k.attrs.get("id") or "data-cms" in k.attrs or "data-cms-link" in k.attrs or "data-cms-img" in k.attrs or risky_desc(k): return True
    return False

def candidate(n):
    if n.tag not in TEXT: return False
    if risky_desc(n): return False
    if "data-cms" in n.attrs or "data-cms-html" in n.attrs or n.attrs.get("id"): return False
    if blocked(n) or has_block_desc(n): return False
    if any(k.tag == "a" and "btn" in (k.attrs.get("class") or "") for k in n.kids): return False
    if any(k.tag == "img" for k in n.kids): return False
    t = re.sub(r"\s+", " ", re.sub(r"&[a-z#0-9]+;", "x", all_text(n))).strip()
    if len(t) < 2 or re.match(r"^(Loading|Checking)", t): return False
    if n.tag in ("span", "strong", "em", "small", "div"):
        # inline bits only when they stand alone (a kicker, a note), not
        # pieces of a sentence whose parent will be tagged instead
        p = n.parent
        if p and p.tag in TEXT and p.tag not in ("div",) : return False
        if n.tag == "div" and not n.text.strip(): return False
    return True

def walk(n, out):
    for k in n.kids:
        if candidate(k): out.append(k)   # don't descend: the whole block is one editable
        else: walk(k, out)

def run(path):
    src = open(path, encoding="utf-8").read()
    page = path.rsplit("/", 1)[-1][:-5]
    p = P(); p.feed(src)
    body = next((n for n in p.root.kids[0].kids if n.tag == "body"), None) if p.root.kids else None
    found = []; walk(p.root, found)
    used = [int(x) for x in re.findall(r'data-cms="%s-(\d+)"' % re.escape(page), src)]
    usedi = [int(x) for x in re.findall(r'data-cms-img="%s-img(\d+)"' % re.escape(page), src)]
    useds = [int(x) for x in re.findall(r'data-section="%s-(\d+)"' % re.escape(page), src)]
    edits = []
    nt = max(used, default=0); ni = max(usedi, default=0); ns = max(useds, default=0)
    for n in found:
        nt += 1; edits.append((n.pos, n.tag, ' data-cms="%s-%04d"' % (page, nt)))
    for n in p.imgs:
        if "data-cms-img" in n.attrs or any(a.tag in ("header", "footer", "nav") for a in n.ancestors()): continue
        if n.attrs.get("id"): continue
        ni += 1; edits.append((n.pos, "img", ' data-cms-img="%s-img%04d"' % (page, ni)))
    for n in p.sections:
        if "data-section" in n.attrs: continue
        ns += 1; edits.append((n.pos, "section", ' data-section="%s-%d"' % (page, ns)))
    lines = src.split("\n"); starts = [0]
    for l in lines: starts.append(starts[-1] + len(l) + 1)
    for (ln, col), tag, attr in sorted(edits, key=lambda e: starts[e[0][0]-1] + e[0][1], reverse=True):
        off = starts[ln - 1] + col
        assert src[off:off + 1 + len(tag)].lower() == "<" + tag, (path, ln, col, src[off:off+20])
        ins = off + 1 + len(tag)
        src = src[:ins] + attr + src[ins:]
    open(path, "w", encoding="utf-8").write(src)
    print("%-36s +%d text, +%d photos, +%d sections" % (path, nt - max(used, default=0), ni - max(usedi, default=0), ns - max(useds, default=0)))

for f in sys.argv[1:]: run(f)
