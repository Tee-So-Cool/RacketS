(() => {
  'use strict';

  // ---------- data ----------
  const KEYS = { r: 'rs.rackets.v1', s: 'rs.strings.v1', h: 'rs.shuttles.v1', o: 'rs.shoes.v1', k: 'rs.socks.v1' };
  const BASE = { r: window.RACKETS || [], s: window.STRINGS || [], h: window.SHUTTLES || [], o: window.SHOES || [], k: window.SOCKS || [] };
  const clone = v => JSON.parse(JSON.stringify(v));
  function load(kind) {
    try { const v = localStorage.getItem(KEYS[kind]); if (v) return JSON.parse(v); } catch (e) {}
    return clone(BASE[kind]);
  }
  const db = { r: load('r'), s: load('s'), h: load('h'), o: load('o'), k: load('k') };
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
    type: { goose: 'ขนห่าน', duck: 'ขนเป็ด', natural: 'ขนธรรมชาติ', hybrid: 'ขนผสมไนลอน', synthetic: 'ขนสังเคราะห์', nylon: 'ไนลอน' },
    grade: { tournament: 'ระดับแข่งขัน', club: 'ระดับชมรม', training: 'ระดับซ้อม' },
    spd: { 75: 'สปีด 75', 76: 'สปีด 76', 77: 'สปีด 77', 78: 'สปีด 78', 79: 'สปีด 79', slow: 'ช้า (Slow)', medium: 'กลาง (Medium)', fast: 'เร็ว (Fast)' },
    width: { normal: 'หน้าเท้าปกติ', wide: 'หน้าเท้ากว้าง', narrow: 'หน้าเท้าแคบ' },
    height: { low: 'ข้อสั้น', mid: 'ข้อกลาง', high: 'ข้อยาว' },
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

  // ---------- search: forgiving about spacing, hyphens, roman numerals, model codes, brand spellings and one typo ----------
  const ALIAS = [[/\bli[\s-]?ning\b|หลี่หนิง|หลีหนิง/g, 'lining'], [/โยเน็กซ์|โยเนกซ์/g, 'yonex'], [/วิคเตอร์|วิกเตอร์/g, 'victor'],
    [/\bars\b/g, 'auraspeed'], [/\btk\b/g, 'thruster'], [/\bjs\b/g, 'jetspeed s'], [/\bdx\b/g, 'drivex'], [/\bbrs\b/g, 'brave sword'],
    [/\bnf\b/g, 'nanoflare'], [/\bax\b/g, 'astrox'], [/\barc\b/g, 'arcsaber'], [/\bii\b/g, '2'], [/\biii\b/g, '3'], [/\biv\b/g, '4']];
  const snorm = t => {
    t = String(t || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase();
    for (const [rx, to] of ALIAS) t = t.replace(rx, to);
    // split letters from digits and drop punctuation: "Astrox99" / "ARS-100X" / "Blade X" all become comparable
    return t.replace(/[^a-z0-9ก-๙]+/g, ' ').replace(/([a-z])(\d)/g, '$1 $2').replace(/(\d)([a-z])/g, '$1 $2').trim();
  };
  const near = (a, b) => {  // one edit apart (a typo, or two letters swapped), for words of five letters or more
    if (Math.abs(a.length - b.length) > 1 || a.length < 5) return false;
    if (a.length === b.length) { const d = [...a].map((c, k) => c !== b[k] ? k : -1).filter(k => k >= 0);
      if (d.length === 2 && d[1] === d[0] + 1 && a[d[0]] === b[d[1]] && a[d[1]] === b[d[0]]) return true; }
    let i = 0, j = 0, e = 0;
    while (i < a.length && j < b.length) {
      if (a[i] === b[j]) { i++; j++; continue; }
      if (++e > 1) return false;
      if (a.length > b.length) i++; else if (b.length > a.length) j++; else { i++; j++; }
    }
    return e + (a.length - i) + (b.length - j) <= 1;
  };
  const searchIndex = new WeakMap();
  const tokensOf = x => {
    let t = searchIndex.get(x);
    if (!t) { const n = snorm(full(x)); t = { words: n.split(' '), compact: n.replace(/ /g, '') }; searchIndex.set(x, t); }
    return t;
  };
  // 0 = no match; higher = better. Every query word must start a word of the name (or sit inside its compact form, or be one typo off)
  const matchScore = (x, q) => {
    let qs = snorm(q).split(' ').filter(Boolean); if (!qs.length) return 1;
    const { words, compact } = tokensOf(x);
    // "blade x 900": a lone letter joins the word before it when the name writes them as one ("bladex")
    qs = qs.reduce((acc, w) => { const last = acc[acc.length - 1];
      if (last && /^[a-z]$/.test(w) && !words.includes(w) && words.some(v => v.startsWith(last + w))) acc[acc.length - 1] = last + w; else acc.push(w);
      return acc; }, []);
    let sc = 0;
    for (const w of qs) {
      if (words.includes(w)) sc += 3;
      else if (words.some(v => v.startsWith(w))) sc += 2;
      else if (w.length >= 3 && compact.includes(w)) sc += 1;
      else if (words.some(v => near(w, v))) sc += 1;
      else return 0;
    }
    return sc;
  };
  const searchList = (list, q) => list.map(x => [x, matchScore(x, q)]).filter(([, s]) => s > 0).sort((a, b) => b[1] - a[1]).map(([x]) => x);
  const byId = (kind, id) => db[kind].find(x => x.id === id);
  const ordIdx = (k, v, fallback) => { const i = ORD[k].indexOf(v); return i < 0 ? fallback : i; };
  const gaugeLabel = s => s.gaugeText || (s.gauge ? `${s.gauge} mm` : '—');
  const gaugeGroup = g => !g ? '' : g <= 0.63 ? 'thin' : g < 0.68 ? 'mid' : 'thick';
  const sortName = (a, b) => full(a).localeCompare(full(b));
  // label for an enum field, with a marker when the value is a series-based estimate (r.est)
  const lab = (r, field) => {
    const v = L[field][r[field]];
    if (!v) return '';
    return (r.est || []).includes(field) ? `≈${v}` : v;
  };
  // string rating cell, same estimate marker
  const rate = (s, field) => {
    if (s[field] === '' || s[field] == null) return '—';
    return (s.est || []).includes(field) ? `${esc(s[field])} (ประเมิน)` : esc(s[field]);
  };
  const est = (x, f) => (x.est || []).includes(f) ? '≈' : '';
  const priceCell = x => x.price ? `${est(x, 'price')}${baht(x.price)}${x.priceNote ? `<div class="small muted">${esc(x.priceNote)}</div>` : ''}` : '—';
  const link = (url, text) => url ? `<a href="${esc(url)}" target="_blank" rel="noopener">${text}</a>` : '';
  const sources = x => [link(x.officialUrl, 'ผู้ผลิต'), link(x.specSrc, 'หน้าสินค้า'), link(x.shopUrl, 'ร้านไทย'), link(x.bayUrl, 'Badminton Bay'), link(x.clickUrl, 'Badminton Click'), ...(Array.isArray(x.shopLinks) ? x.shopLinks.map(l => link(l.url, esc(l.shop))) : []), link(x.priceSrc !== x.bayUrl && x.priceSrc !== x.clickUrl ? x.priceSrc : '', 'ที่มาราคา'), link(x.source, 'chobbad')].filter(Boolean).join(', ') || '—';

  // ---------- profiles (0–10) ----------
  const R_AXES = ['พลังตบ', 'ความคล่องตัว', 'ควบคุม', 'ตีง่าย', 'รับเอ็นตึง', 'หน้าไม้ไว', 'ต้องมีพื้นฐาน'];
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
      0.45 * (1 - bal) + 0.35 * (1 - w) + 0.2 * fx,
      0.55 * fx + 0.45 * lv,
    ].map(v => Math.round(clamp(v) * 100) / 10);
  }
  const S_AXES = ['แรงดีด', 'ควบคุม', 'ความทน', 'เสียงกระทบ', 'ซับแรง'];
  const S_KEYS = ['repulsion', 'control', 'durability', 'sound', 'shock'];
  const stringProfile = s => S_KEYS.map(k => Number(s[k]) || 0);

  // ---------- small renderers ----------
  function radar(axes, series, size = 340, clickable = false) {
    const c = size / 2, R = size / 2 - 58, n = axes.length;
    const pt = (i, v) => { const a = -Math.PI / 2 + i * 2 * Math.PI / n; return [c + Math.cos(a) * R * v, c + Math.sin(a) * R * v]; };
    const poly = v => axes.map((_, i) => pt(i, typeof v === 'number' ? v : v[i]).map(x => x.toFixed(1)).join(',')).join(' ');
    let g = '';
    g += `<polygon points="${poly(1)}" style="fill:var(--radar-well);stroke:var(--color-rule)"/>`;
    for (const lv of [0.25, 0.5, 0.75]) g += `<polygon points="${poly(lv)}" style="fill:none;stroke:var(--color-rule)"/>`;
    axes.forEach((a, i) => {
      const [x, y] = pt(i, 1), [lx, ly] = pt(i, 1.2);
      const anchor = Math.abs(lx - c) < 4 ? 'middle' : (lx > c ? 'start' : 'end');
      g += `<line x1="${c}" y1="${c}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" style="stroke:var(--color-rule)"/>`;
      g += clickable
        ? `<text class="ax" x="${lx.toFixed(1)}" y="${ly.toFixed(1)}" text-anchor="${anchor}" dominant-baseline="middle" data-axis="${i}" role="button" tabindex="0">${esc(a)}</text>`
        : `<text x="${lx.toFixed(1)}" y="${ly.toFixed(1)}" text-anchor="${anchor}" dominant-baseline="middle">${esc(a)}</text>`;
    });
    // each series also gets its own line style so the three stay apart without colour
    const DASH = ['none', '8 5', '2 4'];
    series.forEach((s, i) => {
      g += `<polygon points="${poly(s.values.map(v => clamp(v / 10)))}" style="fill:${s.color};fill-opacity:.18;stroke:${s.color};stroke-width:2.5;stroke-dasharray:${DASH[i] || 'none'};stroke-linejoin:round"><title>${esc(s.name)}</title></polygon>`;
    });
    series.forEach(s => s.values.forEach((v, i) => {
      const [x, y] = pt(i, clamp(v / 10));
      g += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="5" style="fill:${s.color};stroke:var(--color-paper);stroke-width:2"><title>${esc(s.name)}: ${esc(axes[i])} ${Math.round(v * 10)}</title></circle>`;
    }));
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
      sub: x => [lab(x, 'balance'), L.flex[x.flex], x.weights].filter(Boolean).map(esc).join(', '),
      filters: ['style', 'balance', 'flex', 'level'],
      filterAll: { style: 'ทุกแนวการเล่น', balance: 'ทุกสมดุล', flex: 'ทุกความแข็งก้าน', level: 'ทุกระดับ' },
      sorts: { name: 'เรียงตามชื่อ', year: 'ใหม่สุดก่อน', priceAsc: 'ราคาต่ำ → สูง', priceDesc: 'ราคาสูง → ต่ำ' },
      match: (x, f) => (!f.style || x.style === f.style) && (!f.balance || x.balance === f.balance) && (!f.flex || x.flex === f.flex) && (!f.level || x.level === f.level),
      card: r => `
        ${r.img ? `<img class="thumb" src="${esc(r.img)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : '<div class="thumb" aria-hidden="true"></div>'}
        <span class="tag ${r.style || ''}">${lab(r, 'style') || '—'}</span>
        <div class="nm">${esc(full(r))}</div>
        <div class="meta">${[esc(r.brand), r.year, lab(r, 'level')].filter(Boolean).join(', ')}</div>
        <div class="chips">${[lab(r, 'balance'), L.flex[r.flex], r.weights].filter(Boolean).map(v => `<span>${esc(v)}</span>`).join('')}</div>
        <div class="price">${r.price ? `<b class="fig">${(r.est || []).includes('price') ? '≈' : ''}${baht(r.price)}</b>` : '<span class="small muted">ยังไม่มีราคา</span>'}</div>`,
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
        ['ระดับผู้เล่น', r => lab(r, 'level') || '—'],
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
        ['ราคาประมาณ', priceCell],
        ['หมายเหตุ', r => dash(r.note)],
        ['แหล่งข้อมูล', r => sources(r)],
      ],
    },
    s: {
      title: 'เทียบเอ็นไม้แบด',
      sub: x => esc(gaugeLabel(x)),
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
        ${s.price ? `<div class="price"><b class="fig">${est(s, 'price')}${baht(s.price)}</b></div>` : '<div class="price"><span class="small muted">ยังไม่มีราคา</span></div>'}`,
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
        ['ราคา', priceCell],
        ['หมายเหตุ', s => dash(s.note)],
        ['แหล่งข้อมูล', s => sources(s)],
      ],
    },
    h: {
      title: 'เทียบลูกแบด',
      sub: x => [L.type[x.type], L.grade[x.grade], x.speedText || (x.speed ? 'สปีด ' + x.speed : '')].filter(Boolean).map(esc).join(', '),
      filters: ['type', 'grade', 'spd'],
      filterAll: { type: 'ทุกชนิดขน', grade: 'ทุกเกรด', spd: 'ทุกสปีด' },
      sorts: { name: 'เรียงตามชื่อ', priceAsc: 'ราคาต่ำ → สูง', priceDesc: 'ราคาสูง → ต่ำ' },
      match: (x, f) => (!f.type || x.type === f.type) && (!f.grade || x.grade === f.grade) && (!f.spd || x.spd === f.spd),
      card: h => `
        ${h.img ? `<img class="thumb" src="${esc(h.img)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : '<div class="thumb" aria-hidden="true"></div>'}
        <span class="tag ${h.type === 'nylon' ? 'speed' : h.type === 'goose' ? 'control' : h.type ? 'allround' : ''}">${lab(h, 'type') || '—'}</span>
        <div class="nm">${esc(full(h))}</div>
        <div class="meta">${[lab(h, 'grade'), h.speedText || (h.speed ? 'สปีด ' + h.speed : '')].filter(Boolean).map(esc).join(', ')}</div>
        <div class="meta">${[h.cork, h.perTube ? h.perTube + ' ลูก/หลอด' : ''].filter(Boolean).map(esc).join(', ')}</div>
        ${h.price ? `<div class="price"><b class="fig">${est(h, 'price')}${baht(h.price)}</b> ต่อหลอด</div>` : '<div class="price"><span class="small muted">ยังไม่มีราคา</span></div>'}`,
      radar: null,
      bars: [
        { label: 'ราคาต่อหลอด', hint: 'ราคาร้าน ตรวจอีกที', get: h => Number(h.price) || NaN, fmt: v => baht(v) },
        { label: 'ราคาต่อลูก', get: h => (Number(h.price) && Number(h.perTube)) ? Math.round(h.price / h.perTube) : NaN, fmt: v => baht(v) },
        { label: 'สปีด', hint: 'ยิ่งเลขมาก ลูกยิ่งเร็ว', get: h => Number(h.speed) || NaN, fmt: v => String(v), min: 74, max: 79 },
      ],
      spec: [
        ['แบรนด์', h => esc(h.brand)],
        ['รหัสสินค้า', h => dash(h.code)],
        ['ชนิดขน', h => lab(h, 'type') || '—'],
        ['เกรด', h => lab(h, 'grade') || '—'],
        ['สปีด', h => dash(h.speedText || h.speed)],
        ['หัวคอร์ก', h => dash(h.cork)],
        ['จำนวนต่อหลอด', h => h.perTube ? h.perTube + ' ลูก' : '—'],
        ['ราคาต่อหลอด', priceCell],
        ['หมายเหตุ', h => dash(h.note)],
        ['แหล่งข้อมูล', h => sources(h)],
      ],
    },
    o: {
      title: 'เทียบรองเท้าแบด',
      sub: x => [L.width[x.width], x.weight ? x.weight + ' g' : '', x.code].filter(Boolean).map(esc).join(', '),
      filters: ['width'],
      filterAll: { width: 'ทุกหน้าเท้า' },
      sorts: { name: 'เรียงตามชื่อ', year: 'ใหม่สุดก่อน', priceAsc: 'ราคาต่ำ → สูง', priceDesc: 'ราคาสูง → ต่ำ' },
      match: (x, f) => (!f.width || x.width === f.width),
      card: o => `
        ${o.img ? `<img class="thumb" src="${esc(o.img)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : '<div class="thumb" aria-hidden="true"></div>'}
        <span class="tag ${o.width === 'wide' ? 'control' : o.width ? 'speed' : ''}">${L.width[o.width] || '—'}</span>
        <div class="nm">${esc(full(o))}</div>
        <div class="meta">${[o.brand, o.year, o.weight ? o.weight + ' g' : ''].filter(Boolean).map(esc).join(', ')}</div>
        <div class="meta">${esc((o.cushion || '').split('+')[0].trim())}</div>
        ${o.price ? `<div class="price"><b class="fig">${est(o, 'price')}${baht(o.price)}</b></div>` : '<div class="price"><span class="small muted">ยังไม่มีราคา</span></div>'}`,
      radar: null,
      bars: [
        { label: 'ราคา', hint: 'ราคาร้าน ตรวจอีกที', get: o => Number(o.price) || NaN, fmt: v => baht(v) },
        { label: 'น้ำหนัก', hint: 'ต่อข้าง ยิ่งเบายิ่งคล่อง', get: o => Number(o.weight) || NaN, fmt: v => v + ' g' },
      ],
      spec: [
        ['แบรนด์', o => esc(o.brand)],
        ['รหัสรุ่น', o => dash(o.code)],
        ['ปี', o => dash(o.year)],
        ['หน้าเท้า', o => dash(o.widthText || L.width[o.width])],
        ['พื้นรองเท้า', o => dash(o.sole)],
        ['ระบบกันกระแทก', o => dash(o.cushion)],
        ['วัสดุตัวรองเท้า', o => dash(o.upper)],
        ['น้ำหนัก', o => o.weight ? o.weight + ' g' : '—'],
        ['ไซซ์', o => dash(o.sizes)],
        ['สีที่มี', o => dash(o.colors)],
        ['ราคา', o => o.price ? priceCell(o) : dash(o.priceText)],
        ['จุดเด่น', o => dash(o.note)],
        ['แหล่งข้อมูล', o => sources(o)],
      ],
    },
    k: {
      title: 'เทียบถุงเท้าแบด',
      sub: x => [L.height[x.height], x.pack ? x.pack + ' คู่' : '', x.code].filter(Boolean).map(esc).join(', '),
      filters: ['height'],
      filterAll: { height: 'ทุกความสูง' },
      sorts: { name: 'เรียงตามชื่อ', year: 'ใหม่สุดก่อน', priceAsc: 'ราคาต่ำ → สูง' },
      match: (x, f) => (!f.height || x.height === f.height),
      card: k => `
        ${k.img ? `<img class="thumb" src="${esc(k.img)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : '<div class="thumb" aria-hidden="true"></div>'}
        <span class="tag ${k.height ? 'allround' : ''}">${L.height[k.height] || '—'}</span>
        <div class="nm">${esc(full(k))}</div>
        <div class="meta">${[k.brand, k.year, k.pack ? k.pack + ' คู่' : ''].filter(Boolean).map(esc).join(', ')}</div>
        <div class="meta">${esc(k.material || '')}</div>
        ${k.price ? `<div class="price"><b class="fig">${est(k, 'price')}${baht(k.price)}</b></div>` : '<div class="price"><span class="small muted">ยังไม่มีราคา</span></div>'}`,
      radar: null,
      bars: [
        { label: 'ราคา', hint: 'ราคาร้าน ตรวจอีกที', get: k => Number(k.price) || NaN, fmt: v => baht(v) },
      ],
      spec: [
        ['แบรนด์', k => esc(k.brand)],
        ['รหัสรุ่น', k => dash(k.code)],
        ['ปี', k => dash(k.year)],
        ['ความสูง', k => dash(k.heightText || L.height[k.height])],
        ['ความหนา', k => dash(k.thickness)],
        ['วัสดุ', k => dash(k.material)],
        ['จุดบุกันกระแทก', k => dash(k.cushion)],
        ['ไซซ์', k => dash(k.sizes)],
        ['จำนวนต่อแพ็ก', k => k.pack ? k.pack + ' คู่' : '—'],
        ['สีที่มี', k => dash(k.colors)],
        ['ราคา', k => k.price ? priceCell(k) : dash(k.priceText)],
        ['จุดเด่น', k => dash(k.note)],
        ['แหล่งข้อมูล', k => sources(k)],
      ],
    },
  };

  // ---------- compare views ----------
  const emptyFilter = kind => ({ q: '', brand: '', style: '', balance: '', flex: '', level: '', material: '', gauge: '', type: '', grade: '', spd: '', width: '', height: '', sort: kind === 'r' ? 'year' : 'name' });
  const state = {
    sel: { r: [], s: [], h: [], o: [], k: [] },
    shown: { r: 48, s: 48, h: 48, o: 48, k: 48 },
    rank: { r: null, s: null, h: null, o: null, k: null },
    // the compare sheet opens on request, so picking models never shifts the grid under the pointer
    open: { r: false, s: false, h: false, o: false, k: false },
    f: { r: emptyFilter('r'), s: emptyFilter('s'), h: emptyFilter('h'), o: emptyFilter('o'), k: emptyFilter('k') },
    m: null,
    mg: { kind: 'r', edit: null, q: '' },
  };

  const known = x => ['balance', 'flex', 'weight', 'price', 'level', 'img'].filter(k => x[k] !== '' && x[k] != null && !(x.est || []).includes(k)).length;
  function filtered(kind) {
    const f = state.f[kind], cfg = KIND[kind], q = f.q.trim();
    const list = db[kind].filter(x => (!q || matchScore(x, q) > 0) && (!f.brand || x.brand === f.brand) && cfg.match(x, f));
    const num = (v, d) => (v === '' || v == null || isNaN(v)) ? d : Number(v);
    const sorters = {
      name: sortName,
      // same year: the models with more known specs first, so the first screen is not a wall of blanks
      year: (a, b) => num(b.year, 0) - num(a.year, 0) || known(b) - known(a) || sortName(a, b),
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
    if (state.linkSel) { state.sel[kind] = state.linkSel.split(',').slice(0, 3); state.linkSel = null; state.open[kind] = true; }
    state.sel[kind] = state.sel[kind].filter(id => byId(kind, id));
    const brands = [...new Set(items.map(x => x.brand))].sort();
    const countOf = (key, val) => items.filter(x => key === 'gauge' ? gaugeGroup(x.gauge) === val : x[key] === val).length;
    const sel = (key, map, all) => `<select name="${key}"><option value="">${all}</option>${Object.entries(map)
      .filter(([k]) => countOf(key, k))
      .map(([k, v]) => `<option value="${k}" ${f[key] === k ? 'selected' : ''}>${v} (${countOf(key, k)})</option>`).join('')}</select>`;

    view.innerHTML = `
      <h1>${cfg.title}</h1>
      <p class="muted">กดที่การ์ด 2–3 รุ่น แล้วกดปุ่มเทียบด้านล่าง (≈ คือค่าประเมิน) จากทั้งหมด ${items.length} รุ่น</p>
      <div id="cmp"></div>
      <div class="filters" id="flt">
        <input type="search" name="q" placeholder="ค้นหารุ่น…" value="${esc(f.q)}">
        <select name="brand"><option value="">ทุกแบรนด์</option>${brands.map(b => `<option ${f.brand === b ? 'selected' : ''}>${esc(b)}</option>`).join('')}</select>
        ${cfg.filters.map(k => sel(k, L[k], cfg.filterAll[k])).join('')}
        <select name="sort">${Object.entries(cfg.sorts).map(([k, v]) => `<option value="${k}" ${f.sort === k ? 'selected' : ''}>${v}</option>`).join('')}</select>
        <button class="btn ghost" id="clr" type="button">ล้างตัวกรอง</button>
      </div>
      <div class="tiles" id="tiles"></div>
      <div class="chipbar" id="chips"></div>
      <div class="count muted small" id="cnt"></div>
      <div class="grid" id="grid"></div>
      <div class="more-row"><button class="btn" id="more" type="button" hidden></button></div>`;

    const flt = view.querySelector('#flt');
    flt.addEventListener('input', e => { if (e.target.name) { f[e.target.name] = e.target.value; state.shown[kind] = PAGE; renderGrid(kind); } });
    view.querySelector('#more').onclick = () => { state.shown[kind] += PAGE; renderGrid(kind); };
    view.querySelector('#clr').onclick = () => { state.f[kind] = emptyFilter(kind); state.shown[kind] = PAGE; viewCompare(kind); };
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
    // axis label opens its top 10; flip, close, and a ranked row toggles that model
    const rankAction = el => {
      if (el.dataset.axis != null) {
        state.rank[kind] = { axis: +el.dataset.axis, low: false };
        renderRank(kind);
        view.querySelector('#rank')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      } else if (el.dataset.rk === 'flip') { state.rank[kind].low = !state.rank[kind].low; renderRank(kind); }
      else if (el.dataset.rk === 'close') { state.rank[kind] = null; renderRank(kind); }
      else if (el.dataset.add) toggle(kind, el.dataset.add);
    };
    view.querySelector('#cmp').addEventListener('click', e => {
      const sh = e.target.closest('[data-share]');
      if (sh) {
        const done = () => { sh.textContent = 'คัดลอกแล้ว'; setTimeout(() => { sh.textContent = 'คัดลอกลิงก์เทียบ'; }, 1600); };
        navigator.clipboard?.writeText(location.href).then(done, () => { prompt('คัดลอกลิงก์นี้', location.href); });
        return;
      }
      const el = e.target.closest('[data-axis], [data-rk], [data-add]');
      if (el) { rankAction(el); return; }
      if (e.target.closest('[data-close]')) { state.open[kind] = false; renderCompare(kind); view.querySelector('#flt').scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
      const x = e.target.closest('[data-rm]'); if (x) toggle(kind, x.dataset.rm);
    });
    view.querySelector('#cmp').addEventListener('keydown', e => {
      const el = e.target.closest('[data-axis], [data-add]');
      if (el && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); rankAction(el); }
    });
    // the same filters as chips: a row of buttons per filter (store style) or a sidebar list (app style)
    const chips = view.querySelector('#chips');
    const renderChips = () => {
      const groups = [['brand', 'แบรนด์', Object.fromEntries(brands.map(b => [b, b]))], ...cfg.filters.map(k => [k, cfg.filterAll[k].replace(/^ทุก/, ''), L[k]])];
      chips.innerHTML = groups.map(([key, label, map]) => `
        <div class="chipgroup"><span class="chiplabel">${esc(label)}</span><div class="chiprow">
          <button type="button" class="chip ${f[key] ? '' : 'on'}" data-ck="${key}" data-cv="" aria-pressed="${!f[key]}">ทั้งหมด</button>
          ${Object.entries(map).filter(([k]) => key === 'brand' || countOf(key, k)).map(([k, v]) =>
            `<button type="button" class="chip ${f[key] === k ? 'on' : ''}" data-ck="${key}" data-cv="${esc(k)}" aria-pressed="${f[key] === k}">${esc(v)}</button>`).join('')}
        </div></div>`).join('');
    };
    // shortcut tiles for the first filter (playing style for rackets), shown in the sport layout
    const tiles = view.querySelector('#tiles'), tk = cfg.filters[0];
    const renderTiles = () => {
      tiles.innerHTML = Object.entries(L[tk]).filter(([k]) => countOf(tk, k)).map(([k, v]) =>
        `<button type="button" class="tile ${f[tk] === k ? 'on' : ''}" data-ck="${tk}" data-cv="${esc(k)}" aria-pressed="${f[tk] === k}">
          <span class="tile-nm">${esc(v)}</span><span class="tile-n">${countOf(tk, k)} รุ่น</span></button>`).join('');
    };
    const pick = b => {
      f[b.dataset.ck] = f[b.dataset.ck] === b.dataset.cv ? '' : b.dataset.cv;
      const s = flt.querySelector(`[name="${b.dataset.ck}"]`); if (s) s.value = f[b.dataset.ck];
      state.shown[kind] = PAGE; renderChips(); renderTiles(); renderGrid(kind);
    };
    tiles.addEventListener('click', e => { const b = e.target.closest('[data-ck]'); if (b) pick(b); });
    flt.addEventListener('change', renderTiles);
    renderTiles();
    chips.addEventListener('click', e => {
      const b = e.target.closest('[data-ck]'); if (!b) return;
      pick(b);
    });
    flt.addEventListener('change', renderChips);
    renderChips();
    renderGrid(kind);
    renderCompare(kind);
  }

  const PAGE = 48;
  function renderGrid(kind) {
    const all = filtered(kind), sel = state.sel[kind];
    const list = all.slice(0, state.shown[kind]);
    view.querySelector('#cnt').textContent = all.length > list.length ? `พบ ${all.length} รุ่น แสดง ${list.length} รุ่นแรก` : `พบ ${all.length} รุ่น`;
    const more = view.querySelector('#more');
    const left = all.length - list.length;
    more.hidden = left <= 0;
    more.textContent = `ดูเพิ่มอีก ${Math.min(PAGE, left)} รุ่น (เหลือ ${left})`;
    view.querySelector('#grid').innerHTML = list.length ? list.map(x => `
      <div class="item ${sel.includes(x.id) ? 'sel' : ''}" data-id="${esc(x.id)}" role="checkbox" aria-checked="${sel.includes(x.id)}" tabindex="0">
        ${KIND[kind].card(x)}
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
    if (!sel.length) state.open[kind] = false;
    if (!sel.length || !state.open[kind]) { box.innerHTML = ''; watchSheet(); remember(kind); return; }
    const rd = cfg.radar ? cfg.radar(sel) : null;
    box.innerHTML = `
      <section class="panel">
        <div class="heads" style="grid-template-columns:repeat(${sel.length},minmax(0,1fr))">
          ${sel.map((x, i) => `<div class="head" style="--c:${COLORS[i]}">
            <button class="x" data-rm="${esc(x.id)}" aria-label="เอาออก">×</button>
            <div class="nm">${esc(full(x))}</div>
            <div class="small muted">${KIND[kind].sub(x)}</div>
          </div>`).join('')}
        </div>
        <div class="sheet-tools">
          ${sel.length < 2 ? '<p class="small muted">เลือกเพิ่มอีกอย่างน้อย 1 รุ่นเพื่อเทียบ</p>' : '<span></span>'}
          <span class="tools-r"><button class="btn sm" type="button" data-share>คัดลอกลิงก์เทียบ</button>
          <button class="btn sm ghost" type="button" data-close>ปิดผลเทียบ</button></span>
        </div>
        <div class="two${rd ? '' : ' solo'}">
          ${rd ? `<div class="radar"><h3>${rd.title}</h3>${radar(rd.axes, rd.series, 340, true)}${legend(sel)}<p class="small muted">กดที่ชื่อแกน เพื่อดูว่ารุ่นไหนสุดทางด้านนั้น</p><p class="small muted">${rd.note}</p></div>` : ''}
          <div class="bars"><h3>กราฟเทียบ</h3>${rd ? '' : legend(sel)}${bars(cfg.bars, sel, db[kind])}</div>
        </div>
        <div id="rank"></div>
        <p class="small muted sheet-key">ช่องที่ขึ้น — คือยังไม่มีข้อมูล ช่องที่ไฮไลต์คือค่าที่ต่างกัน ค่าที่มี ≈ คือค่าประเมิน (จากซีรีส์ ราคา หรือความแข็งก้าน) ไม่ใช่ค่าที่ผู้ผลิตประกาศ</p>
        ${specTable(cfg.spec, sel)}
      </section>`;
    renderRank(kind);
    watchSheet();
    remember(kind);
  }

  // ---------- shareable link ----------
  const ROUTE = { r: 'rackets', s: 'strings', h: 'shuttles', o: 'shoes', k: 'socks' };
  function remember(kind) {
    const ids = state.sel[kind];
    history.replaceState(null, '', '#' + ROUTE[kind] + (ids.length ? '?c=' + ids.join(',') : ''));
  }

  // ---------- top 10 per radar axis ----------
  // a model counts only when the specs behind the axis are known (rackets: balance and flex; strings: that rating)
  const rankable = {
    r: x => x.balance && x.flex,
    s: (x, i) => x[S_KEYS[i]] !== '' && x[S_KEYS[i]] != null,
  };
  const profileOf = kind => kind === 'r' ? racketProfile : stringProfile;
  function renderRank(kind) {
    const box = view.querySelector('#rank');
    if (!box) return;
    const rk = state.rank[kind];
    if (rk == null) { box.innerHTML = ''; return; }
    const axes = kind === 'r' ? R_AXES : S_AXES;
    const prof = profileOf(kind);
    const pool = db[kind].filter(x => rankable[kind](x, rk.axis)).map(x => ({ x, v: Math.round(prof(x)[rk.axis] * 10) }));
    pool.sort((a, b) => rk.low ? a.v - b.v : b.v - a.v);
    const top = pool.slice(0, 10), sel = state.sel[kind];
    box.innerHTML = `
      <section class="rank" aria-live="polite">
        <div class="rank-head">
          <h3>${esc(axes[rk.axis])}, ${rk.low ? 'ต่ำสุด' : 'สูงสุด'} 10 อันดับ</h3>
          <button class="btn sm" type="button" data-rk="flip">${rk.low ? 'สลับดูสูงสุด' : 'สลับดูต่ำสุด'}</button>
          <button class="btn sm ghost x-btn" type="button" data-rk="close" aria-label="ปิด">×</button>
        </div>
        <ol class="rank-list">${top.map((o, i) => `
          <li class="${sel.includes(o.x.id) ? 'sel' : ''}" data-add="${esc(o.x.id)}" role="button" tabindex="0">
            <span class="pos pos-${i + 1}">${i + 1}</span>
            <span class="nm">${esc(full(o.x))}</span>
            <span class="track"><span class="fill" style="width:${o.v}%"></span></span>
            <b class="fig">${o.v}</b>
          </li>`).join('')}</ol>
        <p class="small muted">นับจาก ${pool.length} รุ่นที่มีข้อมูลพอ กดชื่อรุ่นเพื่อเพิ่มหรือเอาออกจากการเทียบ คะแนนคำนวณจากสเปก ไม่ใช่คะแนนผู้ผลิต</p>
      </section>`;
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
    tray.innerHTML = `<span class="picks">${state.sel[kind].map((id, i) => {
        const x = byId(kind, id);
        return `<span class="pick" style="--c:${COLORS[i]}"><span class="pn">${esc(x ? x.name : id)}</span><button type="button" data-rm="${esc(id)}" aria-label="เอา ${esc(x ? full(x) : id)} ออก">×</button></span>`;
      }).join('')}</span>
      <button class="btn primary sm" data-a="go">${n < 2 ? 'ดูข้อมูล' : `เทียบ ${n} รุ่น`}</button>
      <button class="btn ghost sm" data-a="clear">ล้าง</button>`;
    tray.onclick = e => {
      const rm = e.target.closest('[data-rm]');
      if (rm) { toggle(kind, rm.dataset.rm); return; }
      const a = e.target.closest('[data-a]')?.dataset.a;
      if (a === 'go') { state.open[kind] = true; renderCompare(kind); view.querySelector('#cmp').scrollIntoView({ behavior: 'smooth', block: 'start' }); }
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
  // Matching rules, from docs/research/matching-logic.md (confidence in brackets).
  // Tension band per level [medium: retailer and stringer tables; no manufacturer table exists]
  const LVL_BAND = { beginner: [19, 23, 21], intermediate: [22, 26, 24], advanced: [25, 29, 27], pro: [28, 32, 29] };
  // What a player at each level should value in a string [medium: S1, S3]
  const LEVEL_W = {
    beginner: { durability: 0.35, shock: 0.25, repulsion: 0.25, control: 0.15 },
    intermediate: { repulsion: 0.3, control: 0.3, durability: 0.2, shock: 0.2 },
    advanced: { repulsion: 0.35, control: 0.4, sound: 0.15, shock: 0.1 },
    pro: { repulsion: 0.35, control: 0.45, sound: 0.15, shock: 0.05 },
  };
  // Style leaning [medium: S4, thin/repulsive strings suit attack and speed, control and shock suit control]
  const STYLE_W = {
    attack: { repulsion: 0.5, control: 0.3, sound: 0.2 },
    speed: { repulsion: 0.5, control: 0.25, sound: 0.25 },
    control: { control: 0.6, shock: 0.2, repulsion: 0.2 },
    allround: { repulsion: 0.3, control: 0.3, shock: 0.2, durability: 0.2 },
  };
  const S_NAME = { repulsion: 'แรงดีด', control: 'การควบคุม', durability: 'ความทน', sound: 'เสียงกระทบ', shock: 'การซับแรง' };

  // The score is three parts, each 0–100: the string for this player, the racket for this player, and the racket with the string.
  const PARTS = [['player', 'เอ็นกับผู้เล่น', 0.45], ['racket', 'ไม้กับผู้เล่น', 0.3], ['pair', 'ไม้กับเอ็น', 0.25]];
  const norm = t => String(t || '').toLowerCase().replace(/[^a-z0-9]/g, '');

  function score(r, s, level, style, shuttle = 'feather', climate = 'normal') {
    const reasons = [];
    const ok = t => reasons.push(['ok', t]);
    const wn = t => reasons.push(['wn', t]);
    const lv = ordIdx('level', level, 1);
    const low = lv <= 1; // beginner or intermediate
    const g = Number(s.gauge) || 0.66;
    const bal = r.balance, fx = ordIdx('flex', r.flex, 1);
    // a string without ratings gets them from its gauge (thin = repulsive and fragile, thick = durable)
    const gk = g <= 0.63 ? 0 : g >= 0.68 ? 2 : 1;
    const GAUGE_R = { repulsion: [8, 7, 5], control: [7, 7, 6], durability: [4, 6, 9], sound: [8, 6, 5], shock: [5, 6, 7] };
    const sr = k => Number(s[k]) || GAUGE_R[k][gk];
    const shock = sr('shock'), rep = sr('repulsion');

    // 1. string for the player: half what the level needs, half what the style wants
    const W = {};
    for (const [k, w] of Object.entries(LEVEL_W[level])) W[k] = (W[k] || 0) + w / 2;
    for (const [k, w] of Object.entries(STYLE_W[style])) W[k] = (W[k] || 0) + w / 2;
    const fit = Object.entries(W).reduce((a, [k, w]) => a + w * sr(k), 0);
    let pP = (fit - 4) * 20; // fit 6.5 of 10 -> 50, 9 -> 100
    const best = Object.keys(W).sort((a, b) => W[b] * sr(b) - W[a] * sr(a))[0];
    if (fit >= 7.5) ok(`เอ็นเด่นเรื่อง${S_NAME[best]} ซึ่ง${L.level[level]}สาย${L.style[style]}ให้ความสำคัญ`);
    else if (fit < 6.2) wn(`คุณสมบัติเอ็นไม่ค่อยตรงกับ${L.level[level]}สาย${L.style[style]}`);
    // gauge for beginners [high direction: thin strings break sooner]
    if (level === 'beginner' && g <= 0.63) { pP -= 12; wn('เอ็นบาง ขาดง่าย มือใหม่ควรเริ่มที่ 0.66–0.70'); }
    else if (level === 'beginner' && g >= 0.66) { pP += 5; ok('เอ็นขนาดกลางถึงหนา เหมาะกับมือใหม่'); }
    if (level === 'beginner' && sr('durability') >= 8) { pP += 8; ok('เอ็นทนทาน คุ้มสำหรับมือใหม่ที่ตีบ่อย'); }
    // advanced players trade durability for feel [medium: S3]
    if (lv >= 2 && g >= 0.68) { pP -= 6; wn('เอ็นหนา ทนแต่ความรู้สึกและแรงดีดน้อยกว่าที่ผู้เล่นระดับนี้มักต้องการ'); }

    // 2. racket for the player, from its specs first: balance against the style, shaft and weight against the level;
    // the maker's style and level labels count too, at half weight where this data estimated them
    let pR = 55;
    const rEst = r.est || [];
    const BAL_FIT = { attack: { 'head-heavy': 12, even: 4, 'head-light': -8 }, speed: { 'head-light': 12, even: 6, 'head-heavy': -6 },
      control: { even: 10, 'head-light': 6, 'head-heavy': -4 }, allround: { even: 10, 'head-light': 4, 'head-heavy': 4 } };
    const bf = BAL_FIT[style][bal];
    if (bf != null) {
      pR += rEst.includes('balance') ? bf / 2 : bf;
      if (bf >= 10) ok(`${L.balance[bal]} เหมาะกับสาย${L.style[style]}`);
      else if (bf < 0) wn(`${L.balance[bal]} ไม่ค่อยเข้ากับสาย${L.style[style]}`);
    }
    if (r.flex) {
      const ideal = [0.3, 1, 2, 2.5][lv], gap = Math.abs(fx - ideal);   // flexible 0 .. extra-stiff 3
      if (gap <= 0.5) { pR += 10; ok(`${L.flex[r.flex]} เหมาะกับ${L.level[level]}`); }
      else if (gap >= 1.5) { pR -= gap >= 2.5 ? 25 : 15; wn(fx > ideal ? `${L.flex[r.flex]} ต้องใช้แรงสวิงมากสำหรับ${L.level[level]}` : `${L.flex[r.flex]} อาจนิ่มไปสำหรับ${L.level[level]}`); }
      else pR -= 2;
    }
    const g8 = Number(r.weight) || 0;
    if (g8 && lv <= 1 && g8 >= 87) { pR -= 8; wn(`ไม้หนัก (${g8} g) สวิงเหนื่อยสำหรับ${L.level[level]} ลองรุ่น 4U หรือ 5U`); }
    else if (g8 && lv === 0 && g8 <= 84) pR += 4;
    if (r.style) {
      const sf = r.style === style ? 10 : (r.style === 'allround' || style === 'allround') ? 4 : -8;
      pR += rEst.includes('style') ? sf / 2 : sf;
      if (r.style === style) ok(`ไม้เป็นสาย${L.style[r.style]} ตรงกับสไตล์ที่เลือก`);
      else if (sf < 0) wn(`ไม้วางตัวเป็นสาย${L.style[r.style]} แต่เลือกสไตล์${L.style[style]}`);
    }
    const d = ordIdx('level', r.level, -9) - lv, half = rEst.includes('level') ? 0.5 : 1;
    if (d === 0) { pR += 10 * half; if (half === 1) ok(`ผู้ผลิตทำไม้รุ่นนี้สำหรับ${L.level[r.level]} ตรงกับระดับที่เลือก`); }
    else if (d === 1) { pR -= 4 * half; if (half === 1) wn(`ไม้ทำมาสำหรับ${L.level[r.level]} สูงกว่าระดับที่เลือกหนึ่งขั้น`); }
    else if (d >= 2) { pR -= 18 * half; wn(`ไม้สำหรับ${L.level[r.level]}${half < 1 ? ' (ประเมินจากราคา)' : ''} อาจตีหนักมือสำหรับ${L.level[level]}`); }
    else if (d === -1) pR -= 4 * half;
    else if (d <= -2 && d > -9) { pR -= (d <= -3 ? 30 : 18) * half; wn(`ไม้สำหรับ${L.level[r.level]} อาจไม่ตอบโจทย์${L.level[level]}`); }

    // 3. racket with string [low: judgement, no published pairing tables]
    let pS = 60;
    if (r.recString && norm(s.name).length >= 3 && norm(r.recString).includes(norm(s.name))) { pS += 25; ok('ผู้ผลิตหรือร้านแนะนำเอ็นนี้คู่กับไม้รุ่นนี้'); }
    if (fx >= 2 && shock >= 7) { pS += 15; ok('เอ็นซับแรงช่วยลดแรงสะเทือนจากก้านแข็ง'); }
    if (fx >= 2 && shock <= 4 && low) { pS -= 20; wn('ก้านแข็งกับเอ็นแข็ง อาจสะเทือนข้อมือสำหรับระดับนี้'); }
    if (bal === 'head-heavy' && low && g <= 0.63) { pS -= 20; wn('ไม้หัวหนักกับเอ็นบาง สะเทือนและขาดง่ายสำหรับระดับนี้'); }
    if ((bal === 'head-light' || fx === 0) && (style === 'attack' || style === 'speed') && rep >= 8 && g <= 0.65) {
      pS += 15; ok('ไม้หัวเบาหรือก้านอ่อน ได้เอ็นบางดีดสูงช่วยเพิ่มแรงส่ง');
    }
    if (fx === 0 && style === 'control' && sr('control') >= 8) { pS += 10; ok('ก้านอ่อนกับเอ็นคุมลูกดี เหมาะกับการเล่นคอนโทรล'); }

    // tension: start at the level default, nudge, keep inside the band, then inside the racket and string limits.
    // Each step is kept so the page can show how the number was reached.
    const [bLo, bHi, bDef] = LVL_BAND[level];
    const steps = [[`ค่าเริ่มของ${L.level[level]}`, bDef]];
    let t = bDef;
    const nudge = (dv, why) => { if (dv) { t += dv; steps.push([why, dv]); } };
    if (style === 'control') nudge(level === 'pro' ? 2 : 1, 'สายคอนโทรล ตึงขึ้นเพื่อคุมลูก');              // [medium] higher = more control
    else if ((style === 'attack' || style === 'speed') && low) nudge(-1, 'สายบุก/สปีดระดับนี้ หย่อนลงให้ดีดง่าย'); // [medium] lower = more rebound
    if (g <= 0.63) nudge(-1, 'เอ็นบาง ขาดง่ายเมื่อตึงสูง');                                                  // [medium]
    if (level === 'beginner' && (fx >= 2 || bal === 'head-heavy')) nudge(-1, 'ไม้ต้องใช้แรงอยู่แล้ว');       // [low]
    const inBand = clamp(t, bLo, bHi);
    if (inBand !== t) { steps.push([`ให้อยู่ในช่วงของ${L.level[level]}`, inBand - t]); t = inBand; }
    if (climate === 'hot') nudge(1, 'สนามร้อนชื้น (ความเชื่อของช่าง ยังไม่มีหลักฐานยืนยัน)');               // [low, T7]
    if (shuttle === 'nylon') nudge(-2, 'ลูกไนลอน');                                                          // [medium, two sources]
    const [tmin, tmax] = r.tension || [null, 30];
    const cap = Math.min(tmax || 30, Number(s.tensionMax) || 99);
    if (t > cap - 1) {                                                            // [low, convention] keep a 1 lb margin
      steps.push([`ต่ำกว่าเพดาน ${cap} lbs ของ${(tmax || 30) <= (Number(s.tensionMax) || 99) ? 'ไม้' : 'เอ็น'} 1 ปอนด์`, cap - 1 - t]);
      t = cap - 1;
      if (cap - 1 < bLo) { pS -= 15; wn(`เพดาน ${cap} lbs ต่ำกว่าช่วงที่${L.level[level]}มักใช้ (${bLo}–${bHi} lbs)`); }
    }
    if (tmin && t < tmin) { steps.push([`ไม่ต่ำกว่าค่าต่ำสุดของไม้ ${tmin} lbs`, Math.min(tmin, cap) - t]); t = Math.min(tmin, cap); }
    if (low && shock <= 4 && t >= bHi) wn('เอ็นแข็งที่ตึงสูง อาจสะเทือนข้อมือ ลองลดลง 1–2 ปอนด์');

    const parts = { player: Math.round(clamp(pP, 0, 100)), racket: Math.round(clamp(pR, 0, 100)), pair: Math.round(clamp(pS, 0, 100)) };
    let total = PARTS.reduce((a, [k, , w]) => a + w * parts[k], 0);
    // a racket far off the player cannot be rescued by a good string: three levels apart, or a frame that cannot
    // take the level's tension (a 20 lb aluminium frame for a pro), caps the whole score
    if ((d <= -3 && d > -9 && half === 1) || cap < bLo - 3) {
      total = Math.min(total, 50);
      wn(cap < bLo - 3 ? `ไม้รับเอ็นได้แค่ ${cap} lbs ต่ำกว่าที่${L.level[level]}ใช้มาก ไม่เหมาะกับระดับนี้` : `ไม้สำหรับ${L.level[r.level]} ห่างจากระดับ${L.level[level]}มาก`);
    }

    // how sure: the inputs that weigh most, counted when they are estimates or missing
    const guess = [];
    const sEst = s.est || [];
    Object.entries(W).filter(([, w]) => w >= 0.1).forEach(([k]) => { if (sEst.includes(k) || s[k] === '' || s[k] == null) guess.push(`${S_NAME[k]}ของเอ็น`); });
    [['style', 'แนวของไม้'], ['level', 'ระดับของไม้'], ['balance', 'สมดุลไม้'], ['flex', 'ความแข็งก้าน']].forEach(([k, n]) => {
      if (rEst.includes(k) || !r[k]) guess.push(n);
    });
    if (!r.tension) guess.push('ความตึงสูงสุดของไม้');
    const conf = guess.length <= 1 ? 'สูง' : guess.length <= 3 ? 'ปานกลาง' : 'ต่ำ';

    return { score: Math.round(clamp(total, 0, 100)), parts, tension: t, steps, band: [bLo, bHi], range: [tmin, tmax], reasons, conf, guess };
  }
  const verdict = n => n >= 80 ? ['เข้ากันดีมาก', 'var(--color-accent)'] : n >= 65 ? ['เข้ากันดี', 'var(--color-accent)'] : n >= 50 ? ['พอใช้ได้', 'var(--color-ink)'] : ['ไม่ค่อยเหมาะ', 'var(--color-bad)'];

  function viewMatch() {
    if (!state.m) {
      const pick = (kind, id) => (byId(kind, id) || [...db[kind]].sort(sortName)[0] || {}).id;
      state.m = { r: pick('r', 'yonex-astrox-99-game'), s: pick('s', 'yonex-bg66-ultimax'), level: 'intermediate', style: 'attack', shuttle: 'feather', climate: 'normal' };
    }
    if (!db.r.length || !db.s.length) { view.innerHTML = '<h1>จับคู่ไม้ + เอ็น</h1><p class="empty">ต้องมีข้อมูลไม้และเอ็นอย่างน้อยอย่างละ 1 รายการ</p>'; return; }
    if (!byId('r', state.m.r)) state.m.r = db.r[0].id;
    if (!byId('s', state.m.s)) state.m.s = db.s[0].id;
    const seg = (key, label, map) => `<div class="mseg"><span class="mseg-l">${label}</span><div class="mseg-b" role="group" aria-label="${label}">${
      Object.entries(map).map(([k, v]) => `<button type="button" data-k="${key}" data-v="${k}" aria-pressed="${(state.m[key] || '') === k}">${v}</button>`).join('')}</div></div>`;

    view.innerHTML = `
      <h1>จับคู่ไม้ + เอ็น</h1>
      <p class="muted">เลือกไม้กับเอ็น บอกระดับและสไตล์ แล้วดูว่าเข้ากันแค่ไหนและควรขึ้นกี่ปอนด์</p>
      <div class="mpick">
        <div class="mcard" id="pick-r"></div>
        <span class="mplus" aria-hidden="true">+</span>
        <div class="mcard" id="pick-s"></div>
      </div>
      <div class="msegs" id="mopts">
        ${seg('level', 'ระดับมือ', L.level)}
        ${seg('style', 'สไตล์', L.style)}
        ${seg('shuttle', 'ลูกที่ใช้', { feather: 'ขนไก่/ขนเป็ด', nylon: 'ไนลอน' })}
        ${seg('climate', 'สนาม', { normal: 'ปกติ/ห้องแอร์', hot: 'ร้อนชื้น' })}
      </div>
      <div id="mres"></div>`;

    // each picker: the chosen item as a card, and a search box that lists matches with their pictures
    const card = kind => {
      const x = byId(kind, state.m[kind]);
      const spec = kind === 'r'
        ? [L.style[x.style], lab(x, 'balance'), L.flex[x.flex], x.weights, x.tension ? '≤ ' + x.tension[1] + ' lbs' : ''].filter(Boolean)
        : [gaugeLabel(x), L.material[x.material], x.tensionMax ? '≤ ' + x.tensionMax + ' lbs' : ''].filter(Boolean);
      const bars = kind === 's' ? `<div class="mbars">${S_KEYS.map((k, i) => `<span class="mbar"><span>${S_AXES[i]}</span><i style="--w:${(Number(x[k]) || 0) * 10}"></i></span>`).join('')}</div>` : '';
      view.querySelector('#pick-' + kind).innerHTML = `
        <span class="mcard-k">${kind === 'r' ? 'ไม้แบด' : 'เอ็น'}</span>
        <div class="mcard-in">
          ${x.img ? `<img src="${esc(x.img)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : '<div class="mimg-empty" aria-hidden="true"></div>'}
          <div class="mcard-t"><div class="mcard-b">${esc(x.brand)}</div><div class="mcard-n">${esc(x.name)}</div>
            <div class="mcard-s">${spec.map(esc).join(', ')}</div>${bars}
            <div class="mcard-p">${x.price ? est(x, 'price') + baht(x.price) : ''}</div></div>
        </div>
        <div class="msearch"><input type="search" placeholder="${kind === 'r' ? 'ค้นหาไม้รุ่นอื่น เช่น astrox 99' : 'ค้นหาเอ็นรุ่นอื่น เช่น bg80'}" aria-label="ค้นหา${kind === 'r' ? 'ไม้' : 'เอ็น'}" data-q="${kind}"><div class="mlist" role="listbox" hidden></div></div>`;
    };
    const search = (kind, q) => {
      const list = view.querySelector(`#pick-${kind} .mlist`);
      if (!q.trim()) { list.hidden = true; return; }
      const hits = searchList(db[kind], q).slice(0, 8);
      list.innerHTML = hits.length ? hits.map(x => `<button type="button" role="option" data-pick="${kind}:${esc(x.id)}">
          ${x.img ? `<img src="${esc(x.img)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : '<span class="mimg-empty"></span>'}<span>${esc(full(x))}</span></button>`).join('')
        : '<div class="mlist-empty">ไม่พบรุ่นนี้</div>';
      list.hidden = false;
    };
    const choose = (kind, id) => { state.m[kind] = id; card(kind); renderMatch(); };
    ['r', 's'].forEach(card);
    view.querySelector('.mpick').addEventListener('input', e => { if (e.target.dataset.q) search(e.target.dataset.q, e.target.value); });
    view.querySelector('.mpick').addEventListener('keydown', e => {
      if (e.key === 'Enter' && e.target.dataset.q) { const first = view.querySelector(`#pick-${e.target.dataset.q} .mlist [data-pick]`); if (first) { e.preventDefault(); first.click(); } }
      if (e.key === 'Escape' && e.target.dataset.q) { e.target.value = ''; search(e.target.dataset.q, ''); }
    });
    view.querySelector('.mpick').addEventListener('click', e => {
      const b = e.target.closest('[data-pick]'); if (!b) return;
      const [kind, id] = b.dataset.pick.split(':'); choose(kind, id);
    });
    view.querySelector('#mopts').addEventListener('click', e => {
      const b = e.target.closest('[data-k]'); if (!b) return;
      state.m[b.dataset.k] = b.dataset.v;
      b.parentElement.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', x === b));
      renderMatch();
    });
    view.querySelector('#mres').addEventListener('click', e => {
      const a = e.target.closest('[data-pick]'); if (!a) return;
      const [kind, id] = a.dataset.pick.split(':'); choose(kind, id);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
    renderMatch();
  }

  function renderMatch() {
    const { level, style } = state.m, shuttle = state.m.shuttle || 'feather', climate = state.m.climate || 'normal';
    const r = byId('r', state.m.r), s = byId('s', state.m.s);
    const res = score(r, s, level, style, shuttle, climate);
    const [vt, vc] = verdict(res.score);
    const allS = db.s.filter(x => x.id !== s.id).map(x => ({ x, ...score(r, x, level, style, shuttle, climate) })).sort((a, b) => b.score - a.score || a.guess.length - b.guess.length);
    const altR = db.r.filter(x => x.id !== r.id).map(x => ({ x, ...score(x, s, level, style, shuttle, climate) })).sort((a, b) => b.score - a.score || a.guess.length - b.guess.length).slice(0, 4);
    const good = allS.filter(a => a.score >= (allS[0] ? allS[0].score - 10 : 0));
    const top = (list, f) => list.length ? list.reduce((a, b) => f(b) > f(a) ? b : a) : null;
    const goals = [
      ['เข้ากันที่สุด', allS[0]],
      ['ดีดที่สุด', top(good, a => Number(a.x.repulsion) || 0)],
      ['คุมลูกที่สุด', top(good, a => Number(a.x.control) || 0)],
      ['ทนที่สุด', top(good, a => Number(a.x.durability) || 0)],
      ['คุ้มที่สุด', top(good.filter(a => Number(a.x.price) > 0), a => a.score / Number(a.x.price))],
    ].filter(([, a]) => a).reduce((acc, [tag, a]) => {
      const hit = acc.find(([, b]) => b.x.id === a.x.id);
      if (hit) hit[0] += ', ' + tag; else acc.push([tag, a]);
      return acc;
    }, []);
    const altCard = (a, kind, tag) => `
      <button type="button" class="malt" data-pick="${kind}:${esc(a.x.id)}">
        ${a.x.img ? `<img src="${esc(a.x.img)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : '<span class="mimg-empty"></span>'}
        <span class="malt-t">${tag ? `<span class="malt-tag">${esc(tag)}</span>` : ''}<span class="malt-n">${esc(full(a.x))}</span>
          <span class="malt-m">${kind === 's' ? [gaugeLabel(a.x), a.x.price ? baht(a.x.price) : ''].filter(Boolean).map(esc).join(', ') : [L.style[a.x.style], L.level[a.x.level]].filter(Boolean).join(', ')}</span></span>
        <span class="malt-s"><b class="fig">${a.score}</b><span>คะแนน</span><span class="fig">${a.tension} lbs</span></span>
      </button>`;
    // the tension scale: 16-36 lbs, the level's band shaded, the racket's ceiling marked
    const lo = 16, hi = 36, pos = v => ((v - lo) / (hi - lo) * 100).toFixed(1);
    const cap = Math.min(res.range[1] || 30, Number(s.tensionMax) || 99);
    const ok = res.reasons.filter(x => x[0] === 'ok'), wn = res.reasons.filter(x => x[0] === 'wn');
    const sign = v => v > 0 ? '+' + v : String(v);

    view.querySelector('#mres').innerHTML = `
      <section class="mhero">
        <div class="mscore">
          <div class="ring" style="--p:${res.score};--rc:${vc}"><div>${res.score}</div></div>
          <div class="mscore-t">
            <div class="verdict">${vt}</div>
            <div class="parts">${PARTS.map(([k, n, w]) => `
              <div class="part"><span>${n} <span class="muted">${Math.round(w * 100)}%</span></span><span class="bar"><i style="--w:${res.parts[k]}"></i></span><b class="fig">${res.parts[k]}</b></div>`).join('')}
            </div>
            <p class="small muted">ความมั่นใจ: <b>${res.conf}</b>${res.guess.length ? `, ค่าประเมิน: ${esc(res.guess.join(', '))}` : ''}</p>
          </div>
        </div>
        <div class="mten">
          <div class="mten-k">ความตึงที่แนะนำ</div>
          <div class="tension">${res.tension} <span>lbs</span></div>
          <div class="mscale" aria-hidden="true">
            <span class="mscale-band" style="left:${pos(res.band[0])}%;width:${(pos(res.band[1]) - pos(res.band[0])).toFixed(1)}%"></span>
            <span class="mscale-cap" style="left:${pos(cap)}%"></span>
            <span class="mscale-dot" style="left:${pos(res.tension)}%"></span>
          </div>
          <div class="mscale-l small muted"><span>${lo}</span><span>ช่วง${L.level[level]} ${res.band[0]}–${res.band[1]}, เพดาน ${cap}</span><span>${hi}</span></div>
          <ul class="steps">${res.steps.map(([why, v], i) => `<li><span>${esc(why)}</span><b class="fig">${i ? sign(v) : v}</b></li>`).join('')}</ul>
        </div>
      </section>
      <section class="mwhy">
        <div><h3>ทำไมเข้ากัน</h3><ul class="reasons">${ok.map(([, t]) => `<li><span class="ok">✓</span><span>${esc(t)}</span></li>`).join('') || '<li class="muted">ไม่มีจุดเด่นเป็นพิเศษ</li>'}</ul></div>
        <div><h3>ข้อควรระวัง</h3><ul class="reasons">${wn.map(([, t]) => `<li><span class="wn">!</span><span>${esc(t)}</span></li>`).join('') || '<li class="muted">ไม่มีข้อควรระวัง</li>'}</ul></div>
      </section>
      <h2>เอ็นที่น่าลองกับไม้นี้</h2>
      <div class="malts">${goals.map(([tag, a]) => altCard(a, 's', tag)).join('')}</div>
      <h2>ไม้ที่เข้ากับเอ็นนี้และสไตล์ของคุณ</h2>
      <div class="malts">${altR.map(a => altCard(a, 'r')).join('')}</div>
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
    const [v0, qs] = location.hash.slice(1).split('?');
    const v = v0 || 'rackets';
    state.linkSel = new URLSearchParams(qs || '').get('c');
    document.querySelectorAll('#tabs a').forEach(a => a.classList.toggle('on', a.dataset.v === v));
    tray.hidden = true;
    view.onclick = null;
    if (v === 'strings') viewCompare('s');
    else if (v === 'shuttles') viewCompare('h');
    else if (v === 'shoes') viewCompare('o');
    else if (v === 'socks') viewCompare('k');
    else if (v === 'match') viewMatch();
    else if (v === 'manage') viewManage();
    else viewCompare('r');
    window.scrollTo(0, 0);
  }
  window.addEventListener('hashchange', route);
  route();

  // style picker: the layout lives on <html data-style>, remembered on this device only
  const styleSel = document.getElementById('style');
  if (styleSel) {
    styleSel.value = document.documentElement.dataset.style || '';
    styleSel.addEventListener('change', () => {
      const t = styleSel.value;
      const d = document.documentElement;
      if (t) d.dataset.style = t; else delete d.dataset.style;
      try { t ? localStorage.setItem('style', t) : localStorage.removeItem('style'); } catch (e) {}
      // the sport layout brings its black-and-white palette when no theme was picked
      let saved = null; try { saved = localStorage.getItem('theme'); } catch (e) {}
      if (!saved) { if (t === 'sport') d.dataset.theme = 'mono'; else delete d.dataset.theme; }
      if (themeSel) themeSel.value = d.dataset.theme || '';
    });
  }

  // theme picker: the choice lives on <html data-theme>, remembered on this device only
  const themeSel = document.getElementById('theme');
  if (themeSel) {
    themeSel.value = document.documentElement.dataset.theme || '';
    themeSel.addEventListener('change', () => {
      const t = themeSel.value;
      if (t) document.documentElement.dataset.theme = t; else delete document.documentElement.dataset.theme;
      try { t ? localStorage.setItem('theme', t) : localStorage.removeItem('theme'); } catch (e) {}
    });
  }
})();
