# -*- coding: utf-8 -*-
"""
דוח סיכון: אילו תוצאות ראויות לבדיקה ידנית, ולמה.

לא כל תוצאה נולדה שווה. הסקריפט מדרג את הרשומות לפי רמת הביטחון בהן
ומדפיס מדגם לכל קטגוריה, עם קישור לגוגל מפות לבדיקה ידנית.

שימוש:
    python audit_risk.py "קלפיות.xlsx" [--sample 5]
"""
from __future__ import annotations

import argparse
import collections
import json
import random
import sys
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).parent))
import geocode_kalpiot as G  # noqa: E402

# קטגוריות סיכון, מהגבוה לנמוך.
RISK = [
    ("גבוה",
     "התאמה לשכבת GIS/POI לפי שם המקום — ייתכן מוסד אחר באותו ישוב",
     lambda e: e.get("kind") == "venue"),
    ("בינוני-גבוה",
     "מרכז ישוב בלבד — בעיר גדולה הסטייה יכולה להגיע לק\"מים",
     lambda e: e["tier"] == G.TIER_CITY),
    ("בינוני",
     "הרחוב נכון אך מספר הבית שהתקבל שונה מהמבוקש",
     lambda e: e["tier"] == G.TIER_STREET and e.get("kind") in ("address", "street")),
    ("נמוך",
     "כתובת מדויקת — רחוב ומספר בית תואמים",
     lambda e: e["tier"] == G.TIER_EXACT),
]


def house_of(q: str) -> str:
    head = q.split(",")[0].split()
    return head[-1] if head and head[-1].isdigit() else ""


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("input")
    ap.add_argument("--sample", type=int, default=5)
    args = ap.parse_args()

    in_path = Path(args.input)
    df = pd.read_excel(in_path, sheet_name=G.SHEET)
    queries = [G.build_query(r) for _, r in df.iterrows()]
    keys = [q["variants"][0]["text"] if q["variants"] else "" for q in queries]

    cache = json.loads((in_path.parent / "geocode_cache.json").read_text(encoding="utf-8"))
    ccache_p = in_path.parent / "city_cache.json"
    ccache = json.loads(ccache_p.read_text(encoding="utf-8")) if ccache_p.exists() else {}

    rows = []
    for i, (k, q) in enumerate(zip(keys, queries)):
        e = cache.get(k)
        fb = False
        if not e:
            e, fb = ccache.get(q["city"]), True
        if not e:
            rows.append((i, q, None, False))
        else:
            rows.append((i, q, e, fb))

    total = len(rows)
    buckets = collections.OrderedDict((lbl, []) for lbl, _, _ in [(a, b, c) for a, b, c in RISK])
    missing = []
    for i, q, e, fb in rows:
        if not e:
            missing.append((i, q))
            continue
        ent = dict(e)
        if fb:
            ent["tier"] = G.TIER_CITY
            ent["kind"] = "city"
        for lbl, _desc, pred in RISK:
            if pred(ent):
                buckets[lbl].append((i, q, ent))
                break

    print("=" * 66)
    print("דוח סיכון — אילו שורות כדאי לבדוק ידנית")
    print("=" * 66)
    print(f"סה\"כ שורות: {total:,}\n")

    for lbl, desc, _ in RISK:
        items = buckets[lbl]
        pct = len(items) / total if total else 0
        print(f"■ סיכון {lbl}: {len(items):,} שורות ({pct:.1%})")
        print(f"  {desc}")
        if items:
            rnd = random.Random(20260817)
            for i, q, e in rnd.sample(items, min(args.sample, len(items))):
                want_h = q["house"]
                got_h = house_of(e.get("matched", ""))
                extra = ""
                if want_h and got_h and want_h != got_h:
                    extra = f"  [בקשה בית {want_h} ← התקבל {got_h}]"
                print(f"    שורה {i + 2}: {q['city']} | {q['venue'][:28]}")
                print(f"      נשלח : {e.get('query', '')[:52]}")
                print(f"      התקבל: {e.get('matched', '')[:52]}{extra}")
                print(f"      https://www.google.com/maps?q={e['lat']},{e['lon']}")
        print()

    print(f"■ ללא תוצאה כלל: {len(missing):,}")
    for i, q in missing[:20]:
        print(f"    שורה {i + 2}: {q['variants'][0]['text'] if q['variants'] else '(ריק)'}")
    print("=" * 66)
    return 0


if __name__ == "__main__":
    sys.exit(main())
