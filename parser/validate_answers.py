#!/usr/bin/env python3
"""
validate_answers.py
--------------------
Validation and repair step for the answers pipeline.

Reads  : output/questions.final.json
Writes : output/questions.final.fixed.json
         output/debug/correct_answers_validation.json

Rules
-----
* correctAnswerIndex must exist in question.answers[].index.
* If invalid  → remove it from the question, record in invalidCorrectAnswers.
* If missing  → leave it absent,              record in missingCorrectAnswers.
* Never modify question text, answer texts, images, ids, or section fields.
"""

import json
import os

# ── Paths ──────────────────────────────────────────────────────────────────────
SCRIPT_DIR   = os.path.dirname(os.path.abspath(__file__))
OUT_DIR      = os.path.join(SCRIPT_DIR, "output")
DEBUG_DIR    = os.path.join(OUT_DIR, "debug")

FINAL_IN     = os.path.join(OUT_DIR, "questions.final.json")
FIXED_OUT    = os.path.join(OUT_DIR, "questions.final.fixed.json")
VALIDATION   = os.path.join(DEBUG_DIR, "correct_answers_validation.json")

os.makedirs(DEBUG_DIR, exist_ok=True)


def validate_and_fix(questions: list[dict]) -> tuple[list[dict], dict]:
    """
    Validate correctAnswerIndex for every question.

    Returns
    -------
    fixed_questions : list of question dicts (correctAnswerIndex removed when invalid)
    debug           : validation report dict
    """
    invalid_list: list[dict] = []
    missing_list: list[dict] = []
    valid_count = 0

    fixed_questions: list[dict] = []

    for q in questions:
        q_fixed = dict(q)  # shallow copy — we only touch correctAnswerIndex

        valid_indices = {a["index"] for a in q.get("answers", [])}
        cai = q.get("correctAnswerIndex")

        if cai is None:
            missing_list.append({
                "id":        q["id"],
                "naturalId": q["naturalId"],
                "sectionId": q["sectionId"],
            })
        elif cai not in valid_indices:
            invalid_list.append({
                "id":                 q["id"],
                "naturalId":          q["naturalId"],
                "sectionId":          q["sectionId"],
                "correctAnswerIndex": cai,
                "validIndices":       sorted(valid_indices),
            })
            del q_fixed["correctAnswerIndex"]  # remove the bad value
        else:
            valid_count += 1

        fixed_questions.append(q_fixed)

    debug = {
        "stats": {
            "totalQuestions":       len(questions),
            "validCorrectAnswers":  valid_count,
            "invalidCorrectAnswers": len(invalid_list),
            "missingCorrectAnswers": len(missing_list),
        },
        "invalidCorrectAnswers": invalid_list,
        "missingCorrectAnswers": missing_list,
    }

    return fixed_questions, debug


def main() -> None:
    print(f"Loading {FINAL_IN}")
    with open(FINAL_IN, encoding="utf-8") as f:
        final = json.load(f)

    questions = final["questions"]
    print(f"  {len(questions)} questions")

    fixed_questions, debug = validate_and_fix(questions)

    stats = debug["stats"]
    print()
    print("── Validation statistics ──────────────────────────────────────────")
    print(f"  totalQuestions:         {stats['totalQuestions']}")
    print(f"  validCorrectAnswers:    {stats['validCorrectAnswers']}")
    print(f"  invalidCorrectAnswers:  {stats['invalidCorrectAnswers']}")
    print(f"  missingCorrectAnswers:  {stats['missingCorrectAnswers']}")

    # Write fixed questions (preserve all other top-level keys)
    fixed_output = dict(final)
    fixed_output["questions"] = fixed_questions
    with open(FIXED_OUT, "w", encoding="utf-8") as f:
        json.dump(fixed_output, f, ensure_ascii=False, indent=2)
    print(f"\nSaved → {FIXED_OUT}")

    with open(VALIDATION, "w", encoding="utf-8") as f:
        json.dump(debug, f, ensure_ascii=False, indent=2)
    print(f"Saved → {VALIDATION}")


if __name__ == "__main__":
    main()
