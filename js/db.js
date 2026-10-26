/* The "database": everything the SQLite file used to hold now lives in the browser's localStorage.
   - Key gist_receipts_db     : all tables as JSON (one key, so every save is all-or-nothing)
   - Key gist_receipts_files  : uploaded images (QR codes, watermark) as data URLs, kept apart so they
                                are not rewritten every time a receipt is saved
   Tables, columns and rules mirror schema.sql. */
(function (G) {
  'use strict';
  const { U } = G;
  const KEY = 'gist_receipts_db', FKEY = 'gist_receipts_files', BKEY = 'gist_receipts_last_backup';
  const TABLES = ['users', 'courses', 'acad_years', 'branches', 'students', 'fee_categories', 'pay_modes',
    'receipt_books', 'receipts', 'receipt_items', 'audit_log', 'qr_codes', 'semesters'];

  /* A DbError carries a message that is safe to show the person using the app. */
  class DbError extends Error { }
  const QUOTA = 'The browser storage is full. Download a backup, then remove old data or unused images.';

  let cache = null, fcache = null;
  window.addEventListener('storage', e => { if (e.key === KEY) cache = null; if (e.key === FKEY) fcache = null; });  // another tab changed it

  const blank = () => { const d = { v: 1, seq: {}, settings: {} }; TABLES.forEach(t => { d[t] = []; d.seq[t] = 0; }); return d; };
  const complete = d => {
    const b = blank(); Object.keys(b).forEach(k => { if (d[k] == null) d[k] = b[k]; });
    if (typeof d.seq !== 'object' || Array.isArray(d.seq)) d.seq = b.seq;
    if (typeof d.settings !== 'object' || Array.isArray(d.settings)) d.settings = {};
    // The counter must never be behind the highest id in the table, or new rows would reuse an old id.
    TABLES.forEach(t => { const top = d[t].reduce((m, r) => Math.max(m, Number(r && r.id) || 0), 0); if (!(d.seq[t] >= top)) d.seq[t] = top; });
    return d;
  };
  const write = (key, obj) => {
    try { localStorage.setItem(key, JSON.stringify(obj)); }
    catch (e) { cache = fcache = null; throw new DbError(QUOTA); }
  };

  function load() {
    if (cache) return cache;
    const raw = localStorage.getItem(KEY);
    if (!raw) return (cache = seed(blank()));
    try { cache = complete(JSON.parse(raw)); } catch (e) { const err = new DbError('The saved data could not be read.'); err.raw = raw; err.fatal = true; throw err; }
    return cache;
  }

  /* Run fn(d) on the freshest data. Everything fn changes is saved together, or (if fn throws) not at all. */
  function tx(fn) {
    cache = null;
    const d = load();
    try { const out = fn(d); write(KEY, d); cache = d; return out; }
    catch (e) { cache = null; throw e; }
  }
  const insert = (d, table, row) => { row.id = ++d.seq[table]; d[table].push(row); return row; };
  const byId = (rows, id) => rows.find(r => r.id === Number(id)) || null;

  /* First start: the same starting data the Flask app created. */
  function seed(d) {
    insert(d, 'users', { username: 'ultra', password_hash: U.hashPassword('ultra123'), email: null, role: 'superadmin', active: 1 });
    insert(d, 'users', { username: 'admin', password_hash: U.hashPassword('admin123'), email: null, role: 'admin', active: 1 });
    [['Diploma', 3], ['BTech', 4]].forEach(([name, duration]) => {
      const c = insert(d, 'courses', { name, duration });
      ['Electrical', 'Mechanical', 'Civil', 'Computer Science', 'Basic Science'].forEach(b => insert(d, 'branches', { course_id: c.id, name: b }));
    });
    ['Admission fee', 'Registration fee', 'Semester fee', 'Examination fee', 'Library fee', 'Laboratory fee', 'Hostel fee', 'Project fee', 'Caution money', 'Other']
      .forEach(name => insert(d, 'fee_categories', { name }));
    ['Cash', 'UPI', 'Bank Transfer', 'Cheque'].forEach(name => insert(d, 'pay_modes', { name }));
    for (let i = 1; i <= 10; i++) insert(d, 'semesters', { name: String(i) });
    d.settings.name = 'GIST, Rayagada';
    write(KEY, d);
    return d;
  }

  /* ---------- Uploaded images ---------- */
  const files = () => {
    if (fcache) return fcache;
    try { fcache = JSON.parse(localStorage.getItem(FKEY) || '{}') || {}; } catch (e) { fcache = {}; }
    return fcache;
  };
  const Files = {
    url: id => files()[id] || '',
    put(dataUrl) {
      const f = files(), id = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
      f[id] = dataUrl;
      try { write(FKEY, f); } catch (e) { delete f[id]; throw e; }
      return id;
    },
    del(id) { const f = files(); if (id && f[id]) { delete f[id]; write(FKEY, f); } },
    all: () => files()
  };

  /* ---------- Joined view of receipts (what BASE_SQL did) ---------- */
  function receiptRows(d) {
    d = d || load();
    const books = new Map(d.receipt_books.map(b => [b.id, b])), studs = new Map(d.students.map(s => [s.id, s]));
    const users = new Map(d.users.map(u => [u.id, u])), cats = new Map(d.fee_categories.map(k => [k.id, k]));
    const items = new Map();
    d.receipt_items.forEach(i => { if (!items.has(i.receipt_id)) items.set(i.receipt_id, []); items.get(i.receipt_id).push(i); });
    const out = [];
    d.receipts.forEach(r => {
      const b = books.get(r.book_id), s = studs.get(r.student_id), u = users.get(r.entered_by);
      if (!b || !s || !u) return;
      const purposes = (items.get(r.id) || []).filter(i => cats.has(i.category_id))
        .map(i => cats.get(i.category_id).name + (i.semester ? ', Sem ' + i.semester : '') + ' (' + Number(i.amount).toFixed(2) + ')').join('; ');
      out.push(Object.assign({}, r, { book_no: b.book_no, name: s.name, roll_no: s.roll_no, branch: s.branch, course: s.course, acad_session: s.acad_session, entered_by_name: u.username, purposes }));
    });
    return out;
  }

  /* ---------- Backup and restore ---------- */
  const CORE = ['users', 'students', 'receipts', 'receipt_items', 'receipt_books'];     // a backup must have these; newer tables are filled in when an older backup lacks them
  const sum = (db, files) => U.hex(U.sha256(U.utf8(JSON.stringify({ db, files }))));    // fingerprint: detects a damaged or hand-edited backup file
  const counts = d => ({ receipts: (d.receipts || []).length, students: (d.students || []).length, books: (d.receipt_books || []).length, users: (d.users || []).length });
  const exportAll = () => { const db = load(), f = files(); return { app: 'gist-receipts', version: 2, exported: U.nowIso(), checksum: sum(db, f), db, files: f }; };

  /* Check a parsed backup file WITHOUT touching the saved data. Returns what it contains, or throws a clear message. */
  function inspect(obj) {
    if (!obj || typeof obj !== 'object' || obj.app !== 'gist-receipts' || !obj.db || typeof obj.db !== 'object') throw new DbError('That file is not a backup made by this app.');
    const bad = CORE.filter(t => !Array.isArray(obj.db[t]));
    if (bad.length) throw new DbError('This backup is incomplete (missing: ' + bad.join(', ') + ').');
    TABLES.forEach(t => { if (obj.db[t] != null && !Array.isArray(obj.db[t])) throw new DbError('This backup is damaged (the "' + t + '" part is unreadable).'); });
    if (obj.files != null && (typeof obj.files !== 'object' || Array.isArray(obj.files))) throw new DbError('This backup is damaged (the images part is unreadable).');
    if (obj.checksum && obj.checksum !== sum(obj.db, obj.files || {})) throw new DbError('This backup file is damaged or has been changed after it was downloaded, so it was not used. Try another backup file.');
    if (!obj.db.users.some(u => u && u.role === 'superadmin' && u.active)) throw new DbError('That backup has no active ultra admin user, so nobody could log in.');
    return Object.assign(counts(obj.db), { exported: obj.exported || '', verified: !!obj.checksum, images: Object.keys(obj.files || {}).length });
  }

  /* Replace everything with the backup. All-or-nothing: if it does not fit, or reads back wrong, the old data is put back. */
  function importAll(obj) {
    const info = inspect(obj);
    const d = complete(JSON.parse(JSON.stringify(obj.db))), f = obj.files || {};
    const oldDb = localStorage.getItem(KEY), oldFiles = localStorage.getItem(FKEY);
    const putBack = () => { try { if (oldDb != null) localStorage.setItem(KEY, oldDb); else localStorage.removeItem(KEY); if (oldFiles != null) localStorage.setItem(FKEY, oldFiles); else localStorage.removeItem(FKEY); } catch (e) { /* nothing more can be done */ } cache = fcache = null; };
    try { write(KEY, d); write(FKEY, f); } catch (e) { putBack(); throw e; }
    cache = fcache = null;
    try {                                                                           // read it back from storage and compare
      const back = JSON.parse(localStorage.getItem(KEY)), c = counts(back), w = counts(d);
      if (c.receipts !== w.receipts || c.students !== w.students || c.users !== w.users || Object.keys(JSON.parse(localStorage.getItem(FKEY) || '{}')).length !== Object.keys(f).length) throw new Error('mismatch');
    } catch (e) { putBack(); throw new DbError('The restore could not be verified, so your previous data was kept. Nothing was changed.'); }
    if (obj.exported) { try { localStorage.setItem(BKEY, obj.exported); } catch (e) { /* not important */ } }
    return info;
  }
  /* Erase everything (data, images, backup date) and start again with the first-run accounts. */
  function reset() { [KEY, FKEY, BKEY].forEach(k => localStorage.removeItem(k)); cache = fcache = null; return load(); }
  const lastBackup = () => localStorage.getItem(BKEY) || '';
  const markBackup = () => { try { localStorage.setItem(BKEY, U.nowIso()); } catch (e) { /* not important */ } };
  const usage = () => (localStorage.getItem(KEY) || '').length + (localStorage.getItem(FKEY) || '').length;

  /* ---------- Undo: one "restore point" kept just before Reset website or Restore backup ----------
     The full copy goes into IndexedDB (far more room than localStorage; localStorage is the fallback).
     A small note about it (when, what, and which ultra admin logins existed) stays in localStorage so the
     login page can offer "Undo" even after the data itself has been wiped. */
  const UMETA = 'gist_receipts_undo_meta', UDATA = 'gist_receipts_undo_data', IDBN = 'gist_receipts_undo';
  const idbOpen = () => new Promise((ok, no) => {
    if (!window.indexedDB) return no(new Error('no indexedDB'));
    const rq = indexedDB.open(IDBN, 1); rq.onupgradeneeded = () => rq.result.createObjectStore('s');
    rq.onsuccess = () => ok(rq.result); rq.onerror = () => no(rq.error || new Error('indexedDB failed')); rq.onblocked = () => no(new Error('indexedDB blocked'));
  });
  const idbRun = (mode, fn) => idbOpen().then(db => new Promise((ok, no) => {
    const t = db.transaction('s', mode); let out; const r = fn(t.objectStore('s')); if (r) r.onsuccess = () => { out = r.result; };
    t.oncomplete = () => { db.close(); ok(out); }; t.onerror = t.onabort = () => { db.close(); no(t.error || new Error('indexedDB failed')); };
  }));
  async function slotPut(v) {
    try { await idbRun('readwrite', s => s.put(v, 'last')); localStorage.removeItem(UDATA); return 'idb'; }
    catch (e) {
      try { localStorage.setItem(UDATA, JSON.stringify(v)); return 'ls'; }
      catch (e2) { throw new DbError('There is not enough browser storage to keep an undo copy. Download a backup file first, then try again.'); }
    }
  }
  async function slotGet(meta) {
    if (meta.where === 'ls') { try { return JSON.parse(localStorage.getItem(UDATA) || 'null'); } catch (e) { return null; } }
    try { return (await idbRun('readonly', s => s.get('last'))) || null; } catch (e) { return null; }
  }
  const setOrDrop = (k, v) => { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); };
  const rawNow = () => ({ db: localStorage.getItem(KEY), files: localStorage.getItem(FKEY), bk: localStorage.getItem(BKEY) });

  const Undo = {
    info() { try { return JSON.parse(localStorage.getItem(UMETA) || 'null'); } catch (e) { return null; } },
    /* Step 1 (before the risky action): keep a full copy. Throws if no copy can be kept, so the caller stops. */
    async prepare(label, raw) {
      raw = raw || rawNow(); let d = null;
      localStorage.removeItem(UMETA);                    // the old note must not point at a copy that is about to be replaced
      try { d = JSON.parse(raw.db); } catch (e) { /* counts stay empty */ }
      const meta = { label, ts: U.nowIso(), counts: d ? counts(d) : {}, supers: d ? (d.users || []).filter(u => u.role === 'superadmin' && u.active).map(u => ({ username: u.username, email: u.email || null, password_hash: u.password_hash })) : [] };
      meta.where = await slotPut(raw);
      return meta;
    },
    /* Step 2 (after the action): publish the note. Returns false if the note could not be stored. */
    commit(meta) { try { localStorage.setItem(UMETA, JSON.stringify(meta)); return true; } catch (e) { return false; } },
    discard() { localStorage.removeItem(UMETA); localStorage.removeItem(UDATA); idbRun('readwrite', s => s.delete('last')).catch(() => { }); },
    /* Only someone who was an ultra admin in the saved copy may bring it back. */
    verify(name, pw) {
      const m = Undo.info(), n = String(name || '').trim(); if (!m) return false;
      return (m.supers || []).some(u => (u.username === n || (u.email && u.email === n.toLowerCase())) && U.checkPassword(pw, u.password_hash));
    },
    /* Put the saved copy back. What it replaces is kept as the new restore point, so Undo can itself be undone. */
    async apply() {
      const meta = Undo.info(); if (!meta) throw new DbError('There is nothing to undo.');
      const p = await slotGet(meta);
      let back; try { back = JSON.parse(p.db); if (!back || !Array.isArray(back.users)) throw 0; } catch (e) { throw new DbError('The saved copy could not be found or read, so nothing was changed.'); }
      const cur = rawNow();
      try { setOrDrop(KEY, p.db); setOrDrop(FKEY, p.files); setOrDrop(BKEY, p.bk); }
      catch (e) { try { setOrDrop(KEY, cur.db); setOrDrop(FKEY, cur.files); setOrDrop(BKEY, cur.bk); } catch (e2) { /* nothing more can be done */ } cache = fcache = null; throw new DbError(QUOTA); }
      cache = fcache = null;
      let again = false;
      try { again = Undo.commit(await Undo.prepare('Undo of "' + meta.label + '"', cur)); } catch (e) { Undo.discard(); }
      if (!again) Undo.discard();
      return Object.assign({ again, label: meta.label }, counts(back));
    }
  };

  G.DB = { reset, DbError, load, tx, insert, byId, Files, receiptRows, exportAll, importAll, inspect, Undo, counts, lastBackup, markBackup, usage, TABLES };
})(window);
