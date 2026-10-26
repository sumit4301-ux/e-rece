/* App core: login session, page routing, page layout, form/click handling, flash messages.
   Pages live in pages-receipts.js and pages-setup.js and register themselves here.

   Addresses look like  index.html#/receipts?q=Rahul  (the part after # is handled here), so the site
   works from any folder, any static host, or straight from the disk with no server rules. */
(function (G) {
  'use strict';
  const { U, DB } = G, { h, raw } = U;
  const routes = [], forms = {}, acts = {};
  const SK = 'gist_session', IDLE = 30 * 60 * 1000;      // log out after 30 minutes without activity
  let flashQ = [], navigated = false, installEvt = null, hadSession = false, notice = '';

  class Denied extends Error { }
  class NotFound extends Error { }

  /* ---------- Session ---------- */
  function session() {
    let s; try { s = JSON.parse(localStorage.getItem(SK) || 'null'); } catch (e) { s = null; }
    if (!s) return null;
    if (Date.now() > s.exp) { localStorage.removeItem(SK); return null; }
    const u = DB.load().users.find(x => x.id === s.uid);
    if (!u || !u.active || u.username !== s.user) { localStorage.removeItem(SK); return null; }
    return { uid: u.id, user: u.username, role: u.role, exp: s.exp };
  }
  const startSession = u => { localStorage.setItem(SK, JSON.stringify({ uid: u.id, user: u.username, exp: Date.now() + IDLE })); hadSession = true; };
  const endSession = () => { localStorage.removeItem(SK); hadSession = false; };
  function touch() {
    const s = session();
    if (s && s.exp - Date.now() < IDLE - 5000) localStorage.setItem(SK, JSON.stringify({ uid: s.uid, user: s.user, exp: Date.now() + IDLE }));
  }
  /* Ultra admin (superadmin) passes every check, like the old access() decorator. */
  const has = (...roles) => { const s = session(); return !!s && (s.role === 'superadmin' || roles.includes(s.role)); };
  const need = (...roles) => { if (!has(...roles)) throw new Denied(); };
  const me = () => { const s = session(); return s ? DB.load().users.find(u => u.id === s.uid) : null; };

  /* ---------- Registration used by the page files ---------- */
  // roles: null = public page, [] = any logged-in user, ['admin',...] = those roles (and the ultra admin)
  function page(pattern, roles, fn) {
    const names = [], re = new RegExp('^' + pattern.replace(/:(\w+)/g, (m, n) => { names.push(n); return '([^/]+)'; }) + '$');
    routes.push({ re, names, roles, fn });
  }
  const form = (name, fn) => { forms[name] = fn; };
  const act = (name, fn) => { acts[name] = fn; };

  /* ---------- Flash messages ---------- */
  const flash = (msg, cat) => flashQ.push({ msg, cat: cat || 'message' });
  function showFlash() {
    const box = document.getElementById('flash'); if (!box) { return; }
    box.innerHTML = String(h`${flashQ.map(f => h`<div class="flash ${f.cat}">${f.msg}</div>`)}`);
    if (flashQ.length) window.scrollTo(0, 0);
    flashQ = [];
  }

  /* ---------- Addresses ---------- */
  function parseHash() {
    const r = location.hash.replace(/^#/, '') || '/', i = r.indexOf('?');
    const qs = i < 0 ? '' : r.slice(i + 1);
    return { path: (i < 0 ? r : r.slice(0, i)) || '/', qs, q: Object.fromEntries(new URLSearchParams(qs)) };
  }
  const href = (path, params) => {
    const p = new URLSearchParams();
    Object.keys(params || {}).forEach(k => { if (params[k] !== '' && params[k] != null) p.set(k, params[k]); });
    const s = p.toString();
    return '#' + path + (s ? '?' + s : '');
  };
  function redirect(to) {
    navigated = true;
    if (location.hash === to || (to === '#/' && !location.hash)) render(); else location.hash = to;
  }

  /* ---------- Layout ---------- */
  const NAME = 'GIST, Rayagada';
  const logoUrl = () => { const c = DB.load().settings; return c.logo ? DB.Files.url(c.logo) : ''; };   // institution logo set by the ultra admin
  const IC = {
    home: 'M3 11l9-8 9 8M5 10v10h14V10', plus: 'M12 5v14M5 12h14', search: 'M11 4a7 7 0 100 14 7 7 0 000-14zM21 21l-5-5', book: 'M4 4h12a4 4 0 014 4v12H8a4 4 0 01-4-4zM4 16a4 4 0 014-4h12',
    users: 'M9 11a4 4 0 100-8 4 4 0 000 8zM2 21v-1a6 6 0 0112 0v1M17 3a4 4 0 010 8M22 21v-1a6 6 0 00-4-5.6', cal: 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4',
    school: 'M3 21h18M5 21V9l7-5 7 5v12M10 21v-6h4v6', sliders: 'M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0M14 4v4M8 10v4M16 16v4', save: 'M5 3h12l4 4v14H3V3zM7 3v6h8V3M7 21v-7h10v7',
    user: 'M12 12a4 4 0 100-8 4 4 0 000 8zM4 21a8 8 0 0116 0', rupee: 'M7 5h10M7 9h10M7 5c6 0 6 8 0 8H6l8 7', ban: 'M12 3a9 9 0 100 18 9 9 0 000-18zM5.6 5.6l12.8 12.8', clock: 'M12 3a9 9 0 100 18 9 9 0 000-18zM12 7v5l3 2', chart: 'M4 20V10M10 20V4M16 20v-7M22 20H2', trash: 'M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14M10 10v7M14 10v7'
  };
  const icon = k => h`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${IC[k]}"/></svg>`;
  G.icon = icon;
  function layout(p, s) {
    const c = DB.load().settings, name = c.name || NAME, logo = logoUrl();
    const cur = parseHash().path, on = p => (p === '/receipts' ? (cur === p || /^\/receipts\/\d+/.test(cur)) : p === '/' || p === '/receipts/new' ? cur === p : cur.indexOf(p) === 0) ? 'on' : '';
    const L = (to, ic, txt) => h`<a class="${on(to)}" href="#${to}">${icon(ic)}<span>${txt}</span></a>`;
    const nav = !s ? '' : h`<div class="topbar noprint"><button type="button" data-act="menu" aria-label="Open menu">&#9776;</button>${logo ? h`<img class="tb-logo" src="${logo}" alt="">` : ''}<strong>${name}</strong></div><div class="scrim" data-act="menu"></div><aside class="side"><div class="side-head">${logo ? h`<div class="side-logo"><img src="${logo}" alt="${name} logo"></div>` : ''}<div class="side-name"><h1>${name}</h1><p>Digital Receipt Management</p></div></div><nav>
${L('/', 'home', 'Dashboard')}
${s.role !== 'principal' ? L('/receipts/new', 'plus', 'Add receipt') : ''}
${L('/receipts', 'search', 'Receipt search')}
${has('admin', 'accountant') ? L('/books', 'book', 'Receipt books') : ''}
${s.role !== 'principal' ? L('/students', 'users', 'Students') : ''}
${L('/daily', 'cal', 'Daily collection')}
${has('admin', 'accountant', 'principal') ? L('/reports', 'chart', 'Reports') : ''}
${has('admin') ? L('/college', 'school', 'College details') : ''}
${has() ? L('/master', 'sliders', 'Master data') : ''}
${has('admin') ? L('/backup', 'save', 'Backup') : ''}
${has() ? L('/reset', 'trash', 'Reset website') : ''}
${L('/account', 'user', 'My account')}
</nav><button type="button" id="install" class="btn alt" data-act="install" hidden>Install app</button><div class="brand"><img src="img/brand.png" alt="S Square Labs"></div><div class="who">${s.user} (${s.role === 'superadmin' ? 'ultra admin' : s.role})<br><a href="#/logout">Log out</a></div></aside>`;
    const head = !s || p.ph === false ? '' : h`<div class="printhead">${logo ? h`<img class="ph-logo" src="${logo}" alt="">` : ''}<strong>${name}</strong><br>${c.address || ''} ${c.phone || ''}${c.email ? h`<br>${c.email}` : ''}</div>
<div class="noprint" style="text-align:right"><button type="button" class="btn alt" data-act="print">Print this page</button></div>`;
    return h`${nav}<main class="${s ? '' : 'bare'}">${head}<div id="flash"></div>${p.body}</main>`;
  }

  function draw(p, s) {
    document.title = (p.title || 'Dashboard') + ' | Receipts';
    document.body.classList.remove('menu-open');
    document.getElementById('app').innerHTML = String(layout(p, s));
    countUp();
    if (notice) { flash(notice, 'warn'); notice = ''; }
    showFlash();
    syncInstall();
    if (p.after) p.after();
    window.scrollTo(0, 0);
  }
  /* Numbers on cards count up once when a page opens. */
  function countUp() {
    document.querySelectorAll('[data-count]').forEach(el => {
      const end = Number(el.dataset.count), money = el.dataset.money, dur = 900, t0 = performance.now();
      if (!isFinite(end) || matchMedia('(prefers-reduced-motion:reduce)').matches) return;
      const fmt = v => money ? U.inr(v) : String(Math.round(v));
      const tick = t => { const k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3); el.textContent = fmt(end * e); if (k < 1) requestAnimationFrame(tick); };
      requestAnimationFrame(tick);
    });
  }
  const message = (title, text) => ({ title, body: h`<div class="panel"><h2>${title}</h2><p>${text}</p><p><a class="btn" href="#/">Back to the dashboard</a></p></div>` });

  function fatal(err) {
    document.title = 'Problem | Receipts';
    document.getElementById('app').innerHTML = String(h`<main><div class="panel"><h2>The saved data could not be opened</h2>
<p>${err.message} Nothing has been changed or deleted.</p>
${err.raw ? h`<p>You can download the raw saved data below and keep it safe before doing anything else.</p><p><button type="button" class="btn" data-act="raw-download">Download saved data</button></p>` : ''}</div></main>`);
    acts['raw-download'] = () => U_download(err.raw, 'gist-receipts-raw-data.json', 'application/json');
  }
  const U_download = (data, name, mime) => G.XLSX.download(data, name, mime);

  /* ---------- Router ---------- */
  function render() {
    let s;
    try {
      const { path, q } = parseHash();
      if (path === '/logout') { endSession(); location.hash = '#/login'; return; }
      s = session();
      if (hadSession && !s) { notice = 'You were logged out after 30 minutes without activity.'; hadSession = false; }
      if (s) hadSession = true;
      let found = null, params = {};
      for (const r of routes) { const m = r.re.exec(path); if (m) { found = r; r.names.forEach((n, i) => { params[n] = decodeURIComponent(m[i + 1]); }); break; } }
      if (!found) return draw(message('Page not found', 'There is no such page.'), s);
      if (found.roles) {
        if (!s) { if (location.hash !== '#/login') { location.hash = '#/login'; return; } }
        else if (found.roles.length && !has(...found.roles)) return draw(message('Not allowed', 'You do not have permission to open this page.'), s);
      } else if (s && path === '/login') { location.hash = '#/'; return; }
      draw(found.fn(params, q) || message('Page not found', 'There is no such page.'), s);
    } catch (e) {
      if (e instanceof NotFound) return draw(message('Not found', 'That item does not exist (it may have been deleted).'), s);
      if (e instanceof Denied) return draw(message('Not allowed', 'You do not have permission to open this page.'), s);
      if (e && e.fatal) return fatal(e);
      console.error(e);
      document.getElementById('app').innerHTML = String(h`<main><div class="panel"><h2>Something went wrong</h2><p>${e.message}</p><p><a class="btn" href="#/">Back to the dashboard</a></p></div></main>`);
    }
  }
  const notFound = () => { throw new NotFound(); };

  /* ---------- Password check: asked before anything is edited, deleted or erased ---------- */
  function askPassword(msg, title) {
    return new Promise(resolve => {
      const m = document.createElement('div'); m.className = 'modal noprint';
      m.innerHTML = String(h`<form class="box" autocomplete="off"><h3>${title || 'Confirm with your password'}</h3><p>${msg || 'Enter your password to continue.'}</p>
<label>Your password<input type="password" name="pw" required autocomplete="current-password"></label><p class="perr" role="alert"></p>
<div class="bar"><button>Confirm</button><button type="button" class="btn alt" data-x>Cancel</button></div></form>`);
      document.body.appendChild(m);
      const f = m.querySelector('form'), inp = f.elements.pw, err = f.querySelector('.perr');
      const done = ok => { document.removeEventListener('keydown', onKey); m.remove(); resolve(ok); };
      const onKey = e => { if (e.key === 'Escape') done(false); };
      document.addEventListener('keydown', onKey); inp.focus();
      f.querySelector('[data-x]').onclick = () => done(false);
      m.addEventListener('mousedown', e => { if (e.target === m) done(false); });
      f.addEventListener('submit', e => {
        e.preventDefault();
        const u = me();
        if (u && U.checkPassword(inp.value, u.password_hash)) done(true);
        else { err.textContent = 'Wrong password. Try again.'; inp.value = ''; inp.focus(); }
      });
    });
  }

  /* ---------- Events: one listener each, so pages never need inline handlers ---------- */
  document.addEventListener('submit', async e => {
    const f = e.target, name = f.dataset && f.dataset.form;
    if (!name || !forms[name]) return;
    e.preventDefault();
    if ((f.dataset.confirm || f.dataset.pw != null) && !(await askPassword(f.dataset.confirm || f.dataset.pw))) return;   // edits and deletes need the password
    touch(); navigated = false;
    try { await forms[name](new FormData(f), f); }
    catch (err) {
      if (err instanceof Denied) flash('You do not have permission to do that.', 'error');
      else if (err instanceof NotFound) flash('That item does not exist any more.', 'error');
      else if (err instanceof DB.DbError) { flash(err.message, 'error'); if (err.fatal) return fatal(err); }
      else { console.error(err); flash('Something went wrong: ' + err.message, 'error'); }
    }
    if (!navigated) showFlash();
  });
  document.addEventListener('click', async e => {
    touch();
    const el = e.target.closest('[data-act]');
    if (!el || !acts[el.dataset.act]) return;
    e.preventDefault(); navigated = false;
    try { await acts[el.dataset.act](el, e); }
    catch (err) {
      if (err instanceof Denied) flash('You do not have permission to do that.', 'error');
      else if (err instanceof DB.DbError) flash(err.message, 'error');
      else { console.error(err); flash('Something went wrong: ' + err.message, 'error'); }
    }
    if (!navigated) showFlash();
  });
  document.addEventListener('keydown', touch);
  window.addEventListener('hashchange', render);
  window.addEventListener('storage', e => { if (e.key === SK && !e.newValue) render(); });   // logged out in another tab
  setInterval(() => { if (hadSession && !session()) render(); }, 15000);

  act('print', () => window.print());
  act('menu', () => document.body.classList.toggle('menu-open'));
  act('pw', el => { const i = el.previousElementSibling; i.type = i.type === 'password' ? 'text' : 'password'; el.textContent = i.type === 'password' ? 'Show' : 'Hide'; });
  // soft light that follows the pointer over cards
  document.addEventListener('pointermove', e => { const c = e.target.closest && e.target.closest('.card'); if (!c) return; const r = c.getBoundingClientRect(); c.style.setProperty('--mx', (e.clientX - r.left) + 'px'); c.style.setProperty('--my', (e.clientY - r.top) + 'px'); });

  /* ---------- Install as an app (PWA) ---------- */
  const syncInstall = () => { const b = document.getElementById('install'); if (b) b.hidden = !installEvt; };
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvt = e; syncInstall(); });
  window.addEventListener('appinstalled', () => { installEvt = null; syncInstall(); });
  act('install', async () => { if (!installEvt) return; installEvt.prompt(); await installEvt.userChoice; installEvt = null; syncInstall(); });

  function start() {
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => { });   // ask the browser not to clear our data
    if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) navigator.serviceWorker.register('sw.js').catch(() => { });
    try { DB.load(); } catch (e) { return fatal(e.fatal ? e : new DB.DbError('This browser does not allow the app to save data (private browsing, or storage is blocked).')); }
    hadSession = !!session();
    render();
  }

  G.App = { logoUrl, askPassword, page, form, act, flash, showFlash, redirect, href, parseHash, session, has, need, me, startSession, endSession, notFound, Denied, NotFound, start, render };
})(window);
