"""Generates a webtool-compatible analysis snapshot (JSON) from an Akeneo CSV export.
Mirrors the exact logic/schema of webtool/assets/analysis.js so snapshots can be placed
in webtool/data/history/ and shown under "gedeeld" in history.html for any brand.

Usage:
    python build_snapshot.py <csv_path> [brand_name] [output_json_path]

If brand_name is omitted, it's auto-detected from the most common value in the "Merk" column.
If output_json_path is omitted, it's written to data/history/<brand>_<date>.json.
"""
import csv, json, re, sys, os
from collections import Counter
from datetime import datetime, timezone

SCOPE_KEYWORDS = re.compile(r"set|\bkit\b|koffer|\bpakket\b|\bcombinatie\b|\bduo\b|\btrio\b|\bbundel\b|machine", re.I)
SCOPE_KEYWORDS_NO_MACHINE = re.compile(r"set|\bkit\b|koffer|\bpakket\b|\bcombinatie\b|\bduo\b|\btrio\b|\bbundel\b", re.I)
ACCESSORY_INDICATOR = re.compile(r"\btoebehoren\b|\bonderdeel\b|\bonderdelen\b|\baccessoire\b|\breserveonderdeel\b|\bvervangonderdeel\b", re.I)
MIN_DESC_LEN = 150

# Plausibiliteitsgrenzen voor genormaliseerde afmetingen/gewicht (zie analysis.js voor toelichting).
PLAUSIBLE_DIM_CM = (1, 150)
PLAUSIBLE_WEIGHT_KG = (0.005, 50)

# Vaste uitsluitlijst voor "Genormaliseerde technische specificaties" (zie analysis.js:
# CRITERIA.nonSpecColumn* voor de volledige toelichting) — geldt voor het hele Akeneo-sjabloon,
# dus voor elk merk, geen onderhoud per merk nodig.
NON_SPEC_COLUMN_PATTERNS = [
    re.compile(r"^\[.*\]$"),
    re.compile(r"\(\[unit\]\)$"),
    re.compile(r"^(Desc_long|Desc_optional|Desc_scope|Title_AS400|Title_B2B|Title_B2C|Title_supplier|Title_validated_supplier|Klium AI omschrijving|Klium title suffix|Promo omschrijving|Youtube URL hash|Niet-genormaliseerde dimensies)\b"),
]
NON_SPEC_COLUMNS_EXACT = {
    "sku", "EAN", "Merk", "Afbeeldingen", "Assets Updated", "B2B promo afbeeldingen",
    "Article_type", "ERP_type", "Product model", "product parent", "goodscode", "STOCK_CODE",
    "SUPPLIER", "SUPPLIER_SKU", "Manufacturer reference", "eclass", "unspsc",
    "Klium PIM ready", "Klium status", "Klium blacklist", "Klium comment", "Klium productname",
    "Klium promo end", "Klium promo image", "Klium promo start", "Launch date",
    "WEIGHT_KG", "WIDTH_CM", "LENGTH_CM", "HEIGHT_CM",
    "Klium_price (Euro)", "[Klium_price-USD]", "SALES_PRICE (Euro)", "[SALES_PRICE-USD]",
    "SALES_QUANTITY", "Onderhoudscontract",
    "Certificaat", "Conformiteitsverklaring", "Prestatieverklaring", "Veiligheidsblad",
    "Veiligheidsblad - Component A", "Veiligheidsblad - Component B", "Veiligheidsblad - Component C",
    "Productblad", "Technische fiche", "Technische tekening", "Handleiding", "Maattabel",
    "Brochure", "Onderdelenlijst", "Selectiegids", "REACH-verklaring", "Testrapport",
    "Garantie leverancier", "Levertijd", "Herstelbaarheidsindex", "Laadvermogen tabel",
    "Assemblage informatie", "Plaatsing logo", "promo images",
    "Accessoires [groups]", "Accessoires [products]", "Accessoires [product_models]",
    "Alternatief [groups]", "Alternatief [products]", "Alternatief [product_models]",
    "Verbruiksartikel [groups]", "Verbruiksartikel [products]", "Verbruiksartikel [product_models]",
    "gratis artikel [groups]", "gratis artikel [products]", "gratis artikel [product_models]",
    "Klium cross [groups]", "Klium cross [products]", "Klium cross [product_models]",
    "Onderdeel [groups]", "Onderdeel [products]", "Onderdeel [product_models]",
    "Blokkeer \"Description Long scope\" waarde", "Blokkeer \"Description Long\" waarde",
    "Blokkeer volledig Artikel", "Blokkeren waardes - omschrijving",
    "Vlampunt", "Vlampunt ([unit])", "Gevarenklasse", "Toestand aggregaat", "Kinderbeveiliging",
    "P-zinnen", "H-zinnen", "EUH-zinnen", "Hoofdgevaarseigenschap", "UN-code",
    "ADR-klasse", "ADR-verpakkingsgroep", "Limited Quantity",
    "Relatieve dichtheid", "Relatieve dichtheid ([unit])", "Chemische stoffen",
    "Chemische resistentie", "Poetsinstructies",
}
SPEC_RELEVANCE_THRESHOLD = 0.6
SPEC_MIN_FAMILY_SIZE = 3

FIELDS = {
    "sku": "sku", "ean": "EAN", "categories": "[categories]", "family": "[family]",
    "brand": "Merk", "images": "Afbeeldingen", "weightKg": "WEIGHT_KG",
    "widthCm": "WIDTH_CM", "lengthCm": "LENGTH_CM", "heightCm": "HEIGHT_CM",
    "descLong": "Desc_long (Nederlands België)", "descScope": "Desc_scope (Nederlands België)",
    "price": "Klium_price (Euro)", "titleAS400": "Title_AS400 (Nederlands België)",
    "titleSupplier": "Title_supplier (Nederlands België)", "kliumProductname": "Klium productname",
    "kliumTitleSuffix": "Klium title suffix (Nederlands België)",
}


def nz(v):
    return v is not None and v.strip() != "" and v.strip() != "-"


def num(v):
    if not nz(v):
        return None
    try:
        return float(v.replace(",", "."))
    except ValueError:
        return None


def count_images(v):
    if not nz(v):
        return 0
    return len([x for x in v.split(",") if x.strip()])


def scope_expected(r):
    text = " ".join([
        r.get(FIELDS["titleAS400"], ""), r.get(FIELDS["titleSupplier"], ""),
        r.get(FIELDS["categories"], ""), r.get(FIELDS["family"], ""),
        r.get(FIELDS["kliumProductname"], ""),
    ])
    if ACCESSORY_INDICATOR.search(text):
        return bool(SCOPE_KEYWORDS_NO_MACHINE.search(text))
    return bool(SCOPE_KEYWORDS.search(text))


def detect_brand(rows):
    counts = Counter((r.get(FIELDS["brand"], "") or "").strip() for r in rows)
    counts.pop("", None)
    return counts.most_common(1)[0][0] if counts else ""


def strip_html(html):
    return re.sub(r"\s+", " ", re.sub(r"<[^>]*>", " ", html)).strip()


def is_non_spec_column(header):
    if header in NON_SPEC_COLUMNS_EXACT:
        return True
    return any(p.search(header) for p in NON_SPEC_COLUMN_PATTERNS)


def technical_spec_completeness(rows):
    if not rows:
        return []
    headers = list(rows[0].keys())
    candidate_columns = [h for h in headers if not is_non_spec_column(h)]

    by_family = {}
    for r in rows:
        fam = (r.get(FIELDS["categories"], "") or "").strip() or "(onbekend)"
        by_family.setdefault(fam, []).append(r)

    families = []
    for family, fam_rows in by_family.items():
        if len(fam_rows) < SPEC_MIN_FAMILY_SIZE:
            continue
        fields = []
        for col in candidate_columns:
            filled = sum(1 for r in fam_rows if nz(r.get(col, "")))
            if filled / len(fam_rows) >= SPEC_RELEVANCE_THRESHOLD:
                fields.append({"name": col, "filled": filled, "total": len(fam_rows),
                               "pct": round(100 * filled / len(fam_rows))})
        if not fields:
            continue
        fields.sort(key=lambda f: (-f["pct"], f["name"]))
        avg_completeness = round(sum(f["pct"] for f in fields) / len(fields))
        families.append({"family": family, "count": len(fam_rows), "fields": fields, "avgCompleteness": avg_completeness})
    return sorted(families, key=lambda f: -f["count"])


def analyze(rows):
    desc_counter = Counter()
    desc_to_skus = {}
    for r in rows:
        t = r.get(FIELDS["descLong"], "")
        if nz(t):
            desc_counter[t] += 1
            desc_to_skus.setdefault(t, []).append(r.get(FIELDS["sku"], ""))

    data = []
    for r in rows:
        imgc = count_images(r.get(FIELDS["images"], ""))
        weight = num(r.get(FIELDS["weightKg"], ""))
        w = num(r.get(FIELDS["widthCm"], "")); l = num(r.get(FIELDS["lengthCm"], "")); h = num(r.get(FIELDS["heightCm"], ""))
        desc_text = r.get(FIELDS["descLong"], "")
        desc_present = nz(desc_text)
        desc_short = desc_present and len(desc_text) < MIN_DESC_LEN
        desc_duplicated = desc_present and desc_counter[desc_text] > 1
        cats = (r.get(FIELDS["categories"], "") or "").strip()
        price = num(r.get(FIELDS["price"], ""))
        dims_present = w is not None and l is not None and h is not None
        dims_valid = dims_present and not (w == 0 and l == 0 and h == 0)
        weight_valid = weight is not None and weight > 0
        dims_implausible = dims_valid and (min(w, l, h) < PLAUSIBLE_DIM_CM[0] or max(w, l, h) > PLAUSIBLE_DIM_CM[1])
        weight_implausible = weight_valid and (weight < PLAUSIBLE_WEIGHT_KG[0] or weight > PLAUSIBLE_WEIGHT_KG[1])
        needs_scope = scope_expected(r)
        has_scope = nz(r.get(FIELDS["descScope"], ""))
        klium_name_filled = nz(r.get(FIELDS["kliumProductname"], "")) and nz(r.get(FIELDS["kliumTitleSuffix"], ""))
        display_name = (r.get(FIELDS["titleSupplier"]) or r.get(FIELDS["titleAS400"]) or r.get(FIELDS["kliumProductname"]) or "").strip()

        data.append({
            "sku": r.get(FIELDS["sku"], ""), "ean": (r.get(FIELDS["ean"], "") or "").strip(),
            "family": cats or "(onbekend)", "name": display_name, "price": price,
            "images": imgc, "imagesOk": imgc >= 1, "imagesMulti": imgc >= 2,
            "descNL": desc_present, "descShort": desc_short, "descDuplicated": desc_duplicated, "descText": desc_text,
            "needsScope": needs_scope, "hasScope": has_scope, "scopeOk": has_scope if needs_scope else True,
            "dims": dims_valid, "weightOk": weight_valid, "dimsImplausible": dims_implausible, "weightImplausible": weight_implausible,
            "w": w, "l": l, "h": h, "weight": weight,
            "kliumNameFilled": klium_name_filled,
        })

    cat_counter = Counter(d["family"] for d in data)
    total = len(data)

    def cnt(pred):
        return sum(1 for d in data if pred(d))

    kpi = {
        "total": total,
        "imgMissing": cnt(lambda d: not d["imagesOk"]),
        "imgMulti": cnt(lambda d: d["imagesMulti"]),
        "descMissing": cnt(lambda d: not d["descNL"]),
        "descDuplicated": cnt(lambda d: d["descDuplicated"]),
        "descShort": cnt(lambda d: d["descShort"]),
        "descUniqueTexts": len(desc_counter),
        "dimsBad": cnt(lambda d: not d["dims"]),
        "weightBad": cnt(lambda d: not d["weightOk"]),
        "scopeNeeded": cnt(lambda d: d["needsScope"]),
        "scopeMissing": cnt(lambda d: d["needsScope"] and not d["hasScope"]),
        "kliumNameReady": cnt(lambda d: d["kliumNameFilled"]),
        "fullyReady": cnt(lambda d: d["imagesOk"] and d["descNL"] and d["dims"] and d["weightOk"] and d["scopeOk"]),
    }

    # EAN- en SKU-controle: dubbels/ontbrekende waarden wijzen op reële datarisico's
    # (barcode-scanning, marketplace-feeds, unieke identificatie per product).
    ean_counter = Counter(d["ean"] for d in data if nz(d["ean"]))
    ean_duplicated_groups = [(ean, c) for ean, c in ean_counter.items() if c > 1]
    ean_duplicated_cnt = cnt(lambda d: nz(d["ean"]) and ean_counter[d["ean"]] > 1)
    ean_missing = cnt(lambda d: not nz(d["ean"]))
    sku_counter = Counter(d["sku"] for d in data if nz(d["sku"]))
    sku_duplicated_groups = [(sku, c) for sku, c in sku_counter.items() if c > 1]
    kpi.update({
        "eanMissing": ean_missing, "eanDuplicated": ean_duplicated_cnt,
        "eanDuplicatedGroups": len(ean_duplicated_groups), "skuDuplicated": len(sku_duplicated_groups),
        "familyCount": len(cat_counter),
        "dimsImplausible": cnt(lambda d: d["dimsImplausible"]),
        "weightImplausible": cnt(lambda d: d["weightImplausible"]),
    })

    prices = sorted(d["price"] for d in data if d["price"] is not None)
    n = len(prices)
    avg_price = round(sum(prices) / n, 2) if n else 0
    median_price = (prices[n // 2] if n % 2 else round((prices[n // 2 - 1] + prices[n // 2]) / 2, 2)) if n else 0
    buckets = [("<5", 0, 5), ("5-10", 5, 10), ("10-15", 10, 15), ("15-20", 15, 20),
               ("20-30", 20, 30), ("30-50", 30, 50), (">=50", 50, float("inf"))]
    price_hist = {label: sum(1 for p in prices if lo <= p < hi) for label, lo, hi in buckets}
    kpi.update({
        "minPrice": prices[0] if n else 0, "maxPrice": prices[-1] if n else 0,
        "avgPrice": avg_price, "medianPrice": median_price,
        "priceUnder15": sum(1 for p in prices if p < 15),
        "priceUnder20": sum(1 for p in prices if p < 20),
        "priceOver50": sum(1 for p in prices if p >= 50),
    })

    # Prijsuitschieters: enkel betekenisvol met voldoende datapunten en een positieve mediaan.
    price_missing = cnt(lambda d: d["price"] is None)
    price_zero = cnt(lambda d: d["price"] == 0)
    can_check_outliers = n >= 5 and median_price > 0
    price_outliers_high = [d for d in data if d["price"] is not None and can_check_outliers and d["price"] > median_price * 5]
    price_outliers_low = [d for d in data if d["price"] is not None and can_check_outliers and 0 < d["price"] < median_price * 0.1]
    kpi.update({
        "priceMissing": price_missing, "priceZero": price_zero,
        "priceOutliersHigh": len(price_outliers_high), "priceOutliersLow": len(price_outliers_low),
    })

    def anomaly(key, label, severity, items):
        skus = [d["sku"] for d in items if d.get("sku")]
        return {"key": key, "label": label, "severity": severity, "count": len(items),
                "skus": skus[:8], "extra": max(0, len(skus) - 8)}

    sku_dup_items = [d for sku, _ in sku_duplicated_groups for d in data if d["sku"] == sku]
    ean_dup_items = [d for d in data if nz(d["ean"]) and ean_counter[d["ean"]] > 1]
    anomalies = [
        anomaly("skuDuplicate", "Dubbele SKU (mogelijke exportfout)", "high", sku_dup_items),
        anomaly("eanDuplicate", "Dubbele EAN (meerdere SKU's delen dezelfde barcode)", "high", ean_dup_items),
        anomaly("eanMissing", "EAN ontbreekt", "med", [d for d in data if not nz(d["ean"])]),
        anomaly("priceMissing", "Prijs ontbreekt", "high", [d for d in data if d["price"] is None]),
        anomaly("priceZero", "Prijs is \u20ac 0 (vermoedelijk fout)", "high", [d for d in data if d["price"] == 0]),
        anomaly("priceOutlierHigh", "Prijs > 5x de mediaan (controleer of dit klopt)", "med", price_outliers_high),
        anomaly("priceOutlierLow", "Prijs < 10% van de mediaan (controleer of dit klopt)", "med", price_outliers_low),
        anomaly("familyUnknown", "Categorie/familie ontbreekt", "med", [d for d in data if d["family"] == "(onbekend)"]),
        anomaly("dimsImplausible", "Afmetingen fysiek onwaarschijnlijk (mogelijke eenhedenfout)", "high", [d for d in data if d["dimsImplausible"]]),
        anomaly("weightImplausible", "Gewicht fysiek onwaarschijnlijk (mogelijke eenhedenfout)", "high", [d for d in data if d["weightImplausible"]]),
    ]
    anomalies = [a for a in anomalies if a["count"] > 0]

    desc_dup_examples = sorted(
        ((t, skus) for t, skus in desc_to_skus.items() if len(skus) > 1),
        key=lambda x: -len(x[1]),
    )[:3]
    examples = {
        "descDuplicates": [{
            "preview": strip_html(t)[:180], "rawText": t, "count": len(skus),
            "skus": skus[:6], "extra": max(0, len(skus) - 6),
        } for t, skus in desc_dup_examples],
        "scopeFlagged": [{
            "sku": d["sku"], "family": d["family"], "name": d["name"], "hasScope": d["hasScope"],
        } for d in data if d["needsScope"]][:8],
        "descMissing": [{
            "sku": d["sku"], "name": d["name"], "family": d["family"],
        } for d in data if not d["descNL"]][:12],
        "descShort": [{
            "sku": d["sku"], "name": d["name"], "family": d["family"],
            "preview": strip_html(d["descText"])[:180], "length": len(d["descText"]),
        } for d in data if d["descShort"]][:12],
        "dimsImplausible": [{
            "sku": d["sku"], "name": d["name"], "w": d["w"], "l": d["l"], "h": d["h"], "weight": d["weight"],
        } for d in data if d["dimsImplausible"]][:8],
    }

    def dim_stats(values):
        v = [x for x in values if x is not None and x > 0]
        if not v:
            return {"min": 0, "max": 0, "avg": 0, "n": 0}
        return {"min": min(v), "max": max(v), "avg": round(sum(v) / len(v), 2), "n": len(v)}

    dimension_stats = {
        "width": dim_stats([d["w"] if d["dims"] else None for d in data]),
        "length": dim_stats([d["l"] if d["dims"] else None for d in data]),
        "height": dim_stats([d["h"] if d["dims"] else None for d in data]),
        "weight": dim_stats([d["weight"] if d["weightOk"] else None for d in data]),
    }

    technical_specs = technical_spec_completeness(rows)

    return {"data": data, "catCounter": dict(cat_counter), "priceHist": price_hist, "kpi": kpi,
            "examples": examples, "anomalies": anomalies, "dimensionStats": dimension_stats,
            "technicalSpecs": technical_specs}


def main():
    if len(sys.argv) < 2:
        print("Gebruik: python build_snapshot.py <csv_path> [brand_name] [output_json_path]")
        sys.exit(1)

    csv_path = sys.argv[1]
    with open(csv_path, encoding="utf-8-sig", newline="") as f:
        rows = list(csv.DictReader(f, delimiter=";"))

    brand = sys.argv[2] if len(sys.argv) > 2 and sys.argv[2] else detect_brand(rows)
    result = analyze(rows)
    snapshot = {
        "brand": brand, "date": datetime.now(timezone.utc).isoformat(),
        "sourceFile": os.path.basename(csv_path), "result": result,
    }

    if len(sys.argv) > 3 and sys.argv[3]:
        out_path = sys.argv[3]
    else:
        safe_brand = re.sub(r"[^a-z0-9]+", "_", brand.lower())
        out_path = os.path.join("data", "history", f"{safe_brand}_{datetime.now().strftime('%Y-%m-%d')}.json")

    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(snapshot, f, ensure_ascii=False)

    print(f"OK: {brand} -> {out_path} ({result['kpi']['total']} producten)")
    return out_path


if __name__ == "__main__":
    main()
