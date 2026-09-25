/* Klium merk-analyse — herbruikbare beoordelingscriteria (JS-port van prep.py).
   Pas deze criteria hier centraal aan; ze gelden dan automatisch voor elk nieuw merk. */

const CRITERIA = {
  // Leveringsomvang (Desc_scope) is enkel verplicht als de doos vermoedelijk meerdere
  // losse onderdelen bevat (sets/kits/koffers), niet voor een los standaardproduct.
  // Alle trefwoorden staan tussen \b (woordgrenzen) zodat ze niet per ongeluk matchen
  // binnen samengestelde productnamen (bv. "boormachine", "combinatietang", "multimeter").
  // "machine" en "multi" zijn bewust geschrapt: een los toestel/gereedschap is geen set.
  scopeKeywords: /\bset\b|\bkit\b|\bkoffer\b|\bpakket\b|\bcombinatie\b|\bduo\b|\btrio\b|\bbundel\b/i,
  minDescLen: 150, // heuristische ondergrens voor een niet-triviale NL-omschrijving
  defaultFields: {
    sku: "sku",
    ean: "EAN",
    categories: "[categories]",
    images: "Afbeeldingen",
    weightKg: "WEIGHT_KG",
    widthCm: "WIDTH_CM",
    lengthCm: "LENGTH_CM",
    heightCm: "HEIGHT_CM",
    descLong: "Desc_long (Nederlands België)",
    descScope: "Desc_scope (Nederlands België)",
    price: "Klium_price (Euro)",
    titleAS400: "Title_AS400 (Nederlands België)",
    titleSupplier: "Title_supplier (Nederlands België)",
    kliumProductname: "Klium productname",
    kliumTitleSuffix: "Klium title suffix (Nederlands België)",
  },
};

function nz(v) {
  return v !== undefined && v !== null && v.trim() !== "" && v.trim() !== "-";
}

function toNum(v) {
  if (!nz(v)) return null;
  const f = parseFloat(v.replace(",", "."));
  return isNaN(f) ? null : f;
}

function countImages(v) {
  if (!nz(v)) return 0;
  return v.split(",").map(x => x.trim()).filter(Boolean).length;
}

function scopeExpected(r, F) {
  const text = [r[F.titleAS400], r[F.titleSupplier], r[F.categories], r[F.kliumProductname]]
    .map(x => x || "").join(" ");
  return CRITERIA.scopeKeywords.test(text);
}

/**
 * Analyzes a full Akeneo product export (array of row objects keyed by CSV header)
 * and returns { data, catCounter, priceHist, kpi } — same shape used by the report renderer.
 * `fieldOverrides` lets you remap column names if a future export uses different headers.
 */
function analyzeExport(rows, fieldOverrides = {}) {
  const F = { ...CRITERIA.defaultFields, ...fieldOverrides };

  const descCounter = new Map();
  rows.forEach(r => {
    const t = r[F.descLong] || "";
    if (nz(t)) descCounter.set(t, (descCounter.get(t) || 0) + 1);
  });

  const data = rows.map(r => {
    const imgc = countImages(r[F.images] || "");
    const weight = toNum(r[F.weightKg] || "");
    const w = toNum(r[F.widthCm] || ""), l = toNum(r[F.lengthCm] || ""), h = toNum(r[F.heightCm] || "");
    const descText = r[F.descLong] || "";
    const descPresent = nz(descText);
    const descShort = descPresent && descText.length < CRITERIA.minDescLen;
    const descDuplicated = descPresent && descCounter.get(descText) > 1;
    const cats = (r[F.categories] || "").trim();
    const price = toNum(r[F.price] || "");
    const dimsPresent = w !== null && l !== null && h !== null;
    const dimsValid = dimsPresent && !(w === 0 && l === 0 && h === 0);
    const weightValid = weight !== null && weight > 0;
    const needsScope = scopeExpected(r, F);
    const hasScope = nz(r[F.descScope] || "");
    const kliumNameFilled = nz(r[F.kliumProductname] || "") && nz(r[F.kliumTitleSuffix] || "");

    return {
      sku: r[F.sku] || "",
      ean: (r[F.ean] || "").trim(),
      family: cats || "(onbekend)",
      price,
      images: imgc, imagesOk: imgc >= 1, imagesMulti: imgc >= 2,
      descNL: descPresent, descShort, descDuplicated,
      needsScope, hasScope, scopeOk: needsScope ? hasScope : true,
      dims: dimsValid, weightOk: weightValid,
      w, l, h, weight,
      kliumNameFilled,
    };
  });

  const catCounter = {};
  data.forEach(d => { catCounter[d.family] = (catCounter[d.family] || 0) + 1; });

  const total = data.length;
  const imgMissing = data.filter(d => !d.imagesOk).length;
  const imgMulti = data.filter(d => d.imagesMulti).length;
  const descMissing = data.filter(d => !d.descNL).length;
  const descDuplicatedCnt = data.filter(d => d.descDuplicated).length;
  const descUniqueTexts = descCounter.size;
  const dimsBad = data.filter(d => !d.dims).length;
  const weightBad = data.filter(d => !d.weightOk).length;
  const scopeNeeded = data.filter(d => d.needsScope).length;
  const scopeMissing = data.filter(d => d.needsScope && !d.hasScope).length;
  const kliumNameReady = data.filter(d => d.kliumNameFilled).length;
  const fullyReady = data.filter(d => d.imagesOk && d.descNL && d.dims && d.weightOk && d.scopeOk).length;

  const prices = data.map(d => d.price).filter(p => p !== null).sort((a, b) => a - b);
  const n = prices.length;
  const avgPrice = n ? +(prices.reduce((s, p) => s + p, 0) / n).toFixed(2) : 0;
  const medianPrice = n ? (n % 2 ? prices[(n - 1) / 2] : +((prices[n / 2 - 1] + prices[n / 2]) / 2).toFixed(2)) : 0;
  const buckets = [["<5", 0, 5], ["5-10", 5, 10], ["10-15", 10, 15], ["15-20", 15, 20],
                   ["20-30", 20, 30], ["30-50", 30, 50], [">=50", 50, Infinity]];
  const priceHist = {};
  buckets.forEach(([label, lo, hi]) => { priceHist[label] = prices.filter(p => p >= lo && p < hi).length; });
  const priceUnder15 = prices.filter(p => p < 15).length;
  const priceUnder20 = prices.filter(p => p < 20).length;
  const priceOver50 = prices.filter(p => p >= 50).length;

  return {
    data, catCounter, priceHist,
    kpi: {
      total, imgMissing, imgMulti, descMissing, descDuplicated: descDuplicatedCnt, descUniqueTexts,
      dimsBad, weightBad, scopeNeeded, scopeMissing, kliumNameReady, fullyReady,
      minPrice: n ? prices[0] : 0, maxPrice: n ? prices[n - 1] : 0, avgPrice, medianPrice,
      priceUnder15, priceUnder20, priceOver50,
    },
  };
}
