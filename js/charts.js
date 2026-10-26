/* Small dependency-free charts (inline SVG / CSS). Used by the dashboard and the reports. */
(function (G) {
  'use strict';
  const { U } = G, { h, raw, inr, esc } = U;
  const COL = ['#2B8156', '#E0A526', '#7DB896', '#B7791F', '#8FA89A', '#C9E6D5'];
  const short = v => v >= 1e7 ? (v / 1e7).toFixed(1) + 'Cr' : v >= 1e5 ? (v / 1e5).toFixed(1) + 'L' : v >= 1e3 ? (v / 1e3).toFixed(v >= 1e4 ? 0 : 1) + 'k' : String(Math.round(v));
  const nice = top => { const m = Math.pow(10, Math.floor(Math.log10(top))); return [1, 2, 2.5, 5, 10].map(k => k * m).find(v => v >= top) || top; };
  const empty = txt => h`<p class="empty">${txt || 'Nothing to show yet.'}</p>`;
  let uid = 0;

  function bars(items) {                       // items: [{l, v, t}]
    if (!items.length) return empty();
    const top = Math.max(1, ...items.map(x => x.v)), step = Math.ceil(items.length / 12);
    return h`<div class="chart ${items.length > 14 ? 'dense' : ''}">${items.map((x, i) => h`<div class="${x.t ? 't' : ''}" style="--h:${Math.round(x.v / top * 100)}%;--i:${i}" data-v="${x.l}: ${inr(x.v)}"><i></i><span>${i % step === 0 ? x.l : ''}</span></div>`)}</div>`;
  }

  function area(items, w = 640, hh = 220) {    // line + soft fill with hover dots
    if (!items.length || !items.some(x => x.v)) return empty('No collection in this period yet.');
    const p = { l: 46, r: 14, t: 14, b: 28 }, iw = w - p.l - p.r, ih = hh - p.t - p.b, max = nice(Math.max(...items.map(x => x.v))), id = 'ag' + (++uid);
    const X = i => p.l + (items.length < 2 ? iw / 2 : i * iw / (items.length - 1)), Y = v => p.t + ih - v / max * ih, f = n => n.toFixed(1);
    const line = items.map((x, i) => (i ? 'L' : 'M') + f(X(i)) + ' ' + f(Y(x.v))).join('');
    const grid = [0, 1, 2, 3, 4].map(k => `<line class="gl" x1="${p.l}" x2="${w - p.r}" y1="${f(Y(max * k / 4))}" y2="${f(Y(max * k / 4))}"/><text x="${p.l - 8}" y="${f(Y(max * k / 4) + 4)}" text-anchor="end">${short(max * k / 4)}</text>`).join('');
    const step = Math.ceil(items.length / 7), xl = items.map((x, i) => i % step === 0 ? `<text x="${f(X(i))}" y="${hh - 8}" text-anchor="middle">${esc(x.l)}</text>` : '').join('');
    const dots = items.map((x, i) => `<circle class="dot" cx="${f(X(i))}" cy="${f(Y(x.v))}" r="3.5"><title>${esc(x.l)}: ${esc(inr(x.v))}</title></circle>`).join('');
    return raw(`<svg class="area" viewBox="0 0 ${w} ${hh}" role="img" aria-label="Collection trend"><defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:var(--forest);stop-opacity:.35"/><stop offset="1" style="stop-color:var(--forest);stop-opacity:0"/></linearGradient></defs>${grid}${xl}<path class="fl" d="${line}L${f(X(items.length - 1))} ${p.t + ih}L${f(X(0))} ${p.t + ih}Z" fill="url(#${id})"/><path class="ln" pathLength="1" d="${line}"/>${dots}</svg>`);
  }

  function donut(parts) {                      // parts: [{l, v}]
    const tot = parts.reduce((s, x) => s + x.v, 0);
    if (!tot) return empty('No collection in this period yet.');
    let cum = 0;
    const segs = parts.map((x, i) => { const pc = x.v / tot * 100, s = `<circle class="seg" r="15.9155" cx="21" cy="21" style="stroke:${COL[i % COL.length]};stroke-dasharray:${pc.toFixed(2)} ${(100 - pc).toFixed(2)};stroke-dashoffset:${(25 - cum).toFixed(2)};animation-delay:${i * 120}ms"><title>${esc(x.l)}: ${esc(inr(x.v))}</title></circle>`; cum += pc; return s; }).join('');
    return h`<div class="dn">${raw(`<svg viewBox="0 0 42 42" role="img" aria-label="Share by payment mode"><circle cx="21" cy="21" r="15.9155" fill="none" stroke="#EAF6EF" stroke-width="6"/>${segs}<text class="dt" x="21" y="22.5">${'₹' + short(tot)}</text><text class="ds" x="21" y="27">total</text></svg>`)}
<ul class="lg">${parts.map((x, i) => h`<li><i style="background:${COL[i % COL.length]}"></i>${x.l}<b>${Math.round(x.v / tot * 100)}%</b></li>`)}</ul></div>`;
  }

  function hbars(rows) {                       // rows: [{l, v}]
    if (!rows.length) return empty();
    const top = Math.max(1, ...rows.map(r => r.v));
    return h`<div class="hb">${rows.slice(0, 8).map((r, i) => h`<div style="--i:${i}"><span>${r.l}</span><div class="meter"><i style="--w:${Math.round(r.v / top * 100)}%"></i></div><b>${inr(r.v)}</b></div>`)}</div>`;
  }

  G.Ch = { bars, area, donut, hbars, COL };
})(window);
