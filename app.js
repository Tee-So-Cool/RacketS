(() => {
  'use strict';

  // ---------- data ----------
  const KEYS = { r: 'rs.rackets.v1', s: 'rs.strings.v1' };
  const BASE = { r: window.RACKETS || [], s: window.STRINGS || [] };
  const clone = v => JSON.parse(JSON.stringify(v));
  function load(kind) {
    try { const v = localStorage.getItem(KEYS[kind]); if (v) return JSON.parse(v); } catch (e) {}
    return clone(BASE[kind]);
  }
  const db = { r: load('r'), s: load('s') };
  function persist(kind) { try { localStorage.setItem(KEYS[kind], JSON.stringify(db[kind])); } catch (e) {} }
  function isCustom(kind) { try { return !!localStorage.getItem(KEYS[kind]); } catch (e) { return false; } }

  // ---------- labels / helpers ----------
  const L = {
    style: { attack: 'บุก', speed: 'สปีด', control: 'คอนโทรล', allround: 'ออลราวด์' },
    balance: { 'head-light': 'หัวเบา', even: 'สมดุล', 'head-heavy': 'หัวหนัก' },
    flex: { flexible: 'ก้านอ่อน', medium: 'ก้านกลาง', stiff: 'ก้านแข็ง', 'extra-stiff': 'ก้านแข็งมาก' },
    level: { beginner: 'มือใหม่', intermediate: 'ระดับกลาง', advanced: 'ระดับสูง', pro: 'โปร' },
    material: { multi: 'มัลติฟิลาเมนต์', mono: 'โมโนฟิลาเมนต์', braided: 'ถัก / Braided', hybrid: 'ไฮบริด', coated: 'เคลือบผิว' },
    gauge: { thin: 'บาง (≤ 0.63)', mid: 'กลาง (0.64–0.67)', thick: 'หนา (≥ 0.68)' },
  };
  const ORD = {
    balance: ['head-light', 'even', 'head-heavy'],
    flex: ['flexible', 'medium', 'stiff', 'extra-stiff'],
    level: ['beginner', 'intermediate', 'advanced', 'pro'],
  };
  const COLORS = ['var(--s1)', 'var(--s2)', 'var(--s3)'];
  const view = document.getElementById('view');
  const tray = document.getElementById('tray');

  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const baht = n => (n || n === 0) && n !== '' ? '฿' + Number(n).toLocaleString('th-TH') : '—';
  const dash = v => (v === '' || v == null) ? '—' : esc(v);
  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const full = x => `${x.brand} ${x.name}`;
  const byId = (kind, id) => db[kind].find(x => x.id === id);
  const ordIdx = (k, v, fallback) => { const i = ORD[k].indexOf(v); return i < 0 ? fallback : i; };
  const gaugeLabel = s => s.gaugeText || (s.gauge ? `${s.gauge} mm` : '—');
  const gaugeGroup = g => !g ? '' : g <= 0.63 ? 'thin' : g < 0.68 ? 'mid' : 'thick';
  const sortName = (a, b) => full(a).localeCompare(full(b));
  // label for an enum field, with a marker when the value is a series-based estimate (r.est)
  const lab = (r, field) => {
    const v = L[field][r[field]];
    if (!v) return '';
    return (r.est || []).includes(field) ? `${v} (ประเมิน)` : v;
  };
  // string rating cell, same estimate marker
  const rate = (s, field) => {
    if (s[field] === '' || s[field] == null) return '—';
    return (s.est || []).includes(field) ? `${esc(s[field])} (ประเมิน)` : esc(s[field]);
  };
  const link = (url, text) => url ? `<a href="${esc(url)}" target="_blank" rel="noopener">${text}</a>` : '';
  const sources = x => [link(x.officialUrl, 'ผู้ผลิต'), link(x.specSrc, 'หน้าสินค้า'), link(x.source, 'chobbad')].filter(Boolean).join(', ') || '—';

  // ---------- profiles (0–10) ----------
  const R_AXES = ['พลังตบ', 'ความคล่องตัว', 'ควบคุม', 'ตีง่าย', 'รับเอ็นตึง', 'ต้องมีพื้นฐาน'];
  function racketProfile(r) {
    const bal = ordIdx('balance', r.balance, 1) / 2;
    const fx = ordIdx('flex', r.flex, 1.5) / 3;
    const lv = ordIdx('level', r.level, 1.5) / 3;
    const w = clamp(((Number(r.weight) || 83) - 74) / 16);
    const tmax = clamp((((r.tension && r.tension[1]) || 27) - 22) / 9);
    const st = { attack: 0.3, speed: 0.4, control: 1, allround: 0.7 }[r.style] ?? 0.5;
    return [
      0.5 * bal + 0.3 * fx + 0.2 * w,
      0.65 * (1 - bal) + 0.35 * (1 - w),
      0.5 * st + 0.3 * (1 - Math.abs(bal - 0.5) * 2) + 0.2 * fx,
      0.5 * (1 - fx) + 0.35 * (1 - lv) + 0.15 * (1 - w),
      tmax,
      0.55 * fx + 0.45 * lv,
    ].map(v => Math.round(clamp(v) * 100) / 10);
  }
  const S_AXES = ['แรงดีด', 'ควบคุม', 'ความทน', 'เสียงกระทบ', 'ซับแรง'];
  const S_KEYS = ['repulsion', 'control', 'durability', 'sound', 'shock'];
  const stringProfile = s => S_KEYS.map(k => Number(s[k]) || 0);

  // ---------- small renderers ----------
  function radar(axes, series, size = 340) {
    const c = size / 2, R = size / 2 - 58, n = axes.length;
    const pt = (i, v) => { const a = -Math.PI / 2 + i * 2 * Math.PI / n; return [c + Math.cos(a) * R * v, c + Math.sin(a) * R * v]; };
    const poly = v => axes.map((_, i) => pt(i, typeof v === 'number' ? v : v[i]).map(x => x.toFixed(1)).join(',')).join(' ');
    let g = '';
    for (const lv of [0.25, 0.5, 0.75, 1]) g += `<polygon points="${poly(lv)}" style="fill:none;stroke:var(--color-rule)"/>`;
    axes.forEach((a, i) => {
      const [x, y] = pt(i, 1), [lx, ly] = pt(i, 1.2);
      const anchor = Math.abs(lx - c) < 4 ? 'middle' : (lx > c ? 'start' : 'end');
      g += `<line x1="${c}" y1="${c}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" style="stroke:var(--color-rule)"/>`;
      g += `<text x="${lx.toFixed(1)}" y="${ly.toFixed(1)}" text-anchor="${anchor}" dominant-baseline="middle">${esc(a)}</text>`;
    });
    // each series also gets its own line style so the three stay apart without colour
    const DASH = ['none', '8 5', '2 4'];
    series.forEach((s, i) => {
      g += `<polygon points="${poly(s.values.map(v => clamp(v / 10)))}" style="fill:${s.color};fill-opacity:.1;stroke:${s.color};stroke-width:2.5;stroke-dasharray:${DASH[i] || 'none'};stroke-linejoin:round"><title>${esc(s.name)}</title></polygon>`;
    });
    return `<svg viewBox="-70 0 ${size + 140} ${size}" role="img" aria-label="radar chart">${g}</svg>`;
  }
  const legend = sel => `<div class="legend">${sel.map((x, i) => `<span><i style="color:${COLORS[i]}"></i>${esc(full(x))}</span>`).join('')}</div>`;

  function bars(rows, sel, all) {
    return rows.map(row => {
      const vals = all.map(row.get).filter(v => typeof v === 'number' && !isNaN(v) && v !== -1);
      const min = row.min ?? Math.min(...vals), max = row.max ?? Math.max(...vals);
      const lines = sel.map((x, i) => {
        const v = row.get(x);
        const ok = typeof v === 'number' && !isNaN(v) && v !== -1;
        const pct = ok ? (max === min ? 100 : 8 + 92 * (v - min) / (max - min)) : 0;
        return `<div class="bar" style="--c:${COLORS[i]}"><div class="track"><div class="fill" style="width:${pct}%"></div></div><b>${ok ? row.fmt(v, x) : '—'}</b></div>`;
      }).join('');
      return `<div class="row"><div class="lbl">${esc(row.label)} <span>${esc(row.hint || '')}</span></div>${lines}</div>`;
    }).join('');
  }

  function specTable(rows, sel) {
    const head = `<thead><tr><th>หัวข้อ</th>${sel.map((x, i) => `<td style="--c:${COLORS[i]}">${esc(full(x))}</td>`).join('')}</tr></thead>`;
    const body = rows.map(([label, fn]) => {
      const cells = sel.map(x => fn(x));
      const diff = sel.length > 1 && new Set(cells).size > 1;
      return `<tr><th>${esc(label)}</th>${cells.map(c => `<td class="${diff ? 'diff' : ''}">${c}</td>`).join('')}</tr>`;
    }).join('');
    return `<div class="tbl-wrap"><table class="spec">${head}<tbody>${body}</tbody></table></div>`;
  }

  // ---------- kind configs ----------
  const KIND = {
    r: {
      title: 'เทียบไม้แบด',
      filters: ['style', 'balance', 'level'],
      filterAll: { style: 'ทุกแนวการเล่น', balance: 'ทุกสมดุล', level: 'ทุกระดับ' },
      sorts: { name: 'เรียงตามชื่อ', year: 'ใหม่สุดก่อน', priceAsc: 'ราคาต่ำ → สูง', priceDesc: 'ราคาสูง → ต่ำ' },
      match: (x, f) => (!f.style || x.style === f.style) && (!f.balance || x.balance === f.balance) && (!f.level || x.level === f.level),
      card: r => `
        ${r.img ? `<img class="thumb" src="${esc(r.img)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : '<div class="thumb" aria-hidden="true"></div>'}
        <span class="tag ${r.style || ''}">${lab(r, 'style') || '—'}</span>
        <div class="nm">${esc(full(r))}</div>
        <div class="meta">${[esc(r.brand), r.year, L.level[r.level]].filter(Boolean).join(', ')}</div>
        <div class="meta">${[lab(r, 'balance'), L.flex[r.flex], r.weights].filter(Boolean).map(esc).join(', ')}</div>
        ${r.price ? `<div class="price"><b class="fig">${baht(r.price)}</b></div>` : ''}`,
      radar: sel => ({ axes: R_AXES, series: sel.map((x, i) => ({ name: full(x), color: COLORS[i], values: racketProfile(x) })), title: 'ภาพรวมบุคลิกไม้', note: 'คำนวณจากสเปก (สมดุล ก้าน น้ำหนัก ระดับ) ไม่ใช่คะแนนจากผู้ผลิต' }),
      bars: [
        { label: 'น้ำหนัก', hint: 'หนักมีแรงส่ง เบาสวิงไว', get: r => Number(r.weight) || NaN, fmt: v => v + ' g' },
        { label: 'ความตึงสูงสุด', hint: 'เป็นเพดาน ไม่ใช่ค่าที่ควรขึ้น', get: r => r.tension ? Number(r.tension[1]) : NaN, fmt: v => v + ' lbs' },
        { label: 'ราคา', hint: 'ราคาประมาณ เช็กร้านอีกที', get: r => Number(r.price) || NaN, fmt: v => baht(v) },
      ],
      spec: [
        ['แบรนด์', r => esc(r.brand)],
        ['ปีที่ออก', r => dash(r.year)],
        ['แนวการเล่น', r => lab(r, 'style') || '—'],
        ['ระดับผู้เล่น', r => L.level[r.level] || '—'],
        ['สมดุล', r => lab(r, 'balance') || '—'],
        ['ความแข็งก้าน', r => L.flex[r.flex] || '—'],
        ['น้ำหนัก', r => dash(r.weights)],
        ['น้ำหนักเฉลี่ย', r => r.weight ? r.weight + ' g' : '—'],
        ['ขนาดด้าม', r => dash(r.grips)],
        ['ความตึงที่รับได้', r => !r.tension ? '—' : r.tension[0] ? `${r.tension[0]}–${r.tension[1]} lbs` : `≤ ${r.tension[1]} lbs`],
        ['วัสดุเฟรม', r => dash(r.frame)],
        ['วัสดุก้าน', r => dash(r.shaft)],
        ['ข้อต่อเฟรม-ก้าน', r => dash(r.joint)],
        ['ความยาว', r => dash(r.length)],
        ['ผังเอ็น', r => dash(r.pattern)],
        ['เทคโนโลยี', r => dash(r.tech)],
        ['นักกีฬาที่ใช้', r => dash(r.players)],
        ['ผลิตที่', r => dash(r.madeIn)],
        ['เอ็นที่ผู้ผลิตแนะนำ', r => dash(r.recString)],
        ['ราคาประมาณ', r => baht(r.price)],
        ['หมายเหตุ', r => dash(r.note)],
        ['แหล่งข้อมูล', r => sources(r)],
      ],
    },
    s: {
      title: 'เทียบเอ็นไม้แบด',
      filters: ['material', 'gauge'],
      filterAll: { material: 'ทุกวัสดุ', gauge: 'ทุกขนาดเส้น' },
      sorts: { name: 'เรียงตามชื่อ', repulsion: 'ดีดมากสุดก่อน', control: 'คุมดีสุดก่อน', durability: 'ทนสุดก่อน', priceAsc: 'ราคาต่ำ → สูง' },
      match: (x, f) => (!f.material || x.material === f.material) && (!f.gauge || gaugeGroup(x.gauge) === f.gauge),
      card: s => `
        ${s.img ? `<img class="thumb" src="${esc(s.img)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : '<div class="thumb" aria-hidden="true"></div>'}
        <span class="tag">${esc(gaugeLabel(s))}</span>
        <div class="nm">${esc(full(s))}</div>
        <div class="meta">${esc(L.material[s.material] || '')}</div>
        <div class="meta">ดีด ${dash(s.repulsion)}, คุม ${dash(s.control)}, ทน ${dash(s.durability)}</div>
        ${s.price ? `<div class="price"><b class="fig">${s.price}</b> บาท</div>` : ''}`,
      radar: sel => ({ axes: S_AXES, series: sel.map((x, i) => ({ name: full(x), color: COLORS[i], values: stringProfile(x) })), title: 'บุคลิกเอ็น', note: 'คะแนน 1–10 เป็นค่าประเมิน แก้ได้ในหน้าจัดการข้อมูล' }),
      bars: [
        { label: 'ขนาดเส้น', hint: 'บาง = ดีด / หนา = ทน', get: s => Number(s.gauge) || NaN, fmt: (v, s) => gaugeLabel(s) },
        { label: 'แรงดีด', get: s => Number(s.repulsion), fmt: v => v + '/10', min: 0, max: 10 },
        { label: 'ควบคุม', get: s => Number(s.control), fmt: v => v + '/10', min: 0, max: 10 },
        { label: 'ความทน', get: s => Number(s.durability), fmt: v => v + '/10', min: 0, max: 10 },
        { label: 'ราคา', hint: 'ต่อม้วน/ซอง', get: s => Number(s.price) || NaN, fmt: v => v + ' บาท' },
      ],
      spec: [
        ['แบรนด์', s => esc(s.brand)],
        ['ขนาดเส้น', s => esc(gaugeLabel(s))],
        ['วัสดุ', s => L.material[s.material] || '—'],
        ['แรงดีด', s => rate(s, 'repulsion')],
        ['ควบคุม', s => rate(s, 'control')],
        ['ความทน', s => rate(s, 'durability')],
        ['เสียงกระทบ', s => rate(s, 'sound')],
        ['ซับแรง', s => rate(s, 'shock')],
        ['ความตึงสูงสุด', s => s.tensionMax ? s.tensionMax + ' lbs' : '—'],
        ['สีที่มี', s => dash(s.colors)],
        ['ผลิตที่', s => dash(s.madeIn)],
        ['ราคา', s => s.price ? s.price + ' บาท' : '—'],
        ['หมายเหตุ', s => dash(s.note)],
        ['แหล่งข้อมูล', s => sources(s)],
      ],
    },
  };

  // ---------- compare views ----------
  const emptyFilter = kind => ({ q: '', brand: '', style: '', balance: '', level: '', material: '', gauge: '', sort: kind === 'r' ? 'year' : 'name' });
  const state = {
    sel: { r: [], s: [] },
    f: { r: emptyFilter('r'), s: emptyFilter('s') },
    m: null,
    mg: { kind: 'r', edit: null, q: '' },
  };

  function filtered(kind) {
    const f = state.f[kind], cfg = KIND[kind], q = f.q.trim().toLowerCase();
    const list = db[kind].filter(x =>
      (!q || full(x).toLowerCase().includes(q)) && (!f.brand || x.brand === f.brand) && cfg.match(x, f));
    const num = (v, d) => (v === '' || v == null || isNaN(v)) ? d : Number(v);
    const sorters = {
      name: sortName,
      year: (a, b) => num(b.year, 0) - num(a.year, 0) || sortName(a, b),
      priceAsc: (a, b) => num(a.price, 1e9) - num(b.price, 1e9),
      priceDesc: (a, b) => num(b.price, -1) - num(a.price, -1),
      repulsion: (a, b) => num(b.repulsion, 0) - num(a.repulsion, 0),
      control: (a, b) => num(b.control, 0) - num(a.control, 0),
      durability: (a, b) => num(b.durability, 0) - num(a.durability, 0),
    };
    return list.sort(sorters[f.sort] || sortName);
  }

  function viewCompare(kind) {
    const cfg = KIND[kind], f = state.f[kind], items = db[kind];
    state.sel[kind] = state.sel[kind].filter(id => byId(kind, id));
    const brands = [...new Set(items.map(x => x.brand))].sort();
    const countOf = (key, val) => items.filter(x => key === 'gauge' ? gaugeGroup(x.gauge) === val : x[key] === val).length;
    const sel = (key, map, all) => `<select name="${key}"><option value="">${all}</option>${Object.entries(map)
      .filter(([k]) => countOf(key, k))
      .map(([k, v]) => `<option value="${k}" ${f[key] === k ? 'selected' : ''}>${v} (${countOf(key, k)})</option>`).join('')}</select>`;

    view.innerHTML = `
      <h1>${cfg.title}</h1>
      <p class="muted">ติ๊กเลือกได้สูงสุด 3 รุ่นเพื่อเทียบกัน จากทั้งหมด ${items.length} รุ่น</p>
      <div id="cmp"></div>
      <div class="filters" id="flt">
        <input type="search" name="q" placeholder="ค้นหารุ่น…" value="${esc(f.q)}">
        <select name="brand"><option value="">ทุกแบรนด์</option>${brands.map(b => `<option ${f.brand === b ? 'selected' : ''}>${esc(b)}</option>`).join('')}</select>
        ${cfg.filters.map(k => sel(k, L[k], cfg.filterAll[k])).join('')}
        <select name="sort">${Object.entries(cfg.sorts).map(([k, v]) => `<option value="${k}" ${f.sort === k ? 'selected' : ''}>${v}</option>`).join('')}</select>
        <button class="btn ghost" id="clr" type="button">ล้างตัวกรอง</button>
      </div>
      <div class="count muted small" id="cnt"></div>
      <div class="grid" id="grid"></div>`;

    const flt = view.querySelector('#flt');
    flt.addEventListener('input', e => { if (e.target.name) { f[e.target.name] = e.target.value; renderGrid(kind); } });
    view.querySelector('#clr').onclick = () => { state.f[kind] = emptyFilter(kind); viewCompare(kind); };
    view.querySelector('#grid').addEventListener('click', e => {
      const el = e.target.closest('.item'); if (el) toggle(kind, el.dataset.id);
    });
    // items are role="checkbox": Space and Enter toggle them too
    view.querySelector('#grid').addEventListener('keydown', e => {
      const el = e.target.closest('.item');
      if (el && (e.key === ' ' || e.key === 'Enter')) {
        e.preventDefault();
        toggle(kind, el.dataset.id);
        view.querySelector(`.item[data-id="${CSS.escape(el.dataset.id)}"]`)?.focus();
      }
    });
    view.querySelector('#cmp').addEventListener('click', e => {
      const x = e.target.closest('[data-rm]'); if (x) toggle(kind, x.dataset.rm);
    });
    renderGrid(kind);
    renderCompare(kind);
  }

  function renderGrid(kind) {
    const list = filtered(kind), sel = state.sel[kind];
    view.querySelector('#cnt').textContent = `พบ ${list.length} รุ่น`;
    view.querySelector('#grid').innerHTML = list.length ? list.map(x => `
      <div class="item ${sel.includes(x.id) ? 'sel' : ''}" data-id="${esc(x.id)}" role="checkbox" aria-checked="${sel.includes(x.id)}" tabindex="0">
        <div class="tick">✓</div>${KIND[kind].card(x)}
      </div>`).join('') : '<div class="empty">ไม่พบรุ่นที่ตรงกับตัวกรอง</div>';
  }

  function toggle(kind, id) {
    const sel = state.sel[kind], i = sel.indexOf(id);
    if (i >= 0) sel.splice(i, 1);
    else if (sel.length >= 3) { flashTray(kind, 'เลือกได้สูงสุด 3 รุ่น — เอาออกก่อน 1 รุ่น'); return; }
    else sel.push(id);
    renderGrid(kind);
    renderCompare(kind);
  }

  function renderCompare(kind) {
    const cfg = KIND[kind], sel = state.sel[kind].map(id => byId(kind, id)).filter(Boolean);
    const box = view.querySelector('#cmp');
    updateTray(kind);
    if (!sel.length) { box.innerHTML = ''; watchSheet(); return; }
    const rd = cfg.radar(sel);
    box.innerHTML = `
      <section class="panel">
        <div class="heads" style="grid-template-columns:repeat(${sel.length},minmax(0,1fr))">
          ${sel.map((x, i) => `<div class="head" style="--c:${COLORS[i]}">
            <button class="x" data-rm="${esc(x.id)}" aria-label="เอาออก">×</button>
            <div class="nm">${esc(full(x))}</div>
            <div class="small muted">${kind === 'r' ? [lab(x, 'balance'), L.flex[x.flex], x.weights].filter(Boolean).map(esc).join(', ') : esc(gaugeLabel(x))}</div>
          </div>`).join('')}
        </div>
        ${sel.length < 2 ? '<p class="small muted sheet-key">เลือกเพิ่มอีกอย่างน้อย 1 รุ่นเพื่อเทียบ</p>' : ''}
        <div class="two">
          <div class="radar"><h3>${rd.title}</h3>${radar(rd.axes, rd.series)}${legend(sel)}<p class="small muted">${rd.note}</p></div>
          <div class="bars"><h3>กราฟเทียบ</h3>${bars(cfg.bars, sel, db[kind])}</div>
        </div>
        <p class="small muted sheet-key">ช่องที่ขึ้น — คือยังไม่มีข้อมูล ช่องที่ไฮไลต์คือค่าที่ต่างกัน</p>
        ${specTable(cfg.spec, sel)}
      </section>`;
    watchSheet();
  }

  let trayTimer, sheetSeen;
  // hide the tray while the compare sheet itself is in view; it only points at the sheet
  function watchSheet() {
    sheetSeen?.disconnect();
    const panel = view.querySelector('#cmp .panel');
    tray.classList.remove('away');
    if (!panel || !('IntersectionObserver' in window)) return;
    sheetSeen = new IntersectionObserver(([e]) => tray.classList.toggle('away', e.isIntersecting), { threshold: 0.15 });
    sheetSeen.observe(panel);
  }
  function updateTray(kind) {
    const n = state.sel[kind].length;
    if (!n) { tray.hidden = true; return; }
    tray.hidden = false;
    tray.innerHTML = `<span>เลือกแล้ว ${n}/3 รุ่น</span>
      <button class="btn primary sm" data-a="go">ดูผลเทียบ</button>
      <button class="btn ghost sm" data-a="clear">ล้าง</button>`;
    tray.onclick = e => {
      const a = e.target.dataset.a;
      if (a === 'go') view.querySelector('#cmp').scrollIntoView({ behavior: 'smooth', block: 'start' });
      if (a === 'clear') { state.sel[kind] = []; renderGrid(kind); renderCompare(kind); }
    };
  }
  function flashTray(kind, msg) {
    tray.hidden = false;
    tray.innerHTML = `<span>${esc(msg)}</span>`;
    clearTimeout(trayTimer);
    trayTimer = setTimeout(() => updateTray(kind), 1800);
  }

  // ---------- match ----------
  const LVL_TENSION = { beginner: 21, intermediate: 24, advanced: 26, pro: 28 };
  const STYLE_W = {
    attack: { repulsion: 0.35, control: 0.25, durability: 0.2, sound: 0.2 },
    speed: { repulsion: 0.45, control: 0.3, sound: 0.25 },
    control: { control: 0.55, repulsion: 0.25, shock: 0.2 },
    allround: { repulsion: 0.25, control: 0.25, durability: 0.25, shock: 0.25 },
  };
  const S_NAME = { repulsion: 'แรงดีด', control: 'การควบคุม', durability: 'ความทน', sound: 'เสียงกระทบ', shock: 'การซับแรง' };

  function score(r, s, level, style) {
    const reasons = [];
    const ok = t => reasons.push(['ok', t]);
    const wn = t => reasons.push(['wn', t]);
    let sc = 50;

    const W = STYLE_W[style];
    const fit = Object.entries(W).reduce((a, [k, w]) => a + w * (Number(s[k]) || 5), 0);
    sc += (fit - 6.5) * 6;
    const best = Object.keys(W).sort((a, b) => (Number(s[b]) || 0) - (Number(s[a]) || 0))[0];
    if (fit >= 7.5) ok(`เอ็นเด่นเรื่อง${S_NAME[best]} เข้ากับสไตล์${L.style[style]}`);
    else if (fit < 6.2) wn(`คุณสมบัติเอ็นไม่ค่อยตรงกับสไตล์${L.style[style]}`);

    if (r.style === style) { sc += 8; ok(`ไม้เป็นสาย${L.style[r.style]} ตรงกับสไตล์ที่เลือก`); }
    else if (r.style === 'allround' || style === 'allround') sc += 3;
    else if (r.style) { sc -= 4; wn(`ไม้เป็นสาย${L.style[r.style]} แต่เลือกสไตล์${L.style[style]}`); }

    const d = ordIdx('level', r.level, -9) - ordIdx('level', level, 1);
    if (d === 0) { sc += 10; ok(`ผู้ผลิตออกแบบไม้รุ่นนี้สำหรับ${L.level[r.level]} ตรงกับระดับที่เลือก`); }
    else if (d === 1) { sc += 2; wn(`ไม้ออกแบบมาสำหรับ${L.level[r.level]} สูงกว่าระดับที่เลือกหนึ่งขั้น อาจต้องใช้แรงมากขึ้น`); }
    else if (d >= 2) { sc -= 10; wn(`ไม้ออกแบบมาสำหรับ${L.level[r.level]} — อาจตีหนักมือสำหรับ${L.level[level]}`); }
    else if (d === -1) sc -= 1;
    else if (d > -9) { sc -= 5; wn(`ไม้ออกแบบมาสำหรับ${L.level[r.level]} เล่นสบายแต่อาจไม่ตอบโจทย์${L.level[level]}`); }

    const g = Number(s.gauge) || 0.66;
    if (level === 'beginner' && g <= 0.63) { sc -= 8; wn('เอ็นบาง ขาดง่าย มือใหม่ควรเริ่มที่ 0.68–0.70'); }
    if (level === 'beginner' && Number(s.durability) >= 8) { sc += 4; ok('เอ็นทนทาน คุ้มสำหรับมือใหม่ที่ตีบ่อย'); }
    if (ordIdx('flex', r.flex, 0) >= 2 && Number(s.shock) >= 7) { sc += 3; ok('เอ็นซับแรงช่วยลดแรงสะเทือนจากก้านแข็ง'); }
    if (ordIdx('flex', r.flex, 0) >= 2 && Number(s.shock) <= 4 && ordIdx('level', level, 1) <= 1) { sc -= 4; wn('ก้านแข็ง + เอ็นแข็ง อาจสะเทือนข้อมือสำหรับระดับนี้'); }

    let t = LVL_TENSION[level] + (style === 'control' ? 1 : 0) + (g <= 0.63 ? -1 : 0);
    const [tmin, tmax] = r.tension || [18, 30];
    const cap = Math.min(tmax, Number(s.tensionMax) || 99);
    if (t > cap) { t = cap; wn(`ปรับลงให้ไม่เกินเพดาน ${cap} lbs ของไม้/เอ็น`); }
    t = Math.max(t, tmin);

    return { score: Math.round(clamp(sc, 0, 100)), tension: t, range: [tmin, tmax], reasons };
  }
  const verdict = n => n >= 80 ? ['เข้ากันดีมาก', 'var(--color-accent)'] : n >= 65 ? ['เข้ากันดี', 'var(--color-accent)'] : n >= 50 ? ['พอใช้ได้', 'var(--color-ink)'] : ['ไม่ค่อยเหมาะ', 'var(--color-bad)'];

  function viewMatch() {
    if (!state.m) {
      const pick = (kind, id) => (byId(kind, id) || [...db[kind]].sort(sortName)[0] || {}).id;
      state.m = { r: pick('r', 'yonex-astrox-99-game'), s: pick('s', 'yonex-bg66um'), level: 'intermediate', style: 'attack' };
    }
    if (!db.r.length || !db.s.length) { view.innerHTML = '<h1>จับคู่ไม้ + เอ็น</h1><p class="empty">ต้องมีข้อมูลไม้และเอ็นอย่างน้อยอย่างละ 1 รายการ</p>'; return; }
    if (!byId('r', state.m.r)) state.m.r = db.r[0].id;
    if (!byId('s', state.m.s)) state.m.s = db.s[0].id;
    const grouped = kind => {
      const by = {};
      [...db[kind]].sort(sortName).forEach(x => (by[x.brand] = by[x.brand] || []).push(x));
      return Object.entries(by).map(([b, xs]) => `<optgroup label="${esc(b)}">${xs.map(x =>
        `<option value="${esc(x.id)}" ${state.m[kind] === x.id ? 'selected' : ''}>${esc(full(x))}${kind === 's' ? ' (' + esc(gaugeLabel(x)) + ')' : ''}</option>`).join('')}</optgroup>`).join('');
    };
    const opts = (map, cur) => Object.entries(map).map(([k, v]) => `<option value="${k}" ${cur === k ? 'selected' : ''}>${v}</option>`).join('');

    view.innerHTML = `
      <h1>จับคู่ไม้ + เอ็น</h1>
      <p class="muted">เลือกไม้ เอ็น ระดับมือ และสไตล์ เพื่อดูว่าเข้ากันแค่ไหน และควรขึ้นเอ็นกี่ปอนด์</p>
      <div class="mgrid" id="mform">
        <div class="field"><label>ไม้แบด</label><select name="r">${grouped('r')}</select></div>
        <div class="field"><label>เอ็น</label><select name="s">${grouped('s')}</select></div>
        <div class="field"><label>ระดับมือ</label><select name="level">${opts(L.level, state.m.level)}</select></div>
        <div class="field"><label>สไตล์</label><select name="style">${opts(L.style, state.m.style)}</select></div>
      </div>
      <div id="mres"></div>`;
    view.querySelector('#mform').addEventListener('change', e => { state.m[e.target.name] = e.target.value; renderMatch(); });
    const pickAlt = a => {
      const [kind, id] = a.dataset.pick.split(':');
      state.m[kind] = id;
      view.querySelector(`#mform [name=${kind}]`).value = id;
      renderMatch();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    };
    view.querySelector('#mres').addEventListener('click', e => {
      const a = e.target.closest('[data-pick]'); if (a) pickAlt(a);
    });
    view.querySelector('#mres').addEventListener('keydown', e => {
      const a = e.target.closest('[data-pick]');
      if (a && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); pickAlt(a); }
    });
    renderMatch();
  }

  function renderMatch() {
    const { level, style } = state.m;
    const r = byId('r', state.m.r), s = byId('s', state.m.s);
    const res = score(r, s, level, style);
    const [vt, vc] = verdict(res.score);
    const altS = db.s.filter(x => x.id !== s.id).map(x => ({ x, ...score(r, x, level, style) })).sort((a, b) => b.score - a.score).slice(0, 3);
    const altR = db.r.filter(x => x.id !== r.id).map(x => ({ x, ...score(x, s, level, style) })).sort((a, b) => b.score - a.score).slice(0, 3);
    const alt = (list, kind) => list.map(a => `
      <div class="item" role="button" tabindex="0" data-pick="${kind}:${esc(a.x.id)}">
        <div class="nm">${esc(full(a.x))}</div>
        <div class="meta">${kind === 's' ? esc(gaugeLabel(a.x)) : [L.style[a.x.style], L.level[a.x.level]].filter(Boolean).join(', ')}</div>
        <div class="price"><b class="fig">${a.score}</b> คะแนน, <b class="fig">${a.tension}</b> lbs</div>
      </div>`).join('');

    view.querySelector('#mres').innerHTML = `
      <section class="panel">
        <div class="score">
          <div class="ring" style="--p:${res.score};--rc:${vc}"><div>${res.score}</div></div>
          <div>
            <div class="verdict">${vt}</div>
            <div class="pair">${esc(full(r))} + ${esc(full(s))}</div>
            <div class="small muted">${[L.style[r.style], L.balance[r.balance], L.flex[r.flex], gaugeLabel(s)].filter(Boolean).map(esc).join(', ')}, ${esc(L.material[s.material] || '')}</div>
          </div>
        </div>
        <div class="two">
          <div class="radar"><h3>บุคลิกเอ็น ${esc(full(s))}</h3>${radar(S_AXES, [{ name: full(s), color: COLORS[1], values: stringProfile(s) }])}</div>
          <div>
            <h3>ความตึงที่แนะนำ</h3>
            <div class="tension">${res.tension} lbs</div>
            <div class="small muted">กรอบทางการของไม้ ${res.range[0] ? res.range[0] + '–' : '≤ '}${res.range[1]} lbs${s.tensionMax ? `, เพดานเอ็น ${s.tensionMax} lbs` : ''}</div>
            <ul class="reasons">${res.reasons.map(([k, t]) => `<li><span class="${k}">${k === 'ok' ? '✓' : '!'}</span><span>${esc(t)}</span></li>`).join('') || '<li class="muted">ไม่มีข้อสังเกตเพิ่มเติม</li>'}</ul>
          </div>
        </div>
      </section>
      <h2>เอ็นอื่นที่น่าสนใจกับไม้นี้</h2>
      <div class="alts">${alt(altS, 's')}</div>
      <h2 style="margin-top:20px">ไม้อื่นที่เข้ากับเอ็นนี้ + ระดับ/สไตล์ของคุณ</h2>
      <div class="alts">${alt(altR, 'r')}</div>
      <p class="note">คะแนนและปอนด์ที่แนะนำคำนวณจากสเปกไม้ คะแนนเอ็น และระดับ/สไตล์ที่เลือก ไม่ใช่ตัวเลขที่ผู้ผลิตประกาศ ควรปรึกษาช่างขึงเอ็นประกอบ</p>`;
  }

  // ---------- manage ----------
  const FIELDS = {
    r: [
      ['brand', 'แบรนด์ *', 'text', { list: 1 }], ['name', 'ชื่อรุ่น *', 'text'], ['year', 'ปีที่ออก', 'number'],
      ['style', 'แนวการเล่น', 'select', L.style], ['balance', 'สมดุล', 'select', L.balance],
      ['flex', 'ความแข็งก้าน', 'select', L.flex], ['level', 'ระดับผู้เล่น', 'select', L.level],
      ['weights', 'น้ำหนัก (เช่น 3U, 4U)', 'text'], ['weight', 'น้ำหนักเฉลี่ย (g)', 'number'], ['grips', 'ขนาดด้าม', 'text'],
      ['tmin', 'ความตึงต่ำสุด (lbs)', 'number'], ['tmax', 'ความตึงสูงสุด (lbs)', 'number'], ['price', 'ราคาประมาณ (บาท)', 'number'],
      ['frame', 'วัสดุเฟรม', 'text'], ['shaft', 'วัสดุก้าน', 'text'], ['joint', 'ข้อต่อเฟรม-ก้าน', 'text'], ['length', 'ความยาว', 'text'],
      ['pattern', 'ผังเอ็น', 'text'], ['madeIn', 'ผลิตที่', 'text'], ['recString', 'เอ็นที่ผู้ผลิตแนะนำ', 'text'],
      ['tech', 'เทคโนโลยี', 'text', { wide: 1 }], ['players', 'นักกีฬาที่ใช้', 'text', { wide: 1 }],
      ['img', 'ลิงก์รูป', 'text', { wide: 1 }], ['officialUrl', 'ลิงก์หน้าผู้ผลิต', 'text', { wide: 1 }], ['note', 'หมายเหตุ', 'textarea', { wide: 1 }],
    ],
    s: [
      ['brand', 'แบรนด์ *', 'text', { list: 1 }], ['name', 'ชื่อรุ่น *', 'text'], ['material', 'วัสดุ', 'select', L.material],
      ['gauge', 'ขนาดเส้น (mm)', 'number', { step: '0.01' }], ['gaugeText', 'ขนาดเส้นแบบข้อความ (ถ้าไฮบริด)', 'text'],
      ['repulsion', 'แรงดีด (1–10)', 'number', { r10: 1 }], ['control', 'ควบคุม (1–10)', 'number', { r10: 1 }],
      ['durability', 'ความทน (1–10)', 'number', { r10: 1 }], ['sound', 'เสียงกระทบ (1–10)', 'number', { r10: 1 }],
      ['shock', 'ซับแรง (1–10)', 'number', { r10: 1 }], ['tensionMax', 'ความตึงสูงสุด (lbs)', 'number'],
      ['price', 'ราคา (บาท)', 'number'], ['colors', 'สีที่มี', 'text', { wide: 1 }], ['note', 'หมายเหตุ', 'textarea', { wide: 1 }],
    ],
  };
  const NUMERIC = new Set(['year', 'weight', 'tmin', 'tmax', 'price', 'gauge', 'repulsion', 'control', 'durability', 'sound', 'shock', 'tensionMax']);
  const slug = s => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9ก-๙]+/g, '-').replace(/^-|-$/g, '') || 'item';

  function viewManage() {
    const mg = state.mg, kind = mg.kind;
    const list = db[kind].filter(x => !mg.q || full(x).toLowerCase().includes(mg.q.toLowerCase())).sort(sortName);
    const editing = mg.edit === 'new' ? {} : mg.edit ? byId(kind, mg.edit) : null;

    view.innerHTML = `
      <h1>จัดการข้อมูล</h1>
      <div class="subtabs">
        <button class="btn ${kind === 'r' ? 'on' : ''}" data-k="r">ไม้แบด (${db.r.length})</button>
        <button class="btn ${kind === 's' ? 'on' : ''}" data-k="s">เอ็น (${db.s.length})</button>
      </div>
      <div class="note">
        สิ่งที่เพิ่ม/แก้จะเก็บในเบราว์เซอร์นี้ทันที ${isCustom(kind) ? '<b>(ตอนนี้ใช้ข้อมูลที่แก้แล้ว)</b>' : '(ตอนนี้ใช้ข้อมูลจากไฟล์ต้นฉบับ)'}.
        ถ้าอยากเก็บถาวรหรือใช้ข้ามเครื่อง ให้กด <b>Export</b> แล้วเอาไฟล์ที่ได้ไปทับ <code>data/${kind === 'r' ? 'rackets' : 'strings'}.js</code>
      </div>
      <div class="toolbar">
        <button class="btn primary" data-a="new">+ เพิ่ม${kind === 'r' ? 'ไม้' : 'เอ็น'}ใหม่</button>
        <input type="search" id="mq" class="input grow" placeholder="ค้นหา…" value="${esc(mg.q)}">
        <span class="sp"></span>
        <button class="btn" data-a="export">Export</button>
        <label class="btn">Import<input type="file" id="imp" accept=".js,.json" hidden></label>
        <button class="btn danger" data-a="reset">รีเซ็ต</button>
      </div>
      <div id="edit">${editing ? formHtml(kind, editing) : ''}</div>
      <div class="tbl-wrap">
        <table class="list">
          <thead><tr><th>รุ่น</th><th>${kind === 'r' ? 'แนว / ระดับ' : 'ขนาด / วัสดุ'}</th><th>ราคา</th><th></th></tr></thead>
          <tbody>${list.map(x => `<tr>
            <td><b>${esc(full(x))}</b>${x.year ? ` <span class="muted small">${x.year}</span>` : ''}</td>
            <td class="small">${kind === 'r' ? [L.style[x.style], L.level[x.level]].filter(Boolean).join(', ') : esc(gaugeLabel(x)) + ', ' + esc(L.material[x.material] || '')}</td>
            <td class="small">${kind === 'r' ? baht(x.price) : (x.price ? x.price + ' บาท' : '—')}</td>
            <td><button class="btn sm" data-ed="${esc(x.id)}">แก้ไข</button> <button class="btn sm" data-dup="${esc(x.id)}">ทำสำเนา</button> <button class="btn sm danger" data-del="${esc(x.id)}">ลบ</button></td>
          </tr>`).join('') || '<tr><td colspan="4" class="empty">ไม่มีรายการ</td></tr>'}</tbody>
        </table>
      </div>`;

    view.querySelector('.subtabs').onclick = e => { const k = e.target.dataset.k; if (k) { mg.kind = k; mg.edit = null; viewManage(); } };
    view.querySelector('#mq').oninput = e => { mg.q = e.target.value; const p = e.target.selectionStart; viewManage(); const n = view.querySelector('#mq'); n.focus(); n.setSelectionRange(p, p); };
    view.querySelector('#imp').onchange = e => importFile(kind, e.target.files[0]);
    view.onclick = onManageClick;
    const form = view.querySelector('#editform');
    if (form) {
      form.onsubmit = e => { e.preventDefault(); saveForm(kind, form); };
      form.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  function onManageClick(e) {
    const t = e.target, mg = state.mg, kind = mg.kind;
    if (t.dataset.a === 'new') { mg.edit = 'new'; viewManage(); }
    else if (t.dataset.a === 'cancel') { mg.edit = null; viewManage(); }
    else if (t.dataset.a === 'export') exportFile(kind);
    else if (t.dataset.a === 'reset') {
      if (confirm('ล้างข้อมูลที่แก้ในเบราว์เซอร์ แล้วกลับไปใช้ไฟล์ต้นฉบับ? (ควร Export เก็บไว้ก่อน)')) {
        try { localStorage.removeItem(KEYS[kind]); } catch (err) {}
        db[kind] = clone(BASE[kind]); mg.edit = null; viewManage();
      }
    }
    else if (t.dataset.ed) { mg.edit = t.dataset.ed; viewManage(); }
    else if (t.dataset.dup) {
      const src = byId(kind, t.dataset.dup); if (!src) return;
      const copy = { ...clone(src), name: src.name + ' (สำเนา)' };
      copy.id = uniqueId(kind, slug(full(copy)));
      db[kind].push(copy); persist(kind); mg.edit = copy.id; viewManage();
    }
    else if (t.dataset.del) {
      const x = byId(kind, t.dataset.del);
      if (x && confirm(`ลบ ${full(x)}?`)) {
        db[kind] = db[kind].filter(y => y.id !== x.id); persist(kind);
        if (mg.edit === x.id) mg.edit = null;
        viewManage();
      }
    }
  }

  function formHtml(kind, item) {
    const v = { ...item };
    if (kind === 'r' && item.tension) { v.tmin = item.tension[0]; v.tmax = item.tension[1]; }
    const brands = [...new Set(db[kind].map(x => x.brand))].sort();
    const inp = ([key, label, type, opt]) => {
      opt = opt || {};
      const val = v[key] ?? '';
      let ctl;
      if (type === 'select') ctl = `<select name="${key}"><option value="">—</option>${Object.entries(opt).map(([k, l]) => `<option value="${k}" ${val === k ? 'selected' : ''}>${l}</option>`).join('')}</select>`;
      else if (type === 'textarea') ctl = `<textarea name="${key}" rows="2">${esc(val)}</textarea>`;
      else ctl = `<input name="${key}" type="${type}" value="${esc(val)}" ${opt.step ? `step="${opt.step}"` : type === 'number' ? 'step="any"' : ''} ${opt.r10 ? 'min="0" max="10"' : ''} ${opt.list ? 'list="brandlist"' : ''} ${key === 'brand' || key === 'name' ? 'required' : ''}>`;
      return `<div class="field ${opt.wide ? 'wide' : ''}"><label>${esc(label)}</label>${ctl}</div>`;
    };
    return `
      <form class="panel" id="editform">
        <h2>${item.id ? 'แก้ไข ' + esc(full(item)) : 'เพิ่ม' + (kind === 'r' ? 'ไม้' : 'เอ็น') + 'ใหม่'}</h2>
        <datalist id="brandlist">${brands.map(b => `<option value="${esc(b)}">`).join('')}</datalist>
        <div class="form">${FIELDS[kind].map(inp).join('')}</div>
        <div class="toolbar" style="margin-top:14px">
          <button class="btn primary" type="submit">บันทึก</button>
          <button class="btn" type="button" data-a="cancel">ยกเลิก</button>
        </div>
      </form>`;
  }

  function uniqueId(kind, base) {
    let id = base, n = 2;
    while (byId(kind, id)) id = `${base}-${n++}`;
    return id;
  }

  function saveForm(kind, form) {
    const fd = new FormData(form), mg = state.mg;
    const old = mg.edit && mg.edit !== 'new' ? byId(kind, mg.edit) : null;
    const item = old ? { ...old } : {};
    for (const [k] of FIELDS[kind]) {
      const raw = String(fd.get(k) ?? '').trim();
      item[k] = NUMERIC.has(k) ? (raw === '' ? '' : Number(raw)) : raw;
    }
    if (kind === 'r') {
      item.tension = item.tmin !== '' && item.tmax !== '' ? [item.tmin, item.tmax] : null;
      delete item.tmin; delete item.tmax;
      // a field the user set by hand is no longer an estimate
      item.est = (item.est || []).filter(f => old && old[f] === item[f]);
    }
    if (old) Object.assign(old, item);
    else { item.id = uniqueId(kind, slug(full(item))); db[kind].push(item); }
    persist(kind);
    mg.edit = null;
    viewManage();
  }

  function exportFile(kind) {
    const name = kind === 'r' ? 'rackets' : 'strings';
    const head = kind === 'r'
      ? '// ข้อมูลไม้แบด — style: attack|speed|control|allround, balance: head-light|even|head-heavy,\n// flex: flexible|medium|stiff|extra-stiff, level: beginner|intermediate|advanced|pro\n'
      : '// ข้อมูลเอ็น — material: multi|mono|braided|hybrid|coated, คะแนน 1–10\n';
    const text = `${head}window.${name.toUpperCase()} = ${JSON.stringify(db[kind], null, 2)};\n`;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: 'text/javascript' }));
    a.download = `${name}.js`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  function importFile(kind, file) {
    if (!file) return;
    file.text().then(text => {
      const s = text.indexOf('['), e = text.lastIndexOf(']');
      const arr = JSON.parse(text.slice(s, e + 1));
      if (!Array.isArray(arr) || arr.some(x => !x || !x.id || !x.name)) throw new Error('bad');
      db[kind] = arr; persist(kind); state.mg.edit = null; viewManage();
    }).catch(() => alert('อ่านไฟล์ไม่ได้ — ต้องเป็นไฟล์ที่ได้จากปุ่ม Export'));
  }

  // ---------- router ----------
  function route() {
    const v = location.hash.slice(1) || 'rackets';
    document.querySelectorAll('#tabs a').forEach(a => a.classList.toggle('on', a.dataset.v === v));
    tray.hidden = true;
    view.onclick = null;
    if (v === 'strings') viewCompare('s');
    else if (v === 'match') viewMatch();
    else if (v === 'manage') viewManage();
    else viewCompare('r');
    window.scrollTo(0, 0);
  }
  window.addEventListener('hashchange', route);
  route();
})();
