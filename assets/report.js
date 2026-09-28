/* Renders the full onboarding report (KPIs, assortment, price, content, logistics,
   worklist, conclusion, product table) into a container, given an analysis snapshot
   { brand, date, sourceFile, result: { data, catCounter, priceHist, kpi } }. */

function pct(n, total) { return total ? Math.round((100 * n) / total) : 0; }
function eur(n) { return "€ " + (n ?? 0).toFixed(2).replace(".", ","); }

function readyClass(readyPct) {
  return readyPct >= 70 ? "good" : readyPct >= 40 ? "warn" : "bad";
}

function barListHTML(entries, colors) {
  const total = entries.reduce((s, [, v]) => s + v, 0);
  const max = Math.max(...entries.map(([, v]) => v), 1);
  return entries.map(([label, val], i) => {
    const widthPct = val > 0 ? Math.max((val / max) * 100, 2) : 0;
    const sharePct = total ? ((val / total) * 100).toFixed(1) : "0.0";
    const color = colors ? colors[i % colors.length] : "#3fa9f5";
    return `<div class="bar-row">
        <div class="bar-label">${label}</div>
        <div class="bar-track"><div class="bar-fill" style="width:${widthPct}%;background:${color}"></div></div>
        <div class="bar-value">${val} <span class="bar-share">(${sharePct}%)</span></div>
      </div>`;
  }).join("");
}

function miniConclusion(text, tone) {
  return `<div class="conclusion-mini ${tone}"><b>Conclusie:</b> ${text}</div>`;
}

/** Loads the optional manually-maintained brand reference (known product categories per brand). */
async function loadBrandReference(brand) {
  try {
    const res = await fetch("data/brand-reference.json", { cache: "no-store" });
    if (!res.ok) return null;
    const map = await res.json();
    return map[(brand || "").toUpperCase()] || null;
  } catch {
    return null;
  }
}

function assortmentGapHTML(brandRef, presentLabels) {
  if (!brandRef) return "";
  const presentText = presentLabels.join(" | ").toLowerCase();
  const rows = brandRef.knownCategories.map(c => {
    const present = c.keywords.some(kw => presentText.includes(kw.toLowerCase()));
    return { label: c.label, present };
  });
  const missing = rows.filter(r => !r.present);
  return `
    <h3>Vergelijking met het gekende merkgamma (${brandRef.source})</h3>
    <p class="note">${brandRef.note || ""}</p>
    <table class="worklist">
      <thead><tr><th>Bekende productcategorie</th><th>In deze export?</th></tr></thead>
      <tbody>
        ${rows.map(r => `<tr><td>${r.label}</td><td>${r.present ? '<span class="pill sev-good">Aanwezig</span>' : '<span class="pill sev-bad">Niet in export</span>'}</td></tr>`).join("")}
      </tbody>
    </table>
    ${miniConclusion(
      missing.length === 0
        ? "Alle bekende hoofdcategorie&euml;n van dit merk komen voor in deze export."
        : `<b>${missing.length} van de ${rows.length} bekende hoofdcategorie&euml;n</b> van dit merk zitten niet in deze export: ${missing.map(m => m.label).join(", ")}. Ga na of dit een bewuste selectie is (bv. enkel een deelassortiment voor Klium) of een onvolledige export.`,
      missing.length === 0 ? "good" : "warn"
    )}
    <p class="note" style="margin-top:8px;"><i>Automatische woord-match op basis van categorienamen &mdash; benaderend, controleer zelf bij twijfel.</i></p>
  `;
}

function severityBadge(sev) {
  const cls = sev === "high" ? "sev-bad" : sev === "med" ? "sev-warn" : "sev-good";
  const label = sev === "high" ? "Hoog" : sev === "med" ? "Midden" : "Info";
  return `<span class="pill ${cls}">${label}</span>`;
}

function anomaliesHTML(anomalies, total) {
  if (!anomalies || !anomalies.length) {
    return `<p class="note">Geen opvallende data-anomalieën gevonden (SKU/EAN-duplicaten, ontbrekende/rare prijzen,
    ontbrekende categorie) op basis van de huidige checks.</p>`;
  }
  return `<table class="worklist">
    <thead><tr><th>Bevinding</th><th>Aantal</th><th>Prioriteit</th><th>Voorbeeld-SKU's</th></tr></thead>
    <tbody>
      ${anomalies.map(a => `<tr>
        <td>${a.label}</td>
        <td>${a.count} (${pct(a.count, total)}%)</td>
        <td>${severityBadge(a.severity)}</td>
        <td>${a.skus.join(", ")}${a.extra ? ` + ${a.extra} meer` : ""}</td>
      </tr>`).join("")}
    </tbody>
  </table>`;
}

async function renderReport(container, snapshot) {
  const { brand, date, sourceFile, result } = snapshot;
  const { data, catCounter, priceHist, kpi, examples, anomalies, dimensionStats, technicalSpecs } = result;
  const total = kpi.total;
  const rp = pct(kpi.fullyReady, total);

  const brandRef = await loadBrandReference(brand);

  const catEntries = Object.entries(catCounter).sort((a, b) => b[1] - a[1]);
  const priceOrder = ["<5", "5-10", "10-15", "15-20", "20-30", "30-50", ">=50"];
  const priceEntries = priceOrder.map(k => [k, priceHist[k] || 0]);
  const priceColors = ["#e74c3c", "#e74c3c", "#e74c3c", "#f5a623", "#f5a623", "#2ecc71", "#2ecc71"];
  const famColors = ["#3fa9f5", "#8e44ad", "#16a085", "#e67e22", "#c0392b", "#2980b9"];

  const topFamily = catEntries[0] || ["(onbekend)", 0];
  const topFamilyPct = pct(topFamily[1], total);

  container.innerHTML = `
    <header>
      <h1>${brand} &ndash; Volledige Onboarding-analyse<span class="badge no">Nog niet op Klium</span></h1>
      <p>Analyse op basis van een volledige Akeneo-productexport (${total} producten uit "${sourceFile}",
      geanalyseerd op ${new Date(date).toLocaleDateString("nl-BE")}). Criteria: foto's &ge;1 verplicht, NL lange
      omschrijving altijd verplicht (incl. kwaliteitscheck op hergebruikte tekst), leveringsomvang (Desc_scope) enkel
      verplicht bij sets/kits/koffers, Desc_optional en Title_B2C worden genegeerd, Klium productnaam/title suffix pas
      verplicht bij live-zetten.</p>
    </header>
    <main>
      <nav class="toc">
        <a href="#kpi">Kernresultaten</a>
        <a href="#assortiment">Assortiment</a>
        <a href="#prijs">Prijsanalyse</a>
        <a href="#content">Content</a>
        <a href="#logistiek">Afmetingen &amp; logistiek</a>
        <a href="#technische-specs">Technische specs</a>
        <a href="#datakwaliteit">EAN &amp; anomalieën</a>
        <a href="#status">Klium-status</a>
        <a href="#werklijst">Werklijst</a>
        <a href="#conclusie">Conclusie</a>
        <a href="#tabel">Volledige productlijst</a>
      </nav>

      <section id="kpi">
        <h2>Kernresultaten</h2>
        <div class="kpis">
          <div class="kpi"><div class="val">${total}</div><div class="lbl">Producten in de export</div></div>
          <div class="kpi ${readyClass(rp)}"><div class="val">${kpi.fullyReady} / ${total}</div><div class="lbl">Verkoopklaar (foto + NL-tekst + afmetingen + gewicht + leveringsomvang waar nodig)</div></div>
          <div class="kpi good"><div class="val">${pct(total - kpi.imgMissing, total)}%</div><div class="lbl">Heeft minstens 1 foto</div></div>
          <div class="kpi"><div class="val">${pct(kpi.imgMulti, total)}%</div><div class="lbl">Heeft meerdere foto's (bonus)</div></div>
          <div class="kpi warn"><div class="val">${pct(kpi.dimsBad, total)}%</div><div class="lbl">Afmetingen ontbreken of zijn 0x0x0</div></div>
          <div class="kpi warn"><div class="val">${pct(kpi.weightBad, total)}%</div><div class="lbl">Gewicht ontbreekt of is 0 kg</div></div>
          <div class="kpi good"><div class="val">${pct(total - kpi.descMissing, total)}%</div><div class="lbl">Heeft NL-omschrijving</div></div>
        </div>
        <p class="note">${kpi.fullyReady} van de ${total} producten (${rp}%) voldoet nu al aan alle verkoopklaar-criteria.
        Foto-vereiste (&ge;1) is ${pct(total - kpi.imgMissing, total)}% behaald. Grootste werkpunten: logistieke maten/gewicht
        en ontbrekende/hergebruikte NL-teksten &mdash; zie de werklijst.</p>
      </section>

      <section id="assortiment">
        <h2>Assortimentsverdeling</h2>
        <div class="bar-list">${barListHTML(catEntries, famColors)}</div>
        <p class="note">${topFamilyPct}% van de lijst (${topFamily[1]}/${total}) bestaat uit <b>${topFamily[0]}</b>.
        Deze export bevat in totaal <b>${kpi.familyCount} categorie/familiewaarde(n)</b>.
        ${catEntries.length > 1 ? `De overige producten verdelen zich over ${catEntries.length - 1} andere categorie(&euml;n).` : "Er is slechts één categorie aanwezig in deze export."}</p>
        <p class="note"><b>Let op &mdash; wat zien we NIET:</b> deze analyse is volledig gebaseerd op de meegeleverde export.
        Als het merk in werkelijkheid een breder gamma voert dan deze ${kpi.familyCount} categorie(&euml;n) (bv. andere
        producttypes, accessoirelijnen, kleurvarianten), dan is dat hier niet zichtbaar. Ga na bij de leverancier/het merk
        of dit een bewuste selectie is voor Klium, of een onvolledige/gedeeltelijke export.</p>
        ${assortmentGapHTML(brandRef, [...catEntries.map(([f]) => f), ...data.map(d => d.name)])}
      </section>

      <section id="prijs">
        <h2>Prijsanalyse</h2>
        <div class="kpis">
          <div class="kpi warn"><div class="val">${eur(kpi.avgPrice)}</div><div class="lbl">Gemiddelde prijs</div></div>
          <div class="kpi warn"><div class="val">${eur(kpi.medianPrice)}</div><div class="lbl">Mediaanprijs</div></div>
          <div class="kpi bad"><div class="val">${eur(kpi.minPrice)} &ndash; ${eur(kpi.maxPrice)}</div><div class="lbl">Prijsrange (min &ndash; max)</div></div>
          <div class="kpi bad"><div class="val">${pct(kpi.priceUnder20, total)}%</div><div class="lbl">Producten onder &euro; 20</div></div>
          <div class="kpi good"><div class="val">${(100 * kpi.priceOver50 / (total || 1)).toFixed(1)}%</div><div class="lbl">Producten &ge; &euro; 50 (premium)</div></div>
        </div>
        <div class="bar-list">${barListHTML(priceEntries, priceColors)}</div>
        <p class="note">${kpi.priceUnder15} van de ${total} producten (${pct(kpi.priceUnder15, total)}%) kosten minder dan
        &euro; 15, en ${kpi.priceOver50} producten (${(100 * kpi.priceOver50 / (total || 1)).toFixed(1)}%) zitten boven
        &euro; 50. Beoordeel of dit prijsniveau bij de gewenste merkpositionering past.</p>
      </section>

      <section id="content">
        <h2>Content: foto's &amp; omschrijvingen</h2>
        <h3>Foto's</h3>
        <p class="note">${total - kpi.imgMissing} van de ${total} producten (${pct(total - kpi.imgMissing, total)}%) hebben
        minstens 1 foto (vereiste). ${kpi.imgMulti} producten (${pct(kpi.imgMulti, total)}%) hebben meerdere foto's (bonus,
        niet blokkerend). ${kpi.imgMissing ? `<b>${kpi.imgMissing} producten missen zelfs 1 foto</b> en moeten eerst worden aangevuld.` : ""}</p>

        <h3>NL lange omschrijving (Desc_long)</h3>
        <p class="note">${total - kpi.descMissing} van de ${total} (${pct(total - kpi.descMissing, total)}%) hebben een
        NL lange omschrijving; <b>${kpi.descMissing} producten missen deze volledig</b>.
        ${kpi.descShort ? `<b>${kpi.descShort} producten (${pct(kpi.descShort, total)}%)</b> hebben een opvallend korte tekst (mogelijk te summier).` : ""}
        Van de gevulde teksten zijn er maar <b>${kpi.descUniqueTexts} unieke teksten</b> &mdash;
        <b>${kpi.descDuplicated} producten (${pct(kpi.descDuplicated, total)}%)</b> delen dezelfde tekst met andere SKU's
        (niet per se fout, maar wel te controleren op productspecificiteit).</p>
        ${simpleSkuListHTML(examples?.descMissing, "Producten zonder NL-omschrijving")}
        ${descShortExamplesHTML(examples?.descShort)}
        ${descDuplicateExamplesHTML(examples?.descDuplicates)}
        ${miniConclusion(
          kpi.descMissing === 0 && pct(kpi.descDuplicated, total) < 20
            ? `De NL-omschrijving is in orde: geen ontbrekende teksten en een beperkt aandeel hergebruikte tekst.`
            : kpi.descMissing > 0
              ? `<b>${kpi.descMissing} producten (${pct(kpi.descMissing, total)}%)</b> hebben nog geen NL-omschrijving &mdash; dit moet eerst aangevuld worden. ${kpi.descDuplicated ? `Daarnaast is bij ${pct(kpi.descDuplicated, total)}% de tekst hergebruikt over meerdere SKU's; controleer of dit inhoudelijk klopt per product.` : ""}`
              : `Geen ontbrekende teksten, maar bij <b>${pct(kpi.descDuplicated, total)}%</b> van de producten is dezelfde tekst hergebruikt over meerdere SKU's &mdash; controleer of dit inhoudelijk klopt per product (zie voorbeelden hierboven).`,
          kpi.descMissing === 0 && pct(kpi.descDuplicated, total) < 20 ? "good" : kpi.descMissing > 0 ? "bad" : "warn"
        )}

        <h3>Desc_scope (leveringsomvang) &mdash; enkel waar relevant</h3>
        <p class="note">Enkel verplicht bij sets/kits/koffers of machines met accessoires (meerdere losse onderdelen),
        niet voor een standaard enkelvoudig product. Op basis van titel/categorie is voor
        <b>${kpi.scopeNeeded} van de ${total} producten (${pct(kpi.scopeNeeded, total)}%)</b> een leveringsomvang te
        verwachten, waarvan er <b>${kpi.scopeMissing}</b> deze nog missen. Desc_optional en Title_B2C worden bewust
        genegeerd.</p>
        ${scopeExamplesHTML(examples?.scopeFlagged)}
        ${miniConclusion(
          kpi.scopeNeeded === 0
            ? `Niet van toepassing voor dit assortiment &mdash; er zijn geen sets/kits/koffers/machines met accessoires gedetecteerd die een leveringsomvang vereisen.`
            : kpi.scopeMissing === 0
              ? `Alle ${kpi.scopeNeeded} producten die een leveringsomvang vereisen, hebben deze ook ingevuld.`
              : `<b>${kpi.scopeMissing} van de ${kpi.scopeNeeded} producten</b> die een leveringsomvang vereisen, missen deze nog &mdash; concrete actie nodig (zie voorbeelden hierboven).`,
          kpi.scopeNeeded === 0 || kpi.scopeMissing === 0 ? "good" : "bad"
        )}
      </section>

      <section id="logistiek">
        <h2>Afmetingen &amp; logistieke gegevens</h2>
        <p class="note">Logistieke maten (lengte/breedte/hoogte in cm en gewicht in kg) ontbreken of staan op 0 bij
        <b>${kpi.dimsBad} van de ${total} producten (${pct(kpi.dimsBad, total)}%)</b> voor afmetingen en
        <b>${kpi.weightBad} (${pct(kpi.weightBad, total)}%)</b> voor gewicht. Dit is een reëel operationeel risico voor
        verzendkosten en transport bij foutieve/lege maten.</p>        ${dimensionStats ? dimensionStatsHTML(dimensionStats) : ""}
        <h3>Fysieke plausibiliteit</h3>
        <p class="note">Naast "ontbreekt/is 0" checken we ook of ingevulde maten/gewicht fysiek reëel zijn (grens:
        ${CRITERIA.plausibleDimCm.min}&ndash;${CRITERIA.plausibleDimCm.max} cm per as, ${CRITERIA.plausibleWeightKg.min}&ndash;${CRITERIA.plausibleWeightKg.max} kg)
        &mdash; bedoeld om evidente eenheden-/invoerfouten te vangen die de "ontbreekt"-check niet ziet.
        <b>${kpi.dimsImplausible || 0} producten</b> hebben onwaarschijnlijke afmetingen,
        <b>${kpi.weightImplausible || 0}</b> een onwaarschijnlijk gewicht.</p>
        ${dimsImplausibleExamplesHTML(examples?.dimsImplausible)}
      </section>

      <section id="technische-specs">
        <h2>Genormaliseerde technische specificaties</h2>
        <p class="note">Per categorie automatisch gedetecteerd: welke categorie-specifieke kenmerken (Akeneo's
        "GENORMALISEERD"-groep, bv. Breedte/Type/Materiaal/Kleur) worden in de praktijk gebruikt, en hoe volledig ze
        zijn ingevuld &mdash; ook als dat maar gedeeltelijk is (een kenmerk verdwijnt niet uit het overzicht enkel
        omdat het niet 100% ingevuld is). Enkel categorie&euml;n met &ge; ${CRITERIA.specMinFamilySize} producten
        worden getoond; een kenmerk wordt enkel getoond als het door minstens &eacute;&eacute;n product in die
        categorie gebruikt wordt (anders is het duidelijk niet van toepassing op deze categorie).</p>
        ${technicalSpecsHTML(technicalSpecs)}
      </section>

      <section id="datakwaliteit">
        <h2>EAN-controle &amp; opvallende gevallen</h2>
        <h3>EAN</h3>
        <div class="kpis">
          <div class="kpi ${kpi.eanMissing ? "bad" : "good"}"><div class="val">${pct(kpi.eanMissing, total)}%</div><div class="lbl">EAN ontbreekt</div></div>
          <div class="kpi ${kpi.eanDuplicated ? "bad" : "good"}"><div class="val">${pct(kpi.eanDuplicated, total)}%</div><div class="lbl">EAN is een duplicaat</div></div>
        </div>
        ${miniConclusion(
          !kpi.eanMissing && !kpi.eanDuplicated
            ? "Alle EAN's zijn aanwezig en uniek."
            : `${kpi.eanMissing ? `${kpi.eanMissing} producten missen een EAN. ` : ""}${kpi.eanDuplicated ? `${kpi.eanDuplicatedGroups} EAN-waarde(n) worden gedeeld door in totaal ${kpi.eanDuplicated} producten (moet uniek zijn per product).` : ""}`,
          !kpi.eanMissing && !kpi.eanDuplicated ? "good" : "bad"
        )}
        <h3>Andere opvallende gevallen</h3>
        <p class="note">Automatische checks los van de vaste criteria hierboven (dubbele identifiers, rare/ontbrekende
        prijzen, ontbrekende categorie) &mdash; bedoeld om gekke dingen in de export op te sporen v&oacute;or een
        onboarding-beslissing.</p>
        ${anomaliesHTML(anomalies, total)}
      </section>

      <section id="status">
        <h2>Klium-status</h2>
        <p class="note"><b>Klium productnaam &amp; title suffix</b> zijn voor ${kpi.kliumNameReady} van de ${total}
        producten (${pct(kpi.kliumNameReady, total)}%) ingevuld. Dit is bewust <b>geen blokkerend punt</b> vóór
        live-zetten: deze velden horen thuis in de publicatiestap.</p>
      </section>

      <section id="werklijst">
        <h2>Werklijst: wat moet er gebeuren?</h2>
        <table class="worklist">
          <thead><tr><th>Actie</th><th>Aantal producten</th><th>Prioriteit</th></tr></thead>
          <tbody>
            <tr><td>Foto's toevoegen aan producten zonder foto</td><td>${kpi.imgMissing} (${pct(kpi.imgMissing, total)}%)</td><td><span class="sev ${kpi.imgMissing ? "high" : "low"}">${kpi.imgMissing ? "Hoog" : "N.v.t."}</span></td></tr>
            <tr><td>Logistieke afmetingen &amp; gewicht corrigeren</td><td>${kpi.dimsBad} (${pct(kpi.dimsBad, total)}%)</td><td><span class="sev high">Hoog</span></td></tr>
            <tr><td>NL lange omschrijving schrijven/vertalen (ontbrekend)</td><td>${kpi.descMissing} (${pct(kpi.descMissing, total)}%)</td><td><span class="sev high">Hoog</span></td></tr>
            <tr><td>Hergebruikte/generieke NL-teksten controleren</td><td>${kpi.descDuplicated} (${pct(kpi.descDuplicated, total)}%)</td><td><span class="sev med">Midden</span></td></tr>
            <tr><td>Leveringsomvang (Desc_scope) aanvullen waar nodig</td><td>${kpi.scopeMissing} (${pct(kpi.scopeMissing, total)}%)</td><td><span class="sev ${kpi.scopeMissing ? "med" : "low"}">${kpi.scopeMissing ? "Midden" : "N.v.t."}</span></td></tr>
            <tr><td>Klium-vrijgave zetten na bovenstaande acties</td><td>${total} (100%)</td><td><span class="sev med">Midden</span></td></tr>
            <tr><td>Klium productnaam &amp; title suffix (pas bij live-zetten)</td><td>${total - kpi.kliumNameReady} (${pct(total - kpi.kliumNameReady, total)}%)</td><td><span class="sev low">Laag (later)</span></td></tr>
            <tr><td>Prijspositionering beslissen</td><td>${kpi.priceUnder15} (${pct(kpi.priceUnder15, total)}% &lt; &euro;15)</td><td><span class="sev med">Midden</span></td></tr>
          </tbody>
        </table>
      </section>

      <section id="conclusie">
        <h2>Conclusie: toevoegen aan Klium?</h2>
        <div class="conclusion ${rp >= 50 ? "good" : ""}">
          <b>${kpi.fullyReady} van de ${total} producten (${rp}%)</b> is nu al volledig verkoopklaar volgens de
          Klium-criteria. Grootste werkpunten: logistieke maten/gewicht (${pct(kpi.dimsBad, total)}%) en NL-tekst
          (${pct(kpi.descMissing, total)}% ontbrekend, ${pct(kpi.descDuplicated, total)}% mogelijk generiek). Beoordeel
          samen met de prijs- en assortimentsanalyse hierboven of het merk kan worden toegevoegd, en plan de resterende
          data-opschoning in als concreet actiepunt.
        </div>
      </section>

      <section id="tabel">
        <h2>Volledige productlijst (met datagereedheid)</h2>
        <div class="controls">
          <input type="text" id="search" placeholder="Zoek op SKU of EAN...">
          <select id="famFilter"><option value="">Alle categorieen</option>${catEntries.map(([f]) => `<option value="${f}">${f}</option>`).join("")}</select>
          <select id="issueFilter">
            <option value="">Alle producten</option>
            <option value="ready">Volledig klaar (0 issues)</option>
            <option value="foto">Geen foto (mist vereiste)</option>
            <option value="desc">Geen NL omschrijving</option>
            <option value="descdup">Generieke/hergebruikte NL-tekst</option>
            <option value="dims">Afmetingen fout/ontbreken</option>
            <option value="weight">Gewicht fout/ontbreekt</option>
          </select>
          <span class="pill" id="countPill"></span>
        </div>
        <div class="scroll-table">
        <table id="dataTable">
          <thead><tr>
            <th data-key="sku">SKU</th><th data-key="ean">EAN</th><th data-key="family">Categorie</th>
            <th data-key="price">Prijs (EUR)</th><th data-key="images">Foto's</th>
            <th data-key="descNL">NL tekst</th><th data-key="dims">Afmetingen</th><th data-key="weightOk">Gewicht</th>
          </tr></thead>
          <tbody id="tbody"></tbody>
        </table>
        </div>
      </section>
    </main>
    <footer>Bron: ${sourceFile} (${total} producten) &mdash; geanalyseerd ${new Date(date).toLocaleString("nl-BE")}</footer>
  `;

  wireProductTable(container, data);
}

function simpleSkuListHTML(list, title) {
  if (!list || !list.length) return "";
  return `<div class="llm-examples">
    <h3>${title}</h3>
    <div class="llm-example">
      <p class="note">${list.map(ex => `<b>${ex.sku}</b> &mdash; ${ex.name || "(geen naam)"} <span class="pill">${ex.family}</span>`).join("<br>")}</p>
    </div>
  </div>`;
}

function descShortExamplesHTML(list) {
  if (!list || !list.length) return "";
  return `<div class="llm-examples">
    <h3>Voorbeelden: opvallend korte omschrijving</h3>
    ${list.map((ex) => `<div class="llm-example">
        <p class="note"><b>${ex.sku}</b> &mdash; ${ex.name || "(geen naam)"} <span class="pill">${ex.family}</span> <span class="pill">${ex.length} tekens</span></p>
        <p class="note">&ldquo;${ex.preview}&hellip;&rdquo;</p>
      </div>`).join("")}
  </div>`;
}

function descDuplicateExamplesHTML(list) {
  if (!list || !list.length) return "";
  return `<div class="llm-examples">
    <h3>Voorbeelden: hergebruikte tekst</h3>
    ${list.map((ex) => `<div class="llm-example">
        <p class="note">&ldquo;${ex.preview}&hellip;&rdquo; &mdash; gedeeld door <b>${ex.count}</b> producten
        (${ex.skus.join(", ")}${ex.extra ? ` + ${ex.extra} meer` : ""})</p>
      </div>`).join("")}
  </div>`;
}

function scopeExamplesHTML(list) {
  if (!list || !list.length) return "";
  return `<div class="llm-examples">
    <h3>Voorbeelden: leveringsomvang verwacht</h3>
    ${list.map((ex) => `<div class="llm-example">
        <p class="note"><b>${ex.sku}</b> &mdash; ${ex.name || "(geen naam)"} <span class="pill">${ex.family}</span>
        ${ex.hasScope ? "(heeft al Desc_scope)" : "(mist Desc_scope)"}</p>
      </div>`).join("")}
  </div>`;
}

function dimensionStatsHTML(stats) {
  const rows = [
    ["Breedte", stats.width, "cm"], ["Lengte", stats.length, "cm"],
    ["Hoogte", stats.height, "cm"], ["Gewicht", stats.weight, "kg"],
  ].filter(([, s]) => s.n > 0);
  if (!rows.length) return "";
  return `<h3>Spreiding (over geldige waarden)</h3>
    <table class="worklist">
      <thead><tr><th>Afmeting</th><th>Min</th><th>Gemiddeld</th><th>Max</th><th>#</th></tr></thead>
      <tbody>
        ${rows.map(([label, s, unit]) => `<tr><td>${label}</td><td>${s.min} ${unit}</td><td>${s.avg} ${unit}</td><td>${s.max} ${unit}</td><td>${s.n}</td></tr>`).join("")}
      </tbody>
    </table>`;
}

function dimsImplausibleExamplesHTML(list) {
  if (!list || !list.length) return "";
  return `<div class="llm-examples">
    <h3>Voorbeelden: fysiek onwaarschijnlijke afmetingen/gewicht</h3>
    ${list.map((ex) => `<div class="llm-example">
        <p class="note"><b>${ex.sku}</b> &mdash; ${ex.name || "(geen naam)"}: ${ex.w}&times;${ex.l}&times;${ex.h} cm
        bij ${ex.weight} kg</p>
      </div>`).join("")}
  </div>`;
}

function technicalSpecsHTML(families) {
  if (!families || !families.length) {
    return `<p class="note">Geen categorie met &ge; ${CRITERIA.specMinFamilySize} producten en een duidelijk
    herkenbaar technisch kenmerkenpatroon gevonden.</p>`;
  }
  return families.map(fam => `
    <h3>${fam.family} <span class="pill">${fam.count} producten</span> <span class="pill sev-${fam.avgCompleteness >= 90 ? "good" : fam.avgCompleteness >= 60 ? "warn" : "bad"}">${fam.avgCompleteness}% gemiddeld</span></h3>
    <table class="worklist">
      <thead><tr><th>Kenmerk</th><th>Ingevuld</th><th>%</th></tr></thead>
      <tbody>
        ${fam.fields.map(f => `<tr><td>${f.name}</td><td>${f.filled}/${f.total}</td><td><span class="pill sev-${f.pct >= 90 ? "good" : f.pct >= 60 ? "warn" : "bad"}">${f.pct}%</span></td></tr>`).join("")}
      </tbody>
    </table>
    ${fam.fields.length <= 1 ? `<p class="note">Slechts ${fam.fields.length} technisch kenmerk gedetecteerd voor deze categorie &mdash; weinig contentdiepte t.o.v. andere categorie&euml;n, controleer of hier meer specs beschikbaar/ingevuld kunnen worden.</p>` : ""}
  `).join("");
}

function wireProductTable(container, data) {
  const search = container.querySelector("#search");
  const famFilter = container.querySelector("#famFilter");
  const issueFilter = container.querySelector("#issueFilter");
  const countPill = container.querySelector("#countPill");
  const tbody = container.querySelector("#tbody");
  const headers = container.querySelectorAll("#dataTable th[data-key]");

  let sortState = { key: "price", dir: 1 };

  function render() {
    const s = search.value.trim().toLowerCase();
    const fam = famFilter.value;
    const issue = issueFilter.value;
    let rows = data.filter(d => {
      if (s && !(d.sku.toLowerCase().includes(s) || d.ean.toLowerCase().includes(s))) return false;
      if (fam && d.family !== fam) return false;
      if (issue === "ready" && !(d.imagesOk && d.descNL && d.dims && d.weightOk && d.scopeOk)) return false;
      if (issue === "foto" && d.imagesOk) return false;
      if (issue === "desc" && d.descNL) return false;
      if (issue === "descdup" && !d.descDuplicated) return false;
      if (issue === "dims" && d.dims) return false;
      if (issue === "weight" && d.weightOk) return false;
      return true;
    });
    rows.sort((a, b) => {
      let av = a[sortState.key], bv = b[sortState.key];
      if (typeof av === "boolean") { av = av ? 1 : 0; bv = bv ? 1 : 0; }
      return (av > bv ? 1 : av < bv ? -1 : 0) * sortState.dir;
    });
    countPill.textContent = rows.length + " resultaten";
    tbody.innerHTML = rows.map(d => `<tr>
        <td>${d.sku}</td><td>${d.ean}</td><td>${d.family}</td>
        <td class="price-cell">${d.price != null ? eur(d.price) : "-"}</td>
        <td class="${d.imagesOk ? "ok" : "nok"}">${d.images}</td>
        <td class="${d.descNL ? (d.descDuplicated ? "" : "ok") : "nok"}">${d.descNL ? (d.descDuplicated ? "Ja (generiek)" : "Ja") : "Nee"}</td>
        <td class="${d.dims ? "ok" : "nok"}">${d.dims ? `${d.w}x${d.l}x${d.h} cm` : "Ontbreekt"}</td>
        <td class="${d.weightOk ? "ok" : "nok"}">${d.weightOk ? `${d.weight} kg` : "Ontbreekt"}</td>
      </tr>`).join("");
  }

  search.addEventListener("input", render);
  famFilter.addEventListener("change", render);
  issueFilter.addEventListener("change", render);
  headers.forEach(th => th.addEventListener("click", () => {
    const key = th.dataset.key;
    if (sortState.key === key) sortState.dir *= -1; else sortState = { key, dir: 1 };
    render();
  }));
  render();
}
