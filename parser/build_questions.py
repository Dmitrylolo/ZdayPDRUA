import fitz
import json
import re
import shutil
from pathlib import Path

fitz.TOOLS.mupdf_display_errors(False)
fitz.TOOLS.mupdf_display_warnings(False)

PDF_PATH = Path("questions.pdf")
OUT_DIR = Path("output")
IMAGES_DIR = OUT_DIR / "images"
DEBUG_DIR = OUT_DIR / "debug"

QUESTION_RE = re.compile(r"^(\d+)\.(?!\d)\s*")  # (?!\d) — не збігатись з десятковими '30.5 км'
ANSWER_RE = re.compile(r"^([1-9])\)\s*")  # \s* — handles '1)Text' and '1)\nText' formats

OUT_DIR.mkdir(exist_ok=True)

# Clean previous output so stale images / debug files don't accumulate
for _dir in (IMAGES_DIR, DEBUG_DIR):
    if _dir.exists():
        shutil.rmtree(_dir)
    _dir.mkdir(parents=True)

doc = fitz.open(PDF_PATH)

questions = []
seen_natural_ids: dict[str, int] = {}  # naturalId → occurrence count (also drives duplicate detection)
current_section_id = None
current_section_title = None

# Debug tracking
debug_no_answers: list[str] = []          # question IDs with no answers
debug_embedded: list[str] = []            # question IDs where another question was detected mid-parse
debug_duplicate_ids: list[str] = []       # question IDs that appeared more than once
debug_duplicate_answer_idx: list[str] = [] # question IDs with repeated answer indices
debug_artifacts: list[str] = []            # skipped: text too short to be a real question
debug_page_num_artifacts: list[str] = []   # naturalIds where trailing page numbers were stripped from answers


def block_text(block):
    lines = []
    for line in block.get("lines", []):
        text = "".join(span["text"] for span in line.get("spans", []))
        if text.strip():
            lines.append(text.strip())
    return "\n".join(lines).strip()


def finalize_answer(
    current_answer: dict | None,
    answers: list,
    seen_answer_indices: dict,
) -> bool:
    """Append current_answer to answers. Merges text if index is duplicate. Returns True on duplicate."""
    if current_answer is None:
        return False
    idx = current_answer["index"]
    if idx in seen_answer_indices:
        seen_answer_indices[idx]["text"] += " " + current_answer["text"].strip()
        return True
    seen_answer_indices[idx] = current_answer
    answers.append(current_answer)
    return False


# ─── Phase 1: collect all text / image data across every page ────────────────
# Flat lines carry page number and the section context active at that point,
# so question detection and parsing can work across page boundaries.
all_flat_lines: list[dict] = []   # {text, bbox, page, section_id, section_title}
page_meta: dict[int, dict] = {}   # page_number → {image_blocks, height, width}

for page_index, page in enumerate(doc):
    page_number = page_index + 1
    page_dict = page.get_text("dict")
    blocks = page_dict["blocks"]

    # debug page render
    pix = page.get_pixmap(matrix=fitz.Matrix(1.5, 1.5))
    pix.save(DEBUG_DIR / f"page_{page_number:03}.png")

    text_blocks = []
    image_blocks = []

    for block in blocks:
        bbox = fitz.Rect(block["bbox"])
        if block["type"] == 0:
            text = block_text(block)
            if text:
                text_blocks.append({"bbox": bbox, "text": text})
        elif block["type"] == 1:
            image_blocks.append({"bbox": bbox})

    text_blocks.sort(key=lambda b: (b["bbox"].y0, b["bbox"].x0))

    page_meta[page_number] = {
        "image_blocks": image_blocks,
        "height": page.rect.height,
        "width": page.rect.width,
    }

    # Build flat lines; update section context inline as headers are encountered
    # so every line carries the correct section_id/title at its position.
    for b in text_blocks:
        t = b["text"].replace("\n", " ").strip()
        if re.match(r"^\d+\.\s*[А-ЯІЇЄҐA-Z]", t) and t.isupper():
            parts = t.split(".", 1)
            current_section_id = parts[0].strip()
            current_section_title = parts[1].strip()
        for raw_line in b["text"].split("\n"):
            stripped = raw_line.strip()
            if stripped:
                all_flat_lines.append({
                    "text": stripped,
                    "bbox": b["bbox"],
                    "page": page_number,
                    "section_id": current_section_id,
                    "section_title": current_section_title,
                })

# ─── Phase 2: detect question starts across the full document ─────────────────
starts = []
for li, fl in enumerate(all_flat_lines):
    match = QUESTION_RE.match(fl["text"])
    if not match:
        continue
    number = int(match.group(1))
    # Must be at the left margin (not an answer or indented continuation)
    if fl["bbox"].x0 >= 120:
        continue
    # Skip section-title lines (entirely uppercase, e.g. "1. ЗАГАЛЬНІ ПОЛОЖЕННЯ")
    text = fl["text"]
    if any(c.isalpha() for c in text) and text == text.upper():
        continue
    # Skip bare numbers with no meaningful content (e.g. "1." alone)
    if len(text) <= 4:
        continue
    starts.append({"line_idx": li, "number": number})

# ─── Phase 3: parse questions (now cross-page safe) ───────────────────────────
for i, start in enumerate(starts):
    end_line_idx = starts[i + 1]["line_idx"] if i + 1 < len(starts) else len(all_flat_lines)

    fl_start = all_flat_lines[start["line_idx"]]
    q_page = fl_start["page"]
    start_y = fl_start["bbox"].y0

    lines = [fl["text"] for fl in all_flat_lines[start["line_idx"]:end_line_idx]]

    if not lines:
        continue

    question_lines: list[str] = []
    answers: list[dict] = []
    current_answer: dict | None = None
    seen_answer_indices: dict[int, dict] = {}
    has_dup_answer_idx = False
    embedded_found = False

    for line in lines:
        answer_match = ANSWER_RE.match(line)
        q_match = QUESTION_RE.match(line)

        # Safety net: a question number appearing after answers have already
        # started means a question was not split by the starts detection
        # (e.g. its x0 was just outside the threshold).  Stop here so the
        # stray text doesn't corrupt the current question's last answer.
        if q_match and answers and int(q_match.group(1)) != start["number"]:
            embedded_found = True
            break

        if answer_match:
            dup = finalize_answer(current_answer, answers, seen_answer_indices)
            has_dup_answer_idx = has_dup_answer_idx or dup
            current_answer = {
                "index": int(answer_match.group(1)),
                "text": ANSWER_RE.sub("", line).strip(),
            }
        else:
            if current_answer is not None:
                # Check for embedded question mid-line: "...засобів. 6.Що означає..."
                em = re.search(r'(?<=[.!?»])\s+\d+\.\s*[А-ЯІЇЄҐ]', line)
                if em:
                    pre = line[:em.start()].strip()
                    if pre:
                        current_answer["text"] = (current_answer["text"] + " " + pre).strip()
                    embedded_found = True
                    break
                # strip keeps text clean when answer started with a bare '1)' line
                current_answer["text"] = (current_answer["text"] + " " + line).strip()
            else:
                question_lines.append(line)

    dup = finalize_answer(current_answer, answers, seen_answer_indices)
    has_dup_answer_idx = has_dup_answer_idx or dup

    question_text = "\n".join(question_lines).strip()
    question_text = QUESTION_RE.sub("", question_text, count=1).strip()

    natural_id = f"{fl_start['section_id'] or 'unknown'}-{start['number']}"

    # Strip trailing page-number artifacts from answer text (e.g. "Варіант 1 та 2. 5")
    for ans in answers:
        cleaned = re.sub(r'(?<=[.!?»])\s+\d{1,3}$', '', ans['text'])
        if cleaned != ans['text']:
            ans['text'] = cleaned
            if natural_id not in debug_page_num_artifacts:
                debug_page_num_artifacts.append(natural_id)

    # Skip obvious artifacts: captions / labels that matched QUESTION_RE but are
    # not real questions (e.g. "1. Дозволено." or "2. Заборонено.»").
    if len(question_text) < 14:
        debug_artifacts.append(f"{natural_id} (p{q_page}): {question_text!r}")
        continue

    occurrence = seen_natural_ids.get(natural_id, 0) + 1
    seen_natural_ids[natural_id] = occurrence
    question_id = f"{natural_id}-{occurrence}"

    # --- debug tracking ---
    if not answers:
        debug_no_answers.append(question_id)
    if embedded_found:
        debug_embedded.append(question_id)
    if has_dup_answer_idx:
        debug_duplicate_answer_idx.append(question_id)
    if occurrence > 1:
        debug_duplicate_ids.append(question_id)

    # Image extraction: from the question's start page, y-range [start_y, end_y].
    # end_y = y0 of the next question if it's on the same page, else full page height.
    pm = page_meta[q_page]
    if end_line_idx < len(all_flat_lines) and all_flat_lines[end_line_idx]["page"] == q_page:
        end_y = all_flat_lines[end_line_idx]["bbox"].y0
    else:
        end_y = pm["height"]

    image_file = None
    related_images = [
        img for img in pm["image_blocks"]
        if img["bbox"].y0 >= start_y and img["bbox"].y0 < end_y
    ]

    if related_images:
        rect = related_images[0]["bbox"]
        for img in related_images[1:]:
            rect |= img["bbox"]

        rect.x0 = max(0, rect.x0 - 4)
        rect.y0 = max(0, rect.y0 - 4)
        rect.x1 = min(pm["width"], rect.x1 + 4)
        rect.y1 = min(pm["height"], rect.y1 + 4)

        image_file = f"{question_id}.png"
        pix = doc[q_page - 1].get_pixmap(matrix=fitz.Matrix(2, 2), clip=rect)
        pix.save(IMAGES_DIR / image_file)

    questions.append({
        "id": question_id,
        "naturalId": natural_id,
        "occurrence": occurrence,
        "sectionId": fl_start["section_id"],
        "sectionTitle": fl_start["section_title"],
        "number": start["number"],
        "page": q_page,
        "text": question_text,
        "answers": answers,
        "image": image_file,
    })

with open(OUT_DIR / "questions.raw.json", "w", encoding="utf-8") as f:
    json.dump({
        "source": "questions.pdf",
        "questionsCount": len(questions),
        "questions": questions,
    }, f, ensure_ascii=False, indent=2)

print(f"Done. Questions parsed: {len(questions)}")
print(f"JSON: {OUT_DIR / 'questions.raw.json'}")
print(f"Images: {IMAGES_DIR}")

# --- Debug report ---
print("\n--- Debug Report ---")
print(f"No answers               ({len(debug_no_answers)}): {debug_no_answers or 'none'}")
print(f"Embedded question splits ({len(debug_embedded)}): {debug_embedded or 'none'}")
print(f"Duplicate question IDs   ({len(debug_duplicate_ids)}): {debug_duplicate_ids or 'none'}")
print(f"Duplicate answer indices ({len(debug_duplicate_answer_idx)}): {debug_duplicate_answer_idx or 'none'}")
print(f"Artifacts skipped        ({len(debug_artifacts)}): {debug_artifacts or 'none'}")
print(f"Page num artifacts       ({len(debug_page_num_artifacts)}): {debug_page_num_artifacts or 'none'}")

debug_report = {
    "no_answers": debug_no_answers,
    "embedded_questions": debug_embedded,
    "duplicate_ids": debug_duplicate_ids,
    "duplicate_answer_indices": debug_duplicate_answer_idx,
    "artifacts_skipped": debug_artifacts,
    "page_num_artifacts": debug_page_num_artifacts,
}
with open(DEBUG_DIR / "debug_report.json", "w", encoding="utf-8") as f:
    json.dump(debug_report, f, ensure_ascii=False, indent=2)
print(f"Debug report saved: {DEBUG_DIR / 'debug_report.json'}")