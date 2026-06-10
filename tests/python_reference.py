#!/usr/bin/env python3
"""
Independent FIFA World Cup 2026 bracket calculator.
Implements group standings + best-third + R32 assignment from scratch.
Used as a reference to cross-validate our JavaScript implementation.

Based on FIFA Competition Regulations 2026:
- Group standings: Pts > H2H Pts > H2H GD > H2H GF > Overall GD > Overall GF > Drawing of lots
- Best 8 third-place teams qualify for R32
- Third-place assignment per FIFA Annex C (495-scenario table)
"""
import json, random, sys
from itertools import combinations

# FIFA/Coca-Cola World Ranking (last-resort tiebreaker per 2026 regulations)
FIFA_RANKING = {
    "FRA": 1, "ESP": 2, "ARG": 3, "ENG": 4, "POR": 5, "BRA": 6, "NED": 7, "MAR": 8,
    "BEL": 9, "GER": 10, "CRO": 11, "COL": 13, "SEN": 14, "MEX": 15, "USA": 16,
    "URU": 17, "JPN": 18, "SUI": 19, "IRN": 21, "TUR": 22, "ECU": 23, "AUT": 24,
    "KOR": 25, "AUS": 27, "ALG": 28, "EGY": 29, "CAN": 30, "NOR": 31, "PAN": 33,
    "CIV": 34, "SWE": 38, "PAR": 40, "CZE": 41, "SCO": 43, "TUN": 44, "COD": 46,
    "UZB": 50, "QAT": 55, "IRQ": 57, "RSA": 60, "KSA": 61, "JOR": 63, "BIH": 65,
    "CPV": 69, "GHA": 74, "CUR": 82, "HAI": 83, "NZL": 85,
}

# ============ GROUPS (from FIFA official draw) ============
GROUPS = {
    "A": ["MEX","RSA","KOR","CZE"],
    "B": ["CAN","BIH","QAT","SUI"],
    "C": ["BRA","MAR","HAI","SCO"],
    "D": ["USA","PAR","AUS","TUR"],
    "E": ["GER","CUR","CIV","ECU"],
    "F": ["NED","JPN","SWE","TUN"],
    "G": ["BEL","EGY","IRN","NZL"],
    "H": ["ESP","CPV","KSA","URU"],
    "I": ["FRA","SEN","IRQ","NOR"],
    "J": ["ARG","ALG","AUT","JOR"],
    "K": ["POR","COD","UZB","COL"],
    "L": ["ENG","CRO","GHA","PAN"],
}

# FIFA match pairings per group (seed positions, FIFA official order)
# MD1: 1v2, 3v4 | MD2: 4v2, 1v3 | MD3: 4v1, 2v3
GROUP_PAIRINGS = [
    (1,2), (3,4),  # MD1
    (4,2), (1,3),  # MD2
    (4,1), (2,3),  # MD3
]

# ============ THIRD-PLACE TABLE (FIFA Annex C, extracted from Excel) ============
# Load from our JS file
def load_third_place_table():
    import re, os
    # Source has migrated to .ts; try both for a clean failure mode.
    for ext in ("ts", "js"):
        path = f"/home/user/Beeri-World-Cup/src/data/thirdPlaceTable.{ext}"
        if os.path.exists(path):
            with open(path) as f:
                content = f.read()
            break
    else:
        raise FileNotFoundError("thirdPlaceTable not found in src/data/")
    entries = re.findall(r'(\w{8}):\s*"(\w{8})"', content)
    return dict(entries)

THIRD_PLACE_TABLE = load_third_place_table()
THIRD_PLACE_SLOTS = ["R32-2","R32-5","R32-7","R32-8","R32-9","R32-10","R32-13","R32-15"]

# ============ GROUP STANDINGS (with H2H tiebreaker) ============
def calc_group_standings(group_name, match_results):
    """Calculate standings for one group with FIFA tiebreaker rules."""
    teams = GROUPS[group_name]
    stats = {t: {"code":t,"pts":0,"gf":0,"ga":0,"w":0,"d":0,"l":0,"played":0} for t in teams}

    matches = []
    for i, (h_pos, a_pos) in enumerate(GROUP_PAIRINGS):
        h_team = teams[h_pos - 1]
        a_team = teams[a_pos - 1]
        match_id = f"group-{group_name}-{i+1}"
        result = match_results.get(match_id)
        if not result: continue

        hs, aws = result["homeScore"], result["awayScore"]
        if hs is None or aws is None: continue

        matches.append({"home": h_team, "away": a_team, "hs": hs, "as": aws})

        stats[h_team]["played"] += 1; stats[a_team]["played"] += 1
        stats[h_team]["gf"] += hs; stats[h_team]["ga"] += aws
        stats[a_team]["gf"] += aws; stats[a_team]["ga"] += hs

        if hs > aws:
            stats[h_team]["pts"] += 3; stats[h_team]["w"] += 1; stats[a_team]["l"] += 1
        elif hs < aws:
            stats[a_team]["pts"] += 3; stats[a_team]["w"] += 1; stats[h_team]["l"] += 1
        else:
            stats[h_team]["pts"] += 1; stats[a_team]["pts"] += 1
            stats[h_team]["d"] += 1; stats[a_team]["d"] += 1

    def h2h_stats(tied_codes):
        """Compute head-to-head stats among tied teams."""
        code_set = set(tied_codes)
        h2h = {c: {"pts":0,"gd":0,"gf":0} for c in tied_codes}
        for m in matches:
            if m["home"] in code_set and m["away"] in code_set:
                if m["hs"] > m["as"]:
                    h2h[m["home"]]["pts"] += 3
                elif m["hs"] < m["as"]:
                    h2h[m["away"]]["pts"] += 3
                else:
                    h2h[m["home"]]["pts"] += 1; h2h[m["away"]]["pts"] += 1
                h2h[m["home"]]["gf"] += m["hs"]; h2h[m["home"]]["gd"] += m["hs"] - m["as"]
                h2h[m["away"]]["gf"] += m["as"]; h2h[m["away"]]["gd"] += m["as"] - m["hs"]
        return h2h

    def sort_tied(tied_teams):
        if len(tied_teams) <= 1:
            return tied_teams
        codes = [t["code"] for t in tied_teams]
        h2h = h2h_stats(codes)

        # Sort by H2H criteria only first (FIFA rules a-c)
        h2h_sorted = sorted(tied_teams, key=lambda t: (
            -h2h[t["code"]]["pts"], -h2h[t["code"]]["gd"], -h2h[t["code"]]["gf"]
        ))

        # Group consecutive teams still tied on H2H, then recurse or fall to overall
        result = []
        i = 0
        while i < len(h2h_sorted):
            j = i + 1
            while j < len(h2h_sorted):
                a, b = h2h_sorted[i]["code"], h2h_sorted[j]["code"]
                if (h2h[a]["pts"] != h2h[b]["pts"] or h2h[a]["gd"] != h2h[b]["gd"]
                        or h2h[a]["gf"] != h2h[b]["gf"]):
                    break
                j += 1
            sub = h2h_sorted[i:j]
            if len(sub) > 1 and len(sub) < len(tied_teams):
                result.extend(sort_tied(sub))  # Recursive H2H (FIFA rule d)
            elif len(sub) > 1:
                # H2H exhausted — fall to overall stats (FIFA rules e-h)
                result.extend(sorted(sub, key=lambda t: (-(t["gf"]-t["ga"]), -t["gf"], FIFA_RANKING.get(t["code"], 999))))
            else:
                result.extend(sub)
            i = j
        return result

    # Sort by points first, then apply tiebreakers within groups of equal points
    team_list = list(stats.values())
    team_list.sort(key=lambda t: -t["pts"])

    result = []
    i = 0
    while i < len(team_list):
        j = i + 1
        while j < len(team_list) and team_list[j]["pts"] == team_list[i]["pts"]:
            j += 1
        tied = team_list[i:j]
        result.extend(sort_tied(tied))
        i = j

    return result

# ============ BEST THIRD PLACE ============
def get_best_third(all_standings):
    thirds = []
    for group, standing in all_standings.items():
        if len(standing) >= 3:
            t = standing[2].copy()
            t["group"] = group
            thirds.append(t)

    thirds.sort(key=lambda t: (-t["pts"], -(t["gf"]-t["ga"]), -t["gf"], FIFA_RANKING.get(t["code"], 999)))
    return thirds[:8]

# ============ THIRD-PLACE ASSIGNMENT ============
def assign_third_place(qualifying_thirds):
    groups = sorted([t["group"] for t in qualifying_thirds])
    key = "".join(groups)
    encoded = THIRD_PLACE_TABLE.get(key)
    if not encoded:
        return {}

    third_by_group = {t["group"]: t["code"] for t in qualifying_thirds}
    assignments = {}
    for i, slot in enumerate(THIRD_PLACE_SLOTS):
        assignments[slot] = third_by_group.get(encoded[i])
    return assignments

# ============ BUILD R32 ============
def build_r32(match_results):
    all_standings = {}
    for g in GROUPS:
        all_standings[g] = calc_group_standings(g, match_results)

    best_third = get_best_third(all_standings)
    third_assignments = assign_third_place(best_third)

    def resolve_pos(pos):
        position = int(pos[0])
        group = pos[1]
        standing = all_standings.get(group, [])
        if len(standing) >= position:
            return standing[position - 1]["code"]
        return None

    R32_DEFS = [
        ("R32-1", "2A", "2B"),
        ("R32-2", "1E", "3rd"),
        ("R32-3", "1F", "2C"),
        ("R32-4", "1C", "2F"),
        ("R32-5", "1I", "3rd"),
        ("R32-6", "2E", "2I"),
        ("R32-7", "1A", "3rd"),
        ("R32-8", "1L", "3rd"),
        ("R32-9", "1D", "3rd"),
        ("R32-10", "1G", "3rd"),
        ("R32-11", "2K", "2L"),
        ("R32-12", "1H", "2J"),
        ("R32-13", "1B", "3rd"),
        ("R32-14", "1J", "2H"),
        ("R32-15", "1K", "3rd"),
        ("R32-16", "2D", "2G"),
    ]

    r32 = {}
    for match_id, home_pos, away_pos in R32_DEFS:
        home = resolve_pos(home_pos)
        if away_pos == "3rd":
            away = third_assignments.get(match_id)
        else:
            away = resolve_pos(away_pos)
        r32[match_id] = {"home": home, "away": away}

    return r32, all_standings, best_third

# ============ MAIN: CROSS-VALIDATION ============
if __name__ == "__main__":
    # Output JSON for the JS test to consume
    import sys

    if len(sys.argv) > 1 and sys.argv[1] == "--generate":
        # Generate random scores and output both scores and expected R32
        seed = int(sys.argv[2]) if len(sys.argv) > 2 else random.randint(0, 999999)
        random.seed(seed)

        match_results = {}
        for g in GROUPS:
            teams = GROUPS[g]
            for i, (h_pos, a_pos) in enumerate(GROUP_PAIRINGS):
                match_id = f"group-{g}-{i+1}"
                match_results[match_id] = {
                    "homeScore": random.randint(0, 4),
                    "awayScore": random.randint(0, 4),
                }

        r32, standings, best_third = build_r32(match_results)

        output = {
            "seed": seed,
            "scores": match_results,
            "r32": r32,
            "standings": {g: [{"code": t["code"], "pts": t["pts"], "gf": t["gf"], "ga": t["ga"]} for t in s] for g, s in standings.items()},
            "qualifying_thirds": [t["group"] for t in best_third],
        }
        print(json.dumps(output))

    if len(sys.argv) > 1 and sys.argv[1] == "--batch":
        # Run N trials
        n = int(sys.argv[2]) if len(sys.argv) > 2 else 100

        # Load the ACTUAL match ID → pairing mapping from JS
        import subprocess
        mapping_json = subprocess.check_output([
            "node", "--loader", "/home/user/Beeri-World-Cup/tests/loader.mjs", "-e",
            """import { groupMatches } from '/home/user/Beeri-World-Cup/src/data/matches.js';
import { GROUPS } from '/home/user/Beeri-World-Cup/src/data/teams.js';
const r = {};
for (const m of groupMatches) {
  const t = GROUPS[m.group].map(x => x.code);
  r[m.id] = [t.indexOf(m.homeTeam)+1, t.indexOf(m.awayTeam)+1];
}
process.stdout.write(JSON.stringify(r));"""
        ], stderr=subprocess.DEVNULL).decode()
        js_mapping = json.loads(mapping_json)

        results = []
        for trial in range(n):
            random.seed(trial)
            match_results = {}
            for g in GROUPS:
                for i in range(1, 7):
                    mid = f"group-{g}-{i}"
                    match_results[mid] = {
                        "homeScore": random.randint(0, 4),
                        "awayScore": random.randint(0, 4),
                    }

            # Override GROUP_PAIRINGS per group to match JS mapping
            # Rebuild calc_group_standings to use js_mapping
            all_standings = {}
            for gn in GROUPS:
                teams = GROUPS[gn]
                stats = {t: {"code":t,"pts":0,"gf":0,"ga":0,"w":0,"d":0,"l":0,"played":0} for t in teams}
                matches_list = []
                for i in range(1, 7):
                    mid = f"group-{gn}-{i}"
                    pair = js_mapping[mid]  # [homeIdx, awayIdx] 1-based
                    h_team = teams[pair[0]-1]
                    a_team = teams[pair[1]-1]
                    result = match_results[mid]
                    hs, aws = result["homeScore"], result["awayScore"]
                    matches_list.append({"home": h_team, "away": a_team, "hs": hs, "as": aws})
                    stats[h_team]["played"] += 1; stats[a_team]["played"] += 1
                    stats[h_team]["gf"] += hs; stats[h_team]["ga"] += aws
                    stats[a_team]["gf"] += aws; stats[a_team]["ga"] += hs
                    if hs > aws:
                        stats[h_team]["pts"] += 3; stats[h_team]["w"] += 1; stats[a_team]["l"] += 1
                    elif hs < aws:
                        stats[a_team]["pts"] += 3; stats[a_team]["w"] += 1; stats[h_team]["l"] += 1
                    else:
                        stats[h_team]["pts"] += 1; stats[a_team]["pts"] += 1
                        stats[h_team]["d"] += 1; stats[a_team]["d"] += 1

                # Sort with H2H
                def h2h_stats_local(tied_codes):
                    code_set = set(tied_codes)
                    h2h = {c: {"pts":0,"gd":0,"gf":0} for c in tied_codes}
                    for m in matches_list:
                        if m["home"] in code_set and m["away"] in code_set:
                            if m["hs"] > m["as"]: h2h[m["home"]]["pts"] += 3
                            elif m["hs"] < m["as"]: h2h[m["away"]]["pts"] += 3
                            else: h2h[m["home"]]["pts"] += 1; h2h[m["away"]]["pts"] += 1
                            h2h[m["home"]]["gf"] += m["hs"]; h2h[m["home"]]["gd"] += m["hs"] - m["as"]
                            h2h[m["away"]]["gf"] += m["as"]; h2h[m["away"]]["gd"] += m["as"] - m["hs"]
                    return h2h

                def sort_tied_local(tied):
                    if len(tied) <= 1: return tied
                    codes = [t["code"] for t in tied]
                    h2h = h2h_stats_local(codes)
                    h2h_sorted = sorted(tied, key=lambda t: (
                        -h2h[t["code"]]["pts"], -h2h[t["code"]]["gd"], -h2h[t["code"]]["gf"]
                    ))
                    result = []
                    i = 0
                    while i < len(h2h_sorted):
                        j = i + 1
                        while j < len(h2h_sorted):
                            a, b = h2h_sorted[i]["code"], h2h_sorted[j]["code"]
                            if (h2h[a]["pts"] != h2h[b]["pts"] or h2h[a]["gd"] != h2h[b]["gd"]
                                    or h2h[a]["gf"] != h2h[b]["gf"]):
                                break
                            j += 1
                        sub = h2h_sorted[i:j]
                        if len(sub) > 1 and len(sub) < len(tied):
                            result.extend(sort_tied_local(sub))
                        elif len(sub) > 1:
                            result.extend(sorted(sub, key=lambda t: (-(t["gf"]-t["ga"]), -t["gf"], FIFA_RANKING.get(t["code"], 999))))
                        else:
                            result.extend(sub)
                        i = j
                    return result

                team_list = sorted(list(stats.values()), key=lambda t: -t["pts"])
                final = []
                idx = 0
                while idx < len(team_list):
                    j = idx + 1
                    while j < len(team_list) and team_list[j]["pts"] == team_list[idx]["pts"]: j += 1
                    final.extend(sort_tied_local(team_list[idx:j]))
                    idx = j
                all_standings[gn] = final

            best_third = get_best_third(all_standings)
            third_assignments = assign_third_place(best_third)

            def resolve_pos(pos):
                p = int(pos[0]); g = pos[1]
                s = all_standings.get(g, [])
                return s[p-1]["code"] if len(s) >= p else None

            r32 = {}
            for mid, hp, ap in [("R32-1","2A","2B"),("R32-2","1E","3rd"),("R32-3","1F","2C"),("R32-4","1C","2F"),
                                ("R32-5","1I","3rd"),("R32-6","2E","2I"),("R32-7","1A","3rd"),("R32-8","1L","3rd"),
                                ("R32-9","1D","3rd"),("R32-10","1G","3rd"),("R32-11","2K","2L"),("R32-12","1H","2J"),
                                ("R32-13","1B","3rd"),("R32-14","1J","2H"),("R32-15","1K","3rd"),("R32-16","2D","2G")]:
                home = resolve_pos(hp)
                away = third_assignments.get(mid) if ap == "3rd" else resolve_pos(ap)
                r32[mid] = {"home": home, "away": away}

            results.append({"seed": trial, "scores": match_results, "r32": r32,
                          "standings": {g: [{"code":t["code"],"pts":t["pts"],"gf":t["gf"],"ga":t["ga"]} for t in s] for g,s in all_standings.items()}})

        print(json.dumps(results))
