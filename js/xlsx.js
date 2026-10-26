/* Minimal Excel (.xlsx) support with no libraries, replacing openpyxl.
   - XLSX.build(rows, sheetName) -> Uint8Array   (a workbook with one sheet; first row is bold)
   - XLSX.read(arrayBuffer)      -> Promise<array of rows>  (first sheet; values are strings or numbers)
   - XLSX.csv(text)              -> array of rows
   - XLSX.download(bytes, filename)
   An .xlsx file is a ZIP of XML files, so this file contains a tiny ZIP writer and reader. */
(function (G) {
  'use strict';
  const enc = new TextEncoder(), dec = new TextDecoder();
  const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

  /* ---------- CRC32 ---------- */
  const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  const crc32 = u8 => { let c = 0xffffffff; for (let i = 0; i < u8.length; i++) c = CRC[(c ^ u8[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };

  /* ---------- ZIP writer (stored, no compression) ---------- */
  function zip(files) {                          // files: [{name, data: Uint8Array}]
    const parts = [], central = []; let offset = 0;
    const u16 = n => [n & 255, (n >> 8) & 255], u32 = n => [n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255];
    for (const f of files) {
      const name = enc.encode(f.name), crc = crc32(f.data), size = f.data.length;
      const local = new Uint8Array([0x50, 0x4b, 3, 4, ...u16(20), ...u16(0x0800), ...u16(0), ...u16(0), ...u16(0x21), ...u32(crc), ...u32(size), ...u32(size), ...u16(name.length), ...u16(0)]);
      parts.push(local, name, f.data);
      central.push(new Uint8Array([0x50, 0x4b, 1, 2, ...u16(20), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(0), ...u16(0x21), ...u32(crc), ...u32(size), ...u32(size), ...u16(name.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(offset)]), name);
      offset += local.length + name.length + size;
    }
    const cdSize = central.reduce((s, p) => s + p.length, 0);
    const end = new Uint8Array([0x50, 0x4b, 5, 6, ...u16(0), ...u16(0), ...u16(files.length), ...u16(files.length), ...u32(cdSize), ...u32(offset), ...u16(0)]);
    const all = [...parts, ...central, end], out = new Uint8Array(all.reduce((s, p) => s + p.length, 0));
    let o = 0; for (const p of all) { out.set(p, o); o += p.length; }
    return out;
  }

  /* ---------- XLSX writer ---------- */
  const xe = s => String(s).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const colName = i => { let s = ''; for (i++; i > 0; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + ((i - 1) % 26)) + s; return s; };

  function build(rows, sheetName) {
    const sheetRows = rows.map((row, r) => `<row r="${r + 1}">` + row.map((v, c) => {
      const ref = colName(c) + (r + 1), s = r === 0 ? ' s="1"' : '';
      if (v == null || v === '') return '';
      if (typeof v === 'number' && isFinite(v)) return `<c r="${ref}"${s}><v>${v}</v></c>`;
      return `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${xe(v)}</t></is></c>`;
    }).join('') + '</row>').join('');
    const cols = (rows[0] || []).map((_, i) => `<col min="${i + 1}" max="${i + 1}" width="${Math.min(40, Math.max(10, ...rows.slice(0, 200).map(r => String(r[i] == null ? '' : r[i]).length + 2)))}" customWidth="1"/>`).join('');
    const X = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
    const files = {
      '[Content_Types].xml': X + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>',
      '_rels/.rels': X + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
      'xl/workbook.xml': X + `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${xe(sheetName || 'Sheet1').slice(0, 31)}" sheetId="1" r:id="rId1"/></sheets></workbook>`,
      'xl/_rels/workbook.xml.rels': X + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>',
      'xl/styles.xml': X + '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>',
      'xl/worksheets/sheet1.xml': X + `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>${cols}</cols><sheetData>${sheetRows}</sheetData></worksheet>`
    };
    return zip(Object.keys(files).map(name => ({ name, data: enc.encode(files[name]) })));
  }

  /* ---------- ZIP reader ---------- */
  async function inflate(u8) {
    if (typeof DecompressionStream === 'undefined') throw new Error('nodecompress');
    const ds = new DecompressionStream('deflate-raw');
    const w = ds.writable.getWriter(); w.write(u8); w.close();
    return new Uint8Array(await new Response(ds.readable).arrayBuffer());
  }
  async function unzip(buf) {                    // -> {name: Uint8Array} (lazy: returns a getter)
    const u8 = new Uint8Array(buf), dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    let e = u8.length - 22;
    while (e >= 0 && dv.getUint32(e, true) !== 0x06054b50) e--;
    if (e < 0) throw new Error('notzip');
    const n = dv.getUint16(e + 10, true); let p = dv.getUint32(e + 16, true);
    const entries = {};
    for (let i = 0; i < n; i++) {
      if (dv.getUint32(p, true) !== 0x02014b50) throw new Error('notzip');
      const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true), nlen = dv.getUint16(p + 28, true), xlen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true), lo = dv.getUint32(p + 42, true);
      entries[dec.decode(u8.subarray(p + 46, p + 46 + nlen))] = { method, csize, lo };
      p += 46 + nlen + xlen + clen;
    }
    return async name => {
      const en = entries[name]; if (!en) return null;
      const start = en.lo + 30 + dv.getUint16(en.lo + 26, true) + dv.getUint16(en.lo + 28, true);
      const data = u8.subarray(start, start + en.csize);
      return dec.decode(en.method === 0 ? data : await inflate(data));
    };
  }

  /* ---------- XLSX reader ---------- */
  const unxml = s => s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (m, g) => {
    if (g[0] === '#') return String.fromCodePoint(g[1].toLowerCase() === 'x' ? parseInt(g.slice(2), 16) : parseInt(g.slice(1), 10));
    return { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }[g.toLowerCase()];
  });
  const textOf = xml => { let t = ''; xml.replace(/<t\b[^>]*?(?:\/>|>([\s\S]*?)<\/t>)/g, (m, g) => { t += g ? unxml(g) : ''; }); return t; };
  const colIndex = ref => { let n = 0; for (const ch of ref.replace(/[^A-Z]/gi, '').toUpperCase()) n = n * 26 + ch.charCodeAt(0) - 64; return n - 1; };

  async function read(buf) {
    const file = await unzip(buf);
    const wb = await file('xl/workbook.xml');
    if (!wb) throw new Error('notxlsx');
    // find the first sheet through the workbook relationships
    let path = 'xl/worksheets/sheet1.xml';
    const first = /<sheet\b[^>]*?r:id="([^"]+)"/.exec(wb), rels = await file('xl/_rels/workbook.xml.rels');
    if (first && rels) {
      const re = new RegExp('<Relationship\\b[^>]*?Id="' + first[1] + '"[^>]*?>'), tag = re.exec(rels);
      const tg = tag && /Target="([^"]+)"/.exec(tag[0]);
      if (tg) path = tg[1].startsWith('/') ? tg[1].slice(1) : 'xl/' + tg[1].replace(/^\.\//, '');
    }
    const sheet = await file(path);
    if (!sheet) throw new Error('notxlsx');
    const sst = await file('xl/sharedStrings.xml'), strings = [];
    if (sst) sst.replace(/<si\b[^>]*?(?:\/>|>([\s\S]*?)<\/si>)/g, (m, g) => { strings.push(g ? textOf(g) : ''); });
    const rows = [];
    sheet.replace(/<row\b[^>]*?(?:\/>|>([\s\S]*?)<\/row>)/g, (m, body) => {
      const row = [];
      (body || '').replace(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g, (mm, attrs, inner) => {
        const ref = /\br="([A-Z]+)\d+"/i.exec(attrs), type = (/\bt="([^"]+)"/.exec(attrs) || [])[1];
        const idx = ref ? colIndex(ref[1]) : row.length, v = inner && /<v>([\s\S]*?)<\/v>/.exec(inner);
        let val = null;
        if (type === 'inlineStr') val = textOf(inner || '');
        else if (v) {
          const raw = unxml(v[1]);
          if (type === 's') val = strings[parseInt(raw, 10)] ?? '';
          else if (type === 'str' || type === 'e') val = raw;
          else if (type === 'b') val = raw === '1' ? 'TRUE' : 'FALSE';
          else { const num = Number(raw); val = raw !== '' && isFinite(num) ? num : raw; }
        }
        while (row.length < idx) row.push(null);
        row[idx] = val;
      });
      const r = /\br="(\d+)"/.exec(m);
      if (r) while (rows.length < parseInt(r[1], 10) - 1) rows.push([]);
      rows.push(row);
    });
    return rows;
  }

  /* ---------- CSV (fallback when the browser cannot unzip .xlsx) ---------- */
  function csv(text) {
    const rows = []; let row = [], f = '', q = false;
    text = text.replace(/^\uFEFF/, '');
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) { if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
      else if (c === '"') q = true;
      else if (c === ',') { row.push(f); f = ''; }
      else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(f); rows.push(row); row = []; f = ''; }
      else f += c;
    }
    if (f !== '' || row.length) { row.push(f); rows.push(row); }
    return rows;
  }

  function download(data, filename, mime) {
    const blob = new Blob([data], { type: mime || XLSX_MIME }), a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = filename; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }

  G.XLSX = { build, read, csv, download, MIME: XLSX_MIME };
})(typeof window !== 'undefined' ? window : globalThis);
