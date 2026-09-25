/* Robust CSV parser: handles ';' delimiter, quoted fields ("..."), embedded newlines,
   escaped quotes (""), and strips a leading BOM. Works fully client-side (no deps). */

function parseCSV(text, delimiter = ";") {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1); // strip BOM
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else { inQuotes = false; }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === delimiter) {
      row.push(field); field = "";
    } else if (c === "\r") {
      // skip, handled by \n
    } else if (c === "\n") {
      row.push(field); rows.push(row); row = []; field = "";
    } else {
      field += c;
    }
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows.filter(r => !(r.length === 1 && r[0] === ""));
}

function csvToObjects(text, delimiter = ";") {
  const rows = parseCSV(text, delimiter);
  if (!rows.length) return { headers: [], records: [] };
  const headers = rows[0];
  const records = rows.slice(1).map(r => {
    const obj = {};
    headers.forEach((h, idx) => { obj[h] = r[idx] !== undefined ? r[idx] : ""; });
    return obj;
  });
  return { headers, records };
}
