#!/usr/bin/env python3
"""Writes the top menu into every page that has one.

The menu is plain HTML in each page (so it works with no JavaScript and never
flashes). Edit MENU below, then run:  python3 scripts/build-nav.py
Pages added through the site editor with "show in nav" are appended at load
time by js/nav-pages.js and are unaffected.
"""
import glob, os, re

# (label, href) or (label, [(label, href), ...])
MENU = [
    ("Home", "index.html"),
    ("Teams", [
        ("All teams", "teams.html"),
        ("Splashball", "team-splashball.html"),
        ("8U Coed", "team-8u-coed.html"),
        ("10U Coed", "team-10u-coed.html"),
        ("12U Boys", "team-12u-boys.html"),
        ("12U Girls", "team-12u-girls.html"),
        ("14U Boys", "team-14u-boys.html"),
        ("14U Girls", "team-14u-girls.html"),
        ("16U Boys", "team-16u-boys.html"),
        ("16U Girls", "team-16u-girls.html"),
        ("18U Boys", "team-18u-boys.html"),
        ("18U Girls", "team-18u-girls.html"),
        ("Masters", "masters.html"),
        ("Summer League", "summer-league.html"),
    ]),
    ("Register", [
        ("Open sessions", "index.html#sessions"),
        ("My Account", "dashboard.html"),
        ("2-week trial", "signup.html?trial=1"),
        ("Registration & refund policy", "registration-refund-policy.html"),
        ("Age division calculator", "age-division-calculator.html"),
    ]),
    ("About", [
        ("About us & coaches", "about-us.html"),
        ("Accomplishments", "accomplishments.html"),
        ("Junior Olympics", "junior-olympics.html"),
        ("Athlete projects", "projects.html"),
        ("FAQ", "faq.html"),
        ("Guidelines & etiquette", "guidelines-etiquette.html"),
    ]),
    ("__logo__", None),  # the crest, centered between the two halves (public pages)
    ("Team Store", "eca-gear.html"),
    ("Donate/Sponsor", "support.html"),
    ("Contact", "contact.html"),
]

def esc(t):
    return t.replace("&", "&amp;")

def page_of(href):
    return href.split("#")[0].split("?")[0]

def render(current):
    out = []
    for i, (label, target) in enumerate(MENU):
        if label == "__logo__":
            out.append('        <li class="nav-logo"><a href="index.html" aria-label="East County Aquatics home"><img src="images/eca-logo.png" alt="" width="524" height="517"></a></li>')
            continue
        if isinstance(target, str):
            cls = ' class="active"' if page_of(target) == current else ""
            out.append(f'        <li><a href="{target}"{cls}>{esc(label)}</a></li>')
            continue
        active = any(page_of(h) == current and "#" not in h and "?" not in h for _, h in target)
        wide = " nav-menu-wide" if len(target) > 8 else ""
        items = "\n".join(
            f'            <li><a href="{h}">{esc(l)}</a></li>' for l, h in target
        )
        out.append(
            f'        <li class="has-menu">\n'
            f'          <button type="button" class="nav-parent{" active" if active else ""}" aria-expanded="false" aria-haspopup="true">{esc(label)}</button>\n'
            f'          <ul class="nav-menu{wide}">\n{items}\n          </ul>\n'
            f'        </li>'
        )
    return "\n".join(out) + "\n"

pattern = re.compile(r'(<nav class="main-nav">\s*<ul>\n)(.*?)(\s*<li id="nav-auth-slot">)', re.S)
changed = 0
for path in sorted(glob.glob("*.html")):
    src = open(path, encoding="utf-8").read()
    if pattern.search(src) is None:
        continue
    new = pattern.sub(lambda m: m.group(1) + render(os.path.basename(path)) + m.group(3).lstrip("\n"), src, count=1)
    # keep the original indentation of the auth slot line
    new = new.replace("\n<li id=\"nav-auth-slot\">", "\n        <li id=\"nav-auth-slot\">")
    if new != src:
        open(path, "w", encoding="utf-8").write(new)
        changed += 1
print("updated", changed, "pages")
