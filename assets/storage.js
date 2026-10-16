/* History storage: instant per-browser via localStorage, plus JSON snapshot export/import
   so analyses can be committed to /data/history/ in the repo and shared via GitHub Pages. */

const LOCAL_KEY = "klium_merk_analyses_v1";
const MAX_LOCAL = 100;

function summarize(snapshot) {
  const k = snapshot.result.kpi;
  const pct = (n) => (k.total ? Math.round((100 * n) / k.total) : 0);
  return {
    brand: snapshot.brand,
    supplier: snapshot.supplier || "",
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
  saveSnapshotsToLocalHistory([snapshot]);
}

function saveSnapshotsToLocalHistory(snapshots) {
  if (snapshots.length > MAX_LOCAL) {
    throw new Error(`De lokale geschiedenis bewaart maximaal ${MAX_LOCAL} analyses. Download deze leveranciersanalyse als JSON om alle merken te bewaren.`);
  }
  const list = getLocalHistory();
  list.unshift(...snapshots);
  while (list.length > MAX_LOCAL) list.pop();
  localStorage.setItem(LOCAL_KEY, JSON.stringify(list));
}

function deleteFromLocalHistory(index) {
  const list = getLocalHistory();
  list.splice(index, 1);
  localStorage.setItem(LOCAL_KEY, JSON.stringify(list));
}

function unpackSnapshots(payload) {
  const snapshots = Array.isArray(payload?.snapshots) ? payload.snapshots : [payload];
  if (!snapshots.length || snapshots.some(s =>
    !s || typeof s.brand !== "string" || !s.brand.trim() ||
    typeof s.sourceFile !== "string" || !Number.isFinite(Date.parse(s.date)) ||
    (s.supplier !== undefined && typeof s.supplier !== "string") ||
    !s.result?.kpi || !Number.isFinite(s.result.kpi.total) || !Array.isArray(s.result.data)
  )) throw new Error("Onherkenbaar snapshot-formaat.");
  return snapshots;
}

function downloadSnapshot(snapshot) {
  const snapshots = unpackSnapshots(snapshot);
  const name = snapshot.snapshots ? snapshot.supplier : [snapshot.supplier, snapshot.brand].filter(Boolean).join("_");
  const safeBrand = name.replace(/[^a-z0-9]+/gi, "_").toLowerCase() || "analyse";
  const fileName = `${safeBrand}_${snapshots[0].date.slice(0, 10)}.json`;
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
          return unpackSnapshots(await r.json());
        } catch (err) {
          console.error("Kon gedeelde analyse niet laden:", name, err);
          return null;
        }
      })
    );
    return snapshots.filter(Boolean).flat();
  } catch {
    return [];
  }
}
