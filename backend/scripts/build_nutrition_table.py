#!/usr/bin/env python3
"""
Builds the nutrition table the backend loads at startup:
backend/src/main/resources/nutrition/usda-foods.csv.gz

Source: USDA FoodData Central (public domain, CC0) —
  U.S. Department of Agriculture, Agricultural Research Service. FoodData Central, 2026.
  fdc.nal.usda.gov.
Two of its datasets: SR Legacy (the classic ~7,800 everyday foods, frozen in 2018) and
Foundation Foods (fewer foods, newer lab analyses). Both are per 100 g.

The full downloads are ~10 MB of zips and ~100 MB unpacked, almost all of it sample and lab
detail the app never shows. This keeps one row per food: twelve nutrients per 100 g, its food
group, and its household portions ("1 large=50", "1 cup, chopped=160") — the portions are what
turn "2 eggs" or "1 tbsp olive oil" into grams. The result is ~1.2 MB of CSV, ~350 KB gzipped.

Reproducible: the same inputs give a byte-identical file (rows sorted, gzip timestamp zeroed),
so the backend's "has the table changed?" check — a hash of this file — only fires on a real
change.

Usage:
  python3 backend/scripts/build_nutrition_table.py                 # downloads both zips
  python3 backend/scripts/build_nutrition_table.py --sr sr.zip --foundation ff.zip
  (either may also be an unpacked folder)
"""

import argparse
import csv
import gzip
import io
import os
import sys
import tempfile
import urllib.request
import zipfile

SR_URL = "https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_sr_legacy_food_csv_2018-04.zip"
FOUNDATION_URL = "https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_foundation_food_csv_2026-04-30.zip"

HERE = os.path.dirname(os.path.abspath(__file__))
DEFAULT_OUT = os.path.join(HERE, "..", "src", "main", "resources", "nutrition", "usda-foods.csv.gz")

# Column -> the USDA nutrient ids to try, in order. Foundation Foods often has no plain
# "Energy" (1008) and gives the Atwater energies instead (2048 specific, 2047 general); its
# carbohydrate is sometimes only "by summation" (1050); its sugars are "Sugars, Total" (1063)
# where SR Legacy uses 2000. Fat falls back to the NLEA total (1085).
NUTRIENTS = [
    ("kcal", ["1008", "2048", "2047"]),
    ("protein", ["1003"]),
    ("carbs", ["1005", "1050"]),
    ("fat", ["1004", "1085"]),
    ("fibre", ["1079"]),
    ("sugars", ["2000", "1063"]),
    ("sodium", ["1093"]),      # mg
    ("satfat", ["1258"]),
    ("iron", ["1089"]),        # mg
    ("calcium", ["1087"]),     # mg
    ("vitc", ["1162"]),        # mg
    ("potassium", ["1092"]),   # mg
]
WANTED = {nid for _, ids in NUTRIENTS for nid in ids}

MAX_PORTIONS = 8
# Portions that say nothing about how a cook measures: a "serving" is whatever the label maker
# decided, and "NLEA serving" is the same thing by regulation.
USELESS_PORTION = ("serving", "nlea", "quantity not specified", "undetermined")


class Source:
    """A FoodData Central CSV bundle, zipped or unpacked."""

    def __init__(self, path):
        self.path = path
        self.zip = zipfile.ZipFile(path) if path.endswith(".zip") else None

    def rows(self, name):
        if self.zip:
            member = next(n for n in self.zip.namelist() if n.endswith("/" + name) or n == name)
            with self.zip.open(member) as raw:
                yield from csv.DictReader(io.TextIOWrapper(raw, encoding="utf-8"))
        else:
            for root, _, files in os.walk(self.path):
                if name in files:
                    with open(os.path.join(root, name), encoding="utf-8") as f:
                        yield from csv.DictReader(f)
                    return
            raise FileNotFoundError(name)


def fetch(url, cache_dir):
    target = os.path.join(cache_dir, url.rsplit("/", 1)[1])
    if not os.path.exists(target):
        print(f"downloading {url}", file=sys.stderr)
        request = urllib.request.Request(url, headers={"User-Agent": "MealPlanner/1.0 (rgehan27@gmail.com)"})
        with urllib.request.urlopen(request) as response, open(target, "wb") as out:
            out.write(response.read())
    return target


def number(text):
    text = (text or "").strip()
    if not text:
        return None
    try:
        return float(text)
    except ValueError:
        return None


def tidy(value):
    """Short and stable: 3 significant decimals at most, no trailing zeros."""
    if value is None:
        return ""
    text = f"{value:.3f}".rstrip("0").rstrip(".")
    return "0" if text in ("-0", "") else text


def amount_text(amount):
    return tidy(amount) if amount is not None else "1"


def load(source, kind):
    categories = {r["id"]: r["description"] for r in source.rows("food_category.csv")}
    if kind == "fo":
        wanted_ids = {r["fdc_id"] for r in source.rows("foundation_food.csv")}
        units = {r["id"]: r["name"] for r in source.rows("measure_unit.csv")}
    else:
        wanted_ids = {r["fdc_id"] for r in source.rows("sr_legacy_food.csv")}
        units = {}

    foods = {}
    for r in source.rows("food.csv"):
        if r["fdc_id"] in wanted_ids:
            foods[r["fdc_id"]] = {
                "name": " ".join(r["description"].split()),
                "category": categories.get(r["food_category_id"], ""),
                "values": {},
                "portions": [],
            }

    for r in source.rows("food_nutrient.csv"):
        food = foods.get(r["fdc_id"])
        if food is not None and r["nutrient_id"] in WANTED:
            value = number(r["amount"])
            if value is not None:
                food["values"][r["nutrient_id"]] = value

    for r in source.rows("food_portion.csv"):
        food = foods.get(r["fdc_id"])
        grams = number(r["gram_weight"])
        if food is None or not grams or grams <= 0:
            continue
        amount = number(r["amount"]) or 1.0
        unit = units.get(r["measure_unit_id"], "")
        if unit in ("undetermined",):
            unit = ""
        words = [w for w in (unit, r["portion_description"].strip(), r["modifier"].strip()) if w]
        label = " ".join(words).strip()
        # SR Legacy keeps the whole unit in `modifier` ("cup, chopped"); Foundation splits it
        # into a real unit plus a modifier ("cup" + "chopped"), which reads better joined by a comma.
        if kind == "fo" and unit and len(words) > 1:
            label = unit + ", " + " ".join(words[1:])
        if not label or any(label.lower().startswith(u) for u in USELESS_PORTION):
            continue
        label = " ".join(label.replace("=", "-").replace("|", "/").split())
        seq = r.get("seq_num") or ""
        food["portions"].append((amount, label, grams, int(seq) if seq.isdigit() else 0))

    rows = []
    for fdc_id, food in foods.items():
        values = {}
        for column, ids in NUTRIENTS:
            values[column] = next((food["values"][i] for i in ids if i in food["values"]), None)
        if values["kcal"] is None:
            # Atwater general factors, only where all three macros are known.
            p, c, f = values["protein"], values["carbs"], values["fat"]
            if None in (p, c, f):
                continue
            values["kcal"] = 4 * p + 4 * c + 9 * f
        if values["protein"] is None and values["carbs"] is None and values["fat"] is None:
            continue

        seen, portions = set(), []
        for amount, label, grams, _ in sorted(food["portions"], key=lambda p: (p[3], p[1])):
            text = f"{amount_text(amount)} {label}={tidy(grams)}"
            if text in seen:
                continue
            seen.add(text)
            portions.append(text)
            if len(portions) == MAX_PORTIONS:
                break

        rows.append([int(fdc_id), kind, food["category"], food["name"]]
                    + [tidy(values[c]) for c, _ in NUTRIENTS] + ["|".join(portions)])
    return rows


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--sr", help="SR Legacy zip or folder (downloaded when omitted)")
    parser.add_argument("--foundation", help="Foundation Foods zip or folder (downloaded when omitted)")
    parser.add_argument("--out", default=DEFAULT_OUT)
    args = parser.parse_args()

    cache = os.path.join(tempfile.gettempdir(), "mealplanner-fdc")
    os.makedirs(cache, exist_ok=True)
    sr = Source(args.sr or fetch(SR_URL, cache))
    foundation = Source(args.foundation or fetch(FOUNDATION_URL, cache))

    rows = load(sr, "sr") + load(foundation, "fo")
    rows.sort(key=lambda r: r[0])

    text = io.StringIO()
    writer = csv.writer(text, lineterminator="\n")
    writer.writerow(["fdc_id", "src", "category", "name"] + [c for c, _ in NUTRIENTS] + ["portions"])
    writer.writerows(rows)

    out = os.path.abspath(args.out)
    os.makedirs(os.path.dirname(out), exist_ok=True)
    with open(out, "wb") as f:
        # mtime=0 and no filename in the header: the same rows give the same bytes.
        with gzip.GzipFile(filename="", mode="wb", fileobj=f, mtime=0, compresslevel=9) as gz:
            gz.write(text.getvalue().encode("utf-8"))
    print(f"{len(rows)} foods -> {out} ({os.path.getsize(out) // 1024} KB)", file=sys.stderr)


if __name__ == "__main__":
    main()
