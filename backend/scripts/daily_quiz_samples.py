"""
daily_quiz_samples.py — generate review samples for the 5 Savol categories
without touching the database (5-savol-expanded-categories spec: "30 sample
questions for review — at least one per category — before anything
publishes").

Runs the real generation prompt and the real cold + deep + transliteration
verification for one sub-topic per category, then writes the verified
questions (up to --per-category each) and the rejection reasons to a
Markdown file. AI usage is not logged (no DB session).

Usage (from backend/):
    python scripts/daily_quiz_samples.py --out samples.md [--per-category 2] [--only soz_tarixi,kosmos]
"""
import argparse
import asyncio
import json
import pathlib
import random
import sys
from collections import Counter

BACKEND = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))

from dotenv import load_dotenv  # noqa: E402

load_dotenv(BACKEND / ".env")  # gemini_provider reads GEMINI_API_KEY at import time

from app.services import daily_quiz_service as svc  # noqa: E402
from app.services.category_config import DEFAULT_CATEGORIES  # noqa: E402

svc.log_usage = lambda *args, **kwargs: None  # no DB here


async def sample_category(category: dict, per_category: int, sem: asyncio.Semaphore) -> dict:
    async with sem:
        sub_topic = random.choice(category["sub_topics"])
        candidates = await svc._generate_freeform_candidates(None, category, sub_topic)
        seen, fresh = set(), []
        for c in candidates:
            if c["concept_tag"] in seen:
                continue
            seen.add(c["concept_tag"])
            fresh.append(c)
        for c in fresh:
            await svc._run_verification(None, c)
        verified = [c for c in fresh if c.get("verified")]
        picked, used_levels = [], set()
        for c in verified:  # spread difficulties first
            if len(picked) < per_category and c["difficulty"] not in used_levels:
                picked.append(c)
                used_levels.add(c["difficulty"])
        for c in verified:
            if len(picked) < per_category and c not in picked:
                picked.append(c)
        return {
            "category": category, "sub_topic": sub_topic, "generated": len(fresh),
            "verified": len(verified), "picked": picked,
            "rejected": [c for c in fresh if not c.get("verified")],
        }


def render(results: list[dict]) -> str:
    total_picked = sum(len(r["picked"]) for r in results)
    total_gen = sum(r["generated"] for r in results)
    total_ver = sum(r["verified"] for r in results)
    lines = [
        "# 5 Savol — review samples",
        "",
        f"{total_picked} questions from {len(results)} categories. "
        f"Verifier pass rate: {total_ver}/{total_gen}.",
        "",
    ]
    reason_counts: Counter = Counter()
    for r in results:
        cat = r["category"]
        lines += [f"## {cat['label']} — {r['sub_topic']}", "",
                  f"_{r['verified']}/{r['generated']} candidates passed verification._", ""]
        if not r["picked"]:
            lines += ["**No verified question for this category.**", ""]
        for q in r["picked"]:
            lines.append(f"**{q['question_text']}** ({q['difficulty']}, `{q['concept_tag']}`)")
            lines.append("")
            for i, opt in enumerate(q["options"]):
                mark = "✅" if i == q["correct_index"] else "▫️"
                lines.append(f"- {mark} {opt}")
            lines += ["", f"> {q['explanation']}", "", f"Manba: {q['source']}", ""]
        for q in r["rejected"]:
            for reason in q.get("reject_reasons") or []:
                reason_counts[reason.split(":")[0][:80]] += 1
    lines += ["## Most common rejection reasons", ""]
    lines += [f"- {n}× {reason}" for reason, n in reason_counts.most_common(15)]
    return "\n".join(lines) + "\n"


async def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", required=True)
    parser.add_argument("--per-category", type=int, default=2)
    parser.add_argument("--only", default="")
    parser.add_argument("--concurrency", type=int, default=4)
    args = parser.parse_args()

    only = {k for k in args.only.split(",") if k}
    categories = [c for c in DEFAULT_CATEGORIES if not only or c["key"] in only]
    sem = asyncio.Semaphore(args.concurrency)
    results = await asyncio.gather(*(sample_category(c, args.per_category, sem) for c in categories))

    out = pathlib.Path(args.out)
    out.write_text(render(results), encoding="utf-8")
    out.with_suffix(".json").write_text(
        json.dumps(
            [{**r, "category": r["category"]["key"]} for r in results],
            ensure_ascii=False, indent=2, default=str,
        ),
        encoding="utf-8",
    )
    print(f"wrote {out} ({sum(len(r['picked']) for r in results)} questions)")


if __name__ == "__main__":
    asyncio.run(main())
