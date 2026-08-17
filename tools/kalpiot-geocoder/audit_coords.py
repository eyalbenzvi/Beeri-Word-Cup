# -*- coding: utf-8 -*-
"""
ביקורת גיאומטרית עצמאית על קובץ הפלט.

לא מסתמכת על מנועי הגיאוקודינג אלא על עקביות פנימית:
  1. עוגנים — ערים גדולות מול קואורדינטות ידועות (ויקיפדיה/מפות צה"ל).
  2. פיזור תוך-ישובי — כל קלפיות הישוב חייבות להתקבץ סביב החציון שלו.
  3. עקביות רחוב — שורות באותו ישוב+רחוב חייבות להיות קרובות זו לזו.
  4. נקודה חוזרת — אותה קואורדינטה בכתובות רבות ושונות = דגל.

שימוש:
    python audit_coords.py "קלפיות עם קואורדינטות.xlsx"
"""
from __future__ import annotations

import sys
from collections import defaultdict
from math import asin, cos, radians, sin, sqrt
from pathlib import Path
from statistics import median

import pandas as pd

sys.path.insert(0, str(Path(__file__).parent))
from geocode_kalpiot import COL_CITY, COL_STREET, NEW_COL, NEW_COL_CONF, NEW_COL_SRC, clean  # noqa: E402

# עוגנים — מרכזי ערים ידועים (WGS84). רדיוס = גבול סביר לתחום השיפוט.
ANCHORS = {
    "ירושלים": (31.778, 35.225, 12),
    "תל אביב - יפו": (32.08, 34.78, 9),
    "חיפה": (32.80, 34.99, 10),
    "באר שבע": (31.25, 34.79, 9),
    "אילת": (29.55, 34.95, 8),
    "אשדוד": (31.79, 34.64, 8),
    "נתניה": (32.32, 34.85, 8),
    "ראשון לציון": (31.96, 34.80, 8),
    "פתח תקווה": (32.09, 34.89, 8),
    "רמלה": (31.92, 34.87, 6),
    "נצרת": (32.70, 35.30, 6),
    "טבריה": (32.79, 35.53, 6),
    "צפת": (32.96, 35.50, 6),
    "קרית שמונה": (33.21, 35.57, 6),
    "דימונה": (31.07, 35.03, 6),
    "רהט": (31.39, 34.76, 6),
    "אום אל-פחם": (32.52, 35.15, 6),
}


def hav_km(lat1, lon1, lat2, lon2):
    dlat, dlon = radians(lat2 - lat1), radians(lon2 - lon1)
    a = sin(dlat / 2) ** 2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(dlon / 2) ** 2
    return 2 * 6371 * asin(sqrt(a))


def main() -> int:
    df = pd.read_excel(sys.argv[1], sheet_name="DataSheet")
    pts = []  # (idx, city, street, lat, lon, conf, src)
    for i, r in df.iterrows():
        c = r[NEW_COL]
        if not isinstance(c, str) or not c:
            continue
        lat, lon = (float(x) for x in c.split(","))
        pts.append((i, clean(r[COL_CITY]), clean(r[COL_STREET]), lat, lon,
                    r[NEW_COL_CONF], str(r[NEW_COL_SRC])))
    print(f"נבדקות {len(pts):,} שורות עם קואורדינטות\n")
    issues = 0

    # ---- 1. עוגני ערים ----
    print("■ 1. עוגני ערים גדולות")
    bad = []
    for i, city, _st, lat, lon, conf, src in pts:
        a = ANCHORS.get(city)
        if a and (d := hav_km(lat, lon, a[0], a[1])) > a[2]:
            bad.append((d, i, city, lat, lon, conf, src))
    print(f"  חריגות: {len(bad)}")
    for d, i, city, lat, lon, conf, src in sorted(bad, reverse=True)[:10]:
        print(f"    שורה {i + 2}: {city} — {d:.1f} ק\"מ מהעוגן (ציון {conf}, {src[:36]})")
        print(f"      https://www.google.com/maps?q={lat},{lon}")
    issues += len(bad)

    # ---- 2. פיזור תוך-ישובי ----
    print("\n■ 2. חריגים בתוך ישוב (מרחק מחציון נקודות הישוב)")
    by_city = defaultdict(list)
    for p in pts:
        by_city[p[1]].append(p)
    outliers = []
    for city, group in by_city.items():
        if len(group) < 3:
            continue
        mlat = median(p[3] for p in group)
        mlon = median(p[4] for p in group)
        # רדיוס סביר גדל עם מספר הקלפיות (פרוקסי לשטח העיר); ירושלים חריגה בגודלה
        limit = 4 + 0.06 * len(group) if len(group) < 200 else 16
        for i, _c, st, lat, lon, conf, src in group:
            if (d := hav_km(lat, lon, mlat, mlon)) > limit:
                outliers.append((d, i, city, st, lat, lon, conf, src))
    print(f"  חריגים: {len(outliers)}")
    for d, i, city, st, lat, lon, conf, src in sorted(outliers, reverse=True)[:12]:
        print(f"    שורה {i + 2}: {city} | רחוב={st[:20]!r} — {d:.1f} ק\"מ מחציון הישוב (ציון {conf})")
        print(f"      {src[:44]}  https://www.google.com/maps?q={lat},{lon}")
    issues += len(outliers)

    # ---- 3. עקביות רחוב ----
    print("\n■ 3. אותו ישוב+רחוב עם נקודות רחוקות זו מזו (>3 ק\"מ)")
    by_street = defaultdict(list)
    for p in pts:
        if p[2]:
            by_street[(p[1], p[2])].append(p)
    scatter = []
    for (city, st), group in by_street.items():
        if len(group) < 2:
            continue
        mlat = median(p[3] for p in group)
        mlon = median(p[4] for p in group)
        worst = max(hav_km(p[3], p[4], mlat, mlon) for p in group)
        if worst > 3:
            scatter.append((worst, city, st, group))
    print(f"  רחובות חשודים: {len(scatter)}")
    for worst, city, st, group in sorted(scatter, reverse=True)[:8]:
        print(f"    {city} | {st[:24]} — פיזור {worst:.1f} ק\"מ בין {len(group)} שורות")
        for p in group[:3]:
            print(f"      שורה {p[0] + 2}: {p[6][:40]}  https://www.google.com/maps?q={p[3]},{p[4]}")
    issues += len(scatter)

    # ---- 4. נקודה חוזרת בכתובות שונות ----
    print("\n■ 4. קואורדינטה זהה במספר חריג של כתובות שונות")
    by_pt = defaultdict(set)
    rows_at = defaultdict(int)
    for i, city, st, lat, lon, _cf, _s in pts:
        by_pt[(lat, lon)].add((city, st))
        rows_at[(lat, lon)] += 1
    heavy = [(len(a), pt, rows_at[pt]) for pt, a in by_pt.items() if len(a) >= 8]
    print(f"  נקודות עם 8+ כתובות שונות: {len(heavy)}")
    for n_addr, (lat, lon), n_rows in sorted(heavy, reverse=True)[:8]:
        cities = {c for c, _ in by_pt[(lat, lon)]}
        print(f"    {lat},{lon} — {n_addr} כתובות, {n_rows} שורות, ישובים: {list(cities)[:3]}")

    print("\n" + "=" * 56)
    print(f"סה\"כ ממצאים לבדיקה בסעיפים 1–3: {issues}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
