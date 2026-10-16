const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const vm = require("node:vm");
const { spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
function load(extra = {}) {
  const values = new Map();
  const context = vm.createContext({
    console, Blob, URL,
    localStorage: {
      getItem: key => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
    },
    ...extra,
  });
  for (const name of ["csvParser", "analysis", "storage", "report"]) {
    vm.runInContext(fs.readFileSync(path.join(root, "assets", `${name}.js`), "utf8"), context);
  }
  return context;
}

const csv = [
  "sku;Merk;Desc_long (Nederlands België);Afbeeldingen;Klium_price (Euro)",
  "A1; Alpha ;Gedeelde tekst;foto;10",
  "A2;alpha;Andere tekst;foto;20",
  "B1;Beta;Gedeelde tekst;;30",
  "U1;;;foto;40",
  "U2;-;;;50",
].join("\n");

function analyses(context = load()) {
  return context.analyzeSupplierExport(context.csvToObjects(csv).records, " Leverancier & Co ", "leverancier.csv");
}

test("supplier export keeps every row, merges brand casing, isolates quality checks", () => {
  const context = load();
  const snapshots = analyses(context);
  assert.equal(snapshots.length, 3);
  assert.deepEqual(Array.from(snapshots, s => s.brand), ["Alpha", "Beta", "(Onbekend merk)"]);
  assert.deepEqual(Array.from(snapshots, s => s.result.kpi.total), [2, 1, 2]);
  assert.equal(snapshots.reduce((sum, s) => sum + s.result.kpi.total, 0), 5);
  assert.equal(snapshots[0].supplier, "Leverancier & Co");
  assert.equal(snapshots[0].sourceFile, "leverancier.csv");
  assert.equal(snapshots[0].date, snapshots[1].date);
  assert.equal(snapshots[2].missingBrand, true);
  assert.equal(snapshots[0].missingBrand, false);
  assert.equal(snapshots[0].result.kpi.descDuplicated, 0);
  assert.equal(snapshots[1].result.kpi.imgMissing, 1);
  assert.deepEqual(
    JSON.parse(JSON.stringify(snapshots[0].result)),
    JSON.parse(JSON.stringify(context.analyzeExport(context.csvToObjects(csv).records.slice(0, 2)))),
  );
});

test("supplier validation, custom brand column and single-brand supplier", () => {
  const context = load();
  assert.throws(() => context.analyzeSupplierExport([], "Supplier", "x.csv"), /Geen rijen/);
  assert.throws(() => context.analyzeSupplierExport([{ Merk: "A" }], " ", "x.csv"), /leveranciersnaam/);
  assert.throws(() => context.analyzeSupplierExport([{ sku: "1" }], "Supplier", "x.csv"), /Merk-kolom/);
  const snapshots = context.analyzeSupplierExport([{ Brand: "A", sku: "1" }], "Supplier", "x.csv", { brand: "Brand" });
  assert.equal(snapshots.length, 1);
  assert.equal(snapshots[0].brand, "A");
  const special = context.analyzeSupplierExport([{ Merk: "__proto__" }, { Merk: "constructor" }], "S", "x.csv");
  assert.equal(special.length, 2);
});

test("local history, summaries, bundle import and legacy snapshots retain supplier metadata", () => {
  const context = load();
  const snapshots = analyses(context);
  const bundle = { supplier: "Leverancier & Co", date: snapshots[0].date, snapshots };
  context.saveSnapshotsToLocalHistory(context.unpackSnapshots(JSON.parse(JSON.stringify(bundle))));
  assert.equal(context.getLocalHistory().length, 3);
  assert.equal(context.summarize(context.getLocalHistory()[1]).supplier, bundle.supplier);
  const legacy = { ...snapshots[0] };
  delete legacy.supplier;
  context.saveToLocalHistory(legacy);
  assert.equal(context.getLocalHistory().length, 4);
  assert.equal(context.summarize(legacy).supplier, "");
  assert.equal(context.unpackSnapshots(legacy).length, 1);
  assert.throws(() => context.unpackSnapshots({ snapshots: [] }), /snapshot-formaat/);
  assert.throws(() => context.unpackSnapshots({ snapshots: [snapshots[0], {}] }), /snapshot-formaat/);
  assert.throws(() => context.saveSnapshotsToLocalHistory(Array(101).fill(snapshots[0])), /maximaal 100/);
  assert.equal(context.getLocalHistory().length, 4);
});

test("shared history expands supplier bundles alongside old single snapshots", async () => {
  const snapshots = analyses();
  const legacy = { ...snapshots[0] };
  delete legacy.supplier;
  const files = {
    "data/history/manifest.json": ["supplier.json", "legacy.json"],
    "data/history/supplier.json": { supplier: "Leverancier & Co", snapshots },
    "data/history/legacy.json": legacy,
  };
  const context = load({ fetch: async name => ({ ok: true, json: async () => files[name] }) });
  const shared = await context.loadManifestHistory();
  assert.equal(shared.length, 4);
  assert.equal(shared[2].missingBrand, true);
  assert.equal(shared[3].supplier, undefined);
});

test("download preserves the full bundle and uses the supplier name", async () => {
  let blob;
  const anchor = { click() {}, remove() {} };
  const context = load({
    URL: { createObjectURL: value => { blob = value; return "blob:test"; }, revokeObjectURL() {} },
    document: { createElement: () => anchor, body: { appendChild() {} } },
  });
  const snapshots = analyses(context);
  const bundle = { supplier: snapshots[0].supplier, date: snapshots[0].date, snapshots };
  const filename = context.downloadSnapshot(bundle);
  assert.match(filename, /^leverancier_co_\d{4}-\d{2}-\d{2}\.json$/);
  assert.equal(anchor.download, filename);
  assert.equal(JSON.parse(await blob.text()).snapshots.length, 3);
  const brandFilename = context.downloadSnapshot(snapshots[0]);
  assert.match(brandFilename, /^leverancier_co_alpha_/);
});

test("JavaScript files and inline page scripts compile", () => {
  for (const name of ["index.html", "history.html"]) {
    const html = fs.readFileSync(path.join(root, name), "utf8");
    for (const [, script] of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)) {
      new vm.Script(script, { filename: name });
    }
  }
  assert.equal(load().escapeHTML('Supplier <A> & "B"'), "Supplier &lt;A&gt; &amp; &quot;B&quot;");
});

test("history groups suppliers, preserves row indices and distinguishes repeated analyses", () => {
  const elements = new Map();
  const element = id => {
    if (!elements.has(id)) elements.set(id, {
      innerHTML: "", classList: { add() {}, remove() {} }, querySelectorAll: () => [],
    });
    return elements.get(id);
  };
  const context = load({
    document: { getElementById: element, querySelectorAll: () => [] },
  });
  const html = fs.readFileSync(path.join(root, "history.html"), "utf8");
  const script = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].at(-1)[1];
  const definitions = script.slice(0, script.indexOf('  document.querySelectorAll("#historyTable th[data-key]")'));
  vm.runInContext(definitions, context);
  vm.runInContext('function updateCompareBtn() {}', context);
  const snapshots = analyses(context);
  context.samples = [
    { ...snapshots[0], supplier: "Supplier B", origin: "shared" },
    { ...snapshots[1], supplier: "Supplier A", origin: "local", localIndex: 9 },
    { ...snapshots[2], supplier: " supplier b " },
    { ...snapshots[0], supplier: "" },
    { ...snapshots[1], supplier: "Supplier A" },
  ];
  vm.runInContext('allSnapshots = samples; sortState = { key: "brand", dir: 1 }; renderTable();', context);
  const output = element("historyBody").innerHTML;
  assert.equal((output.match(/class="supplier-group"/g) || []).length, 3);
  assert.match(output, /Losse merken \(geen leverancier vermeld\)/);
  assert.match(output, /2 merken &middot; 4 producten/);
  assert.match(output, /1 merk &middot; 2 producten &middot; 2 analyses/);
  for (let i = 0; i < 5; i++) assert.match(output, new RegExp(`data-view="${i}"`));
  assert.match(output, /data-del="9"/);
  assert.match(output, /data-supplier-toggle="supplier b" aria-expanded="true"/);
  vm.runInContext('collapsedSuppliers.add("supplier b"); renderTable();', context);
  assert.match(element("historyBody").innerHTML, /data-supplier-toggle="supplier b" aria-expanded="false"/);
  assert.equal((element("historyBody").innerHTML.match(/<tr class="hidden">/g) || []).length, 2);
  vm.runInContext('sortState = { key: "total", dir: -1 }; renderTable();', context);
  assert.equal((element("historyBody").innerHTML.match(/class="supplier-group"/g) || []).length, 3);
  assert.equal((element("historyBody").innerHTML.match(/<tr class="hidden">/g) || []).length, 2);
  vm.runInContext('collapsedSuppliers.delete("supplier b"); renderTable();', context);
  assert.doesNotMatch(element("historyBody").innerHTML, /<tr class="hidden">/);
});

test("Python CLI produces matching supplier groups and preserves the legacy command", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "klium-supplier-"));
  try {
    const input = path.join(dir, "supplier.csv");
    const output = path.join(dir, "supplier.json");
    const script = path.join(root, "build_snapshot.py");
    fs.writeFileSync(input, "\ufeff" + csv);
    const result = spawnSync("python", [script, input, "--supplier", "Leverancier & Co", "--output", output], { encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stderr, /2 producten zonder merk/);
    const bundle = JSON.parse(fs.readFileSync(output, "utf8"));
    const snapshots = analyses();
    assert.deepEqual(bundle.snapshots.map(s => [s.brand, s.supplier, s.missingBrand, s.result.kpi.total]),
      Array.from(snapshots, s => [s.brand, s.supplier, s.missingBrand, s.result.kpi.total]));
    assert.equal(bundle.snapshots[0].result.kpi.descDuplicated, 0);
    assert.equal(load().unpackSnapshots(bundle).length, 3);
    const legacyOutput = path.join(dir, "legacy.json");
    const legacy = spawnSync("python", [script, input, "Single", legacyOutput], { encoding: "utf8" });
    assert.equal(legacy.status, 0, legacy.stderr);
    const legacySnapshot = JSON.parse(fs.readFileSync(legacyOutput, "utf8"));
    assert.equal(legacySnapshot.brand, "Single");
    assert.equal(legacySnapshot.result.kpi.total, 5);
    assert.equal(legacySnapshot.supplier, undefined);
    const blank = spawnSync("python", [script, input, "--supplier", " ", "--output", output], { encoding: "utf8" });
    assert.notEqual(blank.status, 0);
    assert.match(blank.stderr, /leveranciersnaam/);
    fs.writeFileSync(input, "sku\n1\n");
    const missing = spawnSync("python", [script, input, "--supplier", "S", "--output", output], { encoding: "utf8" });
    assert.notEqual(missing.status, 0);
    assert.match(missing.stderr, /Merk-kolom/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
