#!/usr/bin/env python3
"""
build_explanations.py

Generate local explanations for Ukrainian driving exam questions by matching
each question+answer combination against PDR rules using TF-IDF cosine
similarity.  No paid API or external LLM is used.  Explanations are built
from templates filled with the best-matching PDR rule excerpt.

Inputs:
  parser/output/questions.final.json
  parser/output/pdr_rules.json

Outputs:
  parser/output/explanations.json
  parser/output/questions.enriched.json
  parser/output/debug/explanations_debug.json

Explanation entry format:
  {
    "questionId":    "1-6-1",
    "pdrReferences": ["1.10"],
    "explanation":   "Питання стосується…",
    "confidence":    0.87
  }
"""

import json
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path

import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

# ─────────────────────────────── Paths ────────────────────────────────────────

SCRIPT_DIR    = Path(__file__).parent
QUESTIONS_F   = SCRIPT_DIR / "output" / "questions.final.json"
RULES_F       = SCRIPT_DIR / "output" / "pdr_rules.json"
OUTPUT_DIR    = SCRIPT_DIR / "output"
DEBUG_DIR     = OUTPUT_DIR / "debug"

EXPLANATIONS_F = OUTPUT_DIR / "explanations.json"
ENRICHED_F     = OUTPUT_DIR / "questions.enriched.json"
DEBUG_F        = DEBUG_DIR  / "explanations_debug.json"

# ─────────────────────────────── Config ───────────────────────────────────────

RAW_THRESHOLD  = 0.07   # cosine scores below this → no explanation produced
MAX_REFS       = 3      # max PDR rule IDs per question
SECTION_BOOST  = 1.4    # cosine multiplier for same-section PDR rules
CONF_SCALE     = 2.5    # confidence = min(1, raw_cosine * CONF_SCALE)
PDR_SECTION_MAX = 34    # question sections 1–34 have direct PDR counterparts

# ─────────────────────────────── Ukrainian text ────────────────────────────────

_UA_STOP = frozenset("""
а або але аж б би була були було бути в від він вона вони все всі вже де до дуже
є з за і й їх їхній із коли крім та то ці цих цього цій цьому у як якщо який яка
яке які якого якій навіть не ні нема нас нам ним них на над ніж об однак по під
при про після перед тобто тому тут тих те там теж сам саме свій своє свою своїх
своїм собі вас вам ваш ваша ваше ваші мені мене мій мою моя моє мої нам наш наша
наше наші цей ця це ці той та те ті що щоб через також
""".split())

_PUNCT_RE = re.compile('[\u00ab\u00bb\u201c\u201d\u201e\u201f"\'().,;:!?\u2014\u2013/\\\\]')
_SPACE_RE = re.compile(r"\s+")
_META_ANS = re.compile(r"відповід[іь].{0,30}пункт", re.I)


def _norm(text: str) -> str:
    """Lowercase, strip punctuation, collapse whitespace."""
    return _SPACE_RE.sub(" ", _PUNCT_RE.sub(" ", text.lower())).strip()


def _words(text: str) -> set:
    return {w for w in _norm(text).split()
            if w not in _UA_STOP and len(w) > 2}

# ─────────────────────────────── Query building ───────────────────────────────


def build_query(q: dict) -> str:
    """
    Combine question text + correct answer (2× weight) + other answers.
    Meta-answers like "Відповіді, зазначені в пунктах 1 та 2" are skipped.
    """
    parts = [q.get("text", "")]
    correct_idx = q.get("correctAnswerIndex")
    for ans in q.get("answers", []):
        t = ans.get("text", "")
        if not t:
            continue
        if correct_idx is not None and ans["index"] == correct_idx:
            if not _META_ANS.search(t):
                parts.extend([t, t])     # double weight for the correct answer
        else:
            parts.append(t)
    return " ".join(parts)

# ─────────────────────────────── Explanation helpers ──────────────────────────


def _best_sentence(rule_text: str, query_words: set) -> str:
    """Return the sentence from rule_text with the highest Jaccard overlap."""
    # Split on sentence boundaries
    parts = re.split(r"(?<=[.!?;])\s+|\n{2,}|\n(?=[А-ЯІЇЄ])", rule_text)
    sents = [s.strip() for s in parts if len(s.strip()) > 15]
    if not sents:
        chunk = rule_text.strip()
        return chunk[:250] + ("…" if len(chunk) > 250 else "")

    best, best_j = sents[0], -1.0
    for s in sents:
        sw = _words(s)
        if not sw:
            continue
        j = len(query_words & sw) / (len(query_words | sw) + 1)
        if j > best_j:
            best_j, best = j, s

    return (best[:300] + "…") if len(best) > 300 else best


def _topic_phrase(text: str) -> str:
    """Strip trailing colon/question-mark and interrogative openers."""
    text = re.sub(r"[?:]\s*$", "", text.strip())
    text = re.sub(
        r"^(Що таке|Де|Як|Коли|Хто|Чи|У якому|В якому|Яким чином|"
        r"Яку|Яка|Яке|Які|Яких|Якою|Якому|Чому|Куди|Звідки|"
        r"На якій|З якою|За яких|При якій)\s+",
        "", text, flags=re.I,
    )
    words = text.split()
    phrase = " ".join(words[:10])
    return (phrase + "…" if len(words) > 10 else phrase).lower()


def _make_explanation(q: dict, top_rules: list, confidence: float) -> dict:
    """Assemble the final explanation dict for one question."""
    qid = q["id"]
    if not top_rules:
        return {
            "questionId":    qid,
            "pdrReferences": [],
            "explanation":   "",
            "confidence":    round(confidence, 4),
        }

    best       = top_rules[0]
    qwords     = _words(build_query(q))
    excerpt    = _best_sentence(best["text"], qwords)
    topic      = _topic_phrase(q.get("text", ""))
    rule_id    = best["id"]

    expl = (
        f"Питання стосується: {topic}. "
        f"Відповідно до п.\u00a0{rule_id} ПДР: {excerpt}"
    )
    if not expl[-1] in ".!?":
        expl += "."

    return {
        "questionId":    qid,
        "pdrReferences": [r["id"] for r in top_rules],
        "explanation":   expl,
        "confidence":    round(confidence, 4),
    }

# ─────────────────────────────── Main ─────────────────────────────────────────


def main() -> None:
    DEBUG_DIR.mkdir(parents=True, exist_ok=True)

    # ── Load ──────────────────────────────────────────────────────────────────
    print("Loading data…")
    questions = json.load(open(QUESTIONS_F, encoding="utf-8"))["questions"]
    rules     = json.load(open(RULES_F,     encoding="utf-8"))["rules"]
    print(f"  {len(questions)} questions, {len(rules)} PDR rules")

    # ── Build TF-IDF index ────────────────────────────────────────────────────
    print("Building TF-IDF index…")
    # Each rule document = section title + rule text (section title provides topic context)
    rule_docs = [
        _norm(r["sectionTitle"] + " " + r["sectionTitle"] + " " + r["text"])
        for r in rules
    ]
    tfidf = TfidfVectorizer(
        analyzer="word",
        ngram_range=(1, 2),
        max_features=40_000,
        sublinear_tf=True,
        min_df=1,
        stop_words=sorted(_UA_STOP),
    )
    rule_mat = tfidf.fit_transform(rule_docs)   # (n_rules × vocab)

    # Rule index by section ID
    rule_sec_idx: dict = defaultdict(list)
    for i, r in enumerate(rules):
        rule_sec_idx[r["sectionId"]].append(i)

    # ── Process questions ─────────────────────────────────────────────────────
    print("Matching questions to PDR rules…")
    explanations:   list = []
    enriched:       list = []
    low_conf_items: list = []
    rule_hits:      Counter = Counter()

    for qi, q in enumerate(questions):
        if qi % 300 == 0:
            print(f"  {qi}/{len(questions)}", flush=True)

        query_str = _norm(build_query(q))
        if not query_str.strip():
            exp = _make_explanation(q, [], 0.0)
        else:
            qvec = tfidf.transform([query_str])
            sims = cosine_similarity(qvec, rule_mat).ravel().copy()

            # Section boost: only for sections that have a direct PDR counterpart
            qsid = q.get("sectionId", "")
            try:
                qsid_int = int(qsid)
                if qsid_int <= PDR_SECTION_MAX and qsid in rule_sec_idx:
                    for idx in rule_sec_idx[qsid]:
                        if sims[idx] > 0.01:          # only boost already-relevant rules
                            sims[idx] = min(1.0, sims[idx] * SECTION_BOOST)
            except ValueError:
                pass

            # Select top rules above threshold
            order   = np.argsort(sims)[::-1]
            top_idx = [i for i in order if sims[i] >= RAW_THRESHOLD][:MAX_REFS]
            max_sim = float(sims[order[0]]) if len(order) else 0.0

            if not top_idx:
                confidence = min(1.0, max_sim * CONF_SCALE)
                exp = _make_explanation(q, [], confidence)
                low_conf_items.append({
                    "questionId":   q["id"],
                    "sectionId":    qsid,
                    "sectionTitle": q.get("sectionTitle", ""),
                    "text":         q.get("text", "")[:100],
                    "topScore":     round(max_sim, 4),
                })
            else:
                top_rules  = [rules[i] for i in top_idx]
                confidence = min(1.0, float(sims[top_idx[0]]) * CONF_SCALE)
                exp = _make_explanation(q, top_rules, confidence)
                for r in top_rules:
                    rule_hits[r["id"]] += 1

        explanations.append(exp)

        eq = dict(q)
        eq["pdrReferences"]         = exp["pdrReferences"]
        eq["explanation"]           = exp["explanation"]
        eq["explanationConfidence"] = exp["confidence"]
        enriched.append(eq)

    # ── Save ─────────────────────────────────────────────────────────────────
    print("Saving outputs…")
    EXPLANATIONS_F.write_text(
        json.dumps({"explanations": explanations}, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    ENRICHED_F.write_text(
        json.dumps({"questions": enriched}, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    # ── Debug stats ───────────────────────────────────────────────────────────
    n_explained = sum(1 for e in explanations if e["explanation"])
    confs       = [e["confidence"] for e in explanations if e["confidence"] > 0]
    avg_conf    = round(sum(confs) / len(confs), 4) if confs else 0.0
    pct         = round(100 * n_explained / len(questions), 2)

    # Per-section coverage
    sec_total: Counter   = Counter(q["sectionId"] for q in questions)
    sec_expl:  Counter   = Counter(
        e["questionId"].rsplit("-", 1)[0].split("-")[0]   # rough section from id
        for e in explanations if e["explanation"]
    )
    # More reliable: join with questions
    sec_expl2: Counter = Counter()
    for q, e in zip(questions, explanations):
        if e["explanation"]:
            sec_expl2[q["sectionId"]] += 1

    sec_coverage = {
        sid: {"total": sec_total[sid], "explained": sec_expl2.get(sid, 0)}
        for sid in sorted(sec_total, key=int)
    }

    debug = {
        "totalQuestions":        len(questions),
        "explainedCount":        n_explained,
        "lowConfidenceCount":    len(questions) - n_explained,
        "coveragePercent":       pct,
        "averageConfidence":     avg_conf,
        "sectionCoverage":       sec_coverage,
        "topMatchedRules": [
            {"ruleId": rid, "hitCount": cnt}
            for rid, cnt in rule_hits.most_common(20)
        ],
        "lowConfidenceExamples": low_conf_items[:30],
    }
    DEBUG_F.write_text(
        json.dumps(debug, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    print(f"\nResults:")
    print(f"  Explained:      {n_explained} / {len(questions)}  ({pct:.1f}%)")
    print(f"  Low confidence: {len(questions) - n_explained}")
    print(f"  Avg confidence: {avg_conf:.3f}")
    print(f"\n  → {EXPLANATIONS_F.relative_to(SCRIPT_DIR.parent)}")
    print(f"  → {ENRICHED_F.relative_to(SCRIPT_DIR.parent)}")
    print(f"  → {DEBUG_F.relative_to(SCRIPT_DIR.parent)}")


if __name__ == "__main__":
    main()
