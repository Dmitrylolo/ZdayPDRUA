#!/usr/bin/env python3
"""
build_answers.py

Parse answers.pdf (scanned table, 11 pages) and produce:
  output/answers.json            - raw parsed answers list
  output/questions.final.json   - questions with correctAnswerIndex added
  output/debug/answers_debug.json - debug / validation report

Answer entry format:
  {"naturalId": "1-6", "sectionId": "1", "questionNumber": 6, "correctAnswerIndex": 3}

For questions with duplicate naturalIds (occurrence > 1), answers are applied
in occurrence order: occurrence=1 gets first answer for that naturalId, etc.
"""

import fitz          # PyMuPDF
import json
import math
import re
import os
import sys
import numpy as np
from PIL import Image
import pytesseract
from collections import defaultdict

# ─────────────────────── Paths ───────────────────────────────────────────────

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PDF_PATH       = os.path.join(SCRIPT_DIR, 'answers.pdf')
QUESTIONS_PATH = os.path.join(SCRIPT_DIR, 'output', 'questions.raw.json')
OUT_DIR        = os.path.join(SCRIPT_DIR, 'output')
DEBUG_DIR           = os.path.join(OUT_DIR, 'debug')
MISSING_CELLS_DIR   = os.path.join(DEBUG_DIR, 'missing_answer_cells')

os.makedirs(DEBUG_DIR, exist_ok=True)

# ─────────────────────── Constants ───────────────────────────────────────────

ZOOM      = 4.0   # PDF render scale factor
SCALE     = 3     # Additional scaling for OCR
BORDER    = 15    # White border pixels added around cell for Tesseract context
THRESHOLD = 180   # Binarisation threshold: pixels darker than this are "text"
PAD_L = 5         # Left crop padding (skip left grid line)
PAD_R = 2         # Right crop padding (small! digits are right-aligned)
PAD_T = 6         # Top crop padding
PAD_B = 6         # Bottom crop padding

# Characters that OCR commonly confuses with "1"
ONE_CHARS = frozenset('|IlіІ!1')

# ─────────────────────── Image helpers ───────────────────────────────────────

def dilate_horiz(arr, kw=3, n_iter=2):
    """Horizontal binary dilation to widen thin "1" strokes for OCR."""
    result = arr.copy()
    kw2 = kw // 2
    for _ in range(n_iter):
        tmp = np.zeros_like(result)
        for dx in range(-kw2, kw2 + 1):
            if dx == 0:
                tmp |= result
            elif dx > 0:
                tmp[:, :-dx] |= result[:, dx:]
            else:
                tmp[:, -dx:] |= result[:, :dx]
        result = tmp
    return result


def make_ocr_image(img, x0, y0, x1, y1,
                   pad_l=PAD_L, pad_r=PAD_R, pad_t=PAD_T, pad_b=PAD_B,
                   dilate_kw=0, threshold=THRESHOLD):
    """Crop, threshold, optionally dilate, scale up, and add white border."""
    cell = img.crop((x0 + pad_l, y0 + pad_t, x1 - pad_r, y1 - pad_b))
    gray = np.array(cell.convert('L'))
    binary = (gray < threshold).astype(np.uint8)    # 1 = text, 0 = background
    if dilate_kw > 0:
        binary = dilate_horiz(binary, kw=dilate_kw, n_iter=2)
    ocr_arr = (1 - binary) * 255                    # invert: text=black, bg=white
    ocr_img  = Image.fromarray(ocr_arr.astype(np.uint8))
    ocr_img  = ocr_img.resize(
        (ocr_img.width * SCALE, ocr_img.height * SCALE), Image.NEAREST)
    bordered = Image.new(
        'L', (ocr_img.width + BORDER * 2, ocr_img.height + BORDER * 2), 255)
    bordered.paste(ocr_img, (BORDER, BORDER))
    return bordered


# ─────────────────────── OCR helpers ─────────────────────────────────────────

def _parse_number(raw, lo, hi):
    """Strip noise, map |/I/l → 1, return int in [lo,hi] or None."""
    t = re.sub(r'[^0-9|IlіІ!]', '', raw)
    t = ''.join('1' if c in ONE_CHARS else c for c in t)
    t = re.sub(r'^0+', '', t)
    if t and t.isdigit():
        v = int(t)
        if lo <= v <= hi:
            return v
    return None


def ocr_number(cell_img, lo=1, hi=200):
    """
    OCR a numeric cell image.  Returns int in [lo,hi] or None.
    Tries multiple PSM modes and languages.
    """
    # Pass 1 – English with digit whitelist (fastest, most precise)
    for psm in [10, 6, 8, 13]:
        t = pytesseract.image_to_string(
            cell_img, lang='eng',
            config=f'--psm {psm} -c tessedit_char_whitelist=0123456789').strip()
        v = _parse_number(t, lo, hi)
        if v is not None:
            return v

    # Pass 2 – Ukrainian without whitelist (catches "І" misread as 1)
    for psm in [8, 10, 13, 6]:
        t = pytesseract.image_to_string(
            cell_img, lang='ukr', config=f'--psm {psm}').strip()
        v = _parse_number(t, lo, hi)
        if v is not None:
            return v

    return None


def ocr_number_robust(img, x0, y0, x1, y1, lo=1, hi=200):
    """
    OCR a cell; if None, retry with horizontal dilation (recovers thin "1" digits).
    """
    n = ocr_number(make_ocr_image(img, x0, y0, x1, y1), lo, hi)
    if n is None:
        n = ocr_number(make_ocr_image(img, x0, y0, x1, y1, dilate_kw=3), lo, hi)
    return n


def ocr_answer_cell(img, x0, y0, x1, y1):
    """
    Aggressive OCR for a single answer cell expecting a value 1–5.
    Tries multiple (threshold, padding, dilation) combinations before giving up.
    Returns int in [1, 5] or None.
    """
    lo, hi = 1, 5
    # (threshold, pad_l, pad_r, pad_t, pad_b, dilate_kw)
    strategies = [
        (180, PAD_L, PAD_R, PAD_T,  PAD_B,  0),   # default
        (180, PAD_L, PAD_R, PAD_T,  PAD_B,  3),   # default + dilation
        (160, PAD_L, PAD_R, PAD_T,  PAD_B,  0),   # lower threshold
        (140, PAD_L, PAD_R, PAD_T,  PAD_B,  0),   # even lower
        (200, PAD_L, PAD_R, PAD_T,  PAD_B,  0),   # higher threshold
        (160, 3,     1,     4,      4,       0),   # tight crop + lower thresh
        (160, 8,     4,     8,      8,       0),   # wide crop + lower thresh
        (140, 2,     1,     2,      2,       0),   # minimal crop + very low thresh
        (180, 2,     1,     2,      2,       0),   # minimal crop
        (160, 3,     1,     4,      4,       3),   # tight + dilate + lower thresh
        (120, PAD_L, PAD_R, PAD_T,  PAD_B,  0),   # very low threshold
        (120, 3,     1,     4,      4,       3),   # very low + tight + dilate
    ]
    for thresh, pl, pr, pt, pb, dkw in strategies:
        cell_img = make_ocr_image(img, x0, y0, x1, y1,
                                   pad_l=pl, pad_r=pr, pad_t=pt, pad_b=pb,
                                   dilate_kw=dkw, threshold=thresh)
        n = ocr_number(cell_img, lo, hi)
        if n is not None:
            return n
    # Strategy 13–14: skip top/bottom third to avoid Q-row bleed from adjacent rows
    dy = max(1, (y1 - y0) // 3)
    for new_y0, new_y1 in [(y0 + dy, y1), (y0, y1 - dy)]:
        for thresh in (160, 140, 120):
            cell_img = make_ocr_image(img, x0, new_y0, x1, new_y1,
                                       pad_l=PAD_L, pad_r=PAD_R,
                                       pad_t=PAD_T, pad_b=PAD_B,
                                       dilate_kw=0, threshold=thresh)
            n = ocr_number(cell_img, lo, hi)
            if n is not None:
                return n
    return None


def _save_missing_cell(img, x0, y0, x1, y1, page_num, row_i, col, q_num):
    """Save a raw-cropped answer cell image for debug inspection. Returns path."""
    os.makedirs(MISSING_CELLS_DIR, exist_ok=True)
    fname = f"p{page_num}_r{row_i}_c{col}_q{q_num}.png"
    fpath = os.path.join(MISSING_CELLS_DIR, fname)
    raw = img.crop((max(0, x0 - 2), max(0, y0 - 2), x1 + 2, y1 + 2))
    raw.save(fpath)
    return fpath


def ocr_row_label(img, x0, y0, x1, y1):
    """
    OCR the label column cell.
    Returns 'Q' (Питання), 'A' (Відповідь), or None.
    """
    cell = make_ocr_image(img, x0, y0, x1, y1, pad_l=3, pad_r=3)
    t = pytesseract.image_to_string(cell, lang='ukr', config='--psm 8').strip().lower()
    if re.search(r'пит|ит[аа]н|itan', t):
        return 'Q'
    if re.search(r'від|ідп|одп|idp', t):
        return 'A'
    return None


def ocr_section_label(img, x0, y0, x1, y1):
    """
    OCR the section column cell.
    Returns section number (int) or None.
    Only matches when the "Розділ" / "Розліл" prefix is present;
    no standalone-number fallback (too many false positives).
    """
    cell = make_ocr_image(img, x0, y0, x1, y1, pad_l=2, pad_r=2, pad_t=3, pad_b=3)
    t = pytesseract.image_to_string(cell, lang='ukr', config='--psm 6').strip()
    # Normalize ONE_CHARS → '1' before matching
    t_norm = re.sub(r'[|IlіІ!]', '1', t)
    # Match "Розділ N" / "Розліл N" / "Розд. N" / "Розл. N"
    # First two chars cover Р/P (Cyrillic/Latin look-alike), оо/oo, зз
    m = re.search(r'[РP][оo][зз][дл]\S*\s*\.?\s*(\d{1,2})', t_norm, re.IGNORECASE)
    if m:
        return int(m.group(1))
    return None


# ─────────────────────── Grid detection ──────────────────────────────────────

# ─────────────────────── Section layout constants ────────────────────────────

# Ordered section IDs as they appear in the answers PDF (same as questions.raw.json)
SECTION_SEQUENCE = [
    1, 2, 3, 4, 5, 6, 7, 9, 10, 11, 12, 13, 15, 19, 20, 21, 22, 23, 24, 25,
    26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43,
    44, 47, 48, 49, 50, 51, 52, 53, 54, 55, 57, 58, 59, 60, 61, 62, 63,
]


def build_section_row_lookup(questions):
    """
    Build a flat list indexed by global-row index → section_id, plus dicts
    for section start offsets and question counts.

    Returns (lookup, section_starts, section_max_q):
      lookup        – list[int|str], index = global data-row → section_id
      section_starts – {section_id: global_row_index_of_first_row}
      section_max_q  – {section_id: total question count in that section}
    """
    from collections import defaultdict
    # Build max question number per section from naturalId (sectionId-questionNumber)
    sec_max_num = defaultdict(int)
    for q in questions:
        sid = q['sectionId']
        # naturalId format: "sectionId-questionNumber[-occurrence]"
        nat = q.get('naturalId', '')
        parts = nat.split('-')
        if len(parts) >= 2:
            try:
                qnum = int(parts[1])
                if qnum > sec_max_num[sid]:
                    sec_max_num[sid] = qnum
            except ValueError:
                pass
    lookup = []
    section_starts = {}
    section_max_q = {}
    for sid in SECTION_SEQUENCE:
        max_q_num = sec_max_num.get(str(sid), sec_max_num.get(sid, 0))
        n_rows = math.ceil(max_q_num / 8) * 2 if max_q_num > 0 else 0
        section_starts[sid] = len(lookup)
        section_max_q[sid] = max_q_num
        lookup.extend([sid] * n_rows)
    return lookup, section_starts, section_max_q


# Reference column positions from page 1 at ZOOM=4x.
# Pages shift by at most ±12px due to scan alignment.
REFERENCE_VLINES = [75, 317, 488, 622, 752, 894, 1023, 1163, 1292, 1433, 1561]
VLINE_SEARCH_RADIUS = 14   # search ±14px around reference for the darkest column


def _cluster_peaks(positions, gap=6):
    """Merge nearby indices into single median values."""
    if len(positions) == 0:
        return []
    lines = []
    group = [int(positions[0])]
    for p in positions[1:]:
        if int(p) - group[-1] <= gap:
            group.append(int(p))
        else:
            lines.append(int(np.median(group)))
            group = [int(p)]
    lines.append(int(np.median(group)))
    return lines


def _normalize_gray(gray):
    """Stretch contrast so the darkest 2% → 0, lightest 2% → 255."""
    p_lo = float(np.percentile(gray, 2))
    p_hi = float(np.percentile(gray, 98))
    if p_hi <= p_lo:
        return gray.copy()
    scaled = (gray.astype(np.float32) - p_lo) / (p_hi - p_lo) * 255.0
    return np.clip(scaled, 0, 255).astype(np.uint8)


def _detect_hlines(gray_norm):
    """Return horizontal line y-coordinates using adaptive row darkness."""
    H, W = gray_norm.shape
    row_dark = (gray_norm < 80).mean(axis=1)
    # Adaptive threshold: use 3× the baseline noise level, min 0.08
    noise_baseline = float(np.median(row_dark))
    threshold = max(0.08, noise_baseline * 3)
    h_idx = np.where(row_dark > threshold)[0]
    return _cluster_peaks(h_idx, gap=5)


def _refine_vlines(gray_norm, hlines, reference_vlines, radius=VLINE_SEARCH_RADIUS):
    """
    For each reference vline position, find the darkest column within ±radius.
    Uses cell-interior rows (strips out horizontal line rows) for cleaner signal.
    """
    H, W = gray_norm.shape
    # Build mask of "cell interior" rows (away from hlines and header)
    mask = np.ones(H, dtype=bool)
    header_limit = H // 5
    mask[:header_limit] = False
    for hy in hlines:
        mask[max(0, hy - 4): hy + 5] = False

    if mask.sum() < 50:
        return list(reference_vlines)

    row_means = gray_norm[mask, :].mean(axis=0).astype(np.float32)

    refined = []
    for vx in reference_vlines:
        lo = max(0, vx - radius)
        hi = min(W - 1, vx + radius + 1)
        window = row_means[lo:hi]
        if len(window) == 0:
            refined.append(vx)
        else:
            refined.append(int(lo + window.argmin()))
    return refined


def detect_grid(img):
    """
    Detect horizontal and vertical grid lines adaptively.
    Returns (hlines, vlines) sorted lists of pixel coordinates.
    Falls back to REFERENCE_VLINES if vline detection fails.
    """
    gray = np.array(img.convert('L'))
    gray_norm = _normalize_gray(gray)

    hlines = _detect_hlines(gray_norm)
    vlines = _refine_vlines(gray_norm, hlines, REFERENCE_VLINES)

    if len(hlines) < 2:
        print("    [warn] No hlines detected")

    return hlines, vlines


# ─────────────────────── Per-page processing ─────────────────────────────────

def process_page(page_img, page_num, section_lookup, global_row_offset,
                 section_starts, section_max_q, missing_cells=None,
                 initial_pending_q_data=None):
    """
    Parse all rows on one page image.

    section_lookup    – flat list built by build_section_row_lookup(); index is
                        the global data-row counter across all pages.
    global_row_offset – number of data rows already processed from previous pages.
    section_starts    – {section_id: global_row_index_of_first_row}
    section_max_q     – {section_id: total question count}

    For Q rows the question numbers are computed deterministically from the
    global row index (no OCR needed), eliminating OCR-induced naturalId errors.
    For A rows, OCR is still used to read the answer index (1-5).

    Returns list of row dicts:
      {page, row_index, type: 'Q'|'A', section_id: int|None, data: {col_1idx: value}}
    """
    hlines, vlines = detect_grid(page_img)

    if len(hlines) < 2:
        print(f"  [page {page_num}] No table rows detected – skipping page")
        return []

    # vlines always has at least REFERENCE_VLINES length from _refine_vlines
    n_data_cols = min(8, len(vlines) - 3)
    data_bounds = [(vlines[2 + i], vlines[3 + i]) for i in range(n_data_cols)]

    # ── Find first actual data row (skip page/table header area) ────────────
    # Scan up to 15 rows at the start; first row where ocr_row_label returns
    # Q or A is where the real table data begins.  Pages 2-11 typically start
    # at row 0; page 1 has a large header block that must be skipped.
    first_data_row = 0
    for _probe in range(min(15, len(hlines) - 1)):
        _y0, _y1 = hlines[_probe], hlines[_probe + 1]
        if (_y1 - _y0) >= 35:
            _lbl = ocr_row_label(page_img, vlines[1], _y0, vlines[2], _y1)
            if _lbl is not None:
                first_data_row = _probe
                break

    rows = []
    prev_section = None
    last_known_section = None   # carry-forward when lookup runs out
    parity = 0          # 0=Q expected, 1=A expected within a section
    data_row_count = 0  # non-hairline rows seen on this page
    # Carry Q-row data across page boundaries: if the last row of the previous
    # page was a Q row, its paired A row may be the first row of this page.
    pending_q_data = dict(initial_pending_q_data) if initial_pending_q_data else {}

    for row_i in range(first_data_row, len(hlines) - 1):
        y0, y1 = hlines[row_i], hlines[row_i + 1]
        if (y1 - y0) < 20:   # skip hairline gaps
            continue

        # ── Skip section separator rows ("Розділ N" header cells) ──────────
        # These rows divide sections visually but are not data rows; including
        # them in data_row_count would shift every subsequent section lookup.
        if ocr_section_label(page_img, vlines[0], y0, vlines[1], y1) is not None:
            continue

        # ── Section assignment (deterministic from known section sizes) ────
        gidx = global_row_offset + data_row_count
        current_section = (section_lookup[gidx]
                           if gidx < len(section_lookup) else None)
        section_inferred = False
        if current_section is None and last_known_section is not None:
            current_section = last_known_section
            section_inferred = True
        elif current_section is not None:
            last_known_section = current_section

        if current_section != prev_section:
            parity = 0
            prev_section = current_section

        # ── Row type (fully deterministic from global position) ───────────
        # ocr_row_label is unreliable (flips Q↔A on many rows); use the
        # global row index instead.  Within each section the first row is Q
        # and rows strictly alternate Q/A, so the parity within the section
        # block gives the exact type without any OCR.
        if current_section is not None:
            _sec_start = section_starts.get(current_section, gidx)
            row_type = 'Q' if (gidx - _sec_start) % 2 == 0 else 'A'
        else:
            row_type = 'Q' if parity % 2 == 0 else 'A'

        parity += 1
        data_row_count += 1

        # ── Data cells ─────────────────────────────────────────────────────
        data = {}
        if row_type == 'Q':
            # Compute expected question numbers from position — no OCR needed.
            # Within each section, rows alternate Q/A (Q at even within-section
            # offsets).  pair_idx is 0-based index of this Q/A pair.
            if current_section is not None:
                sec_start = section_starts.get(current_section, gidx)
                within_sec = gidx - sec_start
                pair_idx = within_sec // 2
                max_q = section_max_q.get(current_section, 0)
                for col in range(1, 9):
                    q_num = pair_idx * 8 + col
                    if q_num <= max_q:
                        data[col] = q_num
            pending_q_data = dict(data)   # save column→q_num for the A row
        else:  # A row – only parse columns that had a question in the Q row
            for col, q_num in pending_q_data.items():
                ci = col - 1
                if ci >= len(data_bounds):
                    continue
                x0_d, x1_d = data_bounds[ci]
                n = ocr_answer_cell(page_img, x0_d, y0, x1_d, y1)
                if n is not None:
                    data[col] = n
                elif missing_cells is not None:
                    cell_path = _save_missing_cell(
                        page_img, x0_d, y0, x1_d, y1,
                        page_num, row_i, col, q_num
                    )
                    missing_cells.append({
                        'page': page_num,
                        'row_index': row_i,
                        'column': col,
                        'questionNumber': q_num,
                        'sectionId': str(current_section) if current_section is not None else None,
                        'cellImagePath': cell_path,
                    })
            pending_q_data = {}   # consumed

        rows.append({
            'page': page_num,
            'row_index': row_i,
            'type': row_type,
            'section_id': current_section,
            'section_inferred': section_inferred,
            'data': data,
        })

    return rows, pending_q_data

def build_answers(all_rows):
    """
    Pair consecutive Q+A rows and produce answer entries.

    Returns list of:
      {"naturalId": "1-6", "sectionId": "1", "questionNumber": 6, "correctAnswerIndex": 3}
    """
    answers = []
    q_row = None   # pending Q row waiting for its A row

    for row in all_rows:
        if row['type'] == 'Q':
            q_row = row
        elif row['type'] == 'A':
            if q_row is None:
                continue  # orphaned A row, skip
            sid = row['section_id'] or q_row.get('section_id')
            if sid is None:
                q_row = None
                continue

            for col in range(1, 9):
                q_num = q_row['data'].get(col)
                a_idx = row['data'].get(col)
                if q_num is not None and a_idx is not None:
                    answers.append({
                        'naturalId':         f"{sid}-{q_num}",
                        'sectionId':         str(sid),
                        'questionNumber':    q_num,
                        'correctAnswerIndex': a_idx,
                    })
            q_row = None   # consumed

    return answers


# ─────────────────────── Merge with questions ────────────────────────────────

def merge_answers(questions, answers):
    """
    Add correctAnswerIndex to each question.

    For duplicate naturalIds (occurrence > 1), answers are applied
    in occurrence order: occurrence 1 → first answer entry for that naturalId.

    Returns (updated_questions, stats_dict).
    """
    # Group answers by naturalId, preserving order
    by_natural = defaultdict(list)
    for a in answers:
        by_natural[a['naturalId']].append(a['correctAnswerIndex'])

    matched = 0
    unmatched_answers = 0
    questions_without = 0

    # Count how many times each naturalId has been "consumed" so far
    consumed = defaultdict(int)

    updated = []
    for q in questions:
        nid = q['naturalId']
        idx = consumed[nid]
        pool = by_natural.get(nid, [])

        q_copy = dict(q)
        if len(pool) == 1:
            # Only one answer was parsed for this Q — apply to every occurrence
            # (duplicates in questions.raw.json all share the same correct answer)
            q_copy['correctAnswerIndex'] = pool[0]
            matched += 1
        elif idx < len(pool):
            q_copy['correctAnswerIndex'] = pool[idx]
            matched += 1
        else:
            questions_without += 1

        consumed[nid] += 1
        updated.append(q_copy)

    # Count answer entries that were never used
    for nid, pool in by_natural.items():
        used = consumed.get(nid, 0)
        if used < len(pool):
            unmatched_answers += len(pool) - used

    stats = {
        'totalAnswersParsed':       len(answers),
        'totalQuestions':           len(questions),
        'matched':                  matched,
        'questionsWithoutAnswer':   questions_without,
        'unmatchedAnswerEntries':   unmatched_answers,
    }
    return updated, stats


# ─────────────────────── Main ────────────────────────────────────────────────

def main():
    print(f"Opening {PDF_PATH}")
    doc = fitz.open(PDF_PATH)
    print(f"  {len(doc)} pages")

    # ── Load questions first (needed for section row layout) ─────────────────
    print(f"\nLoading {QUESTIONS_PATH}")
    with open(QUESTIONS_PATH, encoding='utf-8') as f:
        questions_data = json.load(f)
    questions = questions_data['questions']
    print(f"  {len(questions)} questions")

    section_lookup, section_starts, section_max_q = build_section_row_lookup(questions)
    print(f"  Section row lookup built: {len(section_lookup)} total section rows")

    # ── Render all pages and collect rows ────────────────────────────────────
    all_rows = []
    all_missing_cells = []
    global_row_offset = 0
    pending_q = {}   # Q-row data carried across page boundaries
    for page_i in range(len(doc)):
        page = doc[page_i]
        pix  = page.get_pixmap(matrix=fitz.Matrix(ZOOM, ZOOM))
        img  = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
        print(f"  Processing page {page_i + 1}/{len(doc)} ({img.size})…", end=' ', flush=True)
        rows, pending_q = process_page(img, page_i + 1, section_lookup, global_row_offset,
                             section_starts, section_max_q,
                             missing_cells=all_missing_cells,
                             initial_pending_q_data=pending_q)
        all_rows.extend(rows)
        global_row_offset += len(rows)
        q_count = sum(1 for r in rows if r['type'] == 'Q')
        a_count = sum(1 for r in rows if r['type'] == 'A')
        print(f"{len(rows)} rows ({q_count}Q / {a_count}A)")

    print(f"\nTotal rows: {len(all_rows)}")

    # ── Build raw answer list ─────────────────────────────────────────────────
    answers = build_answers(all_rows)
    print(f"Raw answer entries: {len(answers)}")

    # Save answers.json
    answers_path = os.path.join(OUT_DIR, 'answers.json')
    with open(answers_path, 'w', encoding='utf-8') as f:
        json.dump({'count': len(answers), 'answers': answers}, f, ensure_ascii=False, indent=2)
    print(f"Saved → {answers_path}")

    # ── Load questions and merge ──────────────────────────────────────────────
    updated_questions, stats = merge_answers(questions, answers)

    print("\n── Merge statistics ───────────────────────────────────────")
    for k, v in stats.items():
        print(f"  {k}: {v}")

    # Save questions.final.json
    final_path = os.path.join(OUT_DIR, 'questions.final.json')
    with open(final_path, 'w', encoding='utf-8') as f:
        json.dump({
            'source': questions_data.get('source', 'questions.raw.json'),
            'questionsCount': len(updated_questions),
            'questions': updated_questions,
        }, f, ensure_ascii=False, indent=2)
    print(f"\nSaved → {final_path}")

    # ── Debug report ──────────────────────────────────────────────────────────
    # Row classification
    no_section_rows    = [r for r in all_rows if r['section_id'] is None]
    inferred_rows      = [r for r in all_rows if r.get('section_inferred')]
    explicit_rows      = [r for r in all_rows if r['section_id'] is not None and not r.get('section_inferred')]

    # Questions still without answer (first 50)
    without_answer = [
        {'id': q['id'], 'naturalId': q['naturalId']}
        for q in updated_questions
        if 'correctAnswerIndex' not in q
    ][:50]

    # Duplicate naturalId answer groups
    by_natural = defaultdict(list)
    for a in answers:
        by_natural[a['naturalId']].append(a['correctAnswerIndex'])
    multi_answers = {k: v for k, v in by_natural.items() if len(v) > 1}

    # Per-section answer counts
    sec_answers = defaultdict(int)
    for a in answers:
        sec_answers[a['sectionId']] += 1

    debug = {
        'stats': stats,
        'rowsWithExplicitSection': len(explicit_rows),
        'rowsWithInferredSection': len(inferred_rows),
        'rowsWithNoSection': len(no_section_rows),
        'missingAnswerCellsCount': len(all_missing_cells),
        'inferredSectionRowSample': inferred_rows[:10],
        'noSectionRowSample': no_section_rows[:10],
        'answersPerSection': dict(sorted(sec_answers.items(), key=lambda x: int(x[0]) if str(x[0]).isdigit() else 0)),
        'missingAnswerCells': all_missing_cells,
        'firstQuestionsWithoutAnswer': without_answer,
        'naturalIdsWithMultipleAnswers': dict(list(multi_answers.items())[:20]),
        'allRows': all_rows,
    }

    debug_path = os.path.join(DEBUG_DIR, 'answers_debug.json')
    with open(debug_path, 'w', encoding='utf-8') as f:
        json.dump(debug, f, ensure_ascii=False, indent=2)
    print(f"Saved → {debug_path}")

    print("\nDone.")


if __name__ == '__main__':
    main()
