#!/usr/bin/env python3
"""
repair_correct_answers.py

Re-OCRs invalid/missing answer cells with question-specific valid ranges to
recover correctAnswerIndex values that were out-of-range or missing.

Inputs:
  output/questions.final.json               – all questions (valid + invalid)
  output/questions.final.fixed.json         – invalid correctAnswerIndex removed
  output/debug/answers_debug.json           – allRows, cell locations
  output/debug/correct_answers_validation.json  – invalid + missing lists
  answers.pdf                               – source answer key PDF

Outputs:
  output/questions.final.repaired.json          – fixed.json + repaired values
  output/debug/correct_answers_repair.json      – stats + per-target results
  output/debug/manual_correct_answers_needed.json  – still-unresolved targets
"""

import copy
import json
import os
import re
import sys

import fitz  # PyMuPDF
import pytesseract
from PIL import Image

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, SCRIPT_DIR)

from build_answers import (
    PAD_B, PAD_L, PAD_R, PAD_T, ZOOM,
    detect_grid, make_ocr_image,
)

# ─── Paths ────────────────────────────────────────────────────────────────────

OUT_DIR    = os.path.join(SCRIPT_DIR, 'output')
DEBUG_DIR  = os.path.join(OUT_DIR, 'debug')
MANUAL_DIR = os.path.join(DEBUG_DIR, 'manual_cells')

PDF_PATH      = os.path.join(SCRIPT_DIR, 'answers.pdf')
FINAL_JSON    = os.path.join(OUT_DIR, 'questions.final.json')
FIXED_JSON    = os.path.join(OUT_DIR, 'questions.final.fixed.json')
DEBUG_JSON    = os.path.join(DEBUG_DIR, 'answers_debug.json')
VALID_JSON    = os.path.join(DEBUG_DIR, 'correct_answers_validation.json')

REPAIRED_JSON     = os.path.join(OUT_DIR, 'questions.final.repaired.json')
REPAIR_DEBUG_JSON = os.path.join(DEBUG_DIR, 'correct_answers_repair.json')
MANUAL_JSON       = os.path.join(DEBUG_DIR, 'manual_correct_answers_needed.json')

os.makedirs(MANUAL_DIR, exist_ok=True)


# ─── OCR ──────────────────────────────────────────────────────────────────────

_ONE_CHARS = frozenset('|IlіІ!1')


def _parse_digit(raw, lo, hi):
    """Strip noise, map pipe/I/l → 1, return int in [lo,hi] or None."""
    t = re.sub(r'[^0-9|IlіІ!]', '', raw)
    t = ''.join('1' if c in _ONE_CHARS else c for c in t)
    t = re.sub(r'^0+', '', t)
    if t and t.isdigit():
        v = int(t)
        if lo <= v <= hi:
            return v
    return None


def _ocr_fast(cell_img, lo, hi):
    """
    Fast single-digit OCR: PSM 10 (single character) + PSM 8 (single word),
    English digit whitelist only.  Returns int in [lo,hi] or None.
    """
    for psm in (10, 8):
        t = pytesseract.image_to_string(
            cell_img, lang='eng',
            config=f'--psm {psm} -c tessedit_char_whitelist=0123456789',
        ).strip()
        v = _parse_digit(t, lo, hi)
        if v is not None:
            return v
    return None

def ocr_cell_restricted(img, x0, y0, x1, y1, hi, thorough=False):
    """
    Re-OCR an answer cell accepting only values in [1, hi].

    Uses _ocr_fast (PSM 10+8, English) for each preprocessing variant instead
    of the full 8-PSM ocr_number, making the repair ~4x faster per call.

    ``thorough=True`` tries all 18 strategies (used for originally-missing cells).
    ``thorough=False`` tries 8 diverse strategies (used for out-of-range cells).

    Returns (int, strategy_index) on success, or (None, None) on failure.
    """
    lo = 1
    dy = max(1, (y1 - y0) // 3)

    # (threshold, pad_l, pad_r, pad_t, pad_b, dilate_kw, y0_offset, y1_offset)
    base_strategies = [
        (180, PAD_L, PAD_R, PAD_T, PAD_B, 0,   0,    0),   # 0  default
        (120, PAD_L, PAD_R, PAD_T, PAD_B, 0,   0,    0),   # 1  very low threshold
        (140, PAD_L, PAD_R, PAD_T, PAD_B, 0,   0,    0),   # 2  low threshold
        (200, PAD_L, PAD_R, PAD_T, PAD_B, 0,   0,    0),   # 3  high threshold
        (160, PAD_L, PAD_R, PAD_T, PAD_B, 5,   0,    0),   # 4  lower + heavy dilate
        (160, 2,     1,     2,     2,      0,   0,    0),   # 5  minimal crop
        (160, PAD_L, PAD_R, PAD_T, PAD_B, 0,  dy,    0),   # 6  skip top third
        (160, PAD_L, PAD_R, PAD_T, PAD_B, 0,   0,  -dy),   # 7  skip bottom third
    ]
    extended_strategies = [
        (180, PAD_L, PAD_R, PAD_T, PAD_B, 3,   0,    0),   # 8  default + dilation
        (160, PAD_L, PAD_R, PAD_T, PAD_B, 0,   0,    0),   # 9  lower threshold
        (160, 3,     1,     4,     4,      0,   0,    0),   # 10 tight crop
        (160, 8,     4,     8,     8,      0,   0,    0),   # 11 wide crop
        (140, 2,     1,     2,     2,      0,   0,    0),   # 12 minimal + very low
        (160, 3,     1,     4,     4,      3,   0,    0),   # 13 tight + dilate
        (120, 3,     1,     4,     4,      3,   0,    0),   # 14 very low + tight + dilate
        (140, PAD_L, PAD_R, PAD_T, PAD_B, 0,  dy,    0),   # 15 skip top + lower
        (120, PAD_L, PAD_R, PAD_T, PAD_B, 0,  dy,    0),   # 16 skip top + very low
        (140, PAD_L, PAD_R, PAD_T, PAD_B, 0,   0,  -dy),   # 17 skip bottom + lower
    ]

    strategies = base_strategies + (extended_strategies if thorough else [])

    for idx, (thresh, pl, pr, pt, pb, dkw, dy0, dy1) in enumerate(strategies):
        eff_y0 = y0 + dy0
        eff_y1 = y1 + dy1  # dy1 is negative → shortens from bottom
        if eff_y1 - eff_y0 < 6:
            continue
        cell_img = make_ocr_image(
            img, x0, eff_y0, x1, eff_y1,
            pad_l=pl, pad_r=pr, pad_t=pt, pad_b=pb,
            dilate_kw=dkw, threshold=thresh,
        )
        n = _ocr_fast(cell_img, lo, hi)
        if n is not None:
            return n, idx
    return None, None


# ─── Cell-location helpers ────────────────────────────────────────────────────

def build_qa_lookup(all_rows):
    """
    Build a lookup: (str_section_id, int_q_num) → {col, a_page, a_row_index}.

    allRows Q-row data keys are serialised as JSON strings ("1"–"8");
    values are question numbers (int after JSON parse).
    The paired A-row is always the next type='A' entry after each Q-row.
    """
    lookup = {}
    for i, row in enumerate(all_rows):
        if row['type'] != 'Q':
            continue
        sec = str(row['section_id'])
        # Find paired A row (normally immediately next entry)
        a_row = None
        for j in range(i + 1, min(i + 4, len(all_rows))):
            if all_rows[j]['type'] == 'A':
                a_row = all_rows[j]
                break
        if a_row is None:
            continue
        for col_str, q_num in row['data'].items():
            key = (sec, int(q_num))
            if key not in lookup:   # keep first (canonical) occurrence
                lookup[key] = {
                    'col':        int(col_str),
                    'a_page':     a_row['page'],
                    'a_row_index': a_row['row_index'],
                }
    return lookup


def load_page_grids(pdf_path):
    """
    Render every PDF page at ZOOM and run detect_grid.
    Returns dict: page_num (1-indexed) → (PIL.Image, hlines, vlines).
    """
    doc = fitz.open(pdf_path)
    grids = {}
    for i in range(len(doc)):
        page_num = i + 1
        pix = doc[i].get_pixmap(matrix=fitz.Matrix(ZOOM, ZOOM))
        img = Image.frombytes('RGB', [pix.width, pix.height], pix.samples)
        hlines, vlines = detect_grid(img)
        grids[page_num] = (img, hlines, vlines)
        print(f'  page {page_num}: {len(hlines)} hlines, {len(vlines)} vlines')
    doc.close()
    return grids


def save_manual_cell(img, x0, y0, x1, y1, natural_id, reason):
    """Crop and save the raw cell image for manual inspection."""
    fname = f"{natural_id.replace('-', '_')}_{reason}.png"
    fpath = os.path.join(MANUAL_DIR, fname)
    raw = img.crop((max(0, x0 - 2), max(0, y0 - 2), x1 + 2, y1 + 2))
    raw.save(fpath)
    return os.path.relpath(fpath, SCRIPT_DIR)


# ─── Main ─────────────────────────────────────────────────────────────────────

def main():
    # ── Load inputs ──────────────────────────────────────────────────────────
    print(f'Loading {FINAL_JSON}')
    final_data = json.load(open(FINAL_JSON, encoding='utf-8'))

    print(f'Loading {FIXED_JSON}')
    fixed_data = json.load(open(FIXED_JSON, encoding='utf-8'))

    print(f'Loading {DEBUG_JSON}')
    debug_data = json.load(open(DEBUG_JSON, encoding='utf-8'))
    all_rows = debug_data['allRows']

    print(f'Loading {VALID_JSON}')
    validation = json.load(open(VALID_JSON, encoding='utf-8'))

    # ── Per-naturalId derived data ────────────────────────────────────────────
    # Use the *original* final (with invalid values) to confirm occurrences;
    # use fixed (invalid removed) as the base for the repaired output.
    questions_original = final_data['questions']
    questions_fixed    = fixed_data['questions']

    # naturalId → sorted valid indices as INTERSECTION across all occurrences.
    # Using the intersection guarantees any repaired value is valid for every
    # occurrence, even when different copies of the same naturalId have different
    # option counts (a data-quality edge case found in section 15).
    nat_valid_sets: dict[str, set[int]] = {}   # naturalId → intersection set
    # naturalId → per-occurrence valid index sets (for per-occurrence apply check)
    nat_occ_valid: dict[str, list[set[int]]] = {}
    # naturalId → list of indices in questions_fixed
    nat_q_indices: dict[str, list[int]] = {}
    for i, q in enumerate(questions_fixed):
        nat = q['naturalId']
        nat_q_indices.setdefault(nat, []).append(i)
        occ_valid = frozenset(a['index'] for a in q.get('answers', []))
        nat_occ_valid.setdefault(nat, []).append(occ_valid)

    for nat, occ_sets in nat_occ_valid.items():
        non_empty = [s for s in occ_sets if s]
        nat_valid_sets[nat] = set.intersection(*[set(s) for s in non_empty]) if non_empty else set()

    def nat_valid_indices_sorted(nat: str) -> list[int]:
        return sorted(nat_valid_sets.get(nat, set()))

    # ── Collect unique repair targets ─────────────────────────────────────────
    # Deduplicate: one entry per naturalId (same cell in PDF for all occurrences).
    targets: dict[str, dict] = {}

    for item in validation['invalidCorrectAnswers']:
        nat = item['naturalId']
        targets.setdefault(nat, {
            'naturalId':    nat,
            'sectionId':    str(item['sectionId']),
            'reason':       'invalid',
            'originalValue': item['correctAnswerIndex'],
            'validIndices': item['validIndices'],
        })

    for item in validation['missingCorrectAnswers']:
        nat = item['naturalId']
        if nat not in targets:
            targets[nat] = {
                'naturalId':    nat,
                'sectionId':    str(item['sectionId']),
                'reason':       'missing',
                'originalValue': None,
                'validIndices': nat_valid_indices_sorted(nat),
            }

    n_invalid = sum(1 for t in targets.values() if t['reason'] == 'invalid')
    n_missing = sum(1 for t in targets.values() if t['reason'] == 'missing')
    print(f'\nRepair targets: {len(targets)} unique naturalIds')
    print(f'  invalid: {n_invalid}  missing: {n_missing}')

    # ── Cell-location lookup ──────────────────────────────────────────────────
    print('\nBuilding Q/A cell location lookup …')
    qa_lookup = build_qa_lookup(all_rows)
    print(f'  {len(qa_lookup)} cell locations indexed')

    # ── Render PDF and compute grids ──────────────────────────────────────────
    print(f'\nRendering PDF pages from {PDF_PATH} …')
    page_grids = load_page_grids(pdf_path=PDF_PATH)
    print(f'  {len(page_grids)} pages loaded')

    # ── Repair loop ───────────────────────────────────────────────────────────
    # Work on a deep copy of the *fixed* questions list (invalid values already
    # removed).  Successful repairs will set correctAnswerIndex; failures stay
    # missing.
    repaired_questions = copy.deepcopy(questions_fixed)

    repaired_list: list[dict] = []
    manual_list:   list[dict] = []
    not_located:   list[dict] = []

    n_total = len(targets)
    print(f'\nProcessing {n_total} targets …')
    for t_idx, (nat, target) in enumerate(sorted(targets.items())):
        sec   = target['sectionId']
        parts = nat.split('-')
        q_num = int(parts[1]) if len(parts) >= 2 else -1

        valid_indices = nat_valid_indices_sorted(nat)
        hi = max(valid_indices) if valid_indices else 0

        if (t_idx + 1) % 20 == 0 or t_idx == 0:
            print(f'  [{t_idx + 1}/{n_total}] {nat}  hi={hi}', flush=True)

        if hi == 0:
            not_located.append({
                'naturalId': nat,
                'reason':    'no_valid_answer_indices_for_question',
            })
            continue

        # Locate cell in allRows
        cell_info = qa_lookup.get((sec, q_num))
        if cell_info is None:
            not_located.append({
                'naturalId':      nat,
                'sectionId':      sec,
                'questionNumber': q_num,
                'reason':         'not_found_in_allrows',
            })
            continue

        col         = cell_info['col']
        a_page      = cell_info['a_page']
        a_row_idx   = cell_info['a_row_index']

        if a_page not in page_grids:
            not_located.append({
                'naturalId': nat,
                'reason':    f'page_{a_page}_not_in_pdf',
            })
            continue

        img, hlines, vlines = page_grids[a_page]

        if a_row_idx + 1 >= len(hlines):
            not_located.append({
                'naturalId':   nat,
                'reason':      'row_index_out_of_bounds',
                'a_row_index': a_row_idx,
                'n_hlines':    len(hlines),
            })
            continue

        # col is 1-indexed; data_bounds in build_answers uses vlines[2+ci]
        # where ci = col-1, so x0=vlines[col+1], x1=vlines[col+2].
        if col + 2 > len(vlines):
            not_located.append({
                'naturalId': nat,
                'reason':    'col_out_of_vlines',
                'col':       col,
                'n_vlines':  len(vlines),
            })
            continue

        y0 = hlines[a_row_idx]
        y1 = hlines[a_row_idx + 1]
        x0 = vlines[col + 1]
        x1 = vlines[col + 2]

        # Re-OCR with question-specific hi.
        # Use thorough (all 18 strategies) for cells that were completely
        # missing; use the faster 8-strategy set for out-of-range cells.
        thorough = (target['reason'] == 'missing')
        value, strat_idx = ocr_cell_restricted(img, x0, y0, x1, y1, hi,
                                               thorough=thorough)

        q_indices    = nat_q_indices.get(nat, [])
        n_occurrences = len(q_indices)

        if value is not None:
            # Apply only to occurrences where the value is within their own
            # valid index set (handles cross-occurrence option-count differences).
            occ_valids = nat_occ_valid.get(nat, [])
            applied_count = 0
            for idx_in_occ, qi in enumerate(q_indices):
                occ_v = occ_valids[idx_in_occ] if idx_in_occ < len(occ_valids) else set()
                if value in occ_v:
                    repaired_questions[qi]['correctAnswerIndex'] = value
                    applied_count += 1
            repaired_list.append({
                'naturalId':      nat,
                'sectionId':      sec,
                'questionNumber': q_num,
                'originalValue':  target['originalValue'],
                'repairedValue':  value,
                'validIndices':   valid_indices,
                'hi':             hi,
                'strategyIndex':  strat_idx,
                'appliedOccurrences': applied_count,
                'totalOccurrences':   n_occurrences,
                'reason':         target['reason'],
            })
        else:
            cell_img_path = save_manual_cell(
                img, x0, y0, x1, y1, nat, target['reason']
            )
            manual_list.append({
                'naturalId':      nat,
                'sectionId':      sec,
                'questionNumber': q_num,
                'reason':         target['reason'],
                'originalValue':  target['originalValue'],
                'validIndices':   valid_indices,
                'totalOccurrences':   n_occurrences,
                'cellImagePath':  cell_img_path,
                'page':           a_page,
                'rowIndex':       a_row_idx,
                'col':            col,
            })

    # ── Statistics ────────────────────────────────────────────────────────────
    total_targets  = len(targets)
    repaired_count = len(repaired_list)
    manual_count   = len(manual_list)
    not_located_count = len(not_located)
    repair_rate    = repaired_count / total_targets if total_targets else 0.0

    print()
    print('── Repair statistics ─────────────────────────────────────────────────')
    print(f'  totalTargets:     {total_targets}')
    print(f'  repairedCount:    {repaired_count}')
    print(f'  stillManualCount: {manual_count}')
    print(f'  notLocated:       {not_located_count}')
    print(f'  repairRate:       {repair_rate * 100:.1f}%')

    # ── Write outputs ─────────────────────────────────────────────────────────
    output_data = dict(fixed_data)
    output_data['questions'] = repaired_questions
    with open(REPAIRED_JSON, 'w', encoding='utf-8') as f:
        json.dump(output_data, f, ensure_ascii=False, indent=2)
    print(f'\nSaved → {REPAIRED_JSON}')

    repair_debug = {
        'stats': {
            'totalTargets':     total_targets,
            'repairedCount':    repaired_count,
            'stillManualCount': manual_count,
            'notLocated':       not_located_count,
            'repairRate':       round(repair_rate, 4),
        },
        'repaired':   repaired_list,
        'notLocated': not_located,
    }
    with open(REPAIR_DEBUG_JSON, 'w', encoding='utf-8') as f:
        json.dump(repair_debug, f, ensure_ascii=False, indent=2)
    print(f'Saved → {REPAIR_DEBUG_JSON}')

    with open(MANUAL_JSON, 'w', encoding='utf-8') as f:
        json.dump(manual_list, f, ensure_ascii=False, indent=2)
    print(f'Saved → {MANUAL_JSON}')


if __name__ == '__main__':
    main()
