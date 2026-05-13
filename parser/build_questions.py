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

QUESTION_RE = re.compile(r"^(\d+)\.\s+")
ANSWER_RE = re.compile(r"^([1-9])\)\s+")

OUT_DIR.mkdir(exist_ok=True)

# Clean previous output so stale images / debug files don't accumulate
for _dir in (IMAGES_DIR, DEBUG_DIR):
    if _dir.exists():
        shutil.rmtree(_dir)
    _dir.mkdir(parents=True)

doc = fitz.open(PDF_PATH)

questions = []
question_counter = 0          # global sequential ID (always unique)
seen_natural_ids: dict[str, int] = {}  # sectionId-number → count (for dup tracking only)
current_section_id = None
current_section_title = None

# Debug tracking
debug_no_answers: list[str] = []          # question IDs with no answers
debug_embedded: list[str] = []            # question IDs where another question was detected mid-parse
debug_duplicate_ids: list[str] = []       # question IDs that appeared more than once
debug_duplicate_answer_idx: list[str] = [] # question IDs with repeated answer indices


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
                text_blocks.append({
                    "bbox": bbox,
                    "text": text,
                })

        elif block["type"] == 1:
            image_blocks.append({
                "bbox": bbox,
            })

    text_blocks.sort(key=lambda b: (b["bbox"].y0, b["bbox"].x0))

    # find section title (unchanged logic)
    for b in text_blocks:
        t = b["text"].replace("\n", " ").strip()
        if re.match(r"^\d+\.\s+[А-ЯІЇЄҐA-Z]", t) and t.isupper():
            parts = t.split(".", 1)
            current_section_id = parts[0].strip()
            current_section_title = parts[1].strip()

    # Build a flat list of every individual line with its containing block bbox.
    # This lets us detect question starts inside any line of any block, not just
    # the first line, fixing the "multiple questions in one block" problem.
    flat_lines: list[dict] = []
    for b in text_blocks:
        for raw_line in b["text"].split("\n"):
            stripped = raw_line.strip()
            if stripped:
                flat_lines.append({"text": stripped, "bbox": b["bbox"]})

    # Detect question starts by scanning every flat line.
    starts = []
    for li, fl in enumerate(flat_lines):
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
        starts.append({"line_idx": li, "number": number, "y": fl["bbox"].y0})

    for i, start in enumerate(starts):
        end_line_idx = starts[i + 1]["line_idx"] if i + 1 < len(starts) else len(flat_lines)

        # y-range for image detection derived from flat_lines bboxes
        start_y = flat_lines[start["line_idx"]]["bbox"].y0
        end_y = (
            flat_lines[end_line_idx]["bbox"].y0
            if end_line_idx < len(flat_lines)
            else page.rect.height
        )

        lines = [fl["text"] for fl in flat_lines[start["line_idx"]:end_line_idx]]

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
                    current_answer["text"] += " " + line
                else:
                    question_lines.append(line)

        dup = finalize_answer(current_answer, answers, seen_answer_indices)
        has_dup_answer_idx = has_dup_answer_idx or dup

        question_text = "\n".join(question_lines).strip()
        # remove question number from question text
        question_text = QUESTION_RE.sub("", question_text, count=1).strip()

        # Global sequential ID — always unique regardless of section structure.
        # natural_id (sectionId-number) is kept for debug tracking only.
        question_counter += 1
        question_id = str(question_counter)
        natural_id = f"{current_section_id or 'unknown'}-{start['number']}"

        # --- debug tracking ---
        if not answers:
            debug_no_answers.append(natural_id)
        if embedded_found:
            debug_embedded.append(natural_id)
        if has_dup_answer_idx:
            debug_duplicate_answer_idx.append(natural_id)
        if natural_id in seen_natural_ids:
            seen_natural_ids[natural_id] += 1
            debug_duplicate_ids.append(natural_id)
        else:
            seen_natural_ids[natural_id] = 1

        image_file = None

        related_images = [
            img for img in image_blocks
            if img["bbox"].y0 >= start_y and img["bbox"].y0 < end_y
        ]

        if related_images:
            # crop combined area of all images related to this question
            rect = related_images[0]["bbox"]
            for img in related_images[1:]:
                rect |= img["bbox"]

            # add small padding
            rect.x0 = max(0, rect.x0 - 4)
            rect.y0 = max(0, rect.y0 - 4)
            rect.x1 = min(page.rect.width, rect.x1 + 4)
            rect.y1 = min(page.rect.height, rect.y1 + 4)

            image_file = f"{question_id}.png"
            pix = page.get_pixmap(matrix=fitz.Matrix(2, 2), clip=rect)
            pix.save(IMAGES_DIR / image_file)

        questions.append({
            "id": question_id,
            "sectionId": current_section_id,
            "sectionTitle": current_section_title,
            "number": start["number"],
            "page": page_number,
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

debug_report = {
    "no_answers": debug_no_answers,
    "embedded_questions": debug_embedded,
    "duplicate_ids": debug_duplicate_ids,
    "duplicate_answer_indices": debug_duplicate_answer_idx,
}
with open(DEBUG_DIR / "debug_report.json", "w", encoding="utf-8") as f:
    json.dump(debug_report, f, ensure_ascii=False, indent=2)
print(f"Debug report saved: {DEBUG_DIR / 'debug_report.json'}")