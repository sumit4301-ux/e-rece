/* Small helpers shared by every other file. Plain script, no build step, no modules. */
(function (G) {
  'use strict';

  /* ---------- Safe HTML templates ----------
     h`<td>${value}</td>` escapes every value automatically (like Jinja did).
     Wrap trusted HTML in raw(...) and nested h`` results are never escaped twice. */
  class Raw { constructor(s) { this.s = s; } toString() { return this.s; } }
  const raw = s => new Raw(String(s));
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const part = v => {
    if (v == null || v === false) return '';
    if (v instanceof Raw) return v.s;
    if (Array.isArray(v)) return v.map(part).join('');
    return esc(v);
  };
  const h = (strs, ...vals) => new Raw(strs.reduce((a, s, i) => a + s + (i < vals.length ? part(vals[i]) : ''), ''));

  /* ---------- Formatting ---------- */
  const pad = (n, w = 2) => String(n).padStart(w, '0');
  const serial = n => pad(n, 5);
  const inr = x => '₹' + (Number(x) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  // Local dates (not toISOString, which is UTC and would give the wrong day early in the morning in India)
  const today = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
  const nowIso = () => { const d = new Date(); return `${today()}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`; };
  const yearLabel = (start, duration) => `${start}-${start + duration}`;
  const ON = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const TN = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  const w100 = n => n < 20 ? ON[n] : TN[Math.floor(n / 10)] + (n % 10 ? ' ' + ON[n % 10] : '');
  const w1000 = n => (n >= 100 ? ON[Math.floor(n / 100)] + ' Hundred' + (n % 100 ? ' ' : '') : '') + (n % 100 ? w100(n % 100) : '');
  const words = n => {
    if (!n) return 'Zero';
    const p = [], cr = Math.floor(n / 1e7), lk = Math.floor(n % 1e7 / 1e5), th = Math.floor(n % 1e5 / 1e3), r = n % 1e3;
    if (cr) p.push(words(cr) + ' Crore'); if (lk) p.push(w100(lk) + ' Lakh'); if (th) p.push(w100(th) + ' Thousand'); if (r) p.push(w1000(r));
    return p.join(' ');
  };
  const rupeesWords = x => { const t = Math.round((Number(x) || 0) * 100), p = t % 100; return 'Rupees ' + words(Math.floor(t / 100)) + (p ? ', and ' + w100(p) + ' Paise' : '') + ' only'; };
  const lc = s => String(s == null ? '' : s).toLowerCase();

  /* ---------- Password hashing ----------
     Salted, stretched SHA-256 written in plain JS so it behaves the same on https, http and file://
     (the browser's crypto.subtle is missing on plain http). */
  const K = new Uint32Array([
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2]);
  const W = new Uint32Array(64);
  function sha256(msg) {                       // msg: Uint8Array -> Uint8Array(32)
    const len = msg.length, total = ((len + 9 + 63) >> 6) << 6, buf = new Uint8Array(total);
    buf.set(msg); buf[len] = 0x80;
    const dv = new DataView(buf.buffer);
    dv.setUint32(total - 8, Math.floor(len / 0x20000000)); dv.setUint32(total - 4, (len << 3) >>> 0);
    let h0 = 0x6a09e667, h1 = 0xbb67ae85, h2 = 0x3c6ef372, h3 = 0xa54ff53a, h4 = 0x510e527f, h5 = 0x9b05688c, h6 = 0x1f83d9ab, h7 = 0x5be0cd19;
    for (let o = 0; o < total; o += 64) {
      for (let i = 0; i < 16; i++) W[i] = dv.getUint32(o + i * 4);
      for (let i = 16; i < 64; i++) {
        const a = W[i - 15], b = W[i - 2];
        W[i] = (W[i - 16] + (((a >>> 7) | (a << 25)) ^ ((a >>> 18) | (a << 14)) ^ (a >>> 3)) + W[i - 7] + (((b >>> 17) | (b << 15)) ^ ((b >>> 19) | (b << 13)) ^ (b >>> 10))) >>> 0;
      }
      let a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, hh = h7;
      for (let i = 0; i < 64; i++) {
        const t1 = (hh + (((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7))) + ((e & f) ^ (~e & g)) + K[i] + W[i]) >>> 0;
        const t2 = ((((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10))) + ((a & b) ^ (a & c) ^ (b & c))) >>> 0;
        hh = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
      }
      h0 = (h0 + a) >>> 0; h1 = (h1 + b) >>> 0; h2 = (h2 + c) >>> 0; h3 = (h3 + d) >>> 0; h4 = (h4 + e) >>> 0; h5 = (h5 + f) >>> 0; h6 = (h6 + g) >>> 0; h7 = (h7 + hh) >>> 0;
    }
    const out = new Uint8Array(32), ov = new DataView(out.buffer);
    [h0, h1, h2, h3, h4, h5, h6, h7].forEach((v, i) => ov.setUint32(i * 4, v));
    return out;
  }
  const utf8 = s => new TextEncoder().encode(s);
  const hex = u8 => Array.from(u8, b => pad(b.toString(16))).join('');
  const ROUNDS = 20000;
  function stretch(password, salt) {
    const s = utf8(salt), p = utf8(password), seed = new Uint8Array(s.length + p.length);
    seed.set(s); seed.set(p, s.length);
    let d = sha256(seed);
    const buf = new Uint8Array(32 + seed.length);
    for (let i = 0; i < ROUNDS; i++) { buf.set(d); buf.set(seed, 32); d = sha256(buf); }
    return hex(d);
  }
  const randomHex = n => { const a = new Uint8Array(n); (G.crypto || G.msCrypto).getRandomValues(a); return hex(a); };
  const hashPassword = pw => { const salt = randomHex(16); return `s1$${salt}$${stretch(pw, salt)}`; };
  const checkPassword = (pw, stored) => {
    const p = String(stored || '').split('$');
    return p.length === 3 && p[0] === 's1' && stretch(pw, p[1]) === p[2];
  };

  G.U = { rupeesWords, Raw, raw, esc, h, pad, serial, inr, today, nowIso, yearLabel, lc, sha256, utf8, hex, hashPassword, checkPassword };
})(typeof window !== 'undefined' ? window : globalThis);
