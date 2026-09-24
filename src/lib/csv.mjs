// Lecture / écriture CSV minimale (RFC 4180, guillemets gérés).

export function parseCsv(text, sep = ',') {
  const rows = [];
  let row = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === sep) { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  const [header, ...data] = rows.filter(r => r.length > 1 || r[0] !== '');
  return data.map(r => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ''])));
}

// Ignore les lignes commençant par « # » (commentaires des fichiers de config).
export function parseConfigCsv(text) {
  return parseCsv(text.split(/\r?\n/).filter(l => !l.trim().startsWith('#')).join('\n'));
}

export function toCsv(rows, columns) {
  const esc = v => {
    const s = v == null ? '' : Array.isArray(v) ? v.join('|') : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [columns.join(','), ...rows.map(r => columns.map(c => esc(r[c])).join(','))].join('\n') + '\n';
}
