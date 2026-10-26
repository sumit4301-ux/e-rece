/* Pages for everyday work: login, dashboard, account, receipt books, receipts, daily collection.
   Each App.page(...) replaces a Flask route + template; each App.form(...) replaces a POST handler. */
(function (G) {
  'use strict';
  const { U, DB, App, XLSX } = G, { h, raw, inr, serial, lc } = U;
  const ENTRY = ['admin', 'accountant', 'staff'];
  const sel = c => c ? raw(' selected') : '';
  const D = () => DB.load();
  const get = (F, k) => String(F.get(k) == null ? '' : F.get(k));
  const isInt = s => /^\s*-?\d+\s*$/.test(s);
  const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
  const fail = msg => { throw new DB.DbError(msg); };
  const audit = (d, rid, action, oldV, newV) => DB.insert(d, 'audit_log', { receipt_id: rid, user_id: App.session().uid, action, old_value: oldV, new_value: newV, ts: U.nowIso() });
  const receiptText = r => `${r.book_no}-${serial(r.serial_no)} ${r.roll_no} ${r.amount} ${r.pay_mode} ${r.purposes}`;
  G.P = { ENTRY, sel, D, get, isInt, fail, EMAIL_RE };      // shared with pages-setup.js

  /* ================= Login ================= */
  const stamp = ts => String(ts || '').replace('T', ' ').slice(0, 16);
  App.page('/login', null, () => {
    const c = D().settings, name = c.name || 'GIST, Rayagada', logo = App.logoUrl(), undo = DB.Undo.info();
    const cnt = undo && undo.counts && undo.counts.receipts != null ? ` (${undo.counts.receipts} receipts, ${undo.counts.students} students)` : '';
    return {
      title: 'Log in',
      body: h`<div class="auth"><section class="art">${logo ? h`<div class="art-logo"><img src="${logo}" alt="${name} logo"></div>` : ''}<h1>Fee receipts,<br>simple and safe.</h1><p>Issue, search and print official receipts for ${name}. Works offline, on any device.</p>
<div class="rc"><b>Fee receipt</b><u></u><u></u><u></u><strong>&#8377;12,500.00</strong></div></section>
<form data-form="login" class="panel login" autocomplete="on">${logo ? h`<img class="login-logo inst" src="${logo}" alt="${name} logo"><div class="login-inst">${name}</div>` : h`<img class="login-logo" src="img/brand.png" alt="S Square Labs">`}<h2>Welcome back</h2>
<label>Email or username<input name="username" required autocomplete="username"></label>
<label>Password<span class="pw"><input type="password" name="password" required autocomplete="current-password"><button type="button" data-act="pw">Show</button></span></label>
<div class="capbox"><span class="caplabel" id="caplabel">Verification code</span>
<div class="cap"><canvas width="190" height="56" data-captcha role="img" aria-label="Verification code. Use the new code button if you cannot read it."></canvas><button type="button" class="btn alt" data-act="captcha" aria-label="Show a new code" title="New code">&#8635;</button></div>
<input name="captcha" required autocomplete="off" autocapitalize="characters" spellcheck="false" maxlength="8" aria-labelledby="caplabel" placeholder="Type the code shown above"></div>
<button>Log in</button>
${undo ? h`<div class="undo-note"><b>${undo.label}</b> was done on ${stamp(undo.ts)}. The data from before it is still saved${cnt}.<br><a class="btn alt" href="#/undo">Undo it</a></div>` : ''}
${logo ? h`<small class="built">Built by S Square Labs</small>` : ''}</form></div>`,
      after() { G.Captcha.draw(document.querySelector('canvas[data-captcha]')); const i = document.querySelector('[name=username]'); if (i) i.focus(); }
    };
  });
  App.act('captcha', () => { G.Captcha.draw(document.querySelector('canvas[data-captcha]')); const i = document.querySelector('[name=captcha]'); if (i) { i.value = ''; i.focus(); } });
  App.form('login', (F, f) => {
    const again = () => { G.Captcha.draw(f.querySelector('canvas[data-captcha]')); if (f.elements.captcha) f.elements.captcha.value = ''; };
    if (!G.Captcha.check(get(F, 'captcha'))) { again(); f.elements.captcha.focus(); return App.flash('The verification code is wrong or has expired. Type the new code shown.', 'error'); }
    const name = get(F, 'username').trim();
    const u = D().users.find(x => x.active && (x.username === name || (x.email && x.email === name.toLowerCase())));
    if (u && U.checkPassword(get(F, 'password'), u.password_hash)) { G.Captcha.clear(); App.startSession(u); App.redirect('#/'); }
    else { again(); f.elements.password.value = ''; App.flash('Wrong username or password.', 'error'); }
  });

  /* ================= Dashboard ================= */
  App.page('/', [], () => {
    const d = D(), t = U.today(), issued = d.receipts.filter(r => r.status === 'Issued');
    const sum = rs => rs.reduce((s, r) => s + r.amount, 0);
    const stats = [
      ['Receipt books', d.receipt_books.length, 'mint', 'book'],
      ['Receipts issued', issued.length, 'mint', 'rupee'],
      ["Today's receipts", issued.filter(r => r.receipt_date === t).length, 'amber', 'clock'],
      ["Today's collection", sum(issued.filter(r => r.receipt_date === t)), 'amber', 'cal', 1],
      ["This month's collection", sum(issued.filter(r => r.receipt_date.slice(0, 7) === t.slice(0, 7))), 'mint', 'rupee', 1],
      ['Cancelled receipts', d.receipts.filter(r => r.status === 'Cancelled').length, 'mint', 'ban']
    ];
    const Ch = G.Ch, ym = t.slice(0, 7);
    const key = n => { const x = new Date(); x.setDate(x.getDate() - n); return U.pad(x.getFullYear(), 4) + '-' + U.pad(x.getMonth() + 1) + '-' + U.pad(x.getDate()); };
    const perDay = {}; issued.forEach(r => { perDay[r.receipt_date] = (perDay[r.receipt_date] || 0) + r.amount; });
    const lab = (k, o) => new Date(k + 'T00:00:00').toLocaleDateString('en-IN', o);
    const series = (n, o) => [...Array(n)].map((_, i) => { const k = key(n - 1 - i); return { k, l: lab(k, o), v: perDay[k] || 0, t: k === t }; });
    const month = issued.filter(r => r.receipt_date.slice(0, 7) === ym), mids = new Set(month.map(r => r.id)), cats = new Map(d.fee_categories.map(k => [k.id, k.name]));
    const mode = {}; month.forEach(r => { mode[r.pay_mode] = (mode[r.pay_mode] || 0) + r.amount; });
    const purp = {}; d.receipt_items.forEach(i => { if (mids.has(i.receipt_id)) { const n = cats.get(i.category_id) || 'Other'; purp[n] = (purp[n] || 0) + i.amount; } });
    const rank = o => Object.entries(o).map(([l, v]) => ({ l, v })).sort((x, y) => y.v - x.v);
    const recent = DB.receiptRows(d).sort((x, y) => (y.entry_ts || '') < (x.entry_ts || '') ? -1 : 1).slice(0, 5);
    const hr = new Date().getHours(), hello = hr < 12 ? 'Good morning' : hr < 17 ? 'Good afternoon' : 'Good evening';
    // The data lives only in this browser, so remind the people who can back it up.
    const lb = DB.lastBackup(), nd = lb ? (Date.now() - Date.parse(lb)) / 864e5 : Infinity;
    const nudge = App.has('admin') && d.receipts.length && nd > 7
      ? h`<div class="flash warn">${lb ? 'The last backup was ' + Math.floor(nd) + ' days ago.' : 'No backup has been downloaded yet.'} Receipts are stored only in this browser. <a href="#/backup">Download a backup</a>.</div>` : '';
    const me = App.session();
    return { title: 'Dashboard', ph: false, body: h`${nudge}<section class="hero"><h2>${hello}, ${me.user}</h2><p>${new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>
<div class="big" data-count="${stats[3][1]}" data-money="1">${inr(stats[3][1])}</div><p>collected today from ${stats[2][1]} ${stats[2][1] === 1 ? 'receipt' : 'receipts'}</p>
<div class="bar">${me.role !== 'principal' ? h`<a class="btn" style="background:var(--amber);color:#1B3A28" href="#/receipts/new">${G.icon('plus')} Add receipt</a>` : ''}<a class="btn alt" href="#/daily">Daily collection</a>${App.has('admin', 'accountant', 'principal') ? h`<a class="btn alt" href="#/reports">${G.icon('chart')} Reports</a>` : ''}</div></section>
<div class="cards">${stats.map(([l, v, tone, ic, money], i) => h`<div class="card ${tone}" style="--i:${i}"><div class="ic">${G.icon(ic)}</div><span>${l}</span><strong data-count="${v}" ${money ? raw('data-money="1"') : ''}>${money ? inr(v) : v}</strong></div>`)}</div>
<div class="dash">
<div class="panel s8"><h3>Collection, last 30 days</h3>${Ch.area(series(30, { day: 'numeric', month: 'short' }))}</div>
<div class="panel s4"><h3>Payment modes this month</h3>${Ch.donut(rank(mode))}</div>
<div class="panel s6"><h3>Last 7 days</h3>${Ch.bars(series(7, { weekday: 'short' }))}</div>
<div class="panel s6"><h3>Top fee purposes this month</h3>${Ch.hbars(rank(purp))}</div>
<div class="panel s12 list"><h3>Latest receipts</h3>${recent.length ? recent.map(r => h`<a href="#/receipts/${r.id}"><span><strong>${r.name}</strong><br><small>${r.book_no}-${serial(r.serial_no)}</small></span><span>${inr(r.amount)}</span></a>`) : h`<p class="empty">No receipts yet. Add the first one.</p>`}</div></div>` };
  });

  /* ================= My account ================= */
  App.page('/account', [], () => {
    const d = D(), me = App.me(), ultra = me.role === 'superadmin';
    const users = ultra ? d.users.filter(u => u.active && u.id !== me.id).sort((a, b) => a.username < b.username ? -1 : 1) : [];
    return {
      title: 'My account', body: h`<h2>My account</h2>
<p>Signed in as <strong>${me.username}</strong>. Sign-in email: <strong>${me.email || 'not set yet'}</strong>. You can sign in with either your email or your username.</p>
<form data-form="account" class="panel grid"><input type="hidden" name="action" value="email"><h3 style="grid-column:1/-1;margin:0">Change email</h3>
<label>New email<input type="email" name="email" value="${me.email || ''}" required></label>
<label>Current password<input type="password" name="current" required autocomplete="current-password"></label><button>Save email</button></form>
<form data-form="account" class="panel grid"><input type="hidden" name="action" value="password"><h3 style="grid-column:1/-1;margin:0">Change password</h3>
<label>Current password<input type="password" name="current" required autocomplete="current-password"></label>
<label>New password (at least 8 characters)<input type="password" name="new" minlength="8" required autocomplete="new-password"></label>
<label>Repeat new password<input type="password" name="again" minlength="8" required autocomplete="new-password"></label><button>Change password</button></form>
${ultra ? h`${users.length ? h`<form data-form="account" class="panel grid"><input type="hidden" name="action" value="other"><h3 style="grid-column:1/-1;margin:0">Reset another user (ultra admin)</h3>
<label>User<select name="uid">${users.map(u => h`<option value="${u.id}">${u.username} (${u.role})${u.email ? ', ' + u.email : ''}</option>`)}</select></label>
<label>New email (leave empty to keep)<input type="email" name="email"></label>
<label>New password (leave empty to keep)<input type="password" name="new" minlength="8" autocomplete="new-password"></label><button>Update user</button></form>` : ''}
<form data-form="account" class="panel grid"><input type="hidden" name="action" value="adduser"><h3 style="grid-column:1/-1;margin:0">Add a user (ultra admin)</h3>
<label>Username<input name="username" required></label>
<label>Role<select name="role"><option>admin</option><option>accountant</option><option>staff</option><option>principal</option></select></label>
<label>Email (optional)<input type="email" name="email"></label>
<label>Password (at least 8 characters)<input type="password" name="new" minlength="8" required autocomplete="new-password"></label><button>Add user</button></form>` : ''}`
    };
  });
  App.form('account', F => {
    const me = App.me(), act = get(F, 'action'), ultra = me.role === 'superadmin';
    const taken = (d, email, exceptId) => d.users.some(u => u.email && u.email === email && u.id !== exceptId);
    if (act === 'other') {
      if (!ultra) throw new App.Denied();
      const email = get(F, 'email').trim().toLowerCase(), nw = get(F, 'new'), target = D().users.find(u => u.id === Number(get(F, 'uid')));
      if (!target) App.flash('Choose a user.', 'error');
      else if (!email && !nw) App.flash('Enter a new email, a new password, or both.', 'error');
      else if (email && !EMAIL_RE.test(email)) App.flash('That email address does not look right.', 'error');
      else if (nw && nw.length < 8) App.flash('The new password must have at least 8 characters.', 'error');
      else {
        try {
          DB.tx(d => {
            const u = DB.byId(d.users, target.id);
            if (email) { if (taken(d, email, u.id)) fail('That email address is already used by another account.'); u.email = email; }
            if (nw) u.password_hash = U.hashPassword(nw);
          });
          App.flash("That user's login details were updated.");
        } catch (e) { if (e instanceof DB.DbError) App.flash(e.message, 'error'); else throw e; }
      }
    } else if (act === 'adduser') {
      if (!ultra) throw new App.Denied();
      const username = get(F, 'username').trim(), role = get(F, 'role'), email = get(F, 'email').trim().toLowerCase(), pw = get(F, 'new');
      if (!username) App.flash('Enter a username.', 'error');
      else if (!['admin', 'accountant', 'staff', 'principal'].includes(role)) App.flash('Choose a role.', 'error');
      else if (email && !EMAIL_RE.test(email)) App.flash('That email address does not look right.', 'error');
      else if (pw.length < 8) App.flash('The new password must have at least 8 characters.', 'error');
      else {
        try {
          DB.tx(d => {
            if (d.users.some(u => u.username === username)) fail('That username is already taken.');
            if (email && taken(d, email, 0)) fail('That email address is already used by another account.');
            DB.insert(d, 'users', { username, password_hash: U.hashPassword(pw), email: email || null, role, active: 1 });
          });
          App.flash(`User ${username} added as ${role}.`);
        } catch (e) { if (e instanceof DB.DbError) App.flash(e.message, 'error'); else throw e; }
      }
    } else if (!U.checkPassword(get(F, 'current'), me.password_hash)) {
      App.flash('Your current password is wrong.', 'error');
    } else if (act === 'email') {
      const email = get(F, 'email').trim().toLowerCase();
      if (!EMAIL_RE.test(email)) App.flash('That email address does not look right.', 'error');
      else {
        try {
          DB.tx(d => { if (taken(d, email, me.id)) fail('That email address is already used by another account.'); DB.byId(d.users, me.id).email = email; });
          App.flash('Your sign-in email is now ' + email + '.');
        } catch (e) { if (e instanceof DB.DbError) App.flash(e.message, 'error'); else throw e; }
      }
    } else if (act === 'password') {
      const nw = get(F, 'new'), again = get(F, 'again');
      if (nw.length < 8) App.flash('The new password must have at least 8 characters.', 'error');
      else if (nw !== again) App.flash('The two new passwords do not match.', 'error');
      else { DB.tx(d => { DB.byId(d.users, me.id).password_hash = U.hashPassword(nw); }); App.flash('Your password has been changed.'); }
    }
    App.redirect('#/account');
  });

  /* ================= Receipt books ================= */
  App.page('/books', ['admin', 'accountant'], () => {
    const d = D(), used = {};
    d.receipts.forEach(r => { used[r.book_id] = (used[r.book_id] || 0) + 1; });
    const rows = d.receipt_books.slice().sort((a, b) => b.id - a.id);
    return {
      title: 'Receipt books', body: h`<h2>Receipt book register</h2>
<form data-form="book" class="panel grid">
<label>Book number<input name="book_no" placeholder="RB-2026-001" required></label>
<label>Serial from<input type="number" name="serial_from" min="1" required></label>
<label>Serial to<input type="number" name="serial_to" min="1" required></label>
<label>Assigned to<input name="assigned_to" required></label>
<label>Issue date<input type="date" name="issue_date" value="${U.today()}" required></label>
<button>Register book</button></form>
<div class="wrap"><table><tr><th>Book no</th><th>Serials</th><th>Assigned to</th><th>Issued</th><th>Receipts entered</th><th>Status</th>${App.has('admin') ? h`<th></th>` : ''}</tr>
${rows.length ? rows.map(b => h`<tr><td>${b.book_no}</td><td>${serial(b.serial_from)} to ${serial(b.serial_to)}</td><td>${b.assigned_to}</td><td>${b.issue_date}</td><td>${used[b.id] || 0}</td><td><span class="tag">${b.status}</span></td>${App.has('admin') ? h`<td><a href="#/books/${b.id}">Open / print</a></td>` : ''}</tr>`) : h`<tr><td colspan="7">No receipt books registered yet.</td></tr>`}</table></div>`
    };
  });
  App.form('book', F => {
    App.need('admin', 'accountant');
    const no = get(F, 'book_no').trim(), who = get(F, 'assigned_to').trim(), date = get(F, 'issue_date');
    if (!isInt(get(F, 'serial_from')) || !isInt(get(F, 'serial_to'))) return App.flash('Enter a valid serial range.', 'error');
    const a = parseInt(get(F, 'serial_from'), 10), b = parseInt(get(F, 'serial_to'), 10);
    if (a < 1 || a > b || !no || !who || !date) return App.flash('Enter a valid serial range.', 'error');
    DB.tx(d => {
      if (d.receipt_books.some(x => x.book_no === no)) fail('That book number is already registered.');
      DB.insert(d, 'receipt_books', { book_no: no, serial_from: a, serial_to: b, assigned_to: who, issue_date: date, status: 'In use' });
    });
    App.flash('Receipt book registered.'); App.redirect('#/books');
  });

  /* ================= Receipt book: detail, whole-book print-out, audit (admin) ================= */
  const rangesText = arr => {                                   // [3,4,5,9] -> "00003 to 00005, 00009"
    const out = []; let a = null, z = null;
    const push = () => out.push(a === z ? serial(a) : serial(a) + ' to ' + serial(z));
    arr.forEach(n => { if (a === null) a = z = n; else if (n === z + 1) z = n; else { push(); a = z = n; } });
    if (a !== null) push();
    return out.join(', ');
  };
  const isDay = v => /^\d{4}-\d{2}-\d{2}$/.test(v || '');
  function bookData(id, a) {
    const d = D(), b = DB.byId(d.receipt_books, id); if (!b) App.notFound();
    const to = isDay(a.to) ? a.to : U.today(), from = isDay(a.from) ? a.from : '';
    const cx = a.cx !== '0', part = ['slips', 'reg'].includes(a.part) ? a.part : 'all', copy = a.copy === '1';
    const upto = DB.receiptRows(d).filter(r => r.book_id === b.id && r.receipt_date <= to).sort((x, y) => x.serial_no - y.serial_no);
    const rows = upto.filter(r => (!from || r.receipt_date >= from) && (cx || r.status === 'Issued'));
    const issued = rows.filter(r => r.status === 'Issued');
    const used = new Set(upto.map(r => r.serial_no)), top = upto.reduce((m, r) => Math.max(m, r.serial_no), b.serial_from - 1);
    const skipped = []; for (let n = b.serial_from; n <= top; n++) if (!used.has(n)) skipped.push(n);
    const modes = {}; issued.forEach(r => { const m = modes[r.pay_mode] || (modes[r.pay_mode] = { mode: r.pay_mode, n: 0, v: 0 }); m.n++; m.v += r.amount; });
    const keep = { to: a.to, from: a.from, cx: a.cx, part: a.part, copy: a.copy };
    return { d, b, to, from, cx, part, copy, keep, rows, issued, cancelled: rows.length - issued.length, amount: issued.reduce((s, r) => s + r.amount, 0),
      skipped, left: b.serial_to - top, next: top < b.serial_to ? top + 1 : null, modes: Object.values(modes).sort((x, y) => y.v - x.v) };
  }

  App.page('/books/:id', ['admin'], (p, a) => {
    const B = bookData(Number(p.id), a), b = B.b, closed = b.status !== 'In use', total = b.serial_to - b.serial_from + 1;
    const printLink = App.href('/books/' + b.id + '/print', B.keep);
    const cards = [['Serials in book', total, 'mint', 'book'], ['Receipts in this list', B.rows.length, 'mint', 'rupee'], ['Cancelled', B.cancelled, 'mint', 'ban'],
      ['Collected (issued only)', B.amount, 'amber', 'cal', 1], ['Serials not yet used', B.left, 'amber', 'clock']];
    return {
      title: 'Book ' + b.book_no, body: h`<p class="noprint"><a href="#/books">&#8249; All receipt books</a></p>
<h2>Receipt book ${b.book_no} <span class="tag">${b.status}</span></h2>
<p>Serials ${serial(b.serial_from)} to ${serial(b.serial_to)}. Assigned to <strong>${b.assigned_to}</strong>, issued ${b.issue_date}.${B.next ? ' Next serial to use: ' + serial(B.next) + '.' : ' Every serial in this book has been used.'}</p>
<form data-form="bookview" class="panel grid"><input type="hidden" name="id" value="${b.id}">
<label>All receipts up to this date<input type="date" name="to" value="${B.to}"></label>
<label>From date (optional)<input type="date" name="from" value="${B.from}"></label>
<label>Cancelled receipts<select name="cx"><option value="1"${sel(B.cx)}>Include (stamped CANCELLED)</option><option value="0"${sel(!B.cx)}>Leave out</option></select></label>
<label>What to print<select name="part"><option value="all"${sel(B.part === 'all')}>Cover sheet, register and every receipt</option><option value="slips"${sel(B.part === 'slips')}>Every receipt only (one per page)</option><option value="reg"${sel(B.part === 'reg')}>Cover sheet and register only</option></select></label>
<label>Receipt wording<select name="copy"><option value=""${sel(!B.copy)}>Original</option><option value="1"${sel(B.copy)}>Stamp DUPLICATE COPY</option></select></label>
<div class="bar"><button>Update list</button><a class="btn" href="${printLink}">Print this book (${B.rows.length} ${B.rows.length === 1 ? 'receipt' : 'receipts'})</a><button type="button" class="btn alt" data-act="book-export">Export to Excel</button></div></form>
<div class="cards c4">${cards.map(([l, v, tone, ic, money], i) => h`<div class="card ${tone}" style="--i:${i}"><div class="ic">${G.icon(ic)}</div><span>${l}</span><strong data-count="${v}" ${money ? raw('data-money="1"') : ''}>${money ? inr(v) : v}</strong></div>`)}</div>
${B.skipped.length ? h`<div class="panel"><h3>Serials skipped (no receipt entered)</h3><p>${rangesText(B.skipped)}</p><small>These serials are lower than the last one used up to ${B.to}. Check the physical book: a torn, spoiled or missing page should be explained.</small></div>` : ''}
<h3>Register up to ${B.to}</h3>
<div class="wrap"><table><tr><th>Serial</th><th>Date</th><th>Student</th><th>Roll no</th><th>Purpose</th><th>Amount</th><th>Mode</th><th>Status</th><th></th></tr>
${B.rows.length ? B.rows.map(r => h`<tr class="${r.status === 'Cancelled' ? 'cx' : ''}"><td>${serial(r.serial_no)}</td><td>${r.receipt_date}</td><td>${r.name}</td><td>${r.roll_no}</td><td>${r.purposes}</td><td>${inr(r.amount)}</td><td>${r.pay_mode}</td><td><span class="tag ${r.status}">${r.status}</span></td><td><a href="#/receipts/${r.id}">View</a></td></tr>`) : h`<tr><td colspan="9">No receipts from this book match these dates.</td></tr>`}
<tr><th colspan="5">Total collected (cancelled not counted)</th><th>${inr(B.amount)}</th><th colspan="3"></th></tr></table></div>
<form data-form="bookstatus" data-pw="${closed ? 'Enter your password to reopen this book.' : 'Enter your password to close this book.'}" class="panel noprint"><input type="hidden" name="id" value="${b.id}"><input type="hidden" name="status" value="${closed ? 'In use' : 'Closed'}">
<h3>${closed ? 'This book is closed' : 'Finished with this book?'}</h3><p>${closed ? 'It does not appear when adding receipts. Reopen it if you need to enter more.' : 'Closing a book removes it from the Add receipt list, so nothing more can be entered by mistake. You can reopen it any time.'}</p>
<button class="${closed ? '' : 'danger'}">${closed ? 'Reopen book' : 'Close book'}</button></form>`
    };
  });
  App.form('bookview', F => {
    App.need('admin');
    const o = {}; ['to', 'from', 'cx', 'part', 'copy'].forEach(k => { const v = get(F, k).trim(); if (v) o[k] = v; });
    if (o.cx === '1') delete o.cx; if (o.part === 'all') delete o.part;
    App.redirect(App.href('/books/' + Number(get(F, 'id')), o));
  });
  App.form('bookstatus', F => {
    App.need('admin');
    const id = Number(get(F, 'id')), st = get(F, 'status') === 'Closed' ? 'Closed' : 'In use';
    DB.tx(d => { const b = DB.byId(d.receipt_books, id); if (!b) App.notFound(); b.status = st; });
    App.flash(st === 'Closed' ? 'Book closed. It no longer appears when adding receipts.' : 'Book reopened.');
    App.redirect(App.href('/books/' + id, App.parseHash().q));
  });

  /* The print-out: cover sheet + register, then every receipt on its own A4 page. */
  App.page('/books/:id/print', ['admin'], (p, a) => {
    const B = bookData(Number(p.id), a), { d, b } = B, c = d.settings, name = c.name || 'GIST, Rayagada', logo = App.logoUrl(), me = App.session();
    const front = B.part !== 'slips', slips = B.part !== 'reg';
    const pages = (front ? 1 + Math.floor(B.rows.length / 32) : 0) + (slips ? B.rows.length : 0);
    const nice = s => { const t = new Date(s + 'T00:00:00'); return isNaN(t) ? s : t.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }); };
    return {
      title: 'Print book ' + b.book_no, ph: false, body: h`<div class="bar noprint"><button type="button" data-act="print">Print (${B.rows.length} ${B.rows.length === 1 ? 'receipt' : 'receipts'}, about ${pages} ${pages === 1 ? 'page' : 'pages'})</button>
<a class="btn alt" href="${App.href('/books/' + b.id, B.keep)}">Back to the book</a><small>In the print window choose A4 and, to keep a PDF, Save as PDF.</small></div>
<div class="bulk">
${front ? h`<section class="pb bk"><header class="bk-head">${logo ? h`<img src="${logo}" alt="">` : ''}<div><h3>${name}</h3>${c.address ? h`<div>${c.address}</div>` : ''}</div></header>
<div class="bk-title">RECEIPT BOOK REPORT</div>
<div class="bk-grid"><div><small>Book number</small><b>${b.book_no}</b></div><div><small>Serial range</small><b>${serial(b.serial_from)} to ${serial(b.serial_to)}</b></div><div><small>Status</small><b>${b.status}</b></div>
<div><small>Assigned to</small><b>${b.assigned_to}</b></div><div><small>Book issued on</small><b>${nice(b.issue_date)}</b></div><div><small>Receipts covered</small><b>${B.from ? nice(B.from) + ' to ' : 'Up to '}${nice(B.to)}</b></div></div>
<table><thead><tr><th>Summary</th><th class="r">Receipts</th><th class="r">Amount</th></tr></thead><tbody>
${B.modes.map(m => h`<tr><td>Issued, paid by ${m.mode}</td><td class="r">${m.n}</td><td class="r">${inr(m.v)}</td></tr>`)}
<tr><td><b>Total issued</b></td><td class="r"><b>${B.issued.length}</b></td><td class="r"><b>${inr(B.amount)}</b></td></tr>
<tr><td>Cancelled${B.cx ? '' : ' (left out of this print-out)'}</td><td class="r">${B.cancelled}</td><td class="r">not counted</td></tr></tbody></table>
<p><b>Serials skipped:</b> ${B.skipped.length ? rangesText(B.skipped) : 'none'}.&nbsp; <b>Serials not yet used:</b> ${B.left > 0 ? B.left + ' (' + serial(B.next) + ' to ' + serial(b.serial_to) + ')' : 'none'}.</p>
<table><thead><tr><th>Serial</th><th>Date</th><th>Student</th><th>Roll no</th><th>Purpose</th><th>Mode</th><th class="r">Amount</th><th>Status</th></tr></thead><tbody>
${B.rows.length ? B.rows.map(r => h`<tr><td>${serial(r.serial_no)}</td><td>${r.receipt_date}</td><td>${r.name}</td><td>${r.roll_no}</td><td>${r.purposes}</td><td>${r.pay_mode}</td><td class="r">${r.status === 'Cancelled' ? '-' : inr(r.amount)}</td><td>${r.status}</td></tr>`) : h`<tr><td colspan="8">No receipts in this period.</td></tr>`}</tbody>
<tfoot><tr><td colspan="6"><b>Total collected</b></td><td class="r"><b>${inr(B.amount)}</b></td><td></td></tr></tfoot></table>
<div class="bk-sign"><span>Prepared by ${me.user}</span><span>Accountant</span><span>Principal</span></div>
<p class="note">Printed on ${stamp(U.nowIso())} by ${me.user}.</p></section>` : ''}
${slips ? B.rows.map(r => h`<div class="pb">${slipHtml(d, r, B.copy)}</div>`) : ''}
</div>${slips && !B.rows.length ? h`<p class="noprint">There are no receipts in this book for these dates.</p>` : ''}`
    };
  });
  App.act('book-export', () => {
    App.need('admin');
    const { path, q } = App.parseHash(), m = /^\/books\/(\d+)/.exec(path); if (!m) return;
    const B = bookData(Number(m[1]), q);
    XLSX.download(XLSX.build([['Serial no', 'Receipt date', 'Entry time', 'Student', 'Roll no', 'Course', 'Branch', 'Session', 'Purposes', 'Amount', 'Payment mode', 'Transaction ref', 'Status', 'Cancel reason', 'Entered by']]
      .concat(B.rows.map(r => [serial(r.serial_no), r.receipt_date, r.entry_ts, r.name, r.roll_no, r.course, r.branch, r.acad_session, r.purposes, r.amount, r.pay_mode, r.txn_ref, r.status, r.cancel_reason || '', r.entered_by_name]),
        [['Total collected (issued only)', '', '', '', '', '', '', '', '', B.amount, '', '', '', '', '']]), 'Book ' + B.b.book_no), `receipt-book-${B.b.book_no}-to-${B.to}.xlsx`);
  });

  /* ================= Student fee statement: every receipt of one student (admin, accountant) ================= */
  const STM = ['admin', 'accountant'];
  function studentData(id, a) {
    const d = D(), st = DB.byId(d.students, id); if (!st) App.notFound();
    const to = isDay(a.to) ? a.to : '', from = isDay(a.from) ? a.from : '';
    const cx = a.cx !== '0', part = ['slips', 'reg'].includes(a.part) ? a.part : 'all', copy = a.copy === '1';
    const all = DB.receiptRows(d).filter(r => r.student_id === st.id).sort((x, y) => x.receipt_date < y.receipt_date ? -1 : x.receipt_date > y.receipt_date ? 1 : x.id - y.id);
    const rows = all.filter(r => (!from || r.receipt_date >= from) && (!to || r.receipt_date <= to) && (cx || r.status === 'Issued'));
    const issued = rows.filter(r => r.status === 'Issued'), ids = new Set(issued.map(r => r.id)), cats = new Map(d.fee_categories.map(k => [k.id, k.name]));
    const by = {};
    d.receipt_items.forEach(i => { if (!ids.has(i.receipt_id)) return; const k = (cats.get(i.category_id) || 'Other') + '|' + (i.semester || ''); const e = by[k] || (by[k] = { purpose: cats.get(i.category_id) || 'Other', sem: i.semester || '', n: 0, v: 0 }); e.n++; e.v += i.amount; });
    const purposes = Object.values(by).sort((x, y) => x.purpose < y.purpose ? -1 : x.purpose > y.purpose ? 1 : String(x.sem).localeCompare(String(y.sem), undefined, { numeric: true }));
    const keep = { to: a.to, from: a.from, cx: a.cx, part: a.part, copy: a.copy };
    return { d, st, to, from, cx, part, copy, keep, rows, issued, cancelled: rows.length - issued.length, amount: issued.reduce((s, r) => s + r.amount, 0), purposes };
  }
  App.page('/students/:sid/statement', STM, (p, a) => {
    const B = studentData(Number(p.sid), a), st = B.st, printLink = App.href('/students/' + st.id + '/statement/print', B.keep);
    const cards = [['Receipts in this list', B.rows.length, 'mint', 'rupee'], ['Cancelled', B.cancelled, 'mint', 'ban'], ['Total paid (issued only)', B.amount, 'amber', 'cal', 1]];
    return {
      title: 'Statement ' + st.roll_no, body: h`<p class="noprint"><a href="#/students">&#8249; Students</a></p>
<h2>Fee statement: ${st.name}</h2>
<p>Roll no <strong>${st.roll_no}</strong>, ${st.course}, ${st.branch}, ${st.acad_session}.</p>
<form data-form="stview" class="panel grid"><input type="hidden" name="id" value="${st.id}">
<label>From date (optional)<input type="date" name="from" value="${B.from}"></label>
<label>Up to date (optional)<input type="date" name="to" value="${B.to}"></label>
<label>Cancelled receipts<select name="cx"><option value="1"${sel(B.cx)}>Include (stamped CANCELLED)</option><option value="0"${sel(!B.cx)}>Leave out</option></select></label>
<label>What to print<select name="part"><option value="all"${sel(B.part === 'all')}>Statement, list and every receipt</option><option value="slips"${sel(B.part === 'slips')}>Every receipt only (one per page)</option><option value="reg"${sel(B.part === 'reg')}>Statement and list only</option></select></label>
<label>Receipt wording<select name="copy"><option value=""${sel(!B.copy)}>Original</option><option value="1"${sel(B.copy)}>Stamp DUPLICATE COPY</option></select></label>
<div class="bar"><button>Update list</button><a class="btn" href="${printLink}">Print statement (${B.rows.length} ${B.rows.length === 1 ? 'receipt' : 'receipts'})</a><button type="button" class="btn alt" data-act="student-export">Export to Excel</button></div></form>
<div class="cards c4">${cards.map(([l, v, tone, ic, money], i) => h`<div class="card ${tone}" style="--i:${i}"><div class="ic">${G.icon(ic)}</div><span>${l}</span><strong data-count="${v}" ${money ? raw('data-money="1"') : ''}>${money ? inr(v) : v}</strong></div>`)}</div>
${B.purposes.length ? h`<h3>Paid so far, by purpose</h3><div class="wrap"><table><tr><th>Purpose</th><th>Semester</th><th>Amount</th></tr>${B.purposes.map(x => h`<tr><td>${x.purpose}</td><td>${x.sem || '-'}</td><td>${inr(x.v)}</td></tr>`)}<tr><th colspan="2">Total</th><th>${inr(B.amount)}</th></tr></table></div>` : ''}
<h3>Receipts</h3>
<div class="wrap"><table><tr><th>Date</th><th>Receipt</th><th>Purpose</th><th>Amount</th><th>Mode</th><th>Status</th><th></th></tr>
${B.rows.length ? B.rows.map(r => h`<tr class="${r.status === 'Cancelled' ? 'cx' : ''}"><td>${r.receipt_date}</td><td>${r.book_no}-${serial(r.serial_no)}</td><td>${r.purposes}</td><td>${inr(r.amount)}</td><td>${r.pay_mode}</td><td><span class="tag ${r.status}">${r.status}</span></td><td><a href="#/receipts/${r.id}">View</a></td></tr>`) : h`<tr><td colspan="7">No receipts for this student in these dates.</td></tr>`}</table></div>`
    };
  });
  App.form('stview', F => {
    App.need(...STM);
    const o = {}; ['to', 'from', 'cx', 'part', 'copy'].forEach(k => { const v = get(F, k).trim(); if (v) o[k] = v; });
    if (o.cx === '1') delete o.cx; if (o.part === 'all') delete o.part;
    App.redirect(App.href('/students/' + Number(get(F, 'id')) + '/statement', o));
  });
  App.page('/students/:sid/statement/print', STM, (p, a) => {
    const B = studentData(Number(p.sid), a), { d, st } = B, c = d.settings, name = c.name || 'GIST, Rayagada', logo = App.logoUrl(), me = App.session();
    const front = B.part !== 'slips', slips = B.part !== 'reg';
    const pages = (front ? 1 + Math.floor((B.rows.length + B.purposes.length) / 28) : 0) + (slips ? B.rows.length : 0);
    const nice = s => { const t = new Date(s + 'T00:00:00'); return isNaN(t) ? s : t.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }); };
    return {
      title: 'Statement ' + st.roll_no, ph: false, body: h`<div class="bar noprint"><button type="button" data-act="print">Print (${B.rows.length} ${B.rows.length === 1 ? 'receipt' : 'receipts'}, about ${pages} ${pages === 1 ? 'page' : 'pages'})</button>
<a class="btn alt" href="${App.href('/students/' + st.id + '/statement', B.keep)}">Back to the student</a><small>In the print window choose A4 and, to keep a PDF, Save as PDF.</small></div>
<div class="bulk">
${front ? h`<section class="pb bk"><header class="bk-head">${logo ? h`<img src="${logo}" alt="">` : ''}<div><h3>${name}</h3>${c.address ? h`<div>${c.address}</div>` : ''}</div></header>
<div class="bk-title">STUDENT FEE STATEMENT</div>
<div class="bk-grid"><div><small>Student</small><b>${st.name}</b></div><div><small>Roll number</small><b>${st.roll_no}</b></div><div><small>Academic year</small><b>${st.acad_session}</b></div>
<div><small>Course</small><b>${st.course}</b></div><div><small>Branch</small><b>${st.branch}</b></div><div><small>Receipts covered</small><b>${B.from || B.to ? (B.from ? nice(B.from) : 'Start') + ' to ' + (B.to ? nice(B.to) : 'today') : 'All dates'}</b></div></div>
<table><thead><tr><th>Paid, by purpose</th><th>Semester</th><th class="r">Amount</th></tr></thead><tbody>
${B.purposes.length ? B.purposes.map(x => h`<tr><td>${x.purpose}</td><td>${x.sem || '-'}</td><td class="r">${inr(x.v)}</td></tr>`) : h`<tr><td colspan="3">Nothing paid in this period.</td></tr>`}
<tr><td colspan="2"><b>Total paid (${B.issued.length} ${B.issued.length === 1 ? 'receipt' : 'receipts'})</b></td><td class="r"><b>${inr(B.amount)}</b></td></tr>
<tr><td colspan="2">Cancelled receipts${B.cx ? '' : ' (left out of this print-out)'}</td><td class="r">${B.cancelled}</td></tr></tbody></table>
<table><thead><tr><th>Date</th><th>Receipt</th><th>Purpose</th><th>Mode</th><th class="r">Amount</th><th>Status</th></tr></thead><tbody>
${B.rows.length ? B.rows.map(r => h`<tr><td>${r.receipt_date}</td><td>${r.book_no}-${serial(r.serial_no)}</td><td>${r.purposes}</td><td>${r.pay_mode}</td><td class="r">${r.status === 'Cancelled' ? '-' : inr(r.amount)}</td><td>${r.status}</td></tr>`) : h`<tr><td colspan="6">No receipts in this period.</td></tr>`}</tbody>
<tfoot><tr><td colspan="4"><b>Total paid</b></td><td class="r"><b>${inr(B.amount)}</b></td><td></td></tr></tfoot></table>
<div class="bk-sign"><span>Prepared by ${me.user}</span><span>Accountant</span><span>Principal</span></div>
<p class="note">Printed on ${stamp(U.nowIso())} by ${me.user}.</p></section>` : ''}
${slips ? B.rows.map(r => h`<div class="pb">${slipHtml(d, r, B.copy)}</div>`) : ''}
</div>${slips && !B.rows.length ? h`<p class="noprint">There are no receipts for this student in these dates.</p>` : ''}`
    };
  });
  App.act('student-export', () => {
    App.need(...STM);
    const { path, q } = App.parseHash(), m = /^\/students\/(\d+)/.exec(path); if (!m) return;
    const B = studentData(Number(m[1]), q), st = B.st;
    XLSX.download(XLSX.build([['Receipt date', 'Book no', 'Serial no', 'Student', 'Roll no', 'Course', 'Branch', 'Session', 'Purposes', 'Amount', 'Payment mode', 'Transaction ref', 'Status', 'Cancel reason']]
      .concat(B.rows.map(r => [r.receipt_date, r.book_no, serial(r.serial_no), r.name, r.roll_no, r.course, r.branch, r.acad_session, r.purposes, r.amount, r.pay_mode, r.txn_ref, r.status, r.cancel_reason || '']),
        [['Total paid (issued only)', '', '', '', '', '', '', '', '', B.amount, '', '', '', '']]), 'Statement'), `fee-statement-${st.roll_no}.xlsx`);
  });

  /* ================= Add / edit receipt ================= */
  function receiptForm(rid) {
    const d = D(), old = rid ? DB.receiptRows(d).find(r => r.id === rid) : null;
    if (rid && !old) App.notFound();
    const books = d.receipt_books.filter(b => b.status === 'In use' || (old && b.id === old.book_id)).sort((a, b) => a.book_no < b.book_no ? -1 : 1);
    const cats = d.fee_categories, sems = d.semesters, modes = d.pay_modes.map(m => m.name);
    const f = old || {};
    const items = rid ? d.receipt_items.filter(i => i.receipt_id === rid).map(i => ({ cat: i.category_id, sem: i.semester || '', amt: i.amount })) : [{ cat: '', sem: '', amt: '' }];
    return {
      title: (old ? 'Edit' : 'Add') + ' receipt', body: h`<h2>${old ? 'Edit receipt' : 'Add receipt'}</h2>
<form data-form="receipt" ${old ? raw(`data-rid="${old.id}" data-pw="Enter your password to save changes to this receipt."`) : ''}>
<div class="panel grid">
<label>Receipt book<select name="book_id" id="book" required>${books.map(b => h`<option value="${b.id}" data-r="${serial(b.serial_from)} to ${serial(b.serial_to)}"${sel(f.book_id === b.id)}>${b.book_no}</option>`)}</select><small id="range"></small></label>
<label>Serial number<input type="number" name="serial_no" min="1" value="${f.serial_no || ''}" required></label>
<label>Receipt date<input type="date" name="receipt_date" value="${f.receipt_date || U.today()}" required></label>
<label>Student roll number<input name="roll_no" id="roll" value="${f.roll_no || ''}" required autocomplete="off"><small id="stu"></small></label>
<label>Payment mode<select name="pay_mode">${modes.map(m => h`<option${sel(f.pay_mode === m)}>${m}</option>`)}</select></label>
<label>Transaction reference<input name="txn_ref" value="${f.txn_ref || ''}"></label>
<label>Remarks<input name="remarks" value="${f.remarks || ''}"></label></div>
<div class="panel" id="items"><strong>Semester, purpose and amount</strong>
${items.map(it => h`<div class="grid item"><label>Semester<select name="item_semester"><option value="">Not applicable</option>${sems.map(s => h`<option${sel(it.sem === s.name)}>${s.name}</option>`)}</select></label>
<label>Purpose<select name="category_id">${cats.map(k => h`<option value="${k.id}"${sel(String(it.cat) === String(k.id))}>${k.name}</option>`)}</select></label>
<label>Amount (₹)<input type="number" name="item_amount" step="0.01" min="0.01" value="${it.amt}" required></label>
<button type="button" class="btn alt rm">Remove</button></div>`)}</div>
<div class="bar"><button type="button" class="btn alt" id="addrow">Add another purpose</button><strong>Total: ₹<span id="total">0.00</span></strong></div>
<button>${old ? 'Save changes' : 'Save receipt'}</button></form>
${books.length ? '' : h`<p>Register a receipt book first (Receipt books menu).</p>`}`,
      after() {
        const $ = s => document.querySelector(s), roll = $('#roll'), book = $('#book'), box = $('#items');
        const lookup = () => {
          const v = roll.value.trim(), out = $('#stu');
          if (!v) { out.textContent = ''; return; }
          const s = D().students.find(x => x.roll_no === v);
          out.textContent = s ? [s.name, s.course, s.branch, s.acad_session].join(', ') : 'No student with this roll number.';
        };
        roll.addEventListener('blur', lookup); if (roll.value) lookup();
        const show = () => { const o = book.selectedOptions[0]; $('#range').textContent = o ? 'Serials ' + o.dataset.r : ''; };
        book.addEventListener('change', show); show();
        const total = () => { $('#total').textContent = [...box.querySelectorAll('[name=item_amount]')].reduce((s, i) => s + (parseFloat(i.value) || 0), 0).toFixed(2); };
        box.addEventListener('input', total);
        box.addEventListener('click', e => { if (e.target.classList.contains('rm') && box.querySelectorAll('.item').length > 1) { e.target.closest('.item').remove(); total(); } });
        $('#addrow').addEventListener('click', () => { const n = box.querySelector('.item').cloneNode(true); n.querySelector('input').value = ''; box.appendChild(n); });
        total();
      }
    };
  }
  App.page('/receipts/new', ENTRY, () => receiptForm(null));
  App.page('/receipts/:rid/edit', ['superadmin'], p => receiptForm(Number(p.rid)));

  /* Warning shown when a new receipt would leave serial numbers unused. Resolves true = accept the skip. */
  function askSkip(missing, sn, next) {
    return new Promise(resolve => {
      const m = document.createElement('div'); m.className = 'modal noprint';
      m.innerHTML = String(h`<div class="box" role="alertdialog"><h3>Serial number being skipped</h3>
<p>Receipt <strong>${serial(sn)}</strong> will leave ${missing.length === 1 ? 'this serial' : 'these ' + missing.length + ' serials'} <strong>unused</strong>: <strong>${missing.length === 1 ? serial(missing[0]) : serial(missing[0]) + ' to ' + serial(missing[missing.length - 1])}</strong>.</p>
<p>If that is not intended, choose <em>No, change number</em> and enter your own receipt number (the next unused one is ${serial(next)}).</p>
<div class="bar"><button type="button" data-y>Yes, skip and save</button><button type="button" class="btn alt" data-n>No, change number</button></div></div>`);
      document.body.appendChild(m);
      const done = ok => { document.removeEventListener('keydown', onKey); m.remove(); resolve(ok); };
      const onKey = e => { if (e.key === 'Escape') done(false); };
      document.addEventListener('keydown', onKey);
      m.querySelector('[data-y]').onclick = () => done(true);
      m.querySelector('[data-n]').onclick = () => done(false);
      m.querySelector('[data-n]').focus();
    });
  }

  App.form('receipt', async (F, form) => {
    const rid = form.dataset.rid ? Number(form.dataset.rid) : null;
    if (rid) App.need(); else App.need(...ENTRY);          // only the ultra admin may edit a saved receipt
    const cats = F.getAll('category_id'), sems = F.getAll('item_semester'), amts = F.getAll('item_amount');
    const rows = cats.map((c, i) => ({ cat: c, sem: sems[i] || '', amt: amts[i] == null ? '' : amts[i] }));
    let sn = 0, parsed = [];
    try {
      if (!isInt(get(F, 'serial_no'))) throw 0;
      sn = parseInt(get(F, 'serial_no'), 10);
      parsed = rows.filter(i => String(i.amt).trim()).map(i => { const a = Number(i.amt), c = Number(i.cat); if (!isFinite(a) || !Number.isInteger(c)) throw 0; return { cat: c, sem: i.sem, amt: a }; });
    } catch (e) { sn = 0; parsed = []; }
    const roll = get(F, 'roll_no').trim(), ref = get(F, 'txn_ref').trim();
    if (!rid && sn) {                                       // new receipt: warn if it skips serials after the last one used
      const d0 = D(), bk = DB.byId(d0.receipt_books, get(F, 'book_id'));
      if (bk && bk.serial_from <= sn && sn <= bk.serial_to && !d0.receipts.some(r => r.book_id === bk.id && r.serial_no === sn)) {
        const top = d0.receipts.filter(r => r.book_id === bk.id).reduce((m, r) => Math.max(m, r.serial_no), bk.serial_from - 1);
        if (sn > top + 1) {
          const missing = []; for (let n = top + 1; n < sn; n++) missing.push(n);
          if (!(await askSkip(missing, sn, top + 1))) {
            const inp = form.elements.serial_no; inp.value = top + 1; inp.focus(); inp.select();
            return App.flash('Receipt not saved. Enter the receipt number you want to use.', 'warn');
          }
        }
      }
    }
    const total = Math.round(parsed.reduce((s, i) => s + i.amt, 0) * 100) / 100;
    const newId = DB.tx(d => {
      const stu = d.students.find(s => s.roll_no === roll), book = DB.byId(d.receipt_books, get(F, 'book_id'));
      const semNames = d.semesters.map(s => s.name).concat('');
      const oldRow = rid ? DB.receiptRows(d).find(r => r.id === rid) : null;
      if (rid && !oldRow) App.notFound();
      if (!stu) fail('Roll number not found. Add the student first.');
      if (!book || !(book.serial_from <= sn && sn <= book.serial_to)) fail('Serial number is outside this book\'s range.');
      if (!parsed.length || parsed.some(i => i.amt <= 0 || !semNames.includes(i.sem) || !d.fee_categories.some(k => k.id === i.cat)) || !d.pay_modes.some(m => m.name === get(F, 'pay_mode')) || !get(F, 'receipt_date'))
        fail('Add at least one purpose with an amount, and check the payment mode and date.');
      if (ref && d.receipts.some(r => r.txn_ref === ref && r.id !== rid)) App.flash('Warning: this transaction reference is already on another receipt.', 'warn');
      if (d.receipts.some(r => r.book_id === book.id && r.serial_no === sn && r.id !== rid)) fail('This book and serial number already has a receipt.');
      const vals = { book_id: book.id, serial_no: sn, student_id: stu.id, receipt_date: get(F, 'receipt_date'), amount: total, pay_mode: get(F, 'pay_mode'), txn_ref: ref, remarks: get(F, 'remarks').trim() };
      let r;
      if (rid) { r = DB.byId(d.receipts, rid); Object.assign(r, vals); d.receipt_items = d.receipt_items.filter(i => i.receipt_id !== rid); }
      else r = DB.insert(d, 'receipts', Object.assign(vals, { entry_ts: U.nowIso(), status: 'Issued', cancel_reason: null, entered_by: App.session().uid }));
      parsed.forEach(i => DB.insert(d, 'receipt_items', { receipt_id: r.id, category_id: i.cat, semester: i.sem, amount: i.amt }));
      audit(d, r.id, oldRow ? 'edited' : 'created', oldRow ? receiptText(oldRow) : null, receiptText(DB.receiptRows(d).find(x => x.id === r.id)));
      return r.id;
    });
    App.flash('Receipt saved.'); App.redirect('#/receipts/' + newId);
  });

  /* ================= Receipt slip ================= */
  /* One receipt slip. Used by the receipt page and by the whole-book print-out. */
  function slipHtml(d, r, copy) {
    const c = d.settings, cats = new Map(d.fee_categories.map(k => [k.id, k.name]));
    const items = d.receipt_items.filter(i => i.receipt_id === r.id);
    const contact = [c.phone && 'Phone: ' + c.phone, c.email && 'Email: ' + c.email, c.website].filter(Boolean).join('   \u2022   ');
    const wm = c.wm_text || c.wm_image, logo = App.logoUrl(), name = c.name || 'GIST, Rayagada';
    const when = r.entry_ts ? stamp(r.entry_ts) : '';
    const dateNice = (() => { const t = new Date(r.receipt_date + 'T00:00:00'); return isNaN(t) ? r.receipt_date : t.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }); })();
    return h`<div class="slip">${wm ? h`<div class="wm">${c.wm_image ? h`<img src="${DB.Files.url(c.wm_image)}" alt="">` : ''}${c.wm_text ? h`<span>${c.wm_text}</span>` : ''}</div>` : ''}
<header class="lh ${logo ? 'has-logo' : ''}">${logo ? h`<img class="lh-logo" src="${logo}" alt="${name} logo">` : ''}<div class="lh-text"><h3>${name}</h3>${c.address ? h`<div class="lh-addr">${c.address}</div>` : ''}${contact ? h`<div class="lh-contact">${contact}</div>` : ''}</div></header>
<div class="band">FEE RECEIPT</div>
${copy ? h`<div class="mark">DUPLICATE COPY</div>` : ''}${r.status === 'Cancelled' ? h`<div class="mark">CANCELLED</div>` : ''}
<div class="meta"><div><small>Receipt no.</small><b>${r.book_no} / ${serial(r.serial_no)}</b></div><div class="rt"><small>Date</small><b>${dateNice}</b></div></div>
<div class="recv">Received with thanks from<strong>${r.name}</strong></div>
<div class="details"><div><small>Roll number</small><b>${r.roll_no}</b></div><div><small>Academic year</small><b>${r.acad_session}</b></div>
<div><small>Course</small><b>${r.course}</b></div><div><small>Branch</small><b>${r.branch}</b></div>
<div><small>Payment mode</small><b>${r.pay_mode}</b></div>${r.txn_ref ? h`<div><small>Transaction / cheque ref.</small><b>${r.txn_ref}</b></div>` : h`<div><small>Status</small><b>${r.status === 'Cancelled' ? 'Cancelled' : 'Paid'}</b></div>`}</div>
<table class="fees"><thead><tr><th class="n">#</th><th>Particulars</th><th>Semester</th><th class="r">Amount</th></tr></thead>
<tbody>${items.map((i, k) => h`<tr><td class="n">${k + 1}</td><td>${cats.get(i.category_id)}</td><td>${i.semester || '-'}</td><td class="r">${inr(i.amount)}</td></tr>`)}</tbody>
<tfoot><tr><td colspan="3">Total received</td><td class="r">${inr(r.amount)}</td></tr></tfoot></table>
<div class="inwords"><small>Amount in words</small><b>${U.rupeesWords(r.amount)}</b></div>
${d.qr_codes.length ? h`<div class="logos">${d.qr_codes.map(qr => h`<figure style="margin:0;text-align:center"><img src="${DB.Files.url(qr.filename)}" alt="${qr.label}"><figcaption>${qr.label}</figcaption></figure>`)}</div>` : ''}
<footer class="foot"><div class="sig"><span>Received by${r.entered_by_name ? h`<em>${r.entered_by_name}</em>` : ''}</span><span>Authorised signature<em>${name}</em></span></div>
<p class="note">Please keep this receipt safely for your records.${when ? ' Issued ' + when + '.' : ''}</p></footer></div>`;
  }
  App.page('/receipts/:rid', [], (p, q) => {
    const d = D(), r = DB.receiptRows(d).find(x => x.id === Number(p.rid));
    if (!r) App.notFound();
    return {
      title: 'Receipt ' + serial(r.serial_no), ph: false, body: h`${slipHtml(d, r, q.copy)}
<div class="bar noprint"><button type="button" data-act="print">Print receipt</button>
<a class="btn alt" href="${App.href('/receipts/' + r.id, { copy: 1 })}">Open duplicate copy</a>
${App.has('admin', 'accountant') ? h`<a class="btn alt" href="#/students/${r.student_id}/statement">Student fee statement</a>` : ''}
${App.has() ? h`<a class="btn alt" href="#/receipts/${r.id}/edit">Edit receipt</a>` : ''}
<small>To save a PDF, choose Save as PDF in the print window.</small></div>
${r.status === 'Cancelled' ? h`<p class="noprint">Cancelled: ${r.cancel_reason}</p>`
          : App.has('admin', 'accountant') ? h`<form data-form="cancel" data-pw="Enter your password to cancel this receipt." class="bar noprint"><input type="hidden" name="rid" value="${r.id}"><input name="reason" placeholder="Reason for cancelling" required><button class="danger">Cancel receipt</button></form>` : ''}`
    };
  });
  App.form('cancel', F => {
    App.need('admin', 'accountant');
    const reason = get(F, 'reason').trim(), rid = Number(get(F, 'rid'));
    if (!reason) return App.flash('Enter a reason to cancel this receipt.', 'error');
    DB.tx(d => {
      const r = DB.byId(d.receipts, rid); if (!r) App.notFound();
      if (r.status === 'Issued') { r.status = 'Cancelled'; r.cancel_reason = reason; audit(d, rid, 'cancelled', 'Issued', reason); }
    });
    App.flash('Receipt cancelled.'); App.redirect('#/receipts/' + rid);
  });

  /* ================= Search, summary and export ================= */
  function find(a, limit) {
    const d = D(), q = lc(a.q || '').trim(), qs = q.replace(/^0+/, '') || q;
    const items = new Map();
    d.receipt_items.forEach(i => { if (!items.has(i.receipt_id)) items.set(i.receipt_id, []); items.get(i.receipt_id).push(i); });
    const rows = DB.receiptRows(d).filter(r => {
      if (q && !(lc(r.book_no).includes(q) || String(r.serial_no).includes(qs) || lc(r.name).includes(q) || lc(r.roll_no).includes(q))) return false;
      if (a.date_from && !(r.receipt_date >= a.date_from)) return false;
      if (a.date_to && !(r.receipt_date <= a.date_to)) return false;
      if (a.mode && r.pay_mode !== a.mode) return false;
      if (a.status && r.status !== a.status) return false;
      if (a.course && r.course !== a.course) return false;
      if (a.year && r.acad_session !== a.year) return false;
      if (a.branch && r.branch !== a.branch) return false;
      if ((a.category || a.semester) && !(items.get(r.id) || []).some(i => (!a.category || i.category_id === Number(a.category)) && (!a.semester || i.semester === a.semester))) return false;
      return true;
    }).sort((x, y) => x.receipt_date < y.receipt_date ? 1 : x.receipt_date > y.receipt_date ? -1 : y.id - x.id);
    return limit ? rows.slice(0, limit) : rows;
  }

  /* How many students of a course / academic year have paid a purpose, branch by branch. */
  function paidSummary(a) {
    const course = a.course || '', cat = a.category || '', year = a.year || '', selBranch = a.branch || '', sem = a.semester || '';
    if (!(course && cat)) return null;
    const d = D(), purpose = d.fee_categories.find(k => k.id === Number(cat)), cr = d.courses.find(c => c.name === course);
    if (!purpose || !cr) return null;
    const studs = new Map(d.students.map(s => [s.id, s])), paid = {}, total = {};
    d.receipt_items.forEach(i => {
      const r = DB.byId(d.receipts, i.receipt_id), s = r && r.status === 'Issued' && studs.get(r.student_id);
      if (!s || i.category_id !== Number(cat) || s.course !== course || (year && s.acad_session !== year) || (sem && i.semester !== sem)) return;
      const b = paid[s.branch] || (paid[s.branch] = { ids: new Set(), amt: 0 });
      b.ids.add(s.id); b.amt += i.amount;
    });
    d.students.forEach(s => { if (s.course === course && (!year || s.acad_session === year)) total[s.branch] = (total[s.branch] || 0) + 1; });
    const names = d.branches.filter(b => b.course_id === cr.id).map(b => b.name).sort();
    Object.keys(paid).concat(Object.keys(total)).forEach(b => { if (!names.includes(b)) names.push(b); });
    const rows = names.map(b => ({ branch: b, paid: paid[b] ? paid[b].ids.size : 0, total: total[b] || 0, amount: paid[b] ? paid[b].amt : 0, url: App.href('/receipts', Object.assign({}, a, { branch: b })), selected: b === selBranch }));
    const chosen = rows.filter(r => r.selected), shown = chosen.length ? chosen : rows, add = k => shown.reduce((s, r) => s + r[k], 0);
    const rest = Object.assign({}, a); delete rest.branch;
    return { purpose: purpose.name, course, year, semester: sem, branch: selBranch, rows, paid: add('paid'), total: add('total'), amount: add('amount'), allUrl: App.href('/receipts', rest) };
  }

  App.page('/receipts', [], (p, a) => {
    const d = D(), rows = find(a, 500), summary = paidSummary(a);
    const Y = {}, B = {};
    d.courses.forEach(c => {
      Y[c.name] = d.acad_years.filter(y => y.course_id === c.id).map(y => y.label).sort().reverse();
      B[c.name] = d.branches.filter(b => b.course_id === c.id).map(b => b.name).sort();
    });
    const modes = d.pay_modes.map(m => m.name), S = App.session();
    return {
      title: 'Receipt search', body: h`<h2>Receipt search</h2>
<form data-form="search" class="panel grid">
<label>Search<input name="q" value="${a.q || ''}" placeholder="Book, serial, name or roll no"></label>
<label>From<input type="date" name="date_from" value="${a.date_from || ''}"></label>
<label>To<input type="date" name="date_to" value="${a.date_to || ''}"></label>
<label>Course<select name="course" id="s_course"></select></label>
<label>Academic year<select name="year" id="s_year"></select></label>
<label>Branch<select name="branch" id="s_branch"></select></label>
<label>Purpose<select name="category"><option value="">All</option>${d.fee_categories.map(k => h`<option value="${k.id}"${sel(a.category === String(k.id))}>${k.name}</option>`)}</select></label>
<label>Semester<select name="semester"><option value="">All</option>${d.semesters.map(s => h`<option${sel(a.semester === s.name)}>${s.name}</option>`)}</select></label>
<label>Payment mode<select name="mode"><option value="">All</option>${modes.map(m => h`<option${sel(a.mode === m)}>${m}</option>`)}</select></label>
<label>Status<select name="status"><option value="">All</option>${['Issued', 'Cancelled'].map(s => h`<option${sel(a.status === s)}>${s}</option>`)}</select></label>
<div class="bar"><button>Search</button><a class="btn alt" href="#/receipts">Reset filters</a>
${S.role !== 'staff' ? h`<button type="button" class="btn alt" data-act="export">Export to Excel</button>` : ''}</div></form>
${summary ? h`<div class="panel"><h3>${summary.purpose}: ${summary.course}${summary.year ? ', ' + summary.year : ''}${summary.branch ? ', ' + summary.branch : ''}${summary.semester ? ', Semester ' + summary.semester : ''}</h3>
<p><strong>${summary.paid}</strong> of ${summary.total} students have paid ${summary.purpose}${summary.semester ? ' for semester ' + summary.semester : ''}. Amount collected: <strong>${inr(summary.amount)}</strong>. Cancelled receipts are not counted.</p>
<div class="wrap"><table><tr><th>Branch</th><th>Paid</th><th>Students</th><th>Progress</th><th>Not paid</th><th>Amount</th></tr>
${summary.rows.map(r => h`<tr${r.selected ? raw(' style="font-weight:600"') : ''}><td><a href="${r.url}">${r.branch}</a></td><td>${r.paid}</td><td>${r.total}</td><td><div class="meter"><i style="--w:${r.total ? Math.min(100, Math.round(r.paid / r.total * 100)) : 0}%"></i></div></td><td>${r.total >= r.paid ? r.total - r.paid : 0}</td><td>${inr(r.amount)}</td></tr>`)}</table></div>
${summary.branch ? h`<p><a href="${summary.allUrl}">Show all branches</a></p>` : ''}</div>`
        : a.course && !a.category ? h`<p class="noprint"><small>Choose a purpose to see how many students of this course have paid it, branch by branch.</small></p>` : ''}
<div class="wrap"><table><tr><th>Book</th><th>Serial</th><th>Date</th><th>Student</th><th>Roll no</th><th>Purpose</th><th>Amount</th><th>Mode</th><th>Status</th><th></th></tr>
${rows.length ? rows.map(r => h`<tr><td>${r.book_no}</td><td>${serial(r.serial_no)}</td><td>${r.receipt_date}</td><td>${r.name}</td><td>${r.roll_no}</td><td>${r.purposes}</td><td>${inr(r.amount)}</td><td>${r.pay_mode}</td><td><span class="tag ${r.status}">${r.status}</span></td><td><a href="#/receipts/${r.id}">View</a></td></tr>`) : h`<tr><td colspan="10">No receipts match these filters.</td></tr>`}</table></div>
${rows.length === 500 ? h`<p class="noprint"><small>Showing the newest 500 matches. Narrow the filters to see others; Export to Excel includes all of them.</small></p>` : ''}`,
      after() {
        const c = document.getElementById('s_course'), y = document.getElementById('s_year'), b = document.getElementById('s_branch');
        const opts = (list, cur) => String(h`<option value="">All</option>${(list || []).map(v => h`<option${sel(v === cur)}>${v}</option>`)}`);
        const fill = first => { y.innerHTML = opts(Y[c.value], first ? a.year : ''); b.innerHTML = opts(B[c.value], first ? a.branch : ''); };
        c.innerHTML = String(h`<option value="">All</option>${Object.keys(Y).map(v => h`<option${sel(v === a.course)}>${v}</option>`)}`);
        c.addEventListener('change', () => fill(false)); fill(true);
      }
    };
  });
  App.form('search', F => {
    const o = {}; for (const [k, v] of F.entries()) if (String(v).trim() !== '') o[k] = String(v).trim();
    App.redirect(App.href('/receipts', o));
  });
  App.act('export', () => {
    App.need('admin', 'accountant', 'principal');
    const rows = find(App.parseHash().q);                      // all matches, not just the 500 shown on screen
    XLSX.download(XLSX.build([['Book no', 'Serial no', 'Receipt date', 'Entry time', 'Student', 'Roll no', 'Course', 'Branch', 'Session', 'Purposes', 'Amount', 'Payment mode', 'Transaction ref', 'Status', 'Entered by']]
      .concat(rows.map(r => [r.book_no, serial(r.serial_no), r.receipt_date, r.entry_ts, r.name, r.roll_no, r.course, r.branch, r.acad_session, r.purposes, r.amount, r.pay_mode, r.txn_ref, r.status, r.entered_by_name])), 'Receipts'), 'receipts.xlsx');
  });

  /* ================= Daily collection ================= */
  App.page('/daily', [], (p, a) => {
    const day = a.d || U.today(), rs = D().receipts.filter(r => r.receipt_date === day), by = {};
    rs.filter(r => r.status === 'Issued').forEach(r => { const b = by[r.pay_mode] || (by[r.pay_mode] = { pay_mode: r.pay_mode, n: 0, total: 0 }); b.n++; b.total += r.amount; });
    const rows = Object.values(by).sort((x, y) => x.pay_mode < y.pay_mode ? -1 : 1);
    return {
      title: 'Daily collection', body: h`<h2>Daily collection</h2>
<form data-form="daily" class="bar"><input type="date" name="d" value="${day}"><button>Show</button></form>
<div class="cards"><div class="card amber"><div class="ic">${G.icon('rupee')}</div><span>Total collected</span><strong data-count="${rows.reduce((a, r) => a + r.total, 0)}" data-money="1">${inr(rows.reduce((a, r) => a + r.total, 0))}</strong></div>
<div class="card"><div class="ic">${G.icon('book')}</div><span>Receipts issued</span><strong data-count="${rows.reduce((a, r) => a + r.n, 0)}">${rows.reduce((a, r) => a + r.n, 0)}</strong></div></div>
<div class="wrap"><table><tr><th>Payment mode</th><th>Receipts</th><th>Share</th><th>Amount</th></tr>
${rows.length ? rows.map(r => h`<tr><td>${r.pay_mode}</td><td>${r.n}</td><td><div class="meter"><i style="--w:${Math.round(r.total / (rows.reduce((a, x) => a + x.total, 0) || 1) * 100)}%"></i></div></td><td>${inr(r.total)}</td></tr>`) : h`<tr><td colspan="4">No receipts on this date.</td></tr>`}
<tr><th>Total</th><th>${rows.reduce((s, r) => s + r.n, 0)}</th><th></th><th>${inr(rows.reduce((s, r) => s + r.total, 0))}</th></tr></table></div>
<p>Cancelled receipts on this date: ${rs.filter(r => r.status === 'Cancelled').length} (not included in the total).</p>`
    };
  });
  App.form('daily', F => App.redirect(App.href('/daily', { d: get(F, 'd') })));

  /* ================= Reports: daily, weekly, monthly ================= */
  const iso = x => `${x.getFullYear()}-${U.pad(x.getMonth() + 1)}-${U.pad(x.getDate())}`;
  const parseD = s => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || ''); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : new Date(); };
  const fmtD = x => x.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  const KINDS = { daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly' };
  function period(kind, anchor) {
    const a = parseD(anchor); let f, t, label;
    if (kind === 'weekly') { f = new Date(a.getFullYear(), a.getMonth(), a.getDate() - (a.getDay() + 6) % 7); t = new Date(f.getFullYear(), f.getMonth(), f.getDate() + 6); label = fmtD(f) + ' to ' + fmtD(t); }
    else if (kind === 'monthly') { f = new Date(a.getFullYear(), a.getMonth(), 1); t = new Date(a.getFullYear(), a.getMonth() + 1, 0); label = a.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }); }
    else { f = t = a; label = a.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }); }
    const shift = n => { const x = new Date(a); if (kind === 'monthly') x.setMonth(x.getMonth() + n, 1); else x.setDate(x.getDate() + n * (kind === 'weekly' ? 7 : 1)); return iso(x); };
    return { from: iso(f), to: iso(t), label, f, t, prev: shift(-1), next: shift(1) };
  }
  function reportData(kind, anchor) {
    const d = D(), p = period(kind, anchor), cats = new Map(d.fee_categories.map(k => [k.id, k.name]));
    const rows = DB.receiptRows(d).filter(r => r.receipt_date >= p.from && r.receipt_date <= p.to).sort((x, y) => x.receipt_date < y.receipt_date ? -1 : x.receipt_date > y.receipt_date ? 1 : x.id - y.id);
    const issued = rows.filter(r => r.status === 'Issued'), ids = new Set(issued.map(r => r.id));
    const tally = (list, key) => { const m = {}; list.forEach(r => { const k = key(r), e = m[k] || (m[k] = { l: k, n: 0, v: 0 }); e.n++; e.v += r.amount; }); return Object.values(m).sort((a, b) => b.v - a.v); };
    const purp = {}; d.receipt_items.forEach(i => { if (ids.has(i.receipt_id)) { const k = cats.get(i.category_id) || 'Other'; purp[k] = (purp[k] || 0) + i.amount; } });
    const hourOf = r => parseInt((r.entry_ts || '').slice(11, 13), 10) || 0, perDay = {}, perHour = {};
    issued.forEach(r => { perDay[r.receipt_date] = (perDay[r.receipt_date] || 0) + r.amount; perHour[hourOf(r)] = (perHour[hourOf(r)] || 0) + r.amount; });
    const series = [];
    if (kind === 'daily') { const hs = issued.map(hourOf); for (let k = Math.min(8, ...hs); k <= Math.max(17, ...hs); k++) series.push({ l: k + 'h', v: perHour[k] || 0 }); }
    else for (let x = new Date(p.f); x <= p.t; x.setDate(x.getDate() + 1)) { const k = iso(x); series.push({ l: kind === 'weekly' ? x.toLocaleDateString('en-IN', { weekday: 'short' }) : String(x.getDate()), v: perDay[k] || 0, t: k === U.today() }); }
    return { p, rows, issued, cancelled: rows.length - issued.length, total: issued.reduce((s, r) => s + r.amount, 0), series, modes: tally(issued, r => r.pay_mode),
      purposes: Object.entries(purp).map(([l, v]) => ({ l, v })).sort((a, b) => b.v - a.v), courses: tally(issued, r => r.course + ', ' + r.branch) };
  }
  App.page('/reports', ['admin', 'accountant', 'principal'], (pp, a) => {
    const Ch = G.Ch, kind = KINDS[a.k] ? a.k : 'daily', anchor = a.d || U.today(), R = reportData(kind, anchor), p = R.p, link = (k, d) => App.href('/reports', { k, d });
    const avg = R.issued.length ? R.total / R.issued.length : 0;
    const cards = [['Total collected', R.total, 'amber', 'rupee', 1], ['Receipts issued', R.issued.length, 'mint', 'book'], ['Cancelled', R.cancelled, 'mint', 'ban'], ['Average receipt', avg, 'amber', 'cal', 1]];
    return {
      title: KINDS[kind] + ' report', body: h`<h2>Collection reports</h2>
<div class="panel bar noprint" style="justify-content:space-between"><div class="tabs">${Object.keys(KINDS).map(k => h`<a class="tab ${k === kind ? 'on' : ''}" href="${link(k, anchor)}">${KINDS[k]}</a>`)}</div>
<form data-form="report" class="bar" style="margin:0"><a class="btn alt" href="${link(kind, p.prev)}" title="Previous">&#8249;</a><input type="hidden" name="k" value="${kind}"><input type="date" name="d" value="${anchor}"><button>Show</button><a class="btn alt" href="${link(kind, p.next)}" title="Next">&#8250;</a><a class="btn alt" href="${link(kind, U.today())}">Today</a><button type="button" class="btn alt" data-act="report-export">Export to Excel</button></form></div>
<div class="repTitle"><h3>${KINDS[kind]} collection report</h3><p>${p.label}</p></div>
<div class="cards c4">${cards.map(([l, v, tone, ic, money], i) => h`<div class="card ${tone}" style="--i:${i}"><div class="ic">${G.icon(ic)}</div><span>${l}</span><strong data-count="${v}" ${money ? raw('data-money="1"') : ''}>${money ? inr(v) : v}</strong></div>`)}</div>
<div class="dash"><div class="panel s8"><h3>${kind === 'daily' ? 'Collection by hour' : 'Collection per day'}</h3>${Ch.bars(R.series)}</div>
<div class="panel s4"><h3>Payment modes</h3>${Ch.donut(R.modes)}</div>
<div class="panel s6"><h3>By fee purpose</h3>${Ch.hbars(R.purposes)}</div><div class="panel s6"><h3>By course and branch</h3>${Ch.hbars(R.courses)}</div></div>
<h3>Receipts in this period</h3><div class="wrap"><table><tr><th>Date</th><th>Receipt</th><th>Student</th><th>Roll no</th><th>Mode</th><th>Amount</th><th>Status</th></tr>
${R.rows.length ? R.rows.map(r => h`<tr class="${r.status === 'Cancelled' ? 'cx' : ''}"><td>${r.receipt_date}</td><td><a href="#/receipts/${r.id}">${r.book_no}-${serial(r.serial_no)}</a></td><td>${r.name}</td><td>${r.roll_no}</td><td>${r.pay_mode}</td><td>${inr(r.amount)}</td><td><span class="tag ${r.status}">${r.status}</span></td></tr>`) : h`<tr><td colspan="7">No receipts in this period.</td></tr>`}
<tr><th colspan="5">Total collected (cancelled receipts not counted)</th><th>${inr(R.total)}</th><th></th></tr></table></div>`
    };
  });
  App.form('report', F => App.redirect(App.href('/reports', { k: get(F, 'k'), d: get(F, 'd') })));
  App.act('report-export', () => {
    App.need('admin', 'accountant', 'principal');
    const q = App.parseHash().q, kind = KINDS[q.k] ? q.k : 'daily', R = reportData(kind, q.d || U.today());
    XLSX.download(XLSX.build([['Date', 'Book no', 'Serial no', 'Student', 'Roll no', 'Course', 'Branch', 'Purposes', 'Payment mode', 'Amount', 'Status']]
      .concat(R.rows.map(r => [r.receipt_date, r.book_no, serial(r.serial_no), r.name, r.roll_no, r.course, r.branch, r.purposes, r.pay_mode, r.amount, r.status]), [['Total collected', '', '', '', '', '', '', '', '', R.total, '']]), 'Report'), `collection-report-${kind}-${R.p.from}.xlsx`);
  });
})(window);
