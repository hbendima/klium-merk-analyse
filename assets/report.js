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
    const widthPct = Math.max((val / max) * 100, 2);
    const sharePct = total ? ((val / total) * 100).toFixed(1) : "0.0";
    const color = colors ? colors[i % colors.length] : "#3fa9f5";
    return `<div class="bar-row">
        <div class="bar-label">${label}</div>
        <div class="bar-track"><div class="bar-fill" style="width:${widthPct}%;background:${color}"></div></div>
        <div class="bar-value">${val} <span class="bar-share">(${sharePct}%)</span></div>
      </div>`;
  }).join("");
}

function renderReport(container, snapshot) {
  const { brand, date, sourceFile, result } = snapshot;
  const { data, catCounter, priceHist, kpi, examples } = result;
  const total = kpi.total;
  const rp = pct(kpi.fullyReady, total);

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
        ${catEntries.length > 1 ? `De overige producten verdelen zich over ${catEntries.length - 1} andere categorie(&euml;n).` : ""}
        Controleer of deze verdeling de gewenste merkpositionering weerspiegelt (smal/diep vs. breed assortiment).</p>
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
        <h3>NL lange omschrijving (belangrijkste tekstveld)</h3>
        <p class="note">${total - kpi.descMissing} van de ${total} (${pct(total - kpi.descMissing, total)}%) hebben een
        NL lange omschrijving; <b>${kpi.descMissing} producten missen deze volledig</b> (hoogste prioriteit).<br><br>
        Kwaliteitscheck: van de gevulde teksten zijn er maar <b>${kpi.descUniqueTexts} unieke teksten</b> &mdash;
        <b>${kpi.descDuplicated} producten (${pct(kpi.descDuplicated, total)}%)</b> delen dezelfde generieke tekst met
        andere SKU's. Geen blokkerende fout, maar wel een inhoudelijk kwaliteitsrisico (niet altijd productspecifiek).</p>
        ${descDuplicateExamplesHTML(examples?.descDuplicates)}
        <h3>Desc_scope (leveringsomvang) &mdash; enkel waar relevant</h3>
        <p class="note">Enkel verplicht bij sets/kits/koffers (meerdere losse onderdelen). Op basis van titel/categorie is
        voor <b>${kpi.scopeNeeded} van de ${total} producten</b> een leveringsomvang te verwachten, waarvan er
        <b>${kpi.scopeMissing}</b> deze nog missen. Desc_optional en Title_B2C worden bewust genegeerd.</p>
        ${scopeExamplesHTML(examples?.scopeFlagged)}
      </section>

      <section id="logistiek">
        <h2>Afmetingen &amp; logistieke gegevens</h2>
        <p class="note">Logistieke maten (lengte/breedte/hoogte in cm en gewicht in kg) ontbreken of staan op 0 bij
        <b>${kpi.dimsBad} van de ${total} producten (${pct(kpi.dimsBad, total)}%)</b> voor afmetingen en
        <b>${kpi.weightBad} (${pct(kpi.weightBad, total)}%)</b> voor gewicht. Dit is een reëel operationeel risico voor
        verzendkosten en transport bij foutieve/lege maten.</p>
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
  container.__descDuplicateExamples = examples?.descDuplicates || [];
  container.__scopeExamples = examples?.scopeFlagged || [];
  wireLLMButtons(container);
}

function descDuplicateExamplesHTML(list) {
  if (!list || !list.length) return "";
  return `<div class="llm-examples">
    <h3>Voorbeelden om te beoordelen</h3>
    ${list.map((ex, i) => `<div class="llm-example">
        <p class="note">&ldquo;${ex.preview}&hellip;&rdquo; &mdash; gedeeld door <b>${ex.count}</b> producten
        (${ex.skus.join(", ")}${ex.extra ? ` + ${ex.extra} meer` : ""})</p>
        <button class="secondary llm-btn" data-kind="description" data-idx="${i}">AI-beoordeling opvragen</button>
        <div class="llm-result" id="llmResult-description-${i}"></div>
      </div>`).join("")}
  </div>`;
}

function scopeExamplesHTML(list) {
  if (!list || !list.length) return "";
  return `<div class="llm-examples">
    <h3>Voorbeelden om te beoordelen</h3>
    ${list.map((ex, i) => `<div class="llm-example">
        <p class="note"><b>${ex.sku}</b> &mdash; ${ex.name || "(geen naam)"} <span class="pill">${ex.family}</span>
        ${ex.hasScope ? "(heeft al Desc_scope)" : "(mist Desc_scope)"}</p>
        <button class="secondary llm-btn" data-kind="scope" data-idx="${i}">AI-beoordeling opvragen</button>
        <div class="llm-result" id="llmResult-scope-${i}"></div>
      </div>`).join("")}
  </div>`;
}

function verdictClass(verdict) {
  const v = (verdict || "").toLowerCase();
  if (v === "goed" || v === "ja") return "sev-good";
  if (v === "twijfel") return "sev-warn";
  if (v === "zwak" || v === "nee") return "sev-bad";
  return "";
}

function wireLLMButtons(container) {
  const descriptionExamples = container.__descDuplicateExamples;
  const scopeExamples = container.__scopeExamples;
  container.querySelectorAll(".llm-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      const kind = btn.dataset.kind;
      const idx = parseInt(btn.dataset.idx, 10);
      const resultEl = document.getElementById(`llmResult-${kind}-${idx}`);
      const ex = kind === "description" ? descriptionExamples[idx] : scopeExamples[idx];
      btn.disabled = true;
      resultEl.textContent = "Bezig met beoordelen…";
      try {
        const text = kind === "description" ? ex.rawText : (ex.name || ex.sku);
        const context = kind === "description"
          ? { name: ex.skus.join(", "), family: "" }
          : { name: ex.name, family: ex.family };
        const judged = await judgeWithLLM(kind, text, context);
        resultEl.innerHTML = `<span class="pill ${verdictClass(judged.verdict)}">${judged.verdict}</span> ${judged.reason || ""}`;
      } catch (err) {
        resultEl.innerHTML = `<span class="status-msg error">${err.message}</span>`;
      } finally {
        btn.disabled = false;
      }
    });
  });
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
