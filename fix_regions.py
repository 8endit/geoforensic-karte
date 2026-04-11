"""Assign Bundesland to _all_points entries using a bounding-box lookup (no external shapefiles needed)."""
import json, sys

# Rough bounding boxes for German Bundesländer (lat_min, lat_max, lon_min, lon_max)
# Order matters: smaller/more specific states first so they win over overlapping larger ones
BUNDESLAENDER = [
    ("Bremen",                   53.01, 53.23,  8.48,  8.99),
    ("Hamburg",                  53.39, 53.75,  9.73, 10.33),
    ("Berlin",                   52.33, 52.68, 13.08, 13.77),
    ("Saarland",                 49.11, 49.64,  6.35,  7.41),
    ("Schleswig-Holstein",       53.35, 55.06,  8.30, 11.35),
    ("Mecklenburg-Vorpommern",   53.10, 54.70, 10.59, 14.45),
    ("Brandenburg",              51.35, 53.56, 11.26, 14.77),
    ("Sachsen-Anhalt",           51.00, 53.05, 10.56, 13.19),
    ("Thueringen",               50.20, 51.65,  9.87, 12.66),
    ("Sachsen",                  50.17, 51.70, 11.87, 15.05),
    ("Hessen",                   49.39, 51.66,  7.77, 10.24),
    ("Rheinland-Pfalz",         48.96, 50.95,  6.11,  8.51),
    ("Baden-Wuerttemberg",       47.53, 49.79,  7.51, 10.50),
    ("Bayern",                   47.27, 50.57,  8.97, 13.84),
    ("Niedersachsen",            51.29, 53.90,  6.65, 11.60),
    ("NRW",                      50.32, 52.53,  5.86,  9.47),
]

def classify(lat, lon):
    for name, la_min, la_max, lo_min, lo_max in BUNDESLAENDER:
        if la_min <= lat <= la_max and lo_min <= lon <= lo_max:
            return name
    return None

def main():
    path = "C:/dev/geoforensic-karte/data_backup/geoforensic_map_data.json"
    print(f"Loading {path} ...")
    with open(path) as f:
        d = json.load(f)

    nm = d["nm"]
    all_idx = nm.index("_all_points")
    points = d["p"]

    # Build name->index map, add missing Bundesländer to nm
    name_to_idx = {n: i for i, n in enumerate(nm)}
    for bl_name, *_ in BUNDESLAENDER:
        if bl_name not in name_to_idx:
            name_to_idx[bl_name] = len(nm)
            nm.append(bl_name)

    reassigned = 0
    unmatched = 0
    for p in points:
        if p[3] != all_idx:
            continue
        bl = classify(p[0], p[1])
        if bl:
            p[3] = name_to_idx[bl]
            reassigned += 1
        else:
            unmatched += 1

    print(f"Reassigned: {reassigned}")
    print(f"Unmatched (kept as _all_points): {unmatched}")

    # Update R (region stats)
    from collections import defaultdict
    stats = defaultdict(lambda: {"n": 0, "sum_v": 0.0, "worst": 0.0})
    for p in points:
        name = nm[p[3]]
        s = stats[name]
        s["n"] += 1
        s["sum_v"] += p[2]
        if abs(p[2]) > abs(s["worst"]):
            s["worst"] = p[2]

    new_R = []
    for name in nm:
        s = stats.get(name)
        if s and s["n"] > 0:
            new_R.append({
                "name": name,
                "n": s["n"],
                "mean": round(s["sum_v"] / s["n"], 2),
                "worst": round(s["worst"], 1),
                "bb": None,
            })
        else:
            new_R.append({"name": name, "n": 0, "mean": 0, "worst": 0, "bb": None})

    d["nm"] = nm
    d["R"] = new_R

    # Remove _all_points from nm/R if it has 0 points left
    all_count = stats.get("_all_points", {}).get("n", 0)
    if all_count == 0:
        # Remap indices: remove _all_points
        old_all_idx = all_idx
        nm_new = [n for n in nm if n != "_all_points"]
        old_to_new = {}
        new_i = 0
        for old_i, n in enumerate(nm):
            if n == "_all_points":
                continue
            old_to_new[old_i] = new_i
            new_i += 1
        for p in points:
            p[3] = old_to_new[p[3]]
        d["nm"] = nm_new
        d["R"] = [r for r in new_R if r["name"] != "_all_points"]
        print("Removed _all_points (0 remaining)")

    out = path
    with open(out, "w") as f:
        json.dump(d, f, separators=(",", ":"))
    print(f"Written to {out} ({len(points)} points, {len(d['nm'])} regions)")

    # Also copy to deploy location
    import shutil
    deploy = "C:/dev/geoforensic-karte/geoforensic_map_data.json"
    shutil.copy2(out, deploy)
    print(f"Copied to {deploy}")

if __name__ == "__main__":
    main()
