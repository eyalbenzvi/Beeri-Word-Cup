# -*- coding: utf-8 -*-
"""
בקרת איכות על קובץ הפלט מול המקור.

מאמת שהקובץ החדש זהה למקור בכל תא, ושרק שתי העמודות החדשות נוספו:
  * אותם גיליונות, אותו מספר שורות ועמודות (+2)
  * כל 35 העמודות המקוריות זהות תא-בתא, כולל טיפוס הערך
  * פורמט הקואורדינטות ותחום ישראל
  * עקביות בין רמת הדיוק המוצהרת למנוע שהחזיר את התוצאה

שימוש:
    python verify_output.py "קלפיות.xlsx" "קלפיות עם קואורדינטות.xlsx"
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

import openpyxl

LAT_MIN, LAT_MAX = 29.3, 33.5
LON_MIN, LON_MAX = 34.2, 35.95
COORD_RE = re.compile(r"^-?\d+\.\d{6}, -?\d+\.\d{6}$")
NEW_COLS = ("קואורדינטות", "דיוק קואורדינטות")
TIERS = ("כתובת מדויקת", "רחוב", "ישוב בלבד", "לא נמצא")

failures: list[str] = []
checks = 0


def check(cond: bool, label: str, detail: str = "") -> None:
    global checks
    checks += 1
    if cond:
        print(f"  ✓ {label}")
    else:
        print(f"  ✗ {label}  {detail}")
        failures.append(label)


def main() -> int:
    src, out = Path(sys.argv[1]), Path(sys.argv[2])
    wb_s = openpyxl.load_workbook(src, read_only=True)
    wb_o = openpyxl.load_workbook(out, read_only=True)

    print("מבנה החוברת")
    check(wb_s.sheetnames == wb_o.sheetnames, "אותם גיליונות",
          f"{wb_s.sheetnames} != {wb_o.sheetnames}")

    ws_s, ws_o = wb_s["DataSheet"], wb_o["DataSheet"]
    rows_s, cols_s = ws_s.max_row, ws_s.max_column
    rows_o, cols_o = ws_o.max_row, ws_o.max_column
    check(rows_s == rows_o, f"מספר שורות זהה ({rows_s:,})", f"{rows_s} != {rows_o}")
    check(cols_o == cols_s + 2, f"נוספו בדיוק 2 עמודות ({cols_s} → {cols_o})")

    print("\nשלמות הנתונים המקוריים")
    src_rows = ws_s.iter_rows(values_only=True)
    out_rows = ws_o.iter_rows(values_only=True)
    diffs, n = [], 0
    for i, (rs, ro) in enumerate(zip(src_rows, out_rows), start=1):
        n += 1
        if tuple(rs[:cols_s]) != tuple(ro[:cols_s]):
            for j, (a, b) in enumerate(zip(rs[:cols_s], ro[:cols_s])):
                if a != b:
                    diffs.append(f"שורה {i} עמודה {j + 1}: {a!r} != {b!r}")
    check(n == rows_s, f"נסרקו כל {n:,} השורות")
    check(not diffs, f"כל {cols_s} העמודות המקוריות זהות תא-בתא",
          f"{len(diffs)} הבדלים, ראשון: {diffs[0] if diffs else ''}")

    hdr_o = next(ws_o.iter_rows(min_row=1, max_row=1, values_only=True))
    check(tuple(hdr_o[cols_s:]) == NEW_COLS, "כותרות העמודות החדשות",
          f"{hdr_o[cols_s:]}")

    print("\nתקינות הקואורדינטות")
    bad_fmt, out_of_range, bad_tier, filled = [], [], [], 0
    for i, row in enumerate(
        ws_o.iter_rows(min_row=2, min_col=cols_s + 1, max_col=cols_s + 2, values_only=True),
        start=2,
    ):
        coord, prec = row[0], row[1]
        if coord:
            filled += 1
            if not COORD_RE.match(str(coord)):
                bad_fmt.append(f"שורה {i}: {coord!r}")
            else:
                lat, lon = (float(x) for x in str(coord).split(","))
                if not (LAT_MIN <= lat <= LAT_MAX and LON_MIN <= lon <= LON_MAX):
                    out_of_range.append(f"שורה {i}: {coord}")
        if not prec or not any(str(prec).startswith(t) for t in TIERS):
            bad_tier.append(f"שורה {i}: {prec!r}")
        # תא ריק חייב להיות מסומן "לא נמצא", ולהיפך
        if bool(coord) == (str(prec) == "לא נמצא"):
            bad_tier.append(f"שורה {i}: חוסר התאמה בין {coord!r} ל-{prec!r}")

    total = rows_o - 1
    check(not bad_fmt, "פורמט 'lat, lon' עם 6 ספרות עשרוניות",
          f"{len(bad_fmt)} חריגות, ראשונה: {bad_fmt[0] if bad_fmt else ''}")
    check(not out_of_range, f"כל הקואורדינטות בתחום ישראל",
          f"{len(out_of_range)} חריגות, ראשונה: {out_of_range[0] if out_of_range else ''}")
    check(not bad_tier, "עמודת הדיוק עקבית עם עמודת הקואורדינטות",
          f"{len(bad_tier)} חריגות, ראשונה: {bad_tier[0] if bad_tier else ''}")
    print(f"  → מולאו {filled:,}/{total:,} ({filled / total:.2%})")

    print("\n" + "=" * 52)
    if failures:
        print(f"נכשלו {len(failures)}/{checks} בדיקות:")
        for f in failures:
            print(f"  - {f}")
        return 1
    print(f"כל {checks} הבדיקות עברו ✓")
    return 0


if __name__ == "__main__":
    sys.exit(main())
