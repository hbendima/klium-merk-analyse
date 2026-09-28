/* Klium merk-analyse — herbruikbare beoordelingscriteria (JS-port van prep.py).
   Pas deze criteria hier centraal aan; ze gelden dan automatisch voor elk nieuw merk. */

const CRITERIA = {
  // Leveringsomvang (Desc_scope) is enkel verplicht als de doos vermoedelijk meerdere
  // losse onderdelen bevat (sets/kits/koffers, of een machine met accessoires/lader/koffer),
  // niet voor een simpel los standaardproduct (bv. een hangslot).
  // De meeste trefwoorden staan tussen \b (woordgrenzen) om te vermijden dat ze toevallig
  // matchen binnen ongerelateerde samengestelde woorden (bv. "combinatietang", "multimeter").
  // "machine" staat bewust ZONDER woordgrenzen: in het Nederlands wordt dit vaak aaneen-
  // geschreven (bv. "boormachine", "satineermachine", "slijpmachine") en die producten
  // hebben doorgaans wél accessoires/koffer/lader nodig om te documenteren.
  scopeKeywords: /set|\bkit\b|koffer|\bpakket\b|\bcombinatie\b|\bduo\b|\btrio\b|\bbundel\b|machine/i,
  // Los gebruikt wanneer het product zelf al als accessoire/onderdeel bestempeld is (zie
  // scopeExpected): dan telt "machine" niet mee, want een los onderdeel VOOR een machine
  // is geen machine zelf en heeft normaal geen leveringsomvang nodig.
  // "set" en "koffer" staan ZONDER woordgrenzen (aaneengeschreven Nederlandse samenstellingen,
  // bv. "stripschijvenset", "gereedschapskoffer"). "kit" blijft WEL tussen woordgrenzen:
  // ongebonden "kit" matcht anders per ongeluk binnen merknamen zoals "Makita" (MA-KIT-A).
  scopeKeywordsNoMachine: /set|\bkit\b|koffer|\bpakket\b|\bcombinatie\b|\bduo\b|\btrio\b|\bbundel\b/i,
  accessoryIndicator: /\btoebehoren\b|\bonderdeel\b|\bonderdelen\b|\baccessoire\b|\breserveonderdeel\b|\bvervangonderdeel\b/i,
  minDescLen: 150, // heuristische ondergrens voor een niet-triviale NL-omschrijving
  // Plausibiliteitsgrenzen voor genormaliseerde afmetingen/gewicht: ruim genoeg voor het
  // gros van hardware/gereedschap, bedoeld om evidente eenheden-/invoerfouten te vangen
  // (bv. 0,62 x 0,73 x 0,2 cm bij 280g is fysiek onmogelijk voor een hangslot).
  // Pas gerust aan per merk/categorie indien nodig.
  plausibleDimCm: { min: 1, max: 150 },
  plausibleWeightKg: { min: 0.005, max: 50 },
  // Vaste uitsluitlijst voor de "Genormaliseerde technische specificaties"-check: kolommen
  // die NOOIT een categorie-specifiek technisch kenmerk zijn (identificatie, media, prijzen,
  // logistieke maten/gewicht — apart al gecheckt —, teksten/titels, documenten/certificaten,
  // ADR/gevarenklasse-chemie, admin/workflow, relationele koppelvelden). Dit is vast voor het
  // hele Akeneo-sjabloon en geldt dus voor élk merk — geen onderhoud per merk nodig. Alles wat
  // overblijft wordt automatisch per categorie beoordeeld op invulgraad.
  nonSpecColumnPatterns: [
    /^\[.*\]$/, // systeem-/relationele velden zoals [categories], [groups], [enabled]
    /\(\[unit\]\)$/, // begeleidende eenheid-kolom hoort bij het hoofdveld, geen apart kenmerk
    /^(Desc_long|Desc_optional|Desc_scope|Title_AS400|Title_B2B|Title_B2C|Title_supplier|Title_validated_supplier|Klium AI omschrijving|Klium title suffix|Promo omschrijving|Youtube URL hash|Niet-genormaliseerde dimensies)\b/,
  ],
  nonSpecColumnsExact: new Set([
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
  ]),
  // Enkel bedoeld om kolommen te filteren die voor deze categorie duidelijk NIET van
  // toepassing zijn (zo goed als nooit ingevuld) — NIET om onvolledig ingevulde kenmerken te
  // verbergen. Een kenmerk dat bv. maar 40% ingevuld is voor deze categorie moet zichtbaar
  // blijven als een gat, niet uit de lijst verdwijnen. Vandaar een lage drempel.
  specRelevanceThreshold: 0.05,
  specMinFamilySize: 3,
  defaultFields: {
    sku: "sku",
    ean: "EAN",
    categories: "[categories]",
    family: "[family]",
    brand: "Merk",
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
  const text = [r[F.titleAS400], r[F.titleSupplier], r[F.categories], r[F.family], r[F.kliumProductname]]
    .map(x => x || "").join(" ");
  if (CRITERIA.accessoryIndicator.test(text)) {
    return CRITERIA.scopeKeywordsNoMachine.test(text);
  }
  return CRITERIA.scopeKeywords.test(text);
}

/** Detects the most common non-empty brand value (column "Merk" by default) in the export. */
function detectBrand(records, fieldOverrides = {}) {
  const F = { ...CRITERIA.defaultFields, ...fieldOverrides };
  const counts = new Map();
  records.forEach(r => {
    const v = (r[F.brand] || "").trim();
    if (v) counts.set(v, (counts.get(v) || 0) + 1);
  });
  let best = "", bestCount = 0;
  for (const [v, c] of counts) {
    if (c > bestCount) { best = v; bestCount = c; }
  }
  return best;
}

/**
 * Detects category-specific "genormaliseerde" technical spec columns automatically:
 * anything in the CSV that isn't on the fixed non-spec exclude list is a candidate. Per
 * category/family, a column only counts as a "relevant" spec once enough products in that
 * family actually fill it in — this needs zero manual maintenance per brand.
 */
function isNonSpecColumn(header) {
  if (CRITERIA.nonSpecColumnsExact.has(header)) return true;
  return CRITERIA.nonSpecColumnPatterns.some(re => re.test(header));
}

function technicalSpecCompleteness(rows, F) {
  if (!rows.length) return [];
  const headers = Object.keys(rows[0]);
  const candidateColumns = headers.filter(h => !isNonSpecColumn(h));

  const byFamily = new Map();
  rows.forEach(r => {
    const fam = (r[F.categories] || "").trim() || "(onbekend)";
    if (!byFamily.has(fam)) byFamily.set(fam, []);
    byFamily.get(fam).push(r);
  });

  const families = [];
  for (const [family, famRows] of byFamily.entries()) {
    if (famRows.length < CRITERIA.specMinFamilySize) continue;
    const fields = candidateColumns
      .map(col => {
        const filled = famRows.filter(r => nz(r[col])).length;
        return { name: col, filled, total: famRows.length, pct: Math.round((100 * filled) / famRows.length) };
      })
      .filter(f => f.filled / f.total >= CRITERIA.specRelevanceThreshold)
      .sort((a, b) => b.pct - a.pct || a.name.localeCompare(b.name));
    if (!fields.length) continue;
    const avgCompleteness = Math.round(fields.reduce((s, f) => s + f.pct, 0) / fields.length);
    families.push({ family, count: famRows.length, fields, avgCompleteness });
  }
  return families.sort((a, b) => b.count - a.count);
}

/**
 * Analyzes a full Akeneo product export (array of row objects keyed by CSV header)
 * and returns { data, catCounter, priceHist, kpi } — same shape used by the report renderer.
 * `fieldOverrides` lets you remap column names if a future export uses different headers.
 */
function analyzeExport(rows, fieldOverrides = {}) {
  const F = { ...CRITERIA.defaultFields, ...fieldOverrides };

  const descCounter = new Map();
  const descToSkus = new Map();
  rows.forEach(r => {
    const t = r[F.descLong] || "";
    if (nz(t)) {
      descCounter.set(t, (descCounter.get(t) || 0) + 1);
      if (!descToSkus.has(t)) descToSkus.set(t, []);
      descToSkus.get(t).push(r[F.sku] || "");
    }
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
    const { min: minDim, max: maxDim } = CRITERIA.plausibleDimCm;
    const dimsImplausible = dimsValid && (Math.min(w, l, h) < minDim || Math.max(w, l, h) > maxDim);
    const { min: minW, max: maxW } = CRITERIA.plausibleWeightKg;
    const weightImplausible = weightValid && (weight < minW || weight > maxW);
    const needsScope = scopeExpected(r, F);
    const hasScope = nz(r[F.descScope] || "");
    const kliumNameFilled = nz(r[F.kliumProductname] || "") && nz(r[F.kliumTitleSuffix] || "");
    const displayName = (r[F.titleSupplier] || r[F.titleAS400] || r[F.kliumProductname] || "").trim();

    return {
      sku: r[F.sku] || "",
      ean: (r[F.ean] || "").trim(),
      family: cats || "(onbekend)",
      name: displayName,
      price,
      images: imgc, imagesOk: imgc >= 1, imagesMulti: imgc >= 2,
      descNL: descPresent, descShort, descDuplicated, descText,
      needsScope, hasScope, scopeOk: needsScope ? hasScope : true,
      dims: dimsValid, weightOk: weightValid, dimsImplausible, weightImplausible,
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
  const descShortCnt = data.filter(d => d.descShort).length;
  const descUniqueTexts = descCounter.size;
  const dimsBad = data.filter(d => !d.dims).length;
  const weightBad = data.filter(d => !d.weightOk).length;
  const scopeNeeded = data.filter(d => d.needsScope).length;
  const scopeMissing = data.filter(d => d.needsScope && !d.hasScope).length;
  const kliumNameReady = data.filter(d => d.kliumNameFilled).length;
  const fullyReady = data.filter(d => d.imagesOk && d.descNL && d.dims && d.weightOk && d.scopeOk).length;

  // EAN-controle: ontbrekende en dubbele EAN's zijn een reëel risico (marketplace-feeds,
  // barcode-scanning, prijsvergelijkers rekenen op een unieke, geldige EAN per product).
  const eanCounter = new Map();
  data.forEach(d => { if (nz(d.ean)) eanCounter.set(d.ean, (eanCounter.get(d.ean) || 0) + 1); });
  const eanMissing = data.filter(d => !nz(d.ean)).length;
  const eanDuplicatedGroups = [...eanCounter.entries()].filter(([, c]) => c > 1);
  const eanDuplicatedCnt = data.filter(d => nz(d.ean) && eanCounter.get(d.ean) > 1).length;

  // SKU-controle: sku hoort een unieke sleutel te zijn; duplicaten wijzen op een exportfout.
  const skuCounter = new Map();
  data.forEach(d => { if (nz(d.sku)) skuCounter.set(d.sku, (skuCounter.get(d.sku) || 0) + 1); });
  const skuDuplicatedGroups = [...skuCounter.entries()].filter(([, c]) => c > 1);

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

  // Prijsuitschieters: enkel betekenisvol met voldoende datapunten en een positieve mediaan.
  const priceMissing = data.filter(d => d.price === null).length;
  const priceZero = data.filter(d => d.price === 0).length;
  const canCheckOutliers = n >= 5 && medianPrice > 0;
  const priceOutliersHigh = canCheckOutliers ? data.filter(d => d.price !== null && d.price > medianPrice * 5) : [];
  const priceOutliersLow = canCheckOutliers ? data.filter(d => d.price !== null && d.price > 0 && d.price < medianPrice * 0.1) : [];

  // Concrete examples for judgment calls ("empty" is obvious, "is this text good?" isn't).
  const stripHtml = (html) => html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  const descDuplicateExamples = [...descToSkus.entries()]
    .filter(([, skus]) => skus.length > 1)
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, 3)
    .map(([text, skus]) => ({
      preview: stripHtml(text).slice(0, 180),
      rawText: text,
      count: skus.length,
      skus: skus.slice(0, 6),
      extra: Math.max(0, skus.length - 6),
    }));
  const scopeExamples = data.filter(d => d.needsScope).slice(0, 8)
    .map(d => ({ sku: d.sku, family: d.family, name: d.name, hasScope: d.hasScope }));
  const descMissingExamples = data.filter(d => !d.descNL).slice(0, 12)
    .map(d => ({ sku: d.sku, name: d.name, family: d.family }));
  const descShortExamples = data.filter(d => d.descShort).slice(0, 12)
    .map(d => ({ sku: d.sku, name: d.name, family: d.family, preview: stripHtml(d.descText).slice(0, 180), length: d.descText.length }));

  // Algemene "opvallende gevallen" (data-anomalieën), los van de vaste criteria hierboven —
  // bedoeld om rare/onverwachte dingen in de export zichtbaar te maken vóór een onboarding-beslissing.
  const anomaly = (key, label, severity, items, skuOf = (d) => d.sku) => {
    const skus = items.map(skuOf).filter(Boolean);
    return { key, label, severity, count: items.length, skus: skus.slice(0, 8), extra: Math.max(0, skus.length - 8) };
  };
  const anomalies = [
    anomaly("skuDuplicate", "Dubbele SKU (mogelijke exportfout)", "high",
      skuDuplicatedGroups.flatMap(([sku]) => data.filter(d => d.sku === sku))),
    anomaly("eanDuplicate", "Dubbele EAN (meerdere SKU's delen dezelfde barcode)", "high",
      data.filter(d => nz(d.ean) && eanCounter.get(d.ean) > 1)),
    anomaly("eanMissing", "EAN ontbreekt", "med", data.filter(d => !nz(d.ean))),
    anomaly("priceMissing", "Prijs ontbreekt", "high", data.filter(d => d.price === null)),
    anomaly("priceZero", "Prijs is € 0 (vermoedelijk fout)", "high", data.filter(d => d.price === 0)),
    anomaly("priceOutlierHigh", "Prijs > 5x de mediaan (controleer of dit klopt)", "med", priceOutliersHigh),
    anomaly("priceOutlierLow", "Prijs < 10% van de mediaan (controleer of dit klopt)", "med", priceOutliersLow),
    anomaly("familyUnknown", "Categorie/familie ontbreekt", "med", data.filter(d => d.family === "(onbekend)")),
    anomaly("dimsImplausible", "Afmetingen fysiek onwaarschijnlijk (mogelijke eenhedenfout)", "high",
      data.filter(d => d.dimsImplausible)),
    anomaly("weightImplausible", "Gewicht fysiek onwaarschijnlijk (mogelijke eenhedenfout)", "high",
      data.filter(d => d.weightImplausible)),
  ].filter(a => a.count > 0);

  // Spreiding van de genormaliseerde afmetingen/gewicht, enkel over geldige waarden —
  // geeft diepte naast de loutere aanwezig/ontbreekt-check hierboven.
  const dimStats = (values) => {
    const v = values.filter(x => x !== null && x > 0);
    if (!v.length) return { min: 0, max: 0, avg: 0, n: 0 };
    return { min: Math.min(...v), max: Math.max(...v), avg: +(v.reduce((s, x) => s + x, 0) / v.length).toFixed(2), n: v.length };
  };
  const dimensionStats = {
    width: dimStats(data.map(d => d.dims ? d.w : null)),
    length: dimStats(data.map(d => d.dims ? d.l : null)),
    height: dimStats(data.map(d => d.dims ? d.h : null)),
    weight: dimStats(data.map(d => d.weightOk ? d.weight : null)),
  };

  const dimsImplausibleExamples = data.filter(d => d.dimsImplausible).slice(0, 8)
    .map(d => ({ sku: d.sku, name: d.name, w: d.w, l: d.l, h: d.h, weight: d.weight }));

  const technicalSpecs = technicalSpecCompleteness(rows, F);

  return {
    data, catCounter, priceHist, dimensionStats, technicalSpecs,
    examples: {
      descDuplicates: descDuplicateExamples, scopeFlagged: scopeExamples,
      descMissing: descMissingExamples, descShort: descShortExamples,
      dimsImplausible: dimsImplausibleExamples,
    },
    anomalies,
    kpi: {
      total, imgMissing, imgMulti, descMissing, descDuplicated: descDuplicatedCnt, descShort: descShortCnt, descUniqueTexts,
      dimsBad, weightBad, scopeNeeded, scopeMissing, kliumNameReady, fullyReady,
      dimsImplausible: data.filter(d => d.dimsImplausible).length,
      weightImplausible: data.filter(d => d.weightImplausible).length,
      eanMissing, eanDuplicated: eanDuplicatedCnt, eanDuplicatedGroups: eanDuplicatedGroups.length,
      skuDuplicated: skuDuplicatedGroups.length,
      minPrice: n ? prices[0] : 0, maxPrice: n ? prices[n - 1] : 0, avgPrice, medianPrice,
      priceUnder15, priceUnder20, priceOver50, priceMissing, priceZero,
      priceOutliersHigh: priceOutliersHigh.length, priceOutliersLow: priceOutliersLow.length,
      familyCount: Object.keys(catCounter).length,
    },
  };
}
