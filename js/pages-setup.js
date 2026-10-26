/* Pages for setting things up: students, college details, master data, backup and restore. */
(function (G) {
  'use strict';
  const { U, DB, App, XLSX, P } = G, { h, raw, lc } = U;
  const { ENTRY, sel, D, get, isInt, fail } = P;
  const IMG = ['png', 'jpg', 'jpeg', 'gif', 'webp'];
  const ext = name => (name.indexOf('.') >= 0 ? name.split('.').pop() : '').toLowerCase();

  /* ---------- shared lookups ---------- */
  function pick(d, cid, yid, bid) {
    const course = DB.byId(d.courses, cid) || App.notFound();
    const year = yid == null ? null : (d.acad_years.find(y => y.id === Number(yid) && y.course_id === course.id) || App.notFound());
    const branch = bid == null ? null : (d.branches.find(b => b.id === Number(bid) && b.course_id === course.id) || App.notFound());
    return { course, year, branch };
  }
  /* Is this item used by students or receipts? (then it must not be deleted) */
  function inUse(d, kind, id) {
    id = Number(id);
    if (kind === 'year') { const y = DB.byId(d.acad_years, id), c = y && DB.byId(d.courses, y.course_id); return !!(c && d.students.some(s => s.course === c.name && s.acad_session === y.label)); }
    if (kind === 'branch') { const b = DB.byId(d.branches, id), c = b && DB.byId(d.courses, b.course_id); return !!(c && d.students.some(s => s.course === c.name && s.branch === b.name)); }
    if (kind === 'course') { const c = DB.byId(d.courses, id); return !!(c && d.students.some(s => s.course === c.name)); }
    if (kind === 'semester') { const m = DB.byId(d.semesters, id); return !!(m && d.receipt_items.some(i => i.semester === m.name)); }
    return false;
  }
  const groupUrl = (d, s) => {
    const c = d.courses.find(x => x.name === s.course);
    const y = c && d.acad_years.find(x => x.course_id === c.id && x.label === s.acad_session), b = c && d.branches.find(x => x.course_id === c.id && x.name === s.branch);
    return y && b ? `#/students/course/${c.id}/year/${y.id}/branch/${b.id}` : '#/students';
  };
  const cell = v => v == null ? '' : (typeof v === 'number' && Number.isInteger(v) ? String(v) : String(v).trim());
  const isSuper = () => App.has();                     // true only for the ultra admin
  const stm = () => App.has('admin', 'accountant');       // may open a student's fee statement
  const crumb = (...parts) => h`<p class="crumbs">${parts.map((p, i) => h`${i ? ' / ' : ''}${p}`)}</p>`;

  /* ================= Students: course -> year -> branch -> list ================= */
  App.page('/students', ENTRY, (p, a) => {
    const d = D(), q = (a.q || '').trim(), ql = lc(q);
    const rows = q ? d.students.filter(s => lc(s.roll_no).includes(ql) || lc(s.name).includes(ql))
      .sort((x, y) => (x.course < y.course ? -1 : x.course > y.course ? 1 : x.acad_session < y.acad_session ? -1 : x.acad_session > y.acad_session ? 1 : x.branch < y.branch ? -1 : x.branch > y.branch ? 1 : x.id - y.id)).slice(0, 200) : [];
    return {
      title: 'Students', body: h`<h2>Students</h2>
<p>Choose a course to continue: Course, then Academic year, then Branch, then the student list.</p>
<div class="cards">${d.courses.length ? d.courses.map(c => h`<a class="card mint" href="#/students/course/${c.id}"><strong>${c.name}</strong><span>${c.duration}-year course, ${d.students.filter(s => s.course === c.name).length} students</span></a>`) : h`<p>No courses yet. The ultra admin can add them in Master data.</p>`}</div>
<h3>Find a student</h3>
<form data-form="student-search" class="bar"><input name="q" value="${q}" placeholder="Search name or roll no"><button>Search</button></form>
${q ? h`<div class="wrap"><table><tr><th>Roll no</th><th>Name</th><th>Course</th><th>Academic year</th><th>Branch</th>${stm() ? h`<th></th>` : ''}${isSuper() ? h`<th></th>` : ''}</tr>
${rows.length ? rows.map(s => h`<tr><td>${s.roll_no}</td><td>${s.name}</td><td>${s.course}</td><td>${s.acad_session}</td><td>${s.branch}</td>${stm() ? h`<td><a href="#/students/${s.id}/statement">Fee statement</a></td>` : ''}${isSuper() ? h`<td><a href="#/students/${s.id}/edit">Edit</a></td>` : ''}</tr>`) : h`<tr><td colspan="7">No student matches your search.</td></tr>`}</table></div>` : ''}`
    };
  });
  App.form('student-search', F => App.redirect(App.href('/students', { q: get(F, 'q').trim() })));

  App.page('/students/course/:cid', ENTRY, p => {
    const d = D(), { course } = pick(d, p.cid), ultra = isSuper();
    const years = d.acad_years.filter(y => y.course_id === course.id).sort((a, b) => a.label < b.label ? 1 : -1)
      .map(y => Object.assign({ n: d.students.filter(s => s.course === course.name && s.acad_session === y.label).length }, y));
    return {
      title: course.name + ' academic years', body: h`${crumb(h`<a href="#/students">Students</a>`, course.name)}
<h2>${course.name}: choose the academic year</h2>
<div class="cards">${years.length ? years.map(y => h`<a class="card mint" href="#/students/course/${course.id}/year/${y.id}"><strong>${y.label}</strong><span>${y.n} students</span></a>`)
          : h`<p>No academic years yet.${ultra ? ' Add one below.' : ' Ask the ultra admin to add one.'}</p>`}</div>
${ultra ? h`<div class="panel"><h3>Manage academic years (${course.duration}-year course)</h3>
<form data-form="st-year" class="bar"><input type="hidden" name="cid" value="${course.id}"><input type="hidden" name="action" value="add">
<input type="number" name="start" min="1990" max="2100" placeholder="Starting year, e.g. 2023" required><button>Add year</button>
<small>The end year is added automatically, so 2023 becomes 2023-${2023 + course.duration}.</small></form>
${years.map(y => h`<form data-form="st-year" data-confirm="Delete academic year ${y.label}?" class="bar" style="margin:4px 0"><input type="hidden" name="cid" value="${course.id}"><input type="hidden" name="action" value="del"><input type="hidden" name="id" value="${y.id}"><span class="tag">${y.label}</span><button class="danger">Delete</button></form>`)}</div>` : ''}`
    };
  });
  App.form('st-year', F => {
    App.need(); const cid = Number(get(F, 'cid')), act = get(F, 'action');
    DB.tx(d => {
      const { course } = pick(d, cid);
      if (act === 'add') {
        const s = parseInt(get(F, 'start'), 10);
        if (!isInt(get(F, 'start')) || !(s >= 1990 && s <= 2100)) fail('Enter a valid starting year, for example 2023.');
        const label = U.yearLabel(s, course.duration);
        if (d.acad_years.some(y => y.course_id === cid && y.label === label)) fail('That academic year already exists.');
        DB.insert(d, 'acad_years', { course_id: cid, label }); App.flash('Academic year ' + label + ' added.');
      } else if (act === 'del') {
        if (inUse(d, 'year', get(F, 'id'))) fail('This academic year has students. Move or remove them first.');
        d.acad_years = d.acad_years.filter(y => !(y.id === Number(get(F, 'id')) && y.course_id === cid)); App.flash('Academic year deleted.');
      }
    });
    App.redirect('#/students/course/' + cid);
  });

  App.page('/students/course/:cid/year/:yid', ENTRY, p => {
    const d = D(), { course, year } = pick(d, p.cid, p.yid), ultra = isSuper();
    const branches = d.branches.filter(b => b.course_id === course.id).sort((a, b) => a.name < b.name ? -1 : 1)
      .map(b => Object.assign({ n: d.students.filter(s => s.course === course.name && s.acad_session === year.label && s.branch === b.name).length }, b));
    return {
      title: 'Choose branch', body: h`${crumb(h`<a href="#/students">Students</a>`, h`<a href="#/students/course/${course.id}">${course.name}</a>`, year.label)}
<h2>${course.name} ${year.label}: choose the branch</h2>
<div class="cards">${branches.length ? branches.map(b => h`<a class="card mint" href="#/students/course/${course.id}/year/${year.id}/branch/${b.id}"><strong>${b.name}</strong><span>${b.n} students</span></a>`)
          : h`<p>No branches yet.${ultra ? ' Add one below.' : ''}</p>`}</div>
${ultra ? h`<div class="panel"><h3>Manage branches of ${course.name}</h3>
<form data-form="st-branch" class="bar"><input type="hidden" name="cid" value="${course.id}"><input type="hidden" name="yid" value="${year.id}"><input type="hidden" name="action" value="add"><input name="name" placeholder="New branch name" required><button>Add branch</button></form>
${branches.map(b => h`<form data-form="st-branch" data-confirm="Delete branch ${b.name} from ${course.name}? This applies to every academic year." class="bar" style="margin:4px 0"><input type="hidden" name="cid" value="${course.id}"><input type="hidden" name="yid" value="${year.id}"><input type="hidden" name="action" value="del"><input type="hidden" name="id" value="${b.id}"><span class="tag">${b.name}</span><button class="danger">Delete</button></form>`)}</div>` : ''}`
    };
  });
  App.form('st-branch', F => {
    App.need(); const cid = Number(get(F, 'cid')), yid = Number(get(F, 'yid')), act = get(F, 'action'), name = get(F, 'name').trim();
    DB.tx(d => {
      pick(d, cid, yid);
      if (act === 'add' && name) {
        if (d.branches.some(b => b.course_id === cid && b.name === name)) fail('That branch already exists.');
        DB.insert(d, 'branches', { course_id: cid, name }); App.flash('Branch added.');
      } else if (act === 'del') {
        if (inUse(d, 'branch', get(F, 'id'))) fail('This branch has students in some academic year. Remove them first.');
        d.branches = d.branches.filter(b => !(b.id === Number(get(F, 'id')) && b.course_id === cid)); App.flash('Branch deleted.');
      }
    });
    App.redirect(`#/students/course/${cid}/year/${yid}`);
  });

  App.page('/students/course/:cid/year/:yid/branch/:bid', ENTRY, p => {
    const d = D(), { course, year, branch } = pick(d, p.cid, p.yid, p.bid), ultra = isSuper();
    const rows = d.students.filter(s => s.course === course.name && s.acad_session === year.label && s.branch === branch.name).sort((a, b) => a.id - b.id);
    const ids = `data-cid="${course.id}" data-yid="${year.id}" data-bid="${branch.id}"`;
    return {
      title: 'Students', body: h`${crumb(h`<a href="#/students">Students</a>`, h`<a href="#/students/course/${course.id}">${course.name}</a>`, h`<a href="#/students/course/${course.id}/year/${year.id}">${year.label}</a>`, branch.name)}
<h2>${course.name} ${year.label}, ${branch.name}</h2>
<form data-form="st-add" ${raw(ids)} class="panel grid">
<label>Roll number<input name="roll_no" required></label><label>Student name<input name="name" required></label>
<button>Add student</button></form>
<form data-form="st-import" ${raw(ids)} class="panel bar">
<label>Import from Excel (.xlsx), columns: Roll No, Name<input type="file" name="file" accept=".xlsx,.csv" required></label><button>Import students</button>
<button type="button" class="btn alt" data-act="st-template">Download Excel template</button></form>
<p><strong>${rows.length}</strong> students in this group. New students, including later Excel imports, are added at the bottom.</p>
<div class="wrap"><table><tr><th>No.</th><th>Roll no</th><th>Name</th>${stm() ? h`<th></th>` : ''}${ultra ? h`<th></th>` : ''}</tr>
${rows.length ? rows.map((s, i) => h`<tr><td>${i + 1}</td><td>${s.roll_no}</td><td>${s.name}</td>${stm() ? h`<td><a href="#/students/${s.id}/statement">Fee statement</a></td>` : ''}${ultra ? h`<td><a href="#/students/${s.id}/edit">Edit</a>
<form data-form="st-delete" data-confirm="Delete ${s.name} permanently?" style="display:inline;margin-left:10px"><input type="hidden" name="sid" value="${s.id}"><button class="danger" style="padding:3px 10px">Delete</button></form></td>` : ''}</tr>`)
          : h`<tr><td colspan="5">No students yet. Add one above or import an Excel sheet.</td></tr>`}</table></div>`
    };
  });
  const groupHash = f => `#/students/course/${f.dataset.cid}/year/${f.dataset.yid}/branch/${f.dataset.bid}`;
  App.form('st-add', (F, form) => {
    App.need(...ENTRY);
    const roll = get(F, 'roll_no').trim(), name = get(F, 'name').trim();
    if (!roll || !name) return App.flash('Enter the roll number and the student name.', 'error');
    DB.tx(d => {
      const { course, year, branch } = pick(d, form.dataset.cid, form.dataset.yid, form.dataset.bid);
      if (d.students.some(s => s.roll_no === roll)) fail('That roll number already exists.');
      DB.insert(d, 'students', { roll_no: roll, name, course: course.name, branch: branch.name, acad_session: year.label });
    });
    App.flash('Student saved.'); App.redirect(groupHash(form));
  });

  App.act('st-template', () => XLSX.download(XLSX.build([['Roll No', 'Name'], ['D2026001', 'Rahul Kumar']], 'Sheet1'), 'students_template.xlsx'));
  App.form('st-import', async (F, form) => {
    App.need(...ENTRY);
    const back = groupHash(form), file = F.get('file');
    if (!file || !file.name || !/\.(xlsx|csv)$/i.test(file.name)) { App.flash('Choose an .xlsx file.', 'error'); return App.redirect(back); }
    let rows;
    try { rows = /\.csv$/i.test(file.name) ? XLSX.csv(await file.text()) : await XLSX.read(await file.arrayBuffer()); }
    catch (e) {
      App.flash(e.message === 'nodecompress' ? 'This browser cannot open .xlsx files. In Excel choose Save As, CSV, and import that file instead.' : 'Could not read that file. Save it as a normal .xlsx workbook and try again.', 'error');
      return App.redirect(back);
    }
    let first = 1;
    if (rows.length && ['rollno', 'roll', 'rollnumber'].includes(cell(rows[0] && rows[0][0]).toLowerCase().replace(/ /g, '').replace(/\./g, ''))) first = 2;   // skip the header row
    let added = 0, dup = 0, course, year, branch; const bad = [];
    DB.tx(d => {
      ({ course, year, branch } = pick(d, form.dataset.cid, form.dataset.yid, form.dataset.bid));
      rows.slice(first - 1).forEach((row, i) => {
        const n = first + i;
        if (!row || !row.some(v => v != null && String(v).trim())) return;
        const roll = cell(row[0]), name = cell(row[1]);
        if (!(roll && name)) { bad.push(n); return; }
        if (d.students.some(s => s.roll_no === roll)) { dup++; return; }
        DB.insert(d, 'students', { roll_no: roll, name, course: course.name, branch: branch.name, acad_session: year.label }); added++;
      });
    });
    let msg = `${added} students added to ${course.name} ${year.label} ${branch.name}.`;
    if (dup) msg += ` ${dup} skipped because the roll number already exists.`;
    if (bad.length) msg += ' Rows with a missing roll number or name: ' + bad.slice(0, 15).join(', ') + '.';
    App.flash(msg, bad.length || dup ? 'warn' : 'message'); App.redirect(back);
  });

  App.form('st-delete', (F, form) => {
    App.need();
    DB.tx(d => {
      const s = DB.byId(d.students, get(F, 'sid')) || App.notFound(), back = groupUrl(d, s);
      if (d.receipts.some(r => r.student_id === s.id)) { App.flash(`${s.name} has receipts, so the student cannot be deleted. Edit the details instead.`, 'error'); form.dataset.back = back; return; }
      d.students = d.students.filter(x => x.id !== s.id); App.flash(`Student ${s.name} deleted.`); form.dataset.back = back;
    });
    App.redirect(form.dataset.back);
  });

  App.page('/students/:sid/edit', ['superadmin'], p => {
    const d = D(), s = DB.byId(d.students, p.sid) || App.notFound(), course = d.courses.find(c => c.name === s.course), cid = course ? course.id : 0;
    const years = d.acad_years.filter(y => y.course_id === cid).map(y => y.label).sort().reverse(), branches = d.branches.filter(b => b.course_id === cid).map(b => b.name).sort();
    return {
      title: 'Edit student', body: h`<h2>Edit student</h2>
<form data-form="st-edit" data-pw="Enter your password to save changes to this student." class="panel grid"><input type="hidden" name="sid" value="${s.id}">
<label>Roll number<input name="roll_no" value="${s.roll_no}" required></label>
<label>Student name<input name="name" value="${s.name}" required></label>
<label>Course<input value="${s.course}" disabled></label>
<label>Academic year<select name="acad_session">${years.map(y => h`<option${sel(y === s.acad_session)}>${y}</option>`)}</select></label>
<label>Branch<select name="branch">${branches.map(b => h`<option${sel(b === s.branch)}>${b}</option>`)}</select></label>
<div class="bar"><button>Save changes</button><a class="btn alt" href="${groupUrl(d, s)}">Back</a></div></form>
<form data-form="st-delete" data-confirm="Delete this student permanently?"><input type="hidden" name="sid" value="${s.id}"><button class="danger">Delete this student</button></form>`
    };
  });
  App.form('st-edit', F => {
    App.need();
    const roll = get(F, 'roll_no').trim(), name = get(F, 'name').trim(), ses = get(F, 'acad_session').trim(), br = get(F, 'branch').trim();
    const dest = DB.tx(d => {
      const s = DB.byId(d.students, get(F, 'sid')) || App.notFound(), course = d.courses.find(c => c.name === s.course), cid = course ? course.id : 0;
      const okYear = d.acad_years.some(y => y.course_id === cid && y.label === ses), okBranch = d.branches.some(b => b.course_id === cid && b.name === br);
      if (!roll || !name || !okYear || !okBranch) fail('Fill in the roll number and name, and choose a valid academic year and branch.');
      if (d.students.some(x => x.roll_no === roll && x.id !== s.id)) fail('Another student already has that roll number.');
      Object.assign(s, { roll_no: roll, name, acad_session: ses, branch: br });
      return groupUrl(d, s);
    });
    App.flash('Student updated.'); App.redirect(dest);
  });

  /* ================= Images (QR codes, watermark) =================
     Pictures are shrunk before saving so that a few of them do not use up the browser's storage. */
  function readImage(file, max) {
    return new Promise((resolve, reject) => {
      const bad = () => reject(new DB.DbError('Could not read that image. Try a PNG or JPG file.'));
      const fr = new FileReader(); fr.onerror = bad;
      fr.onload = () => {
        const img = new Image(); img.onerror = bad;
        img.onload = () => {
          const k = Math.min(1, max / Math.max(img.width, img.height)), c = document.createElement('canvas'), jpeg = /jpe?g/i.test(file.type);
          c.width = Math.max(1, Math.round(img.width * k)); c.height = Math.max(1, Math.round(img.height * k));
          const x = c.getContext('2d'); if (jpeg) { x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); }
          x.drawImage(img, 0, 0, c.width, c.height);
          resolve(c.toDataURL(jpeg ? 'image/jpeg' : 'image/png', 0.88));
        };
        img.src = fr.result;
      };
      fr.readAsDataURL(file);
    });
  }

  /* ================= College details and payment QR codes ================= */
  const FIELDS = [['College name', 'name'], ['Address', 'address'], ['Phone', 'phone'], ['Email', 'email'], ['Website', 'website'], ['Account holder name', 'account_holder'], ['Bank name', 'bank_name'], ['Account number', 'account_no'], ['IFSC code', 'ifsc']];
  App.page('/college', ['admin'], () => {
    const d = D(), c = d.settings, ultra = isSuper();
    return {
      title: 'College details', body: h`<h2>College details</h2>
<div class="panel"><h3>Institution logo</h3>
<div class="bar">${c.logo ? h`<img src="${DB.Files.url(c.logo)}" alt="Institution logo" class="logo-prev">` : h`<span class="tag">No logo yet</span>`}
${ultra ? h`<form data-form="college" data-pw="Enter your password to change the logo." class="bar" style="margin:0"><input type="hidden" name="action" value="logo_save">
<label>${c.logo ? 'Replace logo' : 'Add logo'} (PNG, JPG, GIF or WEBP)<input type="file" name="logo" accept="image/*" required></label><button>Save logo</button></form>
${c.logo ? h`<form data-form="college" data-pw="Enter your password to remove the logo." style="margin:0"><input type="hidden" name="action" value="logo_del"><button class="danger">Remove logo</button></form>` : ''}` : ''}</div>
<small>A square or wide picture on a clear or white background looks best. The logo shows at the top of the menu, on the login page, at the top of every receipt and on printed pages.</small></div>
${ultra ? h`<form data-form="college" data-pw="Enter your password to change the college details." class="panel grid"><input type="hidden" name="action" value="save">
${FIELDS.map(([l, k]) => h`<label>${l}<input name="${k}" value="${c[k] || ''}"></label>`)}<button>Save details</button></form>`
          : h`<div class="panel"><table>${FIELDS.map(([l, k]) => h`<tr><td>${l}</td><td>${c[k] || ''}</td></tr>`)}</table></div>`}
<h2>Payment QR codes</h2>
${ultra ? h`<form data-form="college" class="panel grid"><input type="hidden" name="action" value="qr_add">
<label>Label (for example UPI)<input name="label"></label>
<label>Images (you can choose several)<input type="file" name="images" accept="image/*" multiple required></label><button>Add QR codes</button></form>` : ''}
<div class="logos">${d.qr_codes.length ? d.qr_codes.map(q => h`<div style="text-align:center"><img src="${DB.Files.url(q.filename)}" alt="${q.label}"><br>${q.label}
${ultra ? h`<form data-form="college" data-pw="Enter your password to remove this QR code."><input type="hidden" name="action" value="qr_del"><input type="hidden" name="id" value="${q.id}"><button class="danger">Remove</button></form>` : ''}</div>`) : h`<p>No QR codes added yet.</p>`}</div>`
    };
  });
  App.form('college', async F => {
    App.need(); const act = get(F, 'action');
    if (act === 'save') {
      DB.tx(d => { FIELDS.forEach(([, k]) => { d.settings[k] = get(F, k).trim(); }); });
      App.flash('College details saved.');
    } else if (act === 'logo_save') {
      const file = F.get('logo');
      if (!file || !file.name || !IMG.includes(ext(file.name))) App.flash('Choose a PNG, JPG, GIF or WEBP image.', 'error');
      else {
        const id = DB.Files.put(await readImage(file, 500));
        let old; try { old = DB.tx(d => { const o = d.settings.logo; d.settings.logo = id; return o; }); } catch (e) { DB.Files.del(id); throw e; }
        DB.Files.del(old); App.flash('Logo saved. It now shows in the header, on the login page and on receipts.');
      }
    } else if (act === 'logo_del') {
      const old = DB.tx(d => { const o = d.settings.logo; delete d.settings.logo; return o; });
      DB.Files.del(old); App.flash('Logo removed.');
    } else if (act === 'qr_add') {
      const label = get(F, 'label').trim(), made = [];
      try {
        for (const file of F.getAll('images')) if (file && file.name && IMG.includes(ext(file.name))) made.push(DB.Files.put(await readImage(file, 600)));
        if (made.length) DB.tx(d => { made.forEach(id => DB.insert(d, 'qr_codes', { label, filename: id })); });
      } catch (e) { made.forEach(id => DB.Files.del(id)); throw e; }
      if (made.length) App.flash(`${made.length} QR image(s) added.`); else App.flash('Choose PNG, JPG or WEBP images.', 'error');
    } else if (act === 'qr_del') {
      const gone = DB.tx(d => { const q = DB.byId(d.qr_codes, get(F, 'id')); if (q) { d.qr_codes = d.qr_codes.filter(x => x.id !== q.id); } return q; });
      if (gone) { DB.Files.del(gone.filename); App.flash('QR image removed.'); }
    }
    App.redirect('#/college');
  });

  /* ================= Master data ================= */
  const KINDS = { course: 'courses', year: 'acad_years', semester: 'semesters', branch: 'branches', purpose: 'fee_categories', mode: 'pay_modes' };
  App.page('/master', ['superadmin'], () => {
    const d = D(), c = d.settings, byCourse = new Map(d.courses.map(x => [x.id, x]));
    const by = (a, b) => a < b ? -1 : a > b ? 1 : 0;
    const sets = {
      course: d.courses.map(x => ({ id: x.id, label: `${x.name} (${x.duration} years)` })),
      year: d.acad_years.slice().sort((a, b) => a.course_id - b.course_id || by(b.label, a.label)).map(y => ({ id: y.id, label: `${byCourse.get(y.course_id).name} - ${y.label}` })),
      branch: d.branches.slice().sort((a, b) => a.course_id - b.course_id || by(a.name, b.name)).map(b => ({ id: b.id, label: `${byCourse.get(b.course_id).name} - ${b.name}` })),
      purpose: d.fee_categories.map(k => ({ id: k.id, label: k.name })),
      semester: d.semesters.map(s => ({ id: s.id, label: s.name })),
      mode: d.pay_modes.map(m => ({ id: m.id, label: m.name }))
    };
    const box = (title, kind) => h`<div class="panel"><h3>${title}</h3>
<form data-form="master" class="bar"><input type="hidden" name="kind" value="${kind}"><input type="hidden" name="action" value="add">
${kind === 'branch' || kind === 'year' ? h`<select name="course_id">${d.courses.map(x => h`<option value="${x.id}">${x.name}</option>`)}</select>` : ''}
${kind === 'year' ? h`<input type="number" name="start" min="1990" max="2100" placeholder="Starting year, e.g. 2023" required>` : h`<input name="name" placeholder="New name" required>`}
${kind === 'course' ? h`<input type="number" name="duration" min="1" max="6" value="4" title="Course duration in years" style="width:90px">` : ''}
<button>Add</button></form>
${sets[kind].map(r => h`<form data-form="master" data-confirm="Delete ${r.label}?" class="bar" style="margin:4px 0"><input type="hidden" name="kind" value="${kind}"><input type="hidden" name="action" value="del"><input type="hidden" name="id" value="${r.id}"><span class="tag">${r.label}</span><button class="danger">Delete</button></form>`)}</div>`;
    return {
      title: 'Master data', body: h`<h2>Master data (ultra admin)</h2>
${box('Courses', 'course')}${box('Academic years (end year is added from the course duration)', 'year')}${box('Branches', 'branch')}${box('Fee purposes', 'purpose')}${box('Semesters (shown in the receipt form, for example 1 or 1 Back)', 'semester')}${box('Payment modes', 'mode')}
<div class="panel"><h3>Receipt watermark</h3>
<form data-form="master" data-pw="Enter your password to change the watermark." class="grid"><input type="hidden" name="kind" value="watermark">
<label>Watermark text (for example the institution name)<input name="wm_text" value="${c.wm_text || ''}"></label>
<label>Watermark image / logo (from your computer)<input type="file" name="wm_image" accept="image/*"></label>
<button>Save watermark</button></form>
${c.wm_image ? h`<div class="bar"><img src="${DB.Files.url(c.wm_image)}" alt="Watermark image" style="max-height:80px;border:1px solid var(--line);border-radius:6px">
<form data-form="master" data-pw="Enter your password to remove the watermark image."><input type="hidden" name="kind" value="watermark"><input type="hidden" name="action" value="img_del"><button class="danger">Remove image</button></form></div>` : ''}
<small>The text and image appear faintly behind the receipt content, on screen and when printed. Clear the text and save to remove it.</small></div>`
    };
  });

  class InUse extends Error { }
  App.form('master', async F => {
    App.need(); const kind = get(F, 'kind'), act = get(F, 'action');
    if (kind === 'watermark') {
      const file = F.get('wm_image');
      if (act === 'img_del') {
        const old = DB.tx(d => { const o = d.settings.wm_image; delete d.settings.wm_image; return o; });
        DB.Files.del(old); App.flash('Watermark image removed.');
      } else {
        DB.tx(d => { d.settings.wm_text = get(F, 'wm_text').trim(); });
        if (file && file.name) {
          if (IMG.includes(ext(file.name))) {
            const id = DB.Files.put(await readImage(file, 800));
            let old; try { old = DB.tx(d => { const o = d.settings.wm_image; d.settings.wm_image = id; return o; }); } catch (e) { DB.Files.del(id); throw e; }
            DB.Files.del(old); App.flash('Watermark saved.');
          } else App.flash('Text saved, but the image must be PNG, JPG, GIF or WEBP.', 'error');
        } else App.flash('Watermark saved.');
      }
      return App.redirect('#/master');
    }
    if (!KINDS[kind]) throw new Error('Unknown kind of master data.');
    const generic = 'That already exists, is invalid, or is in use and cannot be deleted.';
    try {
      DB.tx(d => {
        const table = KINDS[kind], name = get(F, 'name').trim();
        if (act === 'add') {
          if (kind === 'branch') {
            const c = DB.byId(d.courses, get(F, 'course_id')); if (!c || !name || d.branches.some(b => b.course_id === c.id && b.name === name)) fail(generic);
            DB.insert(d, 'branches', { course_id: c.id, name });
          } else if (kind === 'year') {
            const c = DB.byId(d.courses, get(F, 'course_id')); if (!c || !isInt(get(F, 'start'))) fail(generic);
            const label = U.yearLabel(parseInt(get(F, 'start'), 10), c.duration);
            if (d.acad_years.some(y => y.course_id === c.id && y.label === label)) fail(generic);
            DB.insert(d, 'acad_years', { course_id: c.id, label });
          } else if (kind === 'course') {
            const dur = get(F, 'duration').trim() === '' ? 4 : parseInt(get(F, 'duration'), 10);
            if (!name || !(dur >= 1) || d.courses.some(c => c.name === name)) fail(generic);
            DB.insert(d, 'courses', { name, duration: dur });
          } else {
            if (!name || d[table].some(r => r.name === name)) fail(generic);
            DB.insert(d, table, { name });
          }
        } else {
          const id = Number(get(F, 'id'));
          if (inUse(d, kind, id)) throw new InUse();
          // the old database refused these deletes through its foreign keys
          if (kind === 'course' && (d.acad_years.some(y => y.course_id === id) || d.branches.some(b => b.course_id === id))) fail(generic);
          if (kind === 'purpose' && d.receipt_items.some(i => i.category_id === id)) fail(generic);
          d[table] = d[table].filter(r => r.id !== id);
        }
      });
    } catch (e) {
      if (e instanceof InUse) App.flash('This item is in use (by students or receipts), so it cannot be deleted.', 'error');
      else if (e instanceof DB.DbError) App.flash(e.message, 'error');
      else throw e;
    }
    App.redirect('#/master');
  });

  /* ================= Backup and restore ================= */
  const stamp = ts => String(ts || '').replace('T', ' ').slice(0, 16);
  const nums = c => `${c.receipts} receipts, ${c.students} students, ${c.books} receipt books, ${c.users} users`;
  const undoPanel = () => { const u = DB.Undo.info(); return !u ? '' : h`<div class="panel undo-panel"><h3>Undo is available</h3>
<p><strong>${u.label}</strong> was done on ${stamp(u.ts)}. The data from just before it is still saved${u.counts && u.counts.receipts != null ? ' (' + nums(Object.assign({}, u.counts)) + ')' : ''}.</p>
<p><a class="btn alt" href="#/undo">Undo it</a></p></div>`; };
  App.page('/backup', ['admin'], () => {
    const mb = (DB.usage() * 2 / 1048576).toFixed(2), lb = DB.lastBackup();
    return {
      title: 'Backup', body: h`<h2>Backup and restore</h2>
<div class="panel"><p>All receipts, students and settings are saved <strong>only in this browser on this computer</strong>. Clearing the browser data, or using another computer or browser, means the data will not be there. Download a backup file regularly and keep it somewhere safe. The same file can be restored on another computer.</p>
<p>Storage used: about <strong>${mb} MB</strong> of roughly 10 MB available. Last backup: <strong id="lastbk">${lb ? lb.replace('T', ' ') : 'never'}</strong></p>
<p><button type="button" data-act="backup-download">Download backup</button></p></div>
${isSuper() ? h`${undoPanel()}<form data-form="restore" class="panel bar">
<label>Restore from a backup file (.json). The file is checked first, and you see what it contains before anything is replaced.<input type="file" name="file" accept=".json,application/json" required></label><button class="danger">Check and restore backup</button>
<small style="flex-basis:100%">A copy of the current data is kept first, so a restore can be undone. Backups from older versions of this app work too.</small></form>` : ''}`
    };
  });
  App.act('backup-download', () => {
    App.need('admin');
    XLSX.download(JSON.stringify(DB.exportAll()), `gist-receipts-backup-${U.today()}.json`, 'application/json');
    DB.markBackup(); const el = document.getElementById('lastbk'); if (el) el.textContent = DB.lastBackup().replace('T', ' ');
  });
  App.form('restore', async F => {
    App.need(); const file = F.get('file');
    if (!file || !file.name) return App.flash('Choose a backup file.', 'error');
    let obj; try { obj = JSON.parse(await file.text()); } catch (e) { return App.flash('That file could not be read as a backup. It may be damaged or not a backup made by this app.', 'error'); }
    const info = DB.inspect(obj), now = DB.counts(D());      // throws a clear message if the file is not usable; nothing is changed yet
    const ok = await App.askPassword(`This backup${info.exported ? ' was made on ' + stamp(info.exported) + ' and' : ''} contains ${nums(info)}${info.images ? ', ' + info.images + ' image(s)' : ''}. It will REPLACE everything now in this browser (${nums(now)}). A copy of the current data is kept so you can undo. Enter your password to restore.`, 'Restore backup');
    if (!ok) return;
    const meta = await DB.Undo.prepare('Restore backup');
    let res; try { res = DB.importAll(obj); } catch (e) { DB.Undo.discard(); throw e; }
    const kept = DB.Undo.commit(meta);
    App.endSession();
    App.flash(`Backup restored and checked: ${nums(res)}. Please log in again.${kept ? ' The data from before is saved, so Undo is available on the login page.' : ''}`);
    App.redirect('#/login');
  });

  /* ================= Reset website (ultra admin) ================= */
  App.page('/reset', ['superadmin'], () => {
    const d = D(), n = [['Receipts', d.receipts.length], ['Students', d.students.length], ['Receipt books', d.receipt_books.length], ['Users', d.users.length]];
    return {
      title: 'Reset website', body: h`<h2>Reset website</h2>${undoPanel()}
<div class="panel danger-zone"><h3>Erase everything and start again</h3>
<p>This deletes <strong>every</strong> receipt, student, receipt book, course, setting, logo, QR code, watermark and user account stored in this browser. The app goes back to its first-run state, with the starting logins <strong>ultra / ultra123</strong> and <strong>admin / admin123</strong>.</p>
<div class="cards">${n.map(([l, v], i) => h`<div class="card amber" style="--i:${i}"><span>${l} that will be lost</span><strong>${v}</strong></div>`)}</div>
<p>You will be asked for your password <strong>twice</strong>. A full copy is kept first, so you can <strong>undo the reset</strong> afterwards, even from the login page (you will need the ultra admin login that existed before the reset). Still, <a href="#/backup">download a backup</a> first if the data matters.</p>
<button type="button" class="danger" data-act="reset-site">${G.icon('trash')} Reset website</button></div>`
    };
  });
  App.act('reset-site', async () => {
    App.need();
    if (!await App.askPassword('Step 1 of 2. All data in this website will be erased. Enter your password to continue.', 'Reset website')) return;
    if (!await App.askPassword('Step 2 of 2. Enter your password again to confirm. A copy is kept so the reset can be undone.', 'Final confirmation')) return;
    const meta = await DB.Undo.prepare('Reset website');      // if a copy cannot be kept, this throws and nothing is erased
    DB.reset(); App.endSession();
    const kept = DB.Undo.commit(meta);
    App.flash('The website has been reset. Log in with ultra / ultra123 or admin / admin123, then change the passwords.' + (kept ? ' Changed your mind? Use "Undo it" on this login page.' : ''));
    App.redirect('#/login');
  });

  /* ================= Undo (works even right after a reset, before anyone has logged in) ================= */
  App.page('/undo', null, () => {
    const u = DB.Undo.info();
    if (!u) return { title: 'Undo', body: h`<div class="panel" style="max-width:560px;margin:40px auto"><h2>Nothing to undo</h2><p>There is no saved copy to bring back. A copy is made only just before <em>Reset website</em> or <em>Restore backup</em>.</p><p><a class="btn" href="#/">Continue</a></p></div>` };
    const now = DB.counts(D());
    return {
      title: 'Undo', body: h`<form data-form="undo" class="panel" style="max-width:560px;margin:40px auto"><h2>Undo: ${u.label}</h2>
<p><strong>${u.label}</strong> was done on ${stamp(u.ts)}. Undo brings back the data from just before it${u.counts && u.counts.receipts != null ? h`: <strong>${nums(u.counts)}</strong>` : ''}.</p>
<p>It replaces what is in the website now (${nums(now)}). That is saved too, so you can undo the undo.</p>
<label>Ultra admin username<input name="username" required autocomplete="username"></label>
<label>Password<span class="pw"><input type="password" name="password" required autocomplete="current-password"><button type="button" data-act="pw">Show</button></span></label>
<small>Use the ultra admin login that existed <em>before</em> the change (not the starting login).</small>
<div class="bar"><button>Undo ${u.label.toLowerCase().startsWith('undo') ? 'again' : 'and bring my data back'}</button><a class="btn alt" href="#/">Cancel</a></div></form>`
    };
  });
  App.form('undo', async F => {
    if (!DB.Undo.info()) { App.flash('There is nothing to undo.', 'error'); return App.redirect('#/login'); }
    if (!DB.Undo.verify(get(F, 'username'), get(F, 'password'))) return App.flash('Wrong username or password. Use the ultra admin login from before the change.', 'error');
    const r = await DB.Undo.apply();
    App.endSession();
    App.flash(`Undo complete: ${nums(r)} are back. Please log in with your usual account.${r.again ? ' (The data that was replaced is saved, so this undo can itself be undone.)' : ''}`);
    App.redirect('#/login');
  });
})(window);
