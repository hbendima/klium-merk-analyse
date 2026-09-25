/* History storage: instant per-browser via localStorage, plus JSON snapshot export/import
   so analyses can be committed to /data/history/ in the repo and shared via GitHub Pages. */

const LOCAL_KEY = "klium_merk_analyses_v1";
const MAX_LOCAL = 100;

function summarize(snapshot) {
  const k = snapshot.result.kpi;
  const pct = (n) => (k.total ? Math.round((100 * n) / k.total) : 0);
  return {
    brand: snapshot.brand,
    date: snapshot.date,
    sourceFile: snapshot.sourceFile,
    total: k.total,
    readyPct: pct(k.fullyReady),
    imgOkPct: pct(k.total - k.imgMissing),
    descOkPct: pct(k.total - k.descMissing),
    dimsOkPct: pct(k.total - k.dimsBad),
    weightOkPct: pct(k.total - k.weightBad),
    avgPrice: k.avgPrice,
    under20Pct: pct(k.priceUnder20),
    over50Pct: +(100 * k.priceOver50 / (k.total || 1)).toFixed(1),
  };
}

function getLocalHistory() {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_KEY) || "[]");
  } catch {
    return [];
  }
}

function saveToLocalHistory(snapshot) {
  const list = getLocalHistory();
  list.unshift(snapshot);
  while (list.length > MAX_LOCAL) list.pop();
  localStorage.setItem(LOCAL_KEY, JSON.stringify(list));
}

function deleteFromLocalHistory(index) {
  const list = getLocalHistory();
  list.splice(index, 1);
  localStorage.setItem(LOCAL_KEY, JSON.stringify(list));
}

function downloadSnapshot(snapshot) {
  const safeBrand = snapshot.brand.replace(/[^a-z0-9]+/gi, "_").toLowerCase();
  const fileName = `${safeBrand}_${snapshot.date.slice(0, 10)}.json`;
  const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = fileName;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
  return fileName;
}

/* Optional shared/team history: fetch data/history/manifest.json (an array of snapshot
   filenames committed to the repo). Silently returns [] if it doesn't exist yet or the
   page is opened via file:// (fetch requires http/https, e.g. GitHub Pages or a local server). */
async function loadManifestHistory() {
  try {
    const res = await fetch("data/history/manifest.json", { cache: "no-store" });
    if (!res.ok) return [];
    const files = await res.json();
    const snapshots = await Promise.all(
      files.map(async (name) => {
        try {
          const r = await fetch(`data/history/${name}`, { cache: "no-store" });
          if (!r.ok) return null;
          return await r.json();
        } catch { return null; }
      })
    );
    return snapshots.filter(Boolean);
  } catch {
    return [];
  }
}
