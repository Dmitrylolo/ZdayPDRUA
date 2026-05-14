#!/usr/bin/env python3
"""
build_pdr_rules.py

Download and parse Ukrainian PDR (traffic rules) into structured JSON.

Flow:
  1. Download index page  → parser/pdr.html          (skipped if file exists)
  2. Discover section URLs from the index
  3. Download each section page                       (cached under debug/pdr_sections/)
  4. Parse rules by rule-ID regex boundaries
  5. Write output:
       parser/output/pdr_rules.json
       parser/output/debug/pdr_rules_debug.json

Rule format:
  {
    "id":           "1.10",
    "sectionId":    "1",
    "sectionTitle": "Загальні положення",
    "text":         "..."
  }

Rule IDs follow the pattern \\d+(\\.\\d+)+ e.g.: 1.1  1.10  2.4  8.7.3  2.4.1.1
Nested sub-paragraphs (а), б)…  or •) are kept inside the parent rule text.
"""

import json
import re
import sys
import time
from collections import Counter
from pathlib import Path

import requests
from bs4 import BeautifulSoup

# ─────────────────────────────── Paths ────────────────────────────────────────

SCRIPT_DIR   = Path(__file__).parent
PDR_HTML     = SCRIPT_DIR / "pdr.html"
OUTPUT_DIR   = SCRIPT_DIR / "output"
DEBUG_DIR    = OUTPUT_DIR / "debug"
SECTIONS_DIR = DEBUG_DIR  / "pdr_sections"
OUTPUT_FILE  = OUTPUT_DIR / "pdr_rules.json"
DEBUG_FILE   = DEBUG_DIR  / "pdr_rules_debug.json"

BASE_URL      = "https://pdr.infotech.gov.ua/theory/rules"
REQUEST_DELAY = 1.0  # seconds between network requests

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/124.0 Safari/537.36"
    ),
    "Accept":          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "uk,uk-UA;q=0.9,en;q=0.5",
    "Referer":         "https://pdr.infotech.gov.ua/",
}

# ─────────────────────────────── Network ──────────────────────────────────────

def fetch(url: str, dest: Path, delay: float = REQUEST_DELAY) -> str:
    """Return HTML text; download only when *dest* does not already exist."""
    if dest.exists():
        return dest.read_text("utf-8")
    print(f"  GET {url}", flush=True)
    resp = requests.get(url, headers=HEADERS, timeout=30)
    resp.raise_for_status()
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(resp.text, encoding="utf-8")
    time.sleep(delay)
    return resp.text

# ─────────────────────────────── Index parsing ────────────────────────────────

def parse_index(html: str) -> list[dict]:
    """
    Return a sorted list of {sectionId, sectionTitle, url} dicts discovered
    from <a href="/theory/rules/{N}"> links in the index HTML.
    """
    soup = BeautifulSoup(html, "html.parser")
    seen: dict[str, dict] = {}

    for a in soup.find_all("a", href=True):
        href = (a.get("href") or "").strip()
        # Match both absolute and relative hrefs
        m = re.search(r"/theory/rules/(\d+)$", href)
        if not m:
            continue
        sid = m.group(1)
        if sid in seen:
            continue
        raw = a.get_text(" ", strip=True)
        # Strip leading number:  "1 Загальні …"  or  "1. Загальні …"
        title = re.sub(r"^\d+[\.\s]+", "", raw).strip() or raw
        seen[sid] = {
            "sectionId":    sid,
            "sectionTitle": title,
            "url":          f"{BASE_URL}/{sid}",
        }

    return sorted(seen.values(), key=lambda s: int(s["sectionId"]))

# ─────────────────────────────── Content cleaning ─────────────────────────────

# HTML elements whose entire subtree should be discarded
_DROP_TAGS = frozenset({
    "nav", "header", "footer", "script", "style", "noscript",
    "iframe", "svg", "button", "form",
})

# CSS class / id patterns that identify UI chrome to discard
_UI_RE = re.compile(
    r"\b(nav|footer|header|sidebar|menu|social|banner|cookie|modal|"
    r"subscribe|pagination|download|advert|promo|overlay)\b",
    re.I,
)

def _prune_ui(soup: BeautifulSoup) -> None:
    """Remove navigation / chrome elements from *soup* in-place."""
    for tag in list(soup.find_all(_DROP_TAGS)):
        tag.decompose()
    for tag in list(soup.find_all(True)):
        classes = " ".join(tag.get("class") or [])
        tid = tag.get("id") or ""
        if _UI_RE.search(classes) or _UI_RE.search(tid):
            tag.decompose()

# ─────────────────────────────── Section title ────────────────────────────────

def extract_section_title(soup: BeautifulSoup, fallback: str) -> str:
    """Get the section title from the first <h1> on the page."""
    h1 = soup.find("h1")
    if h1:
        t = h1.get_text(" ", strip=True)
        # Drop leading "N." or "N " prefix that some pages include
        t = re.sub(r"^\d+[\.\s]+", "", t).strip()
        if t:
            return t
    return fallback

# ─────────────────────────────── Content area ─────────────────────────────────

def find_content(soup: BeautifulSoup):
    """
    Return the most appropriate BS4 element that contains the rule text.
    Tries several semantic / structural selectors before falling back to <body>.
    """
    selectors = [
        dict(name="article"),
        dict(name="main"),
        dict(name="div", id=re.compile(r"\b(content|main|article|rules|theory)\b", re.I)),
        dict(name="div", class_=re.compile(r"\b(content|article|rules|theory)\b", re.I)),
    ]
    for sel in selectors:
        el = soup.find(**sel)
        if el:
            return el
    return soup.body or soup

# ─────────────────────────────── Rule parsing ─────────────────────────────────

def parse_section_rules(html: str, section: dict) -> list[dict]:
    """
    Parse all numbered rules from one section page.

    Strategy:
      1. Strip UI chrome from the BeautifulSoup tree.
      2. Locate the main content container.
      3. Iterate over every <p> and <li> element in document order.
      4. A paragraph whose text begins with "{sectionId}.N…" starts a new rule.
      5. All subsequent paragraphs until the next rule ID belong to that rule.
      6. Nested sub-items (а), б), • …) are kept in the rule text.
    """
    soup = BeautifulSoup(html, "html.parser")
    sid   = section["sectionId"]
    title = extract_section_title(soup, section["sectionTitle"])

    _prune_ui(soup)
    content = find_content(soup)

    # Collect text blocks.
    # Using get_text(separator=" ") collapses inline elements (<a>, <strong>…)
    # into the surrounding text without introducing spurious newlines.
    blocks: list[str] = []
    for el in content.find_all(["p", "li"], recursive=True):
        # Avoid double-counting: skip elements whose nearest block ancestor
        # is also a <p> (can happen with malformed HTML)
        if el.find_parent("p"):
            continue
        text = " ".join(el.get_text(separator=" ").split())
        if text:
            blocks.append(text)

    # Rule-ID boundary patterns:
    #   Case A: "{sid}.N… text"  — ID followed by a space then text in same block
    #   Case B: "{sid}.N…"       — ID is the entire block (next blocks are the text)
    # Handles: 1.1  1.10  2.4  8.7.3  2.4.1.1
    rule_with_text = re.compile(
        r"^(" + re.escape(sid) + r"(?:\.\d+)+)[\s\u00a0]"
    )
    rule_id_only = re.compile(
        r"^(" + re.escape(sid) + r"(?:\.\d+)+)$"
    )

    rules: list[dict] = []
    current_id: str | None = None
    current_parts: list[str] = []

    def flush() -> None:
        nonlocal current_id, current_parts
        if current_id is None:
            return
        text = "\n".join(current_parts).strip()
        rules.append({
            "id":           current_id,
            "sectionId":    sid,
            "sectionTitle": title,
            "text":         text,
        })
        current_id    = None
        current_parts = []

    for block in blocks:
        m = rule_with_text.match(block)
        if m:
            # Case A: "2.1 Водій повинен…"
            flush()
            current_id = m.group(1)
            rest = block[m.end():].strip()
            current_parts = [rest] if rest else []
        elif rule_id_only.match(block):
            # Case B: standalone "35.1" — text follows in subsequent blocks
            flush()
            current_id = rule_id_only.match(block).group(1)
            current_parts = []
        elif current_id is not None:
            current_parts.append(block)
        # Blocks before the first rule are silently discarded (navigation text etc.)

    flush()
    return rules

# ─────────────────────────────── Debug report ─────────────────────────────────

def build_debug(rules: list[dict], sections: list[dict]) -> dict:
    by_section = Counter(r["sectionId"] for r in rules)
    lengths    = sorted((len(r["text"]), r["id"]) for r in rules if r.get("text"))
    missing    = [r["id"] for r in rules if not r.get("text")]

    per_section_detail = {}
    for sec in sections:
        sid = sec["sectionId"]
        per_section_detail[sid] = {
            "title": sec["sectionTitle"],
            "count": by_section.get(sid, 0),
        }

    return {
        "totalRules":      len(rules),
        "totalSections":   len(sections),
        "rulesPerSection": per_section_detail,
        "shortestRules": [{"id": rid, "chars": n} for n, rid in lengths[:5]],
        "longestRules":  [{"id": rid, "chars": n} for n, rid in lengths[-5:]],
        "emptyTextCount": len(missing),
        "emptyTextIds":   missing,
    }

# ─────────────────────────────── Main ─────────────────────────────────────────

def main() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    DEBUG_DIR.mkdir(parents=True, exist_ok=True)
    SECTIONS_DIR.mkdir(parents=True, exist_ok=True)

    # 1. Index page
    print("Step 1: Loading index page …")
    index_html = fetch(BASE_URL, PDR_HTML)

    # 2. Discover sections
    sections = parse_index(index_html)
    if not sections:
        sys.exit("[ERROR] No section links found in the index page.\n"
                 "        Check that pdr.html came from "
                 "https://pdr.infotech.gov.ua/theory/rules")
    print(f"Step 2: Found {len(sections)} sections.")

    # 3. Download + parse each section
    print("Step 3: Parsing sections …")
    all_rules: list[dict] = []
    for sec in sections:
        cache = SECTIONS_DIR / f"section_{sec['sectionId']}.html"
        html  = fetch(sec["url"], cache)
        rules = parse_section_rules(html, sec)
        # Back-fill sectionTitle from the parsed page (may differ from index link text)
        if rules:
            sec["sectionTitle"] = rules[0]["sectionTitle"]
        n = len(rules)
        label = sec["sectionTitle"][:48]
        print(f"  [{sec['sectionId']:>3}] {label!r:<50s} → {n} rules")
        all_rules.extend(rules)

    # 4. Main output
    OUTPUT_FILE.write_text(
        json.dumps({"rules": all_rules}, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    print(f"\nSaved {len(all_rules)} rules → {OUTPUT_FILE.relative_to(SCRIPT_DIR.parent)}")

    # 5. Debug output
    debug = build_debug(all_rules, sections)
    DEBUG_FILE.write_text(
        json.dumps(debug, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    print(f"Debug stats      → {DEBUG_FILE.relative_to(SCRIPT_DIR.parent)}")
    print(f"\nSummary: {debug['totalRules']} rules across {debug['totalSections']} sections "
          f"({debug['emptyTextCount']} with empty text)")


if __name__ == "__main__":
    main()
