# -*- coding: utf-8 -*-
"""
גיאוקודינג לקובץ הקלפיות של ועדת הבחירות המרכזית.

מוסיף לכל שורה שתי עמודות: `קואורדינטות` (WGS84, "lat, lon") ו-`דיוק קואורדינטות`.

עקרונות מנחים:
  * לעולם לא להמציא קואורדינטה. תא ריק עדיף על נקודה שגויה.
    מנוע החיפוש של GovMap הוא fuzzy ומחזיר תוצאות שגויות בביטחון מלא
    (למשל: חיפוש בי"ס בירושלים החזיר תוצאה ב"בית אלפא"), ולכן כל תוצאה
    עוברת אימות מול הישוב/הרחוב/מספר הבית שהתבקשו — ראה validate_candidate.
  * הקובץ המקורי נשמר בדיוק כפי שהוא: הפלט נכתב על עותק של החוברת המקורית
    דרך openpyxl, ולא ב-read_excel/to_excel שמשנה טיפוסים ומוחק גיליונות.
  * שגיאת רשת זמנית לעולם לא נשמרת במטמון בתור "לא נמצא".

שימוש:
    python geocode_kalpiot.py --selftest                 # בדיקת מנועים
    python geocode_kalpiot.py "קלפיות.xlsx"              # ריצה מלאה
    python geocode_kalpiot.py "קלפיות.xlsx" --limit 50   # ריצת טעימה
    python geocode_kalpiot.py "קלפיות.xlsx" --report-only
"""
from __future__ import annotations

import argparse
import collections
import json
import os
import random
import re
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import pandas as pd
import requests

# ----------------------------------------------------------------------------
# קבועים
# ----------------------------------------------------------------------------
SHEET = "DataSheet"
COL_CITY = "שם ישוב קלפי"
COL_STREET = "שם רחוב קלפי"
COL_HOUSE = "מס' בית"
COL_LETTER = "אות בית"
COL_VENUE = "מקום קלפי"
COL_RAW_ADDR = "כתובת קלפי"
NEW_COL = "קואורדינטות"
NEW_COL_SRC = "דיוק קואורדינטות"
NEW_COL_CONF = "ציון ביטחון"
NEW_COL_REASON = "סיבת אי-ודאות"

CACHE_FILE = "geocode_cache.json"

# גבולות ישראל — כל תוצאה מחוץ לתחום נדחית ואינה נכתבת.
LAT_MIN, LAT_MAX = 29.3, 33.5
LON_MIN, LON_MAX = 34.2, 35.95

HEADERS = {
    "User-Agent": "kalpiot-geocoder/2.0 (research; polling-station mapping)",
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "he-IL,he;q=0.9,en;q=0.8",
    "Content-Type": "application/json",
}

# רמות דיוק — ערך נמוך = מדויק יותר.
TIER_EXACT, TIER_STREET, TIER_CITY, TIER_NONE = 0, 1, 2, 3
TIER_LABEL = {
    TIER_EXACT: "כתובת מדויקת",
    TIER_STREET: "רחוב",
    TIER_CITY: "ישוב בלבד",
    TIER_NONE: "לא נמצא",
}

# מיפוי סוג התוצאה של GovMap לרמת דיוק.
# POI/שכונה ממופים בכוונה ל"רחוב" ולא ל"כתובת מדויקת": נקודת מרכז של מוסד
# מדויקת ברמת הבלוק, ולא נכון להצהיר עליה כדיוק כתובת.
# סוגי תוצאה שנחשבים "מקום" (בי"ס, מוסד, שכונה, שכבת GIS) — קבילים רק
# לשאילתת `מקום קלפי`, ורק עם חפיפת שם מספקת. ראה validate_candidate.
POI_TYPES = {
    "poi", "מוסדות", "institutes", "neighborhood", "שכונה",
    "entity", "statistic", "כביש", "צומת/מחלף",
}

# מילים גנריות בשמות מקומות קלפי. בלי סינון שלהן, 'בי"ס יסודי בית צפאפא'
# מתאים ל'בית ספר יסודי - בית ספר ירושלים' על סמך "בית"+"יסודי" בלבד,
# בעוד שהמילה המזהה היחידה (צפאפא) נעדרת מהתוצאה.
VENUE_STOPWORDS = {
    "בית", "ספר", "ביהס", "בהס", "בי", "יסודי", "יסודית", "תיכון", "תיכונית",
    "ממלכתי", "ממלכתית", "ממד", "דתי", "דתית", "חטיבת", "חטיבה", "ביניים",
    "מקיף", "אזורי", "אזורית", "אולם", "ספורט", "מגרש", "מועדון", "מזכירות",
    "מרכז", "קהילתי", "קהילתית", "מתנס", "גן", "ילדים", "בנים", "בנות",
    "ישיבה", "ישיבת", "אולפנה", "סמינר", "תלמוד", "תורה", "מוסד", "מוסדות",
    "קלפי", "מבנה", "צריף", "כיתה", "כיתות", "חדר", "אשכול", "פיס", "היכל",
    "תרבות", "עירייה", "מועצה", "מקומית", "כללי", "חדש", "חדשה", "ותיק",
    # "אל" היא תווית היידוע הערבית ומתאימה כמעט לכל שם; בלעדיה
    # 'בי"ס אל עומריה' הותאם ל'אל אנסאר' באותו ישוב.
    "אל", "בנין", "בניין", "אגף", "בוגרי", "בוגרים", "ליד", "עש", "שם",
}

# סוגי מוסד. זיהוי ודאי מחייב שגם *סוג* המוסד יתאים: 'בי"ס ממלכתי נוף ים'
# הותאם ל"גן ילדים נוף ים" — אותה שכונה, מבנה אחר.
VENUE_TYPES = {
    "kinder": {"גן", "גנון", "ילדים", "טרום", "טרומי"},
    "school": {"ביהס", "בהס", "בי", "ספר", "יסודי", "יסודית", "תיכון",
               "תיכונית", "חטיבה", "חטיבת", "מקיף", "אולפנה", "ישיבה",
               "ישיבת", "סמינר", "אורט", "עמל"},
    "library": {"ספריה", "ספרייה"},
    "center": {"מתנס", "קהילתי", "קהילתית"},
    "club": {"מועדון", "מזכירות"},
    "sport": {"אולם", "ספורט", "מגרש", "היכל"},
}
# רק תוצאות מסוג מוסד/POI יכולות להיחשב "זיהוי ודאי של המוסד".
# תוצאת רחוב אינה מזהה מבנה: 'בי"ס דגניה' הותאם ל"דגניה 11א חיפה".
INSTITUTION_TYPES = {"poi", "institutes", "מוסדות"}


def venue_type(s: str) -> str:
    """מסווג שם מקום לסוג מוסד גס, או '' אם לא זוהה."""
    t = toks(s)
    for name, words in VENUE_TYPES.items():
        if t & words:
            return name
    return ""


try:
    from pyproj import Transformer

    ITM2WGS = Transformer.from_crs("EPSG:2039", "EPSG:4326", always_xy=True)
    MERC2WGS = Transformer.from_crs("EPSG:3857", "EPSG:4326", always_xy=True)
except ImportError:  # pragma: no cover
    ITM2WGS = MERC2WGS = None


class TransientError(Exception):
    """כשל רשת/שרת זמני — לא נשמר במטמון, יינוסה שוב בריצה הבאה."""


# ----------------------------------------------------------------------------
# ניקוי וטיוב טקסט
# ----------------------------------------------------------------------------
def clean(v) -> str:
    """מנרמל ערך תא לטקסט. מחזיר '' לערכים ריקים למעשה."""
    if v is None or (isinstance(v, float) and pd.isna(v)):
        return ""
    s = str(v).strip()
    # 0 = "אין מספר בית" בקובץ המקור; '.' מופיע בעמודת אות בית כמציין ריק.
    if s in {"nan", "NaT", "0", "0.0", ".", "-"}:
        return ""
    if re.fullmatch(r"-?\d+\.0", s):
        s = s[:-2]
    return " ".join(s.split())


_PUNCT = re.compile(r"[\"'`״׳.,()\[\]{}/\\|;:!?*+_=<>~^&%$#@–—־-]")


def norm(s: str) -> str:
    """נרמול להשוואה: מקפים/גרשיים/סוגריים → רווח. מטפל ב'תל אביב – יפו'."""
    return " ".join(_PUNCT.sub(" ", s or "").split())


def fold(s: str) -> str:
    """
    מקפל כתיב מלא/חסר לצורך השוואה בלבד: 'סעווה'↔'סעוה', 'אלייה'↔'אליה'.
    וריאציות כתיב הן מקור עיקרי לאי-התאמות בשמות ישובים ערביים ובדואיים.
    """
    return s.replace("וו", "ו").replace("יי", "י")


def toks(s: str) -> set[str]:
    """מילות השוואה — מנורמלות ומקופלות. מילות אות בודדת מושמטות."""
    return {fold(t) for t in norm(s).split() if len(t) > 1}


def counter_toks(s: str) -> collections.Counter:
    """כמו toks, אך שומר ריבוי — נדרש כדי לחסר מילות רחוב ממילות התוצאה."""
    return collections.Counter(fold(t) for t in norm(s).split() if len(t) > 1)


_PARENS = re.compile(r"\([^)]*\)")


def city_core(city: str) -> str:
    """
    שם הישוב בלי הסיווג בסוגריים: 'הוואשלה (שבט)' → 'הוואשלה'.
    בלי זה, המילה "שבט" נדרשת להופיע בתוצאה ואף מנוע לא מחזיר אותה,
    כך שכל הפזורה הבדואית נפסלת באימות.
    """
    return _PARENS.sub(" ", city or "").strip()


def strip_punct(s: str) -> str:
    return norm(s)


# ----------------------------------------------------------------------------
# בניית סולם וריאציות הכתובת
# ----------------------------------------------------------------------------
def build_query(row) -> dict:
    """
    בונה תיאור חיפוש לשורה: רכיבי הכתובת + סולם וריאציות מהמדויק לגס.
    כל וריאציה נושאת `ceiling` — רמת הדיוק המקסימלית שמותר לטעון לה.
    """
    get = row.get if hasattr(row, "get") else (lambda k, d="": row[k])
    city = clean(get(COL_CITY, ""))
    street = clean(get(COL_STREET, ""))
    house = clean(get(COL_HOUSE, ""))
    letter = clean(get(COL_LETTER, ""))
    venue = clean(get(COL_VENUE, ""))
    raw = clean(get(COL_RAW_ADDR, ""))

    variants: list[dict] = []
    seen: set[str] = set()

    def add(text, ceiling, kind, strict_city=False):
        text = " ".join(str(text).split()).strip(" ,")
        if text and text not in seen:
            seen.add(text)
            variants.append({"text": text, "ceiling": ceiling, "kind": kind,
                             "strict_city": strict_city})

    # ב-16.8% מהשורות עמודת הרחוב רק חוזרת על שם הישוב — ישובים קטנים ללא
    # שמות רחובות. חיפוש רחוב כזה מוצא רחוב אמיתי בעל אותו שם בישוב אחר
    # ('אורה, אורה' → "אורה באר אורה", 228 ק"מ משם), ולכן מדלגים עליו לגמרי
    # וניגשים ישר לשם המקום ולישוב. רק אם יש מספר בית נשמרת וריאציית כתובת,
    # שכן בישובים כאלה הכתובת אכן נכתבת "<שם הישוב> <מספר>".
    street_is_city = bool(street) and fold(norm(street)) == fold(norm(city))

    if street and city and not (street_is_city and not house):
        if house:
            strict = street_is_city
            if letter:
                add(f"{street} {house}{letter}, {city}", TIER_EXACT, "address", strict)
                add(f"{street} {house} {letter}, {city}", TIER_EXACT, "address", strict)
            add(f"{street} {house}, {city}", TIER_EXACT, "address", strict)
            if strip_punct(street) != street:
                add(f"{strip_punct(street)} {house}, {city}", TIER_EXACT, "address", strict)
        if not street_is_city:
            add(f"{street}, {city}", TIER_STREET, "street")
            if strip_punct(street) != street:
                add(f"{strip_punct(street)}, {city}", TIER_STREET, "street")

    # כתובת המקור המשולבת ("רחוב,מספר") — מצילה שורות ללא עמודת רחוב.
    if raw and city and not street:
        add(f"{raw.replace(',', ' ')}, {city}", TIER_EXACT, "address")

    # שם המקום (בי"ס וכו') — כשאין רחוב או כשהרחוב לא זוהה.
    if venue and city:
        add(f"{venue}, {city}", TIER_STREET, "venue")
        if strip_punct(venue) != venue:
            add(f"{strip_punct(venue)}, {city}", TIER_STREET, "venue")

    if city:
        add(city, TIER_CITY, "city")
        if strip_punct(city) != city:
            add(strip_punct(city), TIER_CITY, "city")

    return {
        "city": city,
        "street": street,
        "house": house,
        "letter": letter,
        "venue": venue,
        "variants": variants,
    }


# ----------------------------------------------------------------------------
# המרת קואורדינטות + אימות תחום
# ----------------------------------------------------------------------------
def in_israel(lat, lon) -> bool:
    return LAT_MIN <= lat <= LAT_MAX and LON_MIN <= lon <= LON_MAX


def to_wgs84(a, b):
    """
    מקבל זוג מספרים במערכת לא ידועה ומחזיר (lat, lon) ב-WGS84, או None.
    מזהה אוטומטית WGS84, Web Mercator (EPSG:3857 — מה ש-GovMap מחזיר)
    ו-ITM (EPSG:2039). בישראל טווחי lat/lon אינם חופפים, אז הסדר חד-משמעי.
    """
    try:
        a, b = float(a), float(b)
    except (TypeError, ValueError):
        return None
    if a != a or b != b:  # NaN
        return None

    for lon, lat in ((a, b), (b, a)):
        if in_israel(lat, lon):
            return round(lat, 6), round(lon, 6)

    if MERC2WGS is not None and max(abs(a), abs(b)) > 1_000_000:
        for x, y in ((a, b), (b, a)):
            lon, lat = MERC2WGS.transform(x, y)
            if in_israel(lat, lon):
                return round(lat, 6), round(lon, 6)

    if ITM2WGS is not None:
        for x, y in ((a, b), (b, a)):
            if 100_000 <= x <= 320_000 and 350_000 <= y <= 820_000:
                lon, lat = ITM2WGS.transform(x, y)
                if in_israel(lat, lon):
                    return round(lat, 6), round(lon, 6)

    return None


_WKT = re.compile(r"POINT\s*\(\s*(-?[\d.]+)[\s,]+(-?[\d.]+)\s*\)", re.I)


def parse_shape(shape):
    """מפענח 'POINT(x y)' או dict עם x/y — ומחזיר (lat, lon) ב-WGS84."""
    if isinstance(shape, str):
        m = _WKT.search(shape)
        if m:
            return to_wgs84(m.group(1), m.group(2))
        return None
    if isinstance(shape, dict):
        low = {str(k).lower(): v for k, v in shape.items()}
        for ka, kb in (("x", "y"), ("lon", "lat"), ("lng", "lat")):
            if ka in low and kb in low:
                return to_wgs84(low[ka], low[kb])
    return None


# ----------------------------------------------------------------------------
# אימות תוצאה — הלב של "לא להמציא קואורדינטות"
# ----------------------------------------------------------------------------
def base_type(rtype) -> str:
    """
    מנרמל את שדה ה-type של GovMap. שכבות GIS מגיעות כ'12345|שם שכבה|entity'
    (תחנות דלק, תחנות הידרומטריות וכו') — כולן מקובצות ל-'entity'.
    """
    t = str(rtype or "").strip().lower()
    return "entity" if "|" in t else t


def validate_candidate(text, rtype, want, variant):
    """
    מחליט אם תוצאת החיפוש באמת מתאימה לכתובת שביקשנו, ובאיזו רמת דיוק.
    מחזיר (ok: bool, tier: int).

    בלי הבדיקות כאן היינו כותבים נקודות שגויות בעשרות ומאות ק"מ:
      * 'ביה"ס בית יעקב הצפון, ירושלים' → GovMap החזיר 'ביה"ס 203 בית אלפא'.
      * 'מסילות' (קיבוץ בצפון) → החזיר רחוב מסילות באילת.
      * 'מפלסים' (קיבוץ בנגב) → החזיר רחוב מפלסים בפתח תקווה.
    """
    rtoks = toks(text)
    raw_toks = set(norm(text).split())  # כולל מספרים חד-ספרתיים
    base = base_type(rtype)
    kind = variant["kind"]

    # 1) הישוב חייב להתאים — התנאי הקריטי ביותר.
    ctoks = toks(city_core(want["city"]))
    city_ok = (
        not ctoks
        or ctoks <= rtoks
        # ישובים דו-שמיים / סוגריים ("אבו ג'ווייעד (שבט)") — מקבלים גם הכלה הפוכה.
        or (base == "settlement" and rtoks and rtoks <= ctoks)
    )
    if not city_ok:
        return False, TIER_NONE

    # 2) שאילתת ישוב בלבד — רק תוצאת ישוב מתקבלת.
    #    רחוב ששמו כשם הישוב, בעיר אחרת, הוא בדיוק המלכודת שהפילה אותנו.
    if kind == "city":
        return (True, TIER_CITY) if base == "settlement" else (False, TIER_NONE)

    # 3) שאילתת רחוב/כתובת — רק תוצאת רחוב/כתובת, ורק אם שם הרחוב תואם.
    if kind in ("address", "street"):
        if base not in ("address", "street"):
            return False, TIER_NONE

        # GovMap מחזיר תוצאת רחוב כ"<רחוב> <ישוב>". כששם הרחוב זהה לשם
        # הישוב המבוקש, בדיקת הישוב הכללית מסתפקת במילת *הרחוב* ומאשרת
        # תוצאה בעיר אחרת לגמרי: 'מסילות, מסילות' אושר ל"מסילות ELAT",
        # 330 ק"מ משם. לכן שם הישוב חייב להופיע *מעבר* למילות הרחוב —
        # השוואת ריבוי (Counter) ולא קבוצות, כדי ש'שדרות ירושלים, ירושלים'
        # עדיין יעבור.
        if ctoks:
            rest = counter_toks(text) - counter_toks(want["street"])
            if not ctoks <= set(rest):
                return False, TIER_NONE
            # כששם הרחוב זהה לשם הישוב, ההכלה לבדה אינה מספיקה: "אורה באר
            # אורה" מכיל "אורה" פעמיים. כאן נדרש שלא תישאר אף מילה לא-מספרית
            # מעבר לשם הישוב — כלומר שהישוב בתוצאה הוא בדיוק זה שביקשנו.
            if variant.get("strict_city"):
                extra = {t for t in rest if not t.isdigit()} - ctoks
                if extra:
                    return False, TIER_NONE

        stoks = toks(want["street"]) or toks(variant["text"].split(",")[0])
        # שם קצר (מילה-שתיים) חייב להתאים במלואו. הקלה של מילה אחת מותרת רק
        # לשמות ארוכים — אחרת 'בית צפפה' עובר על סמך המילה "בית" לבדה.
        if stoks:
            need = stoks <= rtoks if len(stoks) <= 2 else len(stoks & rtoks) >= len(stoks) - 1
            if not need:
                return False, TIER_NONE  # ישוב נכון, רחוב אחר
        house = want["house"]
        if kind == "address" and base == "address" and house and house in raw_toks:
            return True, TIER_EXACT
        return True, TIER_STREET  # מספר בית לא תאם → רק רמת רחוב

    # 4) שאילתת מקום (בי"ס וכו') — דורש חפיפה משמעותית עם שם המקום,
    #    אחרת זו סתם נקודה כלשהי בישוב הנכון.
    if kind == "venue":
        if base == "settlement":
            return False, TIER_NONE  # וריאציית הישוב תטפל בזה בשלב הבא
        # אותה מלכודת כמו בתוצאות רחוב: 'ניידת איתנים, איתנים' הותאם ל
        # "איתנים 1 חיפה" משום ששם הישוב הופיע בתוצאה — אבל כשם הרחוב.
        # לכן שם הישוב חייב להופיע *מעבר* למילות שם המקום.
        if ctoks:
            rest = counter_toks(text) - counter_toks(want["venue"])
            if not ctoks <= set(rest):
                return False, TIER_NONE

        # ההתאמה חייבת להיות על המילים *המזהות* בשם המקום, לא על מילים
        # גנריות כמו "בית ספר" שמופיעות בכל מוסד בישראל.
        dtoks = toks(want["venue"]) - VENUE_STOPWORDS
        if not dtoks:
            return False, TIER_NONE  # שם גנרי לחלוטין — לא ניתן לאמת
        hit = len(dtoks & rtoks)
        if hit >= 2 or hit >= 0.5 * len(dtoks):
            return True, TIER_STREET
        if base in POI_TYPES and hit >= 1:
            return True, TIER_STREET
        return False, TIER_NONE

    return False, TIER_NONE


# ----------------------------------------------------------------------------
# מנוע GovMap
# ----------------------------------------------------------------------------
SESSION = requests.Session()
SESSION.headers.update(HEADERS)

# ה-endpoint הפעיל (אומת אוגוסט 2026). ה-API הישן, es.govmap.gov.il/TldSearch,
# הוסר ומחזיר דף שגיאה. זהו השירות שאתר govmap עצמו משתמש בו, ללא טוקן.
GOVMAP_ENDPOINTS = [
    {
        "name": "www/search-service/autocomplete",
        "url": "https://www.govmap.gov.il/api/search-service/autocomplete",
        "body": lambda q: {
            "searchText": q,
            "language": "he",
            "isAccurate": False,
            "maxResults": 10,
        },
    },
    {
        "name": "www/search-service/autocomplete (accurate)",
        "url": "https://www.govmap.gov.il/api/search-service/autocomplete",
        "body": lambda q: {
            "searchText": q,
            "language": "he",
            "isAccurate": True,
            "maxResults": 10,
        },
    },
]

_ACTIVE_GOVMAP: dict | None = None
_THROTTLE = threading.Semaphore(8)


def _post(ep, query, timeout=25):
    with _THROTTLE:
        r = SESSION.post(ep["url"], json=ep["body"](query), timeout=timeout)
    if r.status_code >= 500 or r.status_code in (408, 429):
        raise TransientError(f"{ep['name']} HTTP {r.status_code}")
    r.raise_for_status()
    return r.json()


def probe_govmap(verbose=True):
    """מאתר endpoint חי של GovMap מול כתובת ביקורת ידועה."""
    global _ACTIVE_GOVMAP
    if _ACTIVE_GOVMAP is not None:
        return _ACTIVE_GOVMAP
    control, exp_lat, exp_lon = "הרצל 1, תל אביב - יפו", 32.0635, 34.7700
    for ep in GOVMAP_ENDPOINTS:
        pt, err = None, None
        # השרת של GovMap מחזיר 502/504 לסירוגין — מנסים כמה פעמים לפני שפוסלים.
        for attempt in range(4):
            try:
                data = _post(ep, control, timeout=25)
                res = (data or {}).get("results") or []
                pt = parse_shape(res[0].get("shape")) if res else None
                if pt:
                    break
                err = "הגיב ללא קואורדינטה תקפה"
            except Exception as exc:
                err = f"{type(exc).__name__}: {str(exc)[:70]}"
                time.sleep(1.5 * (2**attempt))
        if not pt:
            if verbose:
                print(f"  ✗ {ep['name']}: {err}")
            continue
        dist = abs(pt[0] - exp_lat) + abs(pt[1] - exp_lon)
        if verbose:
            print(f"  {'✓' if dist < 0.05 else '~'} {ep['name']}: {pt[0]}, {pt[1]}")
        if dist < 0.05:
            _ACTIVE_GOVMAP = ep
            return ep
    return None


def geocode_govmap(variant, want):
    ep = probe_govmap(verbose=False)
    if ep is None:
        return None
    last = None
    for attempt in range(3):
        try:
            data = _post(ep, variant["text"])
            break
        except (TransientError, requests.Timeout, requests.ConnectionError) as exc:
            last = exc
            time.sleep(1.5 * (2**attempt))
        except Exception:
            return None  # תשובה תקינה ללא תוצאה
    else:
        raise TransientError(f"govmap failed 3x: {last}")

    best = None
    for item in (data or {}).get("results") or []:
        pt = parse_shape(item.get("shape"))
        if not pt or not in_israel(*pt):
            continue
        ok, tier = validate_candidate(item.get("text", ""), item.get("type"), want, variant)
        if not ok:
            continue
        if best is None or tier < best[0]:
            best = (tier, pt[0], pt[1], item.get("type"), item.get("text", ""))
        if tier == TIER_EXACT:
            break
    if best is None:
        return None
    return {
        "lat": best[1],
        "lon": best[2],
        "tier": best[0],
        "engine": f"govmap:{best[3]}",
        "matched": best[4],
    }


# ----------------------------------------------------------------------------
# מנוע Nominatim (גיבוי) — מדיניות: בקשה אחת לשנייה, גלובלית
# ----------------------------------------------------------------------------
_NOMI_LOCK = threading.Lock()
_NOMI_LAST = [0.0]
NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
NOMI_PLACE = {"city", "town", "village", "municipality", "hamlet", "locality"}
# display_name כולל נפה/מחוז/מדינה. בלי סינון, תוצאה בקריית ים "עוברת" אימות
# לחיפה רק בגלל המילים "נפת חיפה" — ולכן מסירים את מקטעי המנהל.
_NOMI_DROP = ("נפת ", "מחוז ", "ישראל")


def nomi_place_text(display_name: str) -> str:
    segs = [s.strip() for s in (display_name or "").split(",")]
    keep = [
        s for s in segs
        if s and not s.isdigit() and not any(s.startswith(d) for d in _NOMI_DROP)
    ]
    return ", ".join(keep)


def geocode_nominatim(variant, want):
    with _NOMI_LOCK:
        wait = 1.05 - (time.monotonic() - _NOMI_LAST[0])
        if wait > 0:
            time.sleep(wait)
        try:
            r = SESSION.get(
                NOMINATIM_URL,
                params={
                    "q": variant["text"],
                    "format": "jsonv2",
                    "limit": 5,
                    "countrycodes": "il",
                },
                headers={"Content-Type": None},
                timeout=25,
            )
        except (requests.Timeout, requests.ConnectionError) as exc:
            raise TransientError(f"nominatim: {exc}") from exc
        finally:
            _NOMI_LAST[0] = time.monotonic()

    if r.status_code >= 500 or r.status_code == 429:
        raise TransientError(f"nominatim HTTP {r.status_code}")
    try:
        items = r.json()
    except ValueError:
        return None

    for it in items or []:
        try:
            lat, lon = round(float(it["lat"]), 6), round(float(it["lon"]), 6)
        except (KeyError, TypeError, ValueError):
            continue
        if not in_israel(lat, lon):
            continue
        name = it.get("display_name", "")
        cat = str(it.get("category") or it.get("class") or "")
        ntype = str(it.get("type") or "")
        atype = str(it.get("addresstype") or "")
        # Nominatim מסמן בית ב-type='house' (category='place'), לא ב-category.
        if atype in NOMI_PLACE or ntype in NOMI_PLACE:
            rtype = "settlement"
        elif ntype in ("house", "building", "yes", "residential_building"):
            rtype = "address"
        elif cat == "highway":
            rtype = "street"
        else:
            rtype = "poi"
        ok, tier = validate_candidate(nomi_place_text(name), rtype, want, variant)
        if not ok:
            continue
        return {
            "lat": lat,
            "lon": lon,
            "tier": tier,
            "engine": f"nominatim:{cat or 'result'}",
            "matched": name[:80],
        }
    return None


# ----------------------------------------------------------------------------
# תזמור המנועים
# ----------------------------------------------------------------------------
# ----------------------------------------------------------------------------
# ציון ביטחון ואפיון אי-ודאות
# ----------------------------------------------------------------------------
# אוצר מילים סגור. כל ערך בעמודת `סיבת אי-ודאות` הוא בדיוק אחד מאלה.
R_NONE = "ללא"
R_HOUSE_DIFF = "מספר בית שונה"
R_NO_HOUSE = "רחוב ללא מספר בית"
R_PARTIAL_STREET = "שם רחוב חלקי"
R_VENUE = "התאמה לפי שם המקום"
R_CITY = "מרכז ישוב בלבד"
R_SMALL_CITY = "מרכז ישוב קטן"
R_CONFLICT = "סתירה בין מקורות"
R_NOT_FOUND = "לא נמצא"
REASONS = (
    R_NONE, R_HOUSE_DIFF, R_NO_HOUSE, R_PARTIAL_STREET,
    R_VENUE, R_SMALL_CITY, R_CITY, R_CONFLICT, R_NOT_FOUND,
)

# גודל הישוב נמדד במספר הקלפיות בו — מדד טוב לאוכלוסייה, ולכן גם למרחק
# האפשרי בין מרכז הישוב לקלפי בפועל. בקיבוץ או מושב עם קלפי אחת, מרכז
# הישוב הוא למעשה מיקום הקלפי.
CITY_TINY, CITY_SMALL, CITY_MED = 3, 10, 40

def matched_house(text: str) -> str:
    """שולף את מספר הבית מתוך טקסט התוצאה ('נטר 40 ירושלים' → '40')."""
    nums = [t for t in norm(text).split() if t.isdigit()]
    return nums[-1] if nums else ""


def confidence(entry, want, city_kalpiot: int):
    """
    מחזיר (ציון 0–100, סיבה מאוצר מילים סגור).

    הציון נגזר משרשרת הראיות בפועל — לא מהערכה: איזה מנוע ענה, האם שם
    הרחוב הוכל במלואו בתוצאה, והאם מספר הבית תאם. כל הורדה מתועדת כאן.
    """
    if not entry:
        return 0, R_NOT_FOUND

    tier = entry.get("tier", TIER_NONE)
    kind = entry.get("kind", "")
    eng = entry.get("engine", "")
    matched = entry.get("matched", "")
    rtoks = toks(matched)
    nomi_penalty = 5 if eng.startswith("nominatim") else 0

    # ---- זיהוי ודאי של המוסד עצמו ----
    # כשכל המילים המזהות בשם המקום נמצאו בתוצאה, זוהה המבנה שבו הקלפי
    # יושבת בפועל — מדויק יותר מכתובת רחוב, ואין כאן אי-ודאות.
    if kind == "venue":
        dtoks = toks(want.get("venue", "")) - VENUE_STOPWORDS
        hit = len(dtoks & rtoks)
        want_t, got_t = venue_type(want.get("venue", "")), venue_type(matched)
        type_ok = not want_t or not got_t or want_t == got_t
        if (dtoks and dtoks <= rtoks and type_ok
                and base_type(eng.split(":", 1)[-1]) in INSTITUTION_TYPES):
            return 100 - nomi_penalty, R_NONE
        if "entity" in eng or "statistic" in eng:
            return max(0, 55 - nomi_penalty), R_VENUE  # שכבת GIS כללית
        # מוסד מאותו סוג, באותו ישוב, עם מילה מזהה משותפת — כמעט ודאי
        # אותו מבנה. שם המקום במקור נושא לעיתים תיאור נוסף ("- בנין
        # בוגרים") שאינו מופיע במאגר, ואין להעניש עליו.
        if (base_type(eng.split(":", 1)[-1]) in INSTITUTION_TYPES
                and type_ok and hit >= 1):
            return max(0, 90 - nomi_penalty), R_VENUE
        if hit >= 2:
            return max(0, 82 - nomi_penalty), R_VENUE
        return max(0, 66 - nomi_penalty), R_VENUE

    if tier == TIER_CITY:
        # קיבוץ/מושב עם קלפי אחת או שתיים — מרכז הישוב הוא מיקום הקלפי.
        if city_kalpiot <= CITY_TINY:
            return max(0, 90 - nomi_penalty), R_SMALL_CITY
        if city_kalpiot <= CITY_SMALL:
            return max(0, 74 - nomi_penalty), R_SMALL_CITY
        if city_kalpiot <= CITY_MED:
            return max(0, 55 - nomi_penalty), R_CITY
        return max(0, 32 - nomi_penalty), R_CITY

    if tier == TIER_EXACT:
        return 97 - nomi_penalty, R_NONE

    # שם הרחוב לא הוכל במלואו בתוצאה (מותר רק לשמות בני 3+ מילים)
    stoks = toks(want.get("street", ""))
    if stoks and not stoks <= toks(matched):
        return max(0, 60 - nomi_penalty), R_PARTIAL_STREET

    want_h = want.get("house", "")
    got_h = matched_house(matched)
    if want_h and got_h and want_h != got_h:
        try:
            diff = abs(int(want_h) - int(got_h))
        except ValueError:
            diff = 999
        base = 80 if diff <= 4 else 70 if diff <= 20 else 58
        return max(0, base - nomi_penalty), R_HOUSE_DIFF

    # במקור לא היה מספר בית כלל — רמת רחוב היא התשובה הטובה ביותר שקיימת,
    # ובישוב קטן זה כמעט זהה לכתובת מדויקת.
    base = 88 if city_kalpiot <= CITY_TINY else 82 if city_kalpiot <= CITY_SMALL else 76
    return max(0, base - nomi_penalty), R_NO_HOUSE


def apply_verification(score: int, reason: str, entry, ver, want=None):
    """
    משקלל אימות צולב ממנוע בלתי תלוי לתוך הציון.
    הסכמה מחזקת, סתירה ממשית מורידה ומסמנת את השורה לבדיקה ידנית.

    מחזיר (ציון, סיבה, מרחק_במטרים, נקודה_מועדפת_או_None).
    """
    if not ver or not entry or reason == R_NOT_FOUND:
        return score, reason, None, None
    dist = round(haversine_m(entry["lat"], entry["lon"], ver["lat"], ver["lon"]))

    # המנוע הראשי החזיר מספר בית אחר, והמאמת החזיר בדיוק את המספר שביקשנו
    # ובאותו רחוב — במקרה כזה נקודת המאמת מדויקת יותר, ומאמצים אותה.
    if reason == R_HOUSE_DIFF and want:
        same_street = toks(want.get("street", "")) & toks(ver.get("street", ""))
        if ver.get("house") and ver["house"] == want.get("house") and same_street:
            return 88, R_NONE, dist, ver

    # הסכמה במרחק קצר היא ראיה בפני עצמה — הקרבה מוכיחה שמדובר באותו מקום.
    if dist <= AGREE_M:
        return min(100, score + 12), reason, dist, None

    # אבל כדי *לסתור* אותנו, המאמת חייב להוכיח שענה על אותה שאלה. Photon
    # נופל בדיוק באותה מלכודת כמו GovMap ומחזיר רחוב/מוסד שנקרא על שם
    # הישוב בעיר אחרת ('בני יהודה' → מתנ"ס בני יהודה ברחובות, 130 ק"מ).
    # מתוך 677 סתירות, רק 14 היו של מאמת שנמצא בישוב המבוקש.
    if want:
        ctoks = toks(city_core(want.get("city", "")))
        vtoks = toks(f"{ver.get('city', '')} {ver.get('matched', '')}")
        if ctoks and not ctoks <= vtoks:
            return score, reason, None, None  # המאמת אינו קביל — מתעלמים

    if dist >= CONFLICT_M:
        return max(10, score - 25), R_CONFLICT, dist, None
    return score, reason, dist, None


# ----------------------------------------------------------------------------
# אימות צולב מול מנוע בלתי תלוי
# ----------------------------------------------------------------------------
VERIFY_CACHE_FILE = "verify_cache.json"
PHOTON_URL = "https://photon.komoot.io/api"
BROWSER_UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
              "(KHTML, like Gecko) Chrome/120.0 Safari/537.36")
GOOGLE_URL = "https://maps.googleapis.com/maps/api/geocode/json"
WAZE_URL = "https://www.waze.com/live-map/api/autocomplete"

AGREE_M = 250      # עד כאן — המקורות מסכימים, הביטחון עולה
CONFLICT_M = 1500  # מעל כאן — סתירה ממשית, הביטחון יורד והשורה מסומנת


def haversine_m(lat1, lon1, lat2, lon2) -> float:
    from math import asin, cos, radians, sin, sqrt

    dlat, dlon = radians(lat2 - lat1), radians(lon2 - lon1)
    a = sin(dlat / 2) ** 2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(dlon / 2) ** 2
    return 2 * 6371000 * asin(sqrt(a))


def verify_photon(address: str):
    """Photon — מנוע OSM עצמאי. בלתי תלוי בקדסטר הממשלתי של GovMap."""
    try:
        r = SESSION.get(
            PHOTON_URL,
            params={"q": address, "limit": 5, "bbox": "34.2,29.3,35.95,33.5"},
            # Photon מחזיר 403 ל-User-Agent של python-requests. אין כאן עקיפת
            # הגבלה מכוונת — רק כותרת דפדפן רגילה כדי שהבקשה תתקבל.
            headers={"Content-Type": None, "User-Agent": BROWSER_UA},
            timeout=25,
        )
    except (requests.Timeout, requests.ConnectionError) as exc:
        raise TransientError(f"photon: {exc}") from exc
    if r.status_code >= 500 or r.status_code == 429:
        raise TransientError(f"photon HTTP {r.status_code}")
    try:
        feats = (r.json() or {}).get("features") or []
    except ValueError:
        return None
    for f in feats:
        try:
            lon, lat = f["geometry"]["coordinates"][:2]
        except (KeyError, IndexError, TypeError):
            continue
        if in_israel(lat, lon):
            p = f.get("properties") or {}
            name = ", ".join(
                str(p[k]) for k in ("name", "street", "housenumber", "city") if p.get(k)
            )
            return {"lat": round(lat, 6), "lon": round(lon, 6),
                    "engine": "photon", "matched": name[:80],
                    "house": str(p.get("housenumber") or ""),
                    "street": str(p.get("street") or p.get("name") or ""),
                    "city": str(p.get("city") or "")}
    return None


def verify_google(address: str, key: str):
    """Google Geocoding — דורש מפתח API בתשלום (GOOGLE_MAPS_API_KEY)."""
    try:
        r = SESSION.get(
            GOOGLE_URL,
            params={"address": address, "key": key, "region": "il", "language": "he"},
            headers={"Content-Type": None},
            timeout=25,
        )
    except (requests.Timeout, requests.ConnectionError) as exc:
        raise TransientError(f"google: {exc}") from exc
    try:
        data = r.json()
    except ValueError:
        return None
    if data.get("status") in ("OVER_QUERY_LIMIT", "UNKNOWN_ERROR"):
        raise TransientError(f"google {data.get('status')}")
    for res in data.get("results") or []:
        loc = ((res.get("geometry") or {}).get("location")) or {}
        lat, lon = loc.get("lat"), loc.get("lng")
        if lat is not None and in_israel(lat, lon):
            return {"lat": round(lat, 6), "lon": round(lon, 6), "engine": "google",
                    "matched": str(res.get("formatted_address", ""))[:80]}
    return None


def city_query(city: str) -> dict:
    """שאילתת ישוב בלבד — משמשת לשכבת הגיבוי שמבטיחה כיסוי מלא."""
    variants = [{"text": city, "ceiling": TIER_CITY, "kind": "city"}]
    if strip_punct(city) != city:
        variants.append({"text": strip_punct(city), "ceiling": TIER_CITY, "kind": "city"})
    # שם בסוגריים ("אבו קרינאת (יישוב)") — מנסים גם בלי ההסבר בסוגריים.
    bare = re.sub(r"\([^)]*\)", " ", city).strip()
    if bare and bare != city:
        variants.append({"text": bare, "ceiling": TIER_CITY, "kind": "city"})
    return {
        "city": city,
        "street": "",
        "house": "",
        "letter": "",
        "venue": "",
        "variants": variants,
    }


def geocode(want, engine="govmap"):
    """
    מריץ את סולם הוריאציות מול המנועים ומחזיר dict או None.
    זורק TransientError אם כל הניסיונות כשלו מסיבת רשת, כדי לא לשמור
    כשל זמני במטמון בתור "לא נמצא".
    """
    engines = (
        [geocode_govmap, geocode_nominatim]
        if engine == "govmap"
        else [geocode_nominatim, geocode_govmap]
    )
    fine = [v for v in want["variants"] if v["ceiling"] < TIER_CITY]
    coarse = [v for v in want["variants"] if v["ceiling"] >= TIER_CITY]
    transient = False

    # סדר מנוע-ראשי: כל וריאציות הרחוב/הכתובת במנוע הראשי, ורק אם כולן
    # נכשלו — המנוע המשני. אחרת כל כתובת כושלת שולחת 5 בקשות ל-Nominatim
    # (בקשה לשנייה) והריצה נחנקת. שלב הישוב תמיד אחרון, כדי לא להעדיף
    # מרכז ישוב על פני כתובת מדויקת שמנוע אחר היה מוצא.
    for stage in (fine, coarse):
        for fn in engines:
            # Nominatim מוגבל לבקשה אחת בשנייה, גלובלית, ולכן הוא שולט
            # בזמן הריצה כולה: כתובת שנופלת עד רמת הישוב שילמה שלוש
            # קריאות מסודרות לפני שהגיעה לשם. הוא מקבל וריאציה אחת בלבד —
            # הוא ממילא מנרמל פיסוק ונסוג לרמת רחוב בעצמו.
            vs = stage[:1] if fn is geocode_nominatim else stage
            for variant in vs:
                try:
                    res = fn(variant, want)
                except TransientError:
                    transient = True
                    continue
                if res:
                    res["tier"] = max(res["tier"], variant["ceiling"])
                    res["query"] = variant["text"]
                    res["kind"] = variant["kind"]
                    return res
    if transient:
        raise TransientError("all variants failed transiently")
    return None


# ----------------------------------------------------------------------------
# כתיבת הפלט — שמירה מוחלטת על החוברת המקורית
# ----------------------------------------------------------------------------
def write_output(in_path: Path, out_path: Path, sheet: str, columns):
    """
    מעתיק את החוברת המקורית ומוסיף את העמודות החדשות בסוף.
    לא משתמשים ב-to_excel: הוא ממיר טיפוסים, מאבד עיצוב ומוחק גיליונות אחרים.

    `columns` — רשימת (כותרת, ערכים).
    """
    import openpyxl

    wb = openpyxl.load_workbook(in_path)
    ws = wb[sheet]
    ncol = ws.max_column
    for j, (header, values) in enumerate(columns, start=1):
        ws.cell(row=1, column=ncol + j, value=header)
        for i, v in enumerate(values):
            ws.cell(row=i + 2, column=ncol + j, value=v)
    wb.save(out_path)


# ----------------------------------------------------------------------------
# דוח בקרת איכות
# ----------------------------------------------------------------------------
def qa_report(df, details, keys, out_path, vdist=(), n_sample=5):
    total = len(df)
    coords = df[NEW_COL]
    ok = int((coords != "").sum())

    print("\n" + "=" * 64)
    print("דוח בקרת איכות")
    print("=" * 64)
    print(f"קובץ פלט: {out_path}")
    print(f"שורות: {total:,}  |  עם קואורדינטות: {ok:,} ({ok / total:.1%})")

    print(f"ציון ביטחון ממוצע: {df[NEW_COL_CONF].mean():.1f}/100  "
          f"(חציון {df[NEW_COL_CONF].median():.0f})")

    print("\nפילוח לפי סיבת אי-ודאות:")
    for label in REASONS:
        cnt = int((df[NEW_COL_REASON] == label).sum())
        if not cnt:
            continue
        avg = df.loc[df[NEW_COL_REASON] == label, NEW_COL_CONF].mean()
        print(f"  {label:<22} {cnt:6,}  ({cnt / total:5.1%})   ציון ממוצע {avg:.0f}")

    ver = [d for d in vdist if d is not None]
    if ver:
        agree = sum(1 for d in ver if d <= AGREE_M)
        conflict = sum(1 for d in ver if d >= CONFLICT_M)
        print(f"\nאימות צולב: {len(ver):,} שורות נבדקו מול מנוע בלתי תלוי")
        print(f"  מאשר (עד {AGREE_M} מ'):      {agree:6,}  ({agree / len(ver):5.1%})")
        print(f"  ביניים:                  {len(ver) - agree - conflict:6,}")
        print(f"  סותר (מעל {CONFLICT_M} מ'):  {conflict:6,}  ({conflict / len(ver):5.1%})")

    print("\nפילוח לפי רמת דיוק:")
    for label, cnt in df[NEW_COL_SRC].value_counts().items():
        print(f"  {label:<44} {cnt:6,}  ({cnt / total:5.1%})")

    bad = []
    for i, c in enumerate(coords):
        if not c:
            continue
        lat, lon = (float(x) for x in c.split(","))
        if not in_israel(lat, lon):
            bad.append((i, c))
    print(f"\nאימות תחום ישראל (lat {LAT_MIN}–{LAT_MAX}, lon {LON_MIN}–{LON_MAX}):")
    print(f"  חריגות: {len(bad)}" + ("  ✓" if not bad else "  ✗ באג!"))
    for i, c in bad[:10]:
        print(f"    שורה {i + 2}: {c}")

    fmt = re.compile(r"^-?\d+\.\d{6}, -?\d+\.\d{6}$")
    bad_fmt = [c for c in coords if c and not fmt.match(c)]
    print(f"  פורמט (6 ספרות עשרוניות): {'✓' if not bad_fmt else f'✗ {len(bad_fmt)} חריגות'}")

    have = df[df[NEW_COL] != ""]
    if len(have):
        print(f"\nמדגם אקראי ({min(n_sample, len(have))} שורות) לבדיקה ידנית:")
        rnd = random.Random(20260817)
        for idx in rnd.sample(list(have.index), min(n_sample, len(have))):
            r = df.loc[idx]
            e = details[idx] or {}
            lat, lon = r[NEW_COL].split(", ")
            print(f"\n  שורה {idx + 2} | {clean(r[COL_CITY])} | {clean(r[COL_VENUE])}")
            print(f"    נשלח : {e.get('query', '')}")
            print(f"    התקבל: {e.get('matched', '')}")
            print(f"    דיוק : {r[NEW_COL_SRC]}")
            print(f"    https://www.google.com/maps?q={lat},{lon}")

    missing = sorted({keys[i] for i in df.index if not df.at[i, NEW_COL]})
    print(f"\nכתובות ייחודיות ללא תוצאה: {len(missing)}")
    for a in missing[:40]:
        print(f"    {a}")
    if len(missing) > 40:
        print(f"    ... ועוד {len(missing) - 40}")
    if missing:
        p = out_path.with_name("כתובות שלא נמצאו.txt")
        p.write_text("\n".join(missing), encoding="utf-8")
        print(f"  הרשימה המלאה נשמרה: {p}")
    print("=" * 64)


# ----------------------------------------------------------------------------
# main
# ----------------------------------------------------------------------------
def run_selftest():
    print("בדיקת מנועי גיאוקודינג\n")
    print("GovMap — איתור endpoint פעיל:")
    ep = probe_govmap()
    print(f"\n  → נבחר: {ep['name'] if ep else 'אין endpoint פעיל'}\n")

    controls = [
        {COL_CITY: "תל אביב - יפו", COL_STREET: "הרצל", COL_HOUSE: "1", COL_VENUE: ""},
        {COL_CITY: "ירושלים", COL_STREET: 'מעגלי הרי"ם לוין', COL_HOUSE: "27", COL_VENUE: ""},
        {COL_CITY: "חיפה", COL_STREET: "שדרות ירושלים", COL_HOUSE: "10", COL_VENUE: ""},
    ]
    print("כתובות ביקורת:")
    for row in controls:
        want = build_query(row)
        try:
            res = geocode(want, "govmap" if ep else "nominatim")
        except TransientError as exc:
            print(f"  {want['variants'][0]['text']}: כשל רשת — {exc}")
            continue
        head = want["variants"][0]["text"]
        if not res:
            print(f"  {head}: לא נמצא")
            continue
        print(f"  {head}")
        print(f"    {res['lat']}, {res['lon']}  [{TIER_LABEL[res['tier']]} / {res['engine']}]")
        print(f"    התאמה: {res.get('matched', '')}")
        print(f"    https://www.google.com/maps?q={res['lat']},{res['lon']}")
    return 0 if ep else 1


def main() -> int:
    ap = argparse.ArgumentParser(description="גיאוקודינג לקובץ הקלפיות")
    ap.add_argument("input", nargs="?", help="נתיב לקובץ קלפיות.xlsx")
    ap.add_argument("--out", default=None)
    ap.add_argument("--engine", choices=["govmap", "nominatim"], default="govmap")
    ap.add_argument("--sheet", default=SHEET)
    ap.add_argument("--workers", type=int, default=8, help="בקשות במקביל (GovMap בלבד)")
    ap.add_argument("--limit", type=int, default=0, help="הגבל למספר כתובות ייחודיות")
    ap.add_argument("--selftest", action="store_true")
    ap.add_argument("--report-only", action="store_true")
    ap.add_argument("--cache", default=None)
    ap.add_argument("--verify", action="store_true",
                    help="אימות צולב מול מנוע בלתי תלוי לשורות בציון נמוך")
    ap.add_argument("--verify-below", type=int, default=75,
                    help="סף הציון שמתחתיו מריצים אימות צולב (ברירת מחדל 75)")
    args = ap.parse_args()

    if args.selftest:
        return run_selftest()
    if not args.input:
        ap.error("חסר נתיב קובץ קלט (או השתמש ב---selftest)")

    in_path = Path(args.input)
    out_path = (
        Path(args.out) if args.out
        else in_path.with_name(in_path.stem + " עם קואורדינטות.xlsx")
    )

    df = pd.read_excel(in_path, sheet_name=args.sheet)
    print(f"נטענו {len(df):,} שורות מ-{in_path.name} (גיליון {args.sheet})")

    queries = [build_query(r) for _, r in df.iterrows()]
    keys = [q["variants"][0]["text"] if q["variants"] else "" for q in queries]
    uniq: dict[str, dict] = {}
    for k, q in zip(keys, queries):
        if k and k not in uniq:
            uniq[k] = q
    print(f"{len(uniq):,} כתובות ייחודיות")

    cache_path = Path(args.cache) if args.cache else in_path.parent / CACHE_FILE
    cache = {}
    if cache_path.exists():
        try:
            cache = json.loads(cache_path.read_text(encoding="utf-8"))
        except ValueError:
            print("אזהרה: המטמון פגום, מתחיל מחדש")

    todo = [] if args.report_only else [k for k in uniq if k not in cache]
    if args.limit:
        todo = todo[: args.limit]

    if todo:
        if args.engine == "govmap":
            print("\nאיתור endpoint פעיל של GovMap:")
            if probe_govmap() is None:
                print("  אין endpoint פעיל — עובר ל-Nominatim (~1 שנייה לכתובת)")
                args.engine, args.workers = "nominatim", 1
            else:
                print(f"  → {_ACTIVE_GOVMAP['name']}")
        if args.engine == "nominatim":
            args.workers = 1

        print(f"\nמגאוקוד {len(todo):,} כתובות ({args.workers} במקביל)…")
        lock, done, t0 = threading.Lock(), [0], time.monotonic()

        def work(key):
            try:
                res = geocode(uniq[key], args.engine)
                transient = False
            except TransientError:
                res, transient = None, True  # לא נשמר — יינוסה שוב
            with lock:
                if not transient:
                    cache[key] = res
                done[0] += 1
                n = done[0]
                if n % 50 == 0 or n == len(todo):
                    cache_path.write_text(
                        json.dumps(cache, ensure_ascii=False), encoding="utf-8"
                    )
                    el = time.monotonic() - t0
                    rate = n / el if el else 0
                    eta = (len(todo) - n) / rate if rate else 0
                    print(
                        f"  {n:,}/{len(todo):,} ({n / len(todo):5.1%})  "
                        f"{rate:.1f}/שנ'  נותרו ~{eta / 60:.0f} דק'"
                    )

        try:
            if args.workers > 1:
                with ThreadPoolExecutor(max_workers=args.workers) as pool:
                    list(pool.map(work, todo))
            else:
                for k in todo:
                    work(k)
        except KeyboardInterrupt:
            print("\nהופסק — המטמון נשמר, הרץ שוב כדי להמשיך.")
        finally:
            cache_path.write_text(json.dumps(cache, ensure_ascii=False), encoding="utf-8")

    # ------------------------------------------------------------------
    # שכבת גיבוי: כל שורה שהכתובת שלה לא נפתרה מקבלת את מרכז הישוב.
    # זו נקודה אמיתית ממקור מוסמך — לא הערכה — ומסומנת "ישוב בלבד",
    # כך שהכיסוי מלא בלי לטעון לדיוק שאין.
    # ------------------------------------------------------------------
    city_cache_path = cache_path.with_name("city_cache.json")
    city_cache = {}
    if city_cache_path.exists():
        try:
            city_cache = json.loads(city_cache_path.read_text(encoding="utf-8"))
        except ValueError:
            pass

    need_city = sorted(
        {q["city"] for k, q in zip(keys, queries)
         if q["city"] and not cache.get(k) and q["city"] not in city_cache}
    )
    if need_city and not args.report_only:
        print(f"\nשכבת גיבוי — מאתר מרכז ישוב עבור {len(need_city):,} ישובים…")
        clock = threading.Lock()
        cdone = [0]

        def cwork(city):
            try:
                res = geocode(city_query(city), args.engine)
            except TransientError:
                return
            with clock:
                city_cache[city] = res
                cdone[0] += 1
                if cdone[0] % 25 == 0 or cdone[0] == len(need_city):
                    city_cache_path.write_text(
                        json.dumps(city_cache, ensure_ascii=False), encoding="utf-8"
                    )
                    print(f"  {cdone[0]:,}/{len(need_city):,}")

        try:
            with ThreadPoolExecutor(max_workers=max(1, args.workers)) as pool:
                list(pool.map(cwork, need_city))
        finally:
            city_cache_path.write_text(
                json.dumps(city_cache, ensure_ascii=False), encoding="utf-8"
            )

    def entry_for(k, q):
        e = cache.get(k)
        if e:
            return e, False
        e = city_cache.get(q["city"])
        return (e, True) if e else (None, False)

    def fmt_coord(k, q):
        e, _ = entry_for(k, q)
        return f"{e['lat']:.6f}, {e['lon']:.6f}" if e else ""

    def fmt_prec(k, q):
        e, fb = entry_for(k, q)
        if not e:
            return TIER_LABEL[TIER_NONE]
        tier = TIER_CITY if fb else e["tier"]
        return f"{TIER_LABEL[tier]} ({e['engine']}{' — גיבוי ישוב' if fb else ''})"

    coords = [fmt_coord(k, q) for k, q in zip(keys, queries)]
    precision = [fmt_prec(k, q) for k, q in zip(keys, queries)]
    details = [entry_for(k, q)[0] for k, q in zip(keys, queries)]

    # מספר הקלפיות בישוב — משמש כמדד לגודלו בציון הביטחון של "מרכז ישוב".
    city_counts = collections.Counter(q["city"] for q in queries)
    ents = []
    for (k, q), e in zip(zip(keys, queries), details):
        ent = dict(e) if e else None
        if ent and entry_for(k, q)[1]:  # נפתר דרך שכבת גיבוי הישוב
            ent["tier"], ent["kind"] = TIER_CITY, "city"
        ents.append(ent)
    scored = [confidence(e, q, city_counts[q["city"]]) for e, q in zip(ents, queries)]

    # ---- אימות צולב מול מנוע בלתי תלוי, לשורות בעלות ביטחון נמוך ----
    vpath = cache_path.with_name(VERIFY_CACHE_FILE)
    vcache = {}
    if vpath.exists():
        try:
            vcache = json.loads(vpath.read_text(encoding="utf-8"))
        except ValueError:
            pass

    if args.verify:
        gkey = os.environ.get("GOOGLE_MAPS_API_KEY", "").strip()
        todo_v = sorted(
            {k for k, (s, r) in zip(keys, scored)
             if k and s < args.verify_below and k not in vcache}
        )
        print(f"\nאימות צולב ({'google+photon' if gkey else 'photon'}) "
              f"ל-{len(todo_v):,} כתובות בציון < {args.verify_below}…")
        vlock, vdone = threading.Lock(), [0]

        def vwork(key):
            addr = key
            res = None
            try:
                if gkey:
                    res = verify_google(addr, gkey)
                if not res:
                    res = verify_photon(addr)
            except TransientError:
                return
            with vlock:
                vcache[key] = res
                vdone[0] += 1
                if vdone[0] % 50 == 0 or vdone[0] == len(todo_v):
                    vpath.write_text(json.dumps(vcache, ensure_ascii=False), encoding="utf-8")
                    print(f"  {vdone[0]:,}/{len(todo_v):,}")

        try:
            with ThreadPoolExecutor(max_workers=4) as pool:
                list(pool.map(vwork, todo_v))
        finally:
            vpath.write_text(json.dumps(vcache, ensure_ascii=False), encoding="utf-8")

    conf, reason, vdist, adopted = [], [], [], 0
    for i, ((s, r), e, k, q) in enumerate(zip(scored, ents, keys, queries)):
        s2, r2, d, better = apply_verification(s, r, e, vcache.get(k), q)
        if better:  # נקודת המאמת מדויקת יותר — מחליפים גם את הקואורדינטה
            coords[i] = f"{better['lat']:.6f}, {better['lon']:.6f}"
            precision[i] = f"{TIER_LABEL[TIER_EXACT]} ({better['engine']} — אומת)"
            adopted += 1
        conf.append(s2)
        reason.append(r2)
        vdist.append(d)
    if adopted:
        print(f"  {adopted:,} שורות שודרגו לקואורדינטה מדויקת יותר מהמאמת")

    df[NEW_COL] = coords
    df[NEW_COL_SRC] = precision
    df[NEW_COL_CONF] = conf
    df[NEW_COL_REASON] = reason

    write_output(
        in_path, out_path, args.sheet,
        [(NEW_COL, [c or None for c in coords]),
         (NEW_COL_SRC, precision),
         (NEW_COL_CONF, conf),
         (NEW_COL_REASON, reason)],
    )
    print(f"\nנשמר: {out_path}")

    qa_report(df, details, keys, out_path, vdist)
    return 0


if __name__ == "__main__":
    sys.exit(main())
