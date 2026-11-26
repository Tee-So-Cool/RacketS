(() => {
  'use strict';

  // ---------- data ----------
  const KEYS = { r: 'rs.rackets.v1', s: 'rs.strings.v1', h: 'rs.shuttles.v1', o: 'rs.shoes.v1', k: 'rs.socks.v1' };
  const EDIT_KEYS = { r: 'rs.rackets.v2', s: 'rs.strings.v2' };
  const BASE = { r: window.RACKETS || [], s: window.STRINGS || [], h: window.SHUTTLES || [], o: window.SHOES || [], k: window.SOCKS || [] };
  const clone = v => JSON.parse(JSON.stringify(v));
  const sameField = (a, b) => JSON.stringify(a ?? '') === JSON.stringify(b ?? '');
  const edits = {};
  const storedEdits = {};
  const legacy = new Map();
  const pendingLegacy = new Set();
  const catalogSources = new Map(Object.entries({
    year: ['yearSrc'],
    price: ['priceSrc', 'priceNote'],
    tension: ['tensionByWeight', 'tensionNote', 'tensionSrc'],
  }));

  function catalogDelta(base, rows, hidden = []) {
    const defaults = new Map(base.map(item => [item.id, item]));
    const visible = new Set(rows.map(item => item.id));
    const added = [], changed = [];
    for (const item of rows) {
      const original = defaults.get(item.id);
      if (!original) { added.push(item); continue; }
      const fields = Object.keys(item).filter(key => key !== 'id' && !sameField(item[key], original[key]));
      if (fields.length) changed.push({ item, fields });
    }
    const removed = [...new Set([...hidden, ...defaults.keys()])].filter(id => !visible.has(id));
    return { added, changed, removed };
  }

  function applyCatalogDelta(base, { added, changed, removed }) {
    const hidden = new Set(removed);
    const rows = new Map(base.filter(item => !hidden.has(item.id)).map(item => [item.id, item]));
    for (const { item, fields } of changed) {
      if (hidden.has(item.id)) continue;
      const original = rows.get(item.id);
      const patch = Object.fromEntries(fields.map(key => [key, item[key]]));
      if (original) {
        if (original.est || Object.hasOwn(patch, 'est')) {
          patch.est = [...(original.est || []).filter(field => !fields.includes(field)),
            ...(item.est || []).filter(field => fields.includes(field))];
        }
        for (const field of fields) {
          for (const dependent of catalogSources.get(field) || []) {
            if (!Object.hasOwn(patch, dependent)) patch[dependent] = undefined;
          }
        }
      }
      rows.set(item.id, original ? { ...original, ...patch, id: original.id } : item);
    }
    for (const item of added) if (!hidden.has(item.id)) rows.set(item.id, item);
    return clone([...rows.values()]);
  }

  function migrateCatalog(base, snapshot, reference) {
    const defaults = new Map(base.map(item => [item.id, item]));
    const visible = new Set(snapshot.map(item => item.id));
    const published = new Set(reference.first);
    let bestMatches = -1, removed = [];
    for (const [introduced, retired] of [[[], []], ...(reference.revisions || [])]) {
      for (const id of retired) published.delete(id);
      for (const id of introduced) published.add(id);
      const absent = [...published].filter(id => !visible.has(id));
      const matches = published.size - absent.length;
      // An absent ID alone cannot distinguish a deletion from an older catalog.
      if (matches > bestMatches || (matches === bestMatches && absent.length < removed.length)) {
        bestMatches = matches;
        removed = absent;
      }
    }
    const added = [], changed = [];
    for (const item of snapshot) {
      const original = defaults.get(item.id);
      const known = reference.values[item.id];
      const fields = reference.fields.filter((key, index) => Object.hasOwn(item, key) &&
        !sameField(item[key], original?.[key]) && !known?.[index]?.some(value => sameField(item[key], value)));
      if (!original) {
        if (!known || fields.length) added.push(item);
      } else if (fields.length) changed.push({ item, fields });
    }
    return { added, changed, removed };
  }

  const officialTension = new Map(BASE.r.filter(r => r.tensionByWeight).map(r => [r.id, r]));

  function updateSavedTension(rackets) {
    return rackets.map(r => {
      const source = officialTension.get(r.id);
      if (!source || r.brand !== source.brand) return r;
      const gainedLabels = source.tensionSrc && !r.tensionSrc && r.tensionNote &&
        r.tension?.[1] === source.tension[1] && Object.keys(r.tensionByWeight || {}).length === 0;
      if (r.tensionByWeight && !gainedLabels) return r;
      const stricter = Number(r.tension?.[1]) > 0 && r.tension[1] < source.tension[1];
      if (stricter) return { ...r, tensionNote: '', tensionByWeight: {} };
      return { ...r, tension: clone(source.tension), tensionByWeight: clone(source.tensionByWeight),
        tensionNote: source.tensionNote, tensionSrc: source.tensionSrc, est: (r.est || []).filter(f => f !== 'tension') };
    });
  }

  function load(kind) {
    const parse = raw => { try { return JSON.parse(raw); } catch { return null; } };
    try {
      const cache = localStorage.getItem(KEYS[kind]);
      const editKey = EDIT_KEYS[kind];
      if (!editKey) {
        const items = parse(cache);
        return Array.isArray(items) ? items : clone(BASE[kind]);
      }
      if (cache?.trimStart().startsWith('[')) legacy.set(kind, { cache });
      const raw = localStorage.getItem(editKey);
      const saved = parse(raw);
      storedEdits[kind] = raw;
      if (saved && ['added', 'changed', 'removed'].every(key => Array.isArray(saved[key]))) {
        try {
          const rows = applyCatalogDelta(BASE[kind], saved);
          edits[kind] = saved;
          return rows;
        } catch (e) {}
      }
      if (legacy.has(kind)) {
        const items = parse(cache);
        if (Array.isArray(items) && items.every(item => typeof item?.id === 'string')) {
          legacy.get(kind).items = items;
          pendingLegacy.add(kind);
        }
      }
    } catch (e) {}
    return clone(BASE[kind]);
  }
  const db = { r: load('r'), s: load('s'), h: load('h'), o: load('o'), k: load('k') };

  function storeCatalog(kind, delta) {
    const encoded = JSON.stringify(delta);
    try {
      if (localStorage.getItem(EDIT_KEYS[kind]) !== storedEdits[kind] ||
          (pendingLegacy.has(kind) && localStorage.getItem(KEYS[kind]) !== legacy.get(kind).cache)) return false;
      localStorage.setItem(EDIT_KEYS[kind], encoded);
    } catch { return false; }
    storedEdits[kind] = encoded;
    edits[kind] = delta;
    return true;
  }

  function persist(kind, items, hidden = edits[kind]?.removed || []) {
    return saveCatalog(kind, catalogDelta(BASE[kind], items, hidden));
  }

  function saveCatalog(kind, delta) {
    if (pendingLegacy.has(kind)) { alert('โหลดข้อมูลสำหรับย้ายรายการเดิมไม่สำเร็จ ลองรีเฟรชหรือ Export ชุดเดิม'); return false; }
    if (storeCatalog(kind, delta)) {
      db[kind] = applyCatalogDelta(BASE[kind], delta);
      return true;
    }
    alert('บันทึกไม่ได้ ข้อมูลในเบราว์เซอร์อาจเต็มหรือเปลี่ยนจากแท็บอื่น');
    return false;
  }

  function isCustom(kind) {
    return pendingLegacy.has(kind) || Boolean(edits[kind] && ['added', 'changed', 'removed'].some(key => edits[kind][key].length));
  }

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
    head: { large: 'หน้าไม้กว้าง', standard: 'หน้าไม้มาตรฐาน', small: 'หน้าไม้เล็ก' },
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
  // no photograph: a tile of the same size as the others, with the brand's first letters, so a row of cards stays level
  const noPhoto = x => `<div class="thumb ph" aria-hidden="true"><span>${esc(String(x.brand || '?').slice(0, 2))}</span></div>`;
  const baht = n => (n || n === 0) && n !== '' ? '฿' + Number(n).toLocaleString('th-TH') : '—';
  const dash = v => (v === '' || v == null) ? '—' : esc(v);
  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const full = x => `${x.brand} ${x.name}`;

  // ---------- search: forgiving about spacing, hyphens, roman numerals, model codes, brand spellings and one typo ----------
  const ALIAS = [[/\bli[\s-]?ning\b|หลี่หนิง|หลีหนิง/g, 'lining'], [/\bhndrd\b|ฮันเดรด/g, 'hundred'], [/\bfz\b|ฟอร์ซ่า/g, 'forza'], [/โยเน็กซ์|โยเนกซ์/g, 'yonex'], [/วิคเตอร์|วิกเตอร์/g, 'victor'],
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
  const codeKey = value => String(value).normalize('NFKD').toLowerCase().replace(/[^a-z0-9]/g, '');
  const ROMAN_GENERATION = { II: 2, III: 3, IV: 4 };
  const tokensOf = x => {
    let t = searchIndex.get(x);
    if (!t) {
      const aliases = Array.isArray(x.aliases) ? x.aliases : [];
      const names = [x.name, ...aliases].filter(Boolean).map(name => {
        const label = snorm(name), fullLabel = snorm(`${x.brand} ${name}`);
        return { label, fullLabel, words: fullLabel.split(' '), compact: fullLabel.replace(/ /g, '') };
      });
      // A Roman numeral after a model identifier is a search hint. A lone series name
      // followed by a number (Tectonic III, for example) need not be a generation.
      const roman = x.name.normalize('NFKC').match(/^(.+?)\b(II|III|IV)\b/i);
      const romanGeneration = roman && /[\d ]/.test(roman[1].trim()) ? ROMAN_GENERATION[roman[2].toUpperCase()] : 0;
      const codes = x.modelCode ? [codeKey(x.modelCode), codeKey(`${x.brand} ${x.modelCode}`)] : [];
      t = { names, generation: x.generation || romanGeneration, codes };
      searchIndex.set(x, t);
    }
    return t;
  };
  // 0 = no match; higher = better. Every query word must start a word of the name (or sit inside its compact form, or be one typo off)
  const matchName = ({ words, compact }, qs, exactNumbers) => {
    // "blade x 900": a lone letter joins the word before it when the name writes them as one ("bladex")
    qs = qs.reduce((acc, w) => { const last = acc[acc.length - 1];
      if (last && /^[a-z]$/.test(w) && !words.includes(w) && words.some(v => v.startsWith(last + w))) acc[acc.length - 1] = last + w; else acc.push(w);
      return acc; }, []);
    let sc = 0;
    for (const w of qs) {
      if (words.includes(w)) sc += 3;
      else if (exactNumbers && /^\d+$/.test(w)) return 0;
      else if (words.some(v => v.startsWith(w))) sc += 2;
      else if (w.length >= 3 && compact.includes(w)) sc += 1;
      else if (words.some(v => near(w, v))) sc += 1;
      else return 0;
    }
    return sc;
  };
  function searchQuery(q) {
    const normalized = snorm(q);
    const generation = normalized.match(/\b(?:gen(?:eration)?|mk|mark) (\d+)\b/) ||
      normalized.match(/\b(\d+) (?:st|nd|rd|th) gen(?:eration)?\b/);
    const remaining = generation ? normalized.replace(generation[0], ' ').replace(/ +/g, ' ').trim() : normalized;
    const codeOnly = /(?:^|\s)\d*[a-z]{1,4}\s*\d+[a-z]{0,2}\s*-\s*[a-z0-9]{1,4}$/i.test(String(q).trim());
    return { text: remaining, words: remaining.split(' ').filter(Boolean), code: codeKey(q), codeOnly, generation: generation ? Number(generation[1]) : 0 };
  }
  function matchScore(x, query) {
    const item = tokensOf(x);
    if (query.generation && query.generation !== item.generation) return 0;
    // Product codes are exact, so an older AX99-P cannot match the newer 3AX99-P.
    if (query.code && item.codes.includes(query.code)) return query.words.length * 3 + 1;
    if (query.codeOnly) return 0;
    if (!query.words.length) return 1;
    if (item.names.some(name => name.label === query.text || name.fullLabel === query.text)) return query.words.length * 3 + 1;
    return item.names.reduce((best, name) => Math.max(best, matchName(name, query.words, query.generation > 0)), 0);
  }
  const searchList = (list, q) => {
    const query = searchQuery(q);
    return list.map(x => [x, matchScore(x, query)]).filter(([, s]) => s > 0).sort((a, b) => b[1] - a[1]).map(([x]) => x);
  };
  const byId = (kind, id) => db[kind].find(x => x.id === id);
  const ordIdx = (k, v, fallback) => { const i = ORD[k].indexOf(v); return i < 0 ? fallback : i; };
  const gaugeLabel = s => s.gaugeText || (s.gauge ? `${s.gauge} mm` : '—');
  const gaugeGroup = g => !g ? '' : g <= 0.63 ? 'thin' : g < 0.68 ? 'mid' : 'thick';
  const sortName = (a, b) => full(a).localeCompare(full(b));
  // label for an enum field, with a marker when the value is a series-based estimate (r.est)
  // a racket's level can be a range (level..levelTo) where its sources print one, e.g. "intermediate - advanced"
  const lvLo = r => ordIdx('level', r.level, -1);
  const lvHi = r => { const lo = lvLo(r), hi = ordIdx('level', r.levelTo, lo); return lo < 0 ? -1 : Math.max(lo, hi); };
  const lvText = r => {
    const a = L.level[r.level] || '', b = lvHi(r) > lvLo(r) ? L.level[r.levelTo] : '';
    return b ? `${a}–${a.startsWith('ระดับ') ? b.replace(/^ระดับ/, '') : b}` : a;
  };
  const lab = (r, field) => {
    const v = field === 'level' ? lvText(r) : L[field][r[field]];
    if (!v) return '';
    return (r.est || []).includes(field) ? `≈${v}` : v;
  };
  // string rating cell, same estimate marker
  const rate = (s, field) => {
    if (s[field] === '' || s[field] == null) return '—';
    return (s.est || []).includes(field) ? `${esc(s[field])} (ประเมิน)` : esc(s[field]);
  };
  const est = (x, f) => (x.est || []).includes(f) ? '≈' : '';
  const estimatedValue = (x, f, value = x[f]) => value ? est(x, f) + value : '';
  const priceCell = x => x.price ? `${est(x, 'price')}${baht(x.price)}${x.priceNote ? `<div class="small muted">${esc(x.priceNote)}</div>` : ''}` : '—';
  // Shopee's own search for the model; no price is read from it
  const shopee = x => `<a class="btn sm ghost" href="https://shopee.co.th/search?keyword=${encodeURIComponent(full(x))}" target="_blank" rel="noopener">ค้นใน Shopee</a>`;
  function shareLink(btn, label) {
    const url = location.href, done = () => { btn.textContent = 'คัดลอกแล้ว'; setTimeout(() => { btn.textContent = label; }, 1600); };
    if (navigator.share && matchMedia('(pointer: coarse)').matches) { navigator.share({ title: document.title, url }).catch(() => {}); return; }
    navigator.clipboard?.writeText(url).then(done, () => { prompt('คัดลอกลิงก์นี้', url); });
  }
  const link = (url, text) => /^https?:\/\//i.test(url || '') ? `<a href="${esc(url)}" target="_blank" rel="noopener">${text}</a>` : '';
  const sources = x => [link(x.officialUrl, 'ผู้ผลิต'), link(x.specSrc, 'หน้าสินค้า'), link(x.yearSrc, 'ที่มาปี'), link(x.tensionSrc, 'ที่มาเพดานเอ็น'), link(x.shopUrl, 'ร้านไทย'), link(x.bayUrl, 'Badminton Bay'), link(x.clickUrl, 'Badminton Click'), ...(Array.isArray(x.shopLinks) ? x.shopLinks.map(l => link(l.url, esc(l.shop))) : []), link(x.priceSrc !== x.bayUrl && x.priceSrc !== x.clickUrl ? x.priceSrc : '', 'ที่มาราคา'), link(x.source, 'chobbad'), link(x.wordSrc, 'คำบรรยายจากผู้ผลิต')].filter(Boolean).join(', ') || '—';

  // ---------- profiles (0–10) ----------
  // What a racket's named technologies claim to do, read from the makers' and retailers' own descriptions
  // (docs/research/matching-logic.md, "Technology"). These are marketing claims, so the match gives them a
  // small, capped weight and never lets them change the tension.
  const TECH = [
    ['sweet', /isometric|enlarged sweet|dynamic-optimum/i, 'หัวทรงเหลี่ยม/ขยายจุดหวาน ตีไม่โดนกลางหน้าไม้ก็ยังไปได้'],
    ['shock', /free core|mucell|solid foam|wing stabili[sz]er|solid feel core/i, 'ซับแรงสะเทือน ถนอมข้อมือ'],
    ['stable', /power box|box frame|aero\+?box|hard cored|nano fortify|anti.?tors|anti twist|built-in t|embedded t/i, 'เฟรมต้านการบิด หน้าไม้นิ่ง คุมทิศทางง่าย'],
    ['aero', /aero(?!\+?box)|wind cutting|wind tearing|slim shaft|68 shaft|ultra-thin shaft|super slim/i, 'เฟรมหรือก้านลดแรงต้านลม สวิงไว'],
    ['rebound', /nanomesh|super ?elastic|whipping enhance|energy boost|power assist bumper|high resilience/i, 'วัสดุหรือโครงสร้างเพิ่มแรงดีด ส่งลูกไกลง่าย'],
    ['counter', /rotational generator|counterbalanced/i, 'ถ่วงน้ำหนักที่ด้ามและหัว ไม้หัวหนักแต่สะบัดคล่องขึ้น'],
  ];
  const techTags = r => TECH.filter(([, re]) => re.test(r.tech || '')).map(([k, , txt]) => [k, txt]);
  const R_AXES = ['พลังตบ', 'ความคล่องตัว', 'ควบคุม', 'ตีง่าย', 'รับเอ็นตึง', 'หน้าไม้ไว', 'ต้องมีพื้นฐาน'];
  // Balance as a position 0-1 for the radar: its class (head-light 0, even .5, head-heavy 1) and, where the balance point
  // is known in mm, a nudge of up to .15 either way by how far it sits from the typical point of that class in this data
  // (10 mm = the full nudge). Sources draw the class lines in different places, so mm only refines within a class.
  let bpMed = null, bpMedN = -1;
  const classBp = () => {
    if (bpMedN === db.r.length) return bpMed;
    const by = {};
    for (const x of db.r) if (Number(x.bp) && x.balance && !(x.est || []).includes('balance')) (by[x.balance] = by[x.balance] || []).push(Number(x.bp));
    bpMed = Object.fromEntries(Object.entries(by).filter(([, v]) => v.length >= 5).map(([k, v]) => [k, v.sort((a, b) => a - b)[v.length >> 1]]));
    bpMedN = db.r.length; return bpMed;
  };
  const balPos = r => {
    const b = ordIdx('balance', r.balance, 1) / 2, m = classBp()[r.balance], p = Number(r.bp);
    return m && p ? clamp(b + 0.15 * clamp((p - m) / 10, -1, 1)) : b;
  };
  // The radar's seven axes. An input a racket lacks (balance, flex, level, weight, max tension, style) is left out and the
  // axis re-weighted over the inputs it has; an axis with under half of its weight known is null: not drawn, not ranked, not
  // compared. Nothing is filled with a middle value, which would plot as a fact. (Head size is published by no maker, so it
  // is the same middle value for every racket and only shifts all of them alike.)
  function racketProfile(r) {
    const bal = ordIdx('balance', r.balance, -1) < 0 ? null : balPos(r);
    const fx = ordIdx('flex', r.flex, -1) < 0 ? null : ordIdx('flex', r.flex, 0) / 3;
    const lv = lvLo(r) < 0 ? null : (lvLo(r) + lvHi(r)) / 2 / 3;   // the middle of a range
    const w = Number(r.weight) > 0 ? clamp((Number(r.weight) - 74) / 16) : null;
    // 18-40 lbs: 20-lb starter frames still register, and the 205 frames rated 32 lbs or more (VS and Felet go to 38-42)
    // stay apart instead of all hitting the edge
    const tmax = r.tension && Number(r.tension[1]) > 0 ? clamp((Number(r.tension[1]) - 18) / 22) : null;
    const st = { attack: 0.3, speed: 0.4, control: 1, allround: 0.7 }[r.style] ?? null;
    const hd = { large: 1, standard: 0.5, small: 0 }[r.head] ?? 0.5;  // a larger string bed has a larger sweet spot
    const inv = v => v == null ? null : 1 - v;
    const mix = (terms, need) => {
      let s = 0, k = 0;
      for (const [wt, v] of terms) if (v != null) { s += wt * v; k += wt; }
      return k >= need - 1e-9 ? s / k : null;
    };
    const easy = mix([[0.45, inv(fx)], [0.3, inv(lv)], [0.1, inv(w)]], 0.45);
    return [
      mix([[0.4, bal], [0.3, fx], [0.3, w]], 0.5),  // a stiff shaft and a heavier frame add power, not only a heavy head
      mix([[0.65, inv(bal)], [0.35, inv(w)]], 0.5),
      mix([[0.35, st], [0.2, bal == null ? null : 1 - Math.abs(bal - 0.5) * 2], [0.3, fx], [0.15, inv(bal)]], 0.5),  // stiff shafts aim truer; light heads steer at the net
      easy == null ? null : 0.85 * easy + 0.15 * hd,
      tmax,
      mix([[0.45, inv(bal)], [0.35, inv(w)], [0.2, fx]], 0.5),
      mix([[0.55, fx], [0.45, lv]], 0.5),
    ].map(v => v == null ? null : Math.round(clamp(v) * 100) / 10);
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
      g += `<polygon class="rs" points="${s.values.map((v, k) => v == null ? null : pt(k, clamp(v / 10)).map(x => x.toFixed(1)).join(',')).filter(Boolean).join(' ')}" style="fill:${s.color};fill-opacity:.18;stroke:${s.color};stroke-width:2.5;stroke-dasharray:${DASH[i] || 'none'};stroke-linejoin:round"><title>${esc(s.name)}</title></polygon>`;
    });
    series.forEach(s => s.values.forEach((v, i) => {
      if (v == null) return;
      const [x, y] = pt(i, clamp(v / 10));
      g += `<circle class="rd" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="5" style="fill:${s.color};stroke:var(--color-paper);stroke-width:2"><title>${esc(s.name)}: ${esc(axes[i])} ${Math.round(v * 10)}</title></circle>`;
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

  function specTable(rows, sel, rackets = false) {
    const head = `<thead><tr><th scope="col">สเปก</th>${sel.map((x, i) => `<th scope="col" style="--c:${COLORS[i]}">${rackets ? compareRacketHead(x) : esc(full(x))}</th>`).join('')}</tr></thead>`;
    const renderRows = list => list.map(([label, fn]) => compareSpecRow(label, sel.map((x, i) => fn(x, sel[0], i)))).join('');
    const body = rackets ? [
      racketSpecGroup('ขึ้นเอ็น', compareTensionRow(sel) + compareWeightRows(sel) + compareMarketRow(sel), sel.length),
      ...rows.map(([label, list]) => racketSpecGroup(label, renderRows(list), sel.length)),
    ].join('') : `<tbody>${renderRows(rows)}</tbody>`;
    const region = rackets ? ' tabindex="0" role="region" aria-label="ตารางเทียบสเปกไม้แบด"' : '';
    return `<div class="tbl-wrap"${region}><table class="spec" data-columns="${sel.length}">${head}${body}</table></div>`;
  }

  function compareSpecRow(label, cells, values = cells) {
    const same = cells.length > 1 && new Set(values).size < 2;
    return `<tr${same ? ' class="same"' : ''}><th scope="row">${esc(label)}</th>${cells.map(cell => `<td${cells.length > 1 && !same ? ' class="diff"' : ''}>${cell}</td>`).join('')}</tr>`;
  }

  function racketSpecGroup(label, rows, columns) {
    return `<tbody class="compare-group"><tr class="compare-section"><th scope="rowgroup" colspan="${columns + 1}">${esc(label)}</th></tr>${rows}</tbody>`;
  }

  // ---------- kind configs ----------
  const KIND = {
    r: {
      title: 'เทียบไม้แบด',
      sub: x => [lab(x, 'balance'), lab(x, 'flex'), estimatedValue(x, 'weights')].filter(Boolean).map(esc).join(', '),
      filters: ['style', 'balance', 'flex', 'level'],
      filterAll: { style: 'ทุกแนวการเล่น', balance: 'ทุกสมดุล', flex: 'ทุกความแข็งก้าน', level: 'ทุกระดับ' },
      sorts: { auto: 'อัตโนมัติ', name: 'ชื่อรุ่น', year: 'ใหม่สุดก่อน', priceAsc: 'ราคาต่ำ → สูง', priceDesc: 'ราคาสูง → ต่ำ' },
      match: (x, f) => (!f.style || x.style === f.style) && (!f.balance || x.balance === f.balance) && (!f.flex || x.flex === f.flex) && (!f.level || (f.level === 'none' ? lvLo(x) < 0 : lvLo(x) <= ordIdx('level', f.level, -2) && ordIdx('level', f.level, -2) <= lvHi(x))),
      card: (r, pick) => `
        <div class="racket-photo">${r.img ? `<img class="thumb" src="${esc(r.img)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : noPhoto(r)}</div>
        <div class="racket-card-body">
          <div class="meta">${[r.brand, estimatedValue(r, 'year')].filter(Boolean).map(esc).join(' / ')}</div>
          <h2 class="nm">${esc(r.name)}</h2>
          ${r.modelCode ? `<div class="racket-code">${esc(r.modelCode)}</div>` : ''}
          <div class="chips">${[estimatedValue(r, 'weights'), lab(r, 'balance'), lab(r, 'flex')].filter(Boolean).map(v => `<span>${esc(v)}</span>`).join('')}</div>
          <div class="price">${r.price ? `<b class="fig">${est(r, 'price')}${baht(r.price)}</b>` : '<span class="small muted">ยังไม่มีราคา</span>'}${thaiRacketListing(r) ? '<span class="small muted">มีหน้าร้านไทย</span>' : ''}</div>
          <div class="racket-card-actions">${pick}<button class="btn sm ghost" type="button" data-who="${esc(r.id)}" aria-label="ดูข้อมูล ${esc(full(r))}">ดูข้อมูล</button></div>
        </div>`,
      radar: sel => ({ axes: R_AXES, series: sel.map((x, i) => ({ name: full(x), color: COLORS[i], values: racketProfile(x) })), title: 'ภาพรวมบุคลิกไม้', note: 'คำนวณจากสเปก (สมดุล ก้าน น้ำหนัก ระดับ ความตึงสูงสุด และจุดสมดุลเป็น mm เมื่อมี) ไม่ใช่คะแนนจากผู้ผลิต' }),
      bars: [
        { label: 'น้ำหนัก', hint: 'หนักมีแรงส่ง เบาสวิงไว', get: r => Number(r.weight) || NaN, fmt: (v, r) => estimatedValue(r, 'weight', v + ' g') },
        { label: 'ราคา', hint: 'ราคาประมาณ เช็กร้านอีกที', get: r => Number(r.price) || NaN, fmt: (v, r) => estimatedValue(r, 'price', baht(v)) },
      ],
      spec: [
        ['น้ำหนักและฟีลไม้', [
          ['เวตที่มี', r => dash(estimatedValue(r, 'weights'))],
          ['น้ำหนักอ้างอิง', r => r.weight ? dash(estimatedValue(r, 'weight', r.weight + ' g')) : '—'],
          ['สมดุล', r => lab(r, 'balance') || '—'],
          ['จุดสมดุล', (r, first) => Number(r.bp) ? `${esc(r.bp)} mm${racketNumericDifference(r, first, 'bp', 'mm')}` : '—'],
          ['ความแข็งก้าน', r => lab(r, 'flex') || '—'],
          ['ขนาดด้ามที่ระบุ', r => dash(r.grips)],
          ['แนวการเล่น', r => lab(r, 'style') || '—'],
          ['ระดับผู้เล่น', r => lab(r, 'level') || 'ไม่ระบุ'],
        ]],
        ['โครงสร้างและวัสดุ', [
          ['วัสดุเฟรม', r => dash(r.frame)],
          ['วัสดุก้าน', r => dash(r.shaft)],
          ['ข้อต่อเฟรม-ก้าน', r => dash(r.joint)],
          ['ความยาว', r => dash(r.length)],
          ['ขนาดหน้าไม้', r => L.head[r.head] || '—'],
          ['ผังเอ็น', r => dash(r.pattern)],
          ['เอ็นที่ผู้ผลิตแนะนำ', r => dash(r.recString)],
          ['เทคโนโลยีช่วยเรื่อง', r => { const t = techTags(r); return t.length ? t.map(([, x]) => esc(x)).join('<br>') + '<div class="small muted">ตามคำอธิบายของผู้ผลิต</div>' : '—'; }],
          ['เทคโนโลยี', r => dash(r.tech)],
        ]],
        ['ราคาและที่มา', [
          ['ราคาประมาณ', (r, first) => priceCell(r) + racketNumericDifference(r, first, 'price', 'บาท')],
          ['หน้าร้านไทย', r => link(thaiRacketListing(r), 'ดูหน้าสินค้า') || '—'],
          ['ปีที่ออก', r => dash(estimatedValue(r, 'year')) + (r.year && r.yearSrc ? `<div class="small">${link(r.yearSrc, 'ที่มาของปี')}</div>` : '')],
          ['แบรนด์', r => esc(r.brand)],
          ['ผลิตที่', r => dash(r.madeIn)],
          ['นักกีฬาที่ใช้', r => dash(r.players)],
          ['หมายเหตุ', r => dash(r.note)],
          ['แหล่งข้อมูล', r => sources(r)],
        ]],
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
        ${s.img ? `<img class="thumb" src="${esc(s.img)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : noPhoto(s)}
        <span class="tag">${esc(gaugeLabel(s))}</span>
        <div class="nm">${esc(full(s))}</div>
        <div class="meta">${esc(L.material[s.material] || '')}</div>
        <div class="meta">ดีด ${dash(s.repulsion)}, คุม ${dash(s.control)}, ทน ${dash(s.durability)}</div>
        ${s.price ? `<div class="price"><b class="fig">${est(s, 'price')}${baht(s.price)}</b></div>` : '<div class="price"><span class="small muted">ยังไม่มีราคา</span></div>'}
        <div class="card-acts">${shopee(s)}</div>`,
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
        ['ผู้ผลิตบอกว่า', s => [{ repulsion: 'เน้นแรงดีด', control: 'เน้นควบคุม', durability: 'เน้นทน' }[s.feature], { soft: 'นุ่ม', medium: 'กลาง', hard: 'แข็ง' }[s.feel]].filter(Boolean).join(', ') || '—'],
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
        ${h.img ? `<img class="thumb" src="${esc(h.img)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : noPhoto(h)}
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
        ${o.img ? `<img class="thumb" src="${esc(o.img)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : noPhoto(o)}
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
        ${k.img ? `<img class="thumb" src="${esc(k.img)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : noPhoto(k)}
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
  const emptyFilter = kind => ({ q: '', brand: '', style: '', balance: '', flex: '', level: '', variant: '', thaiShop: '', material: '', gauge: '', type: '', grade: '', spd: '', width: '', height: '', sort: kind === 'r' ? 'auto' : 'name' });
  const state = {
    sel: { r: [], s: [], h: [], o: [], k: [] },
    compareWeights: new Map(),
    shown: { r: 48, s: 48, h: 48, o: 48, k: 48 },
    rank: { r: null, s: null, h: null, o: null, k: null },
    // the compare sheet opens on request, so picking models never shifts the grid under the pointer
    open: { r: false, s: false, h: false, o: false, k: false },
    f: { r: emptyFilter('r'), s: emptyFilter('s'), h: emptyFilter('h'), o: emptyFilter('o'), k: emptyFilter('k') },
    m: null,
    hotSpan: 'current',
    mg: { kind: 'r', edit: null, q: '' },
  };

  const known = x => ['balance', 'flex', 'weight', 'price', 'level', 'img'].filter(k => x[k] !== '' && x[k] != null && !(x.est || []).includes(k)).length;
  function thaiRacketListing(racket) {
    const urls = [racket.shopUrl, ...(Array.isArray(racket.shopLinks) ? racket.shopLinks.map(listing => listing?.url) : [])];
    return urls.find(value => {
      if (!value || !/^https?:\/\//i.test(value)) return false;
      let url;
      try { url = new URL(value); } catch { return false; }
      const host = url.hostname.replace(/^www\./, '');
      if (host === 'badmintonplaza.com') return /^\d+$/.test(url.searchParams.get('products_id') || '');
      if (host === 'shopee.co.th') return /^\/product\/\d+\/\d+\/?$|[.-]i\.\d+\.\d+\/?$/i.test(url.pathname);
      return host.endsWith('.co.th') && /[^/]/.test(url.pathname) && !/^\/(?:search|category|collections?)(?:\/|$)/i.test(url.pathname);
    }) || '';
  }
  const racketFilterKeys = ['variant', 'thaiShop'];
  const racketMatchesFilters = (r, f) => (!f.variant || statedWeights(r).includes(f.variant) || Object.hasOwn(r.tensionByWeight || {}, f.variant)) &&
    (!f.thaiShop || thaiRacketListing(r));
  function filtered(kind) {
    const f = state.f[kind], cfg = KIND[kind], q = f.q.trim();
    const query = searchQuery(q);
    const list = db[kind].filter(x => (!q || matchScore(x, query) > 0) && (!f.brand || x.brand === f.brand) && cfg.match(x, f) && (kind !== 'r' || racketMatchesFilters(x, f)));
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
    const automatic = q ? (a, b) => matchScore(b, query) - matchScore(a, query) || sorters.year(a, b) : sorters.year;
    return list.sort(f.sort === 'auto' ? automatic : sorters[f.sort] || sortName);
  }

  // numbers that count up when they first appear (skipped when the visitor asked for less motion)
  const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  function countUp(root) {
    if (!root || reduceMotion() || document.hidden) return;
    root.querySelectorAll('[data-count]').forEach((el, i) => {
      const to = Number(el.dataset.count), t0 = performance.now() + i * 90, dur = 1000;
      el.textContent = '0';
      // frames stop when the tab is hidden mid-count: the right number is set regardless, shortly after the count should end
      setTimeout(() => { el.textContent = to.toLocaleString('th-TH'); }, dur + i * 90 + 250);
      const step = now => {
        const k = Math.min(1, Math.max(0, (now - t0) / dur));
        el.textContent = Math.round(to * (1 - Math.pow(1 - k, 3))).toLocaleString('th-TH');
        if (k < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
  }
  // the opening scene of a gear page: three real products on tiles, one per slot; the ids are products whose photographs read well
  // on a tile (clean grounds, strong colour); if one is gone from the data, the next product with a photograph stands in
  const HERO = {
    s: { title: 'เลือกเอ็น<em>ที่ใช่</em>', ids: ['hundred-jp-58-magnite', 'kizuna-z65x', 'li-ning-ns95'] },
    h: { title: 'เลือกลูกแบด<em>ที่ใช่</em>', ids: ['apacs-aero-space-808', 'apacs-aero-space-900', 'apacs-aero-space-909'] },
    o: { title: 'เลือกรองเท้า<em>ที่ใช่</em>', ids: ['asics-gel-rocket-11', 'asics-powerbreak-ff', 'asics-court-control-ff-4'] },
    k: { title: 'เลือกถุงเท้า<em>ที่ใช่</em>', ids: ['vs-1226', 'li-ning-balance-socks', 'apacs-l-027-v'] },
  };
  function heroArt(kind, items) {
    const used = new Set(), cards = [];
    for (const id of HERO[kind].ids) {
      const x = items.find(y => y.id === id && y.img) || items.find(y => y.img && !used.has(y.id));
      if (x) { used.add(x.id); cards.push(x); }
    }
    const slot = ['attack', 'speed', 'control'];   // the three tiles' tints and places
    return `<div class="hero-art" aria-hidden="true">${cards.map((x, i) => `<span class="hcard ${slot[i]}" style="--i:${i}"><img src="${esc(x.img)}" alt="" referrerpolicy="no-referrer"><span class="hn">${esc(full(x))}</span></span>`).join('')}</div>`;
  }
  function viewCompare(kind) {
    view.classList.toggle('has-hero', !!HERO[kind]);
    const rackets = kind === 'r';
    view.classList.toggle('racket-catalog', rackets);
    const cfg = KIND[kind], f = state.f[kind], items = db[kind];
    if (state.linkSel) {
      const { ids, weights } = compareSelection(state.linkSel, state.linkWeights, id => byId(kind, id));
      state.sel[kind] = ids;
      if (rackets) state.compareWeights = weights;
      state.linkSel = null;
      state.open[kind] = true;
    }
    state.sel[kind] = state.sel[kind].filter(id => byId(kind, id));
    const brands = [...new Set(items.map(x => x.brand))].sort();
    const countOf = (key, val) => items.filter(x => key === 'gauge' ? gaugeGroup(x.gauge) === val : x[key] === val).length;
    const sel = (key, map, all) => `<select name="${key}" aria-label="${all.replace(/^ทุก/, '')}"><option value="">${all}</option>${Object.entries(map)
      .filter(([k]) => countOf(key, k))
      .map(([k, v]) => `<option value="${k}" ${f[key] === k ? 'selected' : ''}>${v} (${countOf(key, k)})</option>`).join('')}${key === 'level' && items.some(x => !x.level) ? `<option value="none" ${f[key] === 'none' ? 'selected' : ''}>ไม่ระบุ (${items.filter(x => !x.level).length})</option>` : ''}</select>`;
    const searchInput = `<input type="search" name="q" placeholder="${rackets ? 'ค้นหาชื่อรุ่นหรือรหัสสินค้า' : 'ค้นหารุ่น…'}" aria-label="ค้นหารุ่น" value="${esc(f.q)}">`;
    const searchIcon = '<svg class="s-ic" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>';
    const filterButton = controls => `<button class="btn ghost fl-toggle" id="flt-toggle" type="button" aria-expanded="false" aria-controls="${controls}">ตัวกรอง<span class="fl-n" id="fl-n" hidden></span></button>`;
    const brandSelect = `<select name="brand" aria-label="แบรนด์"><option value="">ทุกแบรนด์</option>${brands.map(b => `<option ${f.brand === b ? 'selected' : ''}>${esc(b)}</option>`).join('')}</select>`;
    const specFilters = cfg.filters.map(k => sel(k, L[k], cfg.filterAll[k])).join('');
    const sortSelect = `<select name="sort" aria-label="เรียงตาม">${Object.entries(cfg.sorts).map(([k, v]) => `<option value="${k}" ${f.sort === k ? 'selected' : ''}>${v}</option>`).join('')}</select>`;
    const clearButton = '<button class="btn ghost" id="clr" type="button">ล้างตัวกรอง</button>';
    const filters = rackets ? `<div class="filters catalog-filters" id="flt" data-open="false">
        <div class="catalog-search"><div class="catalog-search-field">${searchIcon}${searchInput}</div>${filterButton('catalog-refine')}</div>
        <div class="catalog-refine" id="catalog-refine" hidden>
          ${brandSelect}
          <select name="variant" aria-label="เวตไม้"><option value="">ทุกเวต</option>${['2U', '3U', '4U', '5U', '6U', '7U', '8U', 'U', 'F'].map(weight => `<option${f.variant === weight ? ' selected' : ''}>${weight}</option>`).join('')}</select>
          ${specFilters}
          <label class="catalog-thai"><input type="checkbox" name="thaiShop" value="1"${f.thaiShop ? ' checked' : ''}> มีหน้าร้านไทย</label>
          ${clearButton}
        </div>
        <div class="tiles" id="tiles" role="group" aria-label="แนวการเล่น"></div>
          <div class="catalog-results"><div class="count muted small" id="cnt"></div><label><span>เรียงตาม</span>${sortSelect}</label></div>
      </div>` : `<div class="filters" id="flt" data-open="false">
        ${searchIcon}${searchInput}${filterButton('flt')}${brandSelect}${specFilters}${sortSelect}${clearButton}
      </div><div class="tiles" id="tiles"></div><div class="count muted small" id="cnt"></div>`;

    view.innerHTML = `
      <h1>${HERO[kind] ? HERO[kind].title : cfg.title}</h1>
      <p class="muted">${rackets ? 'เลือกไม้ได้สูงสุด 3 รุ่นแล้วเทียบสเปกพร้อมกัน' : `กดที่การ์ด 2–3 รุ่น แล้วกดปุ่มเทียบด้านล่าง (≈ คือค่าประเมิน) จากทั้งหมด ${items.length} รุ่น`}${HERO[kind] ? `<span class="hero-stats"><span><b data-count="${items.length}">${items.length}</b>รุ่น</span><span><b data-count="${brands.length}">${brands.length}</b>แบรนด์</span><span><b data-count="${items.filter(x => x.price).length}">${items.filter(x => x.price).length}</b>รุ่นที่มีราคา</span></span>` : ''}</p>
      ${HERO[kind] ? heroArt(kind, items) : ''}
      <div id="cmp"></div>
      ${filters}
      <div class="grid" id="grid" role="group" aria-label="รายการรุ่น"></div>
      <div class="more-row"><button class="btn" id="more" type="button" hidden></button></div>`;

    const flt = view.querySelector('#flt');
    const filterToggle = view.querySelector('#flt-toggle');
    const refine = view.querySelector('#catalog-refine');
    const setFilterOpen = open => {
      flt.dataset.open = open;
      filterToggle.setAttribute('aria-expanded', open);
      if (refine) refine.hidden = !open;
    };
    filterToggle.onclick = () => setFilterOpen(flt.dataset.open !== 'true');
    const swap = () => { if (!rackets && !reduceMotion()) view.querySelector('#grid').animate([{ opacity: 0.3, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }], { duration: 300, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' }); };
    flt.addEventListener('input', e => {
      if (!e.target.name) return;
      f[e.target.name] = e.target.type === 'checkbox' && !e.target.checked ? '' : e.target.value;
      state.shown[kind] = PAGE;
      renderGrid(kind);
      swap();
    });
    view.querySelector('#more').onclick = () => { state.shown[kind] += PAGE; renderGrid(kind); };
    const resetFilters = keepQuery => {
      state.f[kind] = keepQuery ? { ...emptyFilter(kind), q: f.q, sort: f.sort } : emptyFilter(kind);
      state.shown[kind] = PAGE;
      viewCompare(kind);
      view.querySelector('input[name="q"]').focus({ preventScroll: true });
    };
    view.querySelector('#clr').onclick = () => resetFilters(rackets);
    view.querySelector('#grid').addEventListener('click', e => {
      if (e.target.closest('[data-clear-all]')) { resetFilters(false); return; }
      const w = e.target.closest('[data-who]');
      if (w) { showWho(w.dataset.who); return; }
      if (e.target.closest('a')) return;
      const el = e.target.closest(rackets ? '.pickbtn' : '.item');
      if (el) toggle(kind, el.closest('.item').dataset.id);
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
        shareLink(sh, 'แชร์ลิงก์เทียบ');
        return;
      }
      const same = e.target.closest('[data-same]');
      if (same) {
        state.hideSame = !state.hideSame;
        same.setAttribute('aria-pressed', state.hideSame);
        view.querySelector('#cmp .tbl-wrap').parentElement.classList.toggle('hide-same', state.hideSame);
        return;
      }
      const match = e.target.closest('[data-tomatch]');
      if (match) {
        const id = match.dataset.tomatch || state.sel[kind][0];
        state.mPick = [kind, id, rackets ? state.compareWeights.get(id) || '' : undefined];
        location.hash = '#match';
        return;
      }
      const el = e.target.closest('[data-axis], [data-rk], [data-add]');
      if (el) { rankAction(el); return; }
      if (e.target.closest('[data-close]')) {
        state.open[kind] = false;
        renderCompare(kind);
        flt.scrollIntoView({ behavior: reduceMotion() ? 'auto' : 'smooth', block: 'start' });
        flt.querySelector('input[name="q"]').focus({ preventScroll: true });
        return;
      }
      const x = e.target.closest('[data-rm]'); if (x) toggle(kind, x.dataset.rm);
    });
    view.querySelector('#cmp').addEventListener('change', e => {
      const id = e.target.dataset.compareWeight;
      if (!id || !rackets) return;
      const weight = e.target.value;
      if (weight) state.compareWeights.set(id, weight);
      else state.compareWeights.delete(id);
      const sel = state.sel.r.map(id => byId('r', id)).filter(Boolean);
      const row = view.querySelector('[data-compare-tension]');
      row.outerHTML = compareTensionRow(sel);
      const cell = view.querySelector('[data-compare-tension]').cells[sel.findIndex(item => item.id === id) + 1];
      live.textContent = cell.querySelector('strong')?.textContent || cell.textContent;
      remember(kind);
    });
    view.querySelector('#cmp').addEventListener('keydown', e => {
      const el = e.target.closest('[data-axis], [data-add]');
      if (el && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); rankAction(el); }
    });
    // shortcut tiles for the first filter (playing style for rackets); they stand in for that dropdown
    const tiles = view.querySelector('#tiles'), tk = cfg.filters[0];
    const renderTiles = () => {
      const options = Object.entries(L[tk]).filter(([k]) => countOf(tk, k));
      if (rackets) options.unshift(['', 'ทุกแนว']);
      tiles.innerHTML = options.map(([k, v]) =>
        `<button type="button" class="tile ${f[tk] === k ? 'on' : ''}" data-ck="${tk}" data-cv="${esc(k)}" aria-pressed="${f[tk] === k}">
          <span class="tile-nm">${esc(v)}</span>${rackets ? '' : `<span class="tile-n"><span data-count="${countOf(tk, k)}">${countOf(tk, k)}</span> รุ่น</span>`}</button>`).join('');
    };
    const pick = b => {
      f[b.dataset.ck] = f[b.dataset.ck] === b.dataset.cv ? '' : b.dataset.cv;
      const s = flt.querySelector(`[name="${b.dataset.ck}"]`); if (s) s.value = f[b.dataset.ck];
      state.shown[kind] = PAGE; renderTiles(); renderGrid(kind); swap();
      tiles.querySelector(`[data-cv="${CSS.escape(b.dataset.cv)}"]`)?.focus({ preventScroll: true });
    };
    tiles.addEventListener('click', e => { const b = e.target.closest('[data-ck]'); if (b) pick(b); });
    flt.addEventListener('change', renderTiles);
    renderTiles();
    flt.querySelector(`[name="${tk}"]`)?.classList.add('has-tiles');
    if (!rackets) {
      countUp(tiles);
      countUp(view.querySelector('.hero-stats'));
    }
    renderGrid(kind);
    const art = view.querySelector('.hero-art');
    if (art && !reduceMotion()) {
      let raf = 0;
      view.onpointermove = e => {
        if (e.pointerType === 'touch' || raf) return;
        raf = requestAnimationFrame(() => {
          raf = 0; const b = art.getBoundingClientRect();
          const nx = Math.max(-1, Math.min(1, (e.clientX - (b.left + b.width / 2)) / (innerWidth / 2)));
          const ny = Math.max(-1, Math.min(1, (e.clientY - (b.top + b.height / 2)) / (innerHeight / 2)));
          art.style.setProperty('--px', nx.toFixed(3)); art.style.setProperty('--py', ny.toFixed(3));
        });
      };
    }
    if (!rackets) {
      const gridEl = view.querySelector('#grid');
      gridEl.classList.add('enter');
      setTimeout(() => gridEl.classList.remove('enter'), 1000);
    }
    renderCompare(kind);
  }

  const PAGE = 48;
  function renderGrid(kind) {
    const all = filtered(kind), sel = state.sel[kind];
    const list = all.slice(0, state.shown[kind]);
    const cnt = view.querySelector('#cnt');
    cnt.setAttribute('aria-live', 'polite');
    cnt.textContent = all.length > list.length ? `พบ ${all.length} รุ่น แสดง ${list.length} รุ่นแรก` : `พบ ${all.length} รุ่น`;
    const nSet = ['brand', ...KIND[kind].filters, ...(kind === 'r' ? racketFilterKeys : [])].filter(k => state.f[kind][k]).length;
    const badge = view.querySelector('#fl-n');
    if (badge) { badge.hidden = !nSet; badge.textContent = nSet; }
    view.querySelector('#flt').dataset.any = !!(nSet || state.f[kind].q);   // "ล้างตัวกรอง" shows only when there is something to clear
    const more = view.querySelector('#more');
    const left = all.length - list.length;
    more.hidden = left <= 0;
    more.textContent = `ดูเพิ่มอีก ${Math.min(PAGE, left)} รุ่น (เหลือ ${left})`;
    view.querySelector('#grid').innerHTML = list.length ? list.map(x => {
      const picked = sel.includes(x.id);
      const pick = kind === 'r'
        ? `<button type="button" class="btn sm pickbtn" aria-pressed="${picked}" aria-label="เพิ่มเทียบ ${esc(full(x))}"><span aria-hidden="true">${picked ? '✓ เลือกแล้ว' : '+ เพิ่มเทียบ'}</span></button>`
        : `<button type="button" class="pickbtn" role="checkbox" aria-checked="${picked}" aria-label="เลือก ${esc(full(x))} เพื่อเทียบ"><span aria-hidden="true">${picked ? '✓' : ''}</span></button>`;
      const card = KIND[kind].card(x, pick);
      return `<div class="item${picked ? ' sel' : ''}" data-id="${esc(x.id)}">${kind === 'r' ? card : pick + card}</div>`;
    }).join('') : `<div class="empty"><p>${state.f[kind].q ? 'ไม่พบรุ่นที่ตรงกับการค้นหา' : 'ไม่พบรุ่นที่ตรงกับตัวกรอง'}</p><button class="btn" type="button" data-clear-all>ล้างการค้นหาและตัวกรอง</button></div>`;
  }

  function toggle(kind, id) {
    const sel = state.sel[kind], i = sel.indexOf(id);
    if (i >= 0) {
      sel.splice(i, 1);
      if (kind === 'r') state.compareWeights.delete(id);
    }
    else if (sel.length >= 3) { flashTray(kind, 'เลือกได้สูงสุด 3 รุ่น — เอาออกก่อน 1 รุ่น'); return; }
    else sel.push(id);
    const hadFocus = document.activeElement && document.activeElement.classList.contains('pickbtn');
    renderGrid(kind);
    const card = view.querySelector(`.item[data-id="${CSS.escape(id)}"]`);
    if (hadFocus && card) card.querySelector('.pickbtn').focus({ preventScroll: true });
    if (card) { card.classList.add('just'); setTimeout(() => card.classList.remove('just'), 500); }
    renderCompare(kind);
  }

  function compareRacketHead(racket) {
    const rating = resolveRacketTension(racket, state.compareWeights.get(racket.id));
    const weightControl = rating.choices.length
      ? `<label class="compare-variant"><span>เวตไม้</span><select data-compare-weight="${esc(racket.id)}" aria-label="เวตไม้ ${esc(full(racket))}">
          <option value="">เลือกเวต</option>${rating.choices.map(weight => `<option${rating.weight === weight ? ' selected' : ''}>${esc(weight)}</option>`).join('')}
        </select></label>`
      : rating.weight ? `<p class="compare-variant small muted">เวตไม้ ${esc(rating.weight)}</p>` : '';
    return `<div class="compare-model">
      <strong>${esc(full(racket))}</strong>
      <button class="compare-remove" type="button" data-rm="${esc(racket.id)}" aria-label="เอา ${esc(full(racket))} ออกจากตาราง">×</button>
    </div>
    ${racket.modelCode ? `<p class="compare-code small muted">${esc(racket.modelCode)}</p>` : ''}
    ${racket.price ? `<p class="compare-code small muted">${esc(estimatedValue(racket, 'price', baht(racket.price)))}</p>` : ''}
    ${weightControl}
    <button class="btn sm ghost compare-match" type="button" data-tomatch="${esc(racket.id)}" aria-label="จับคู่เอ็นกับ ${esc(full(racket))}">จับคู่เอ็น</button>`;
  }

  function racketNumericDifference(racket, first, field, unit) {
    const a = Number(racket[field]), b = Number(first[field]);
    if (!(a > 0 && b > 0 && Number.isFinite(a) && Number.isFinite(b)) || a === b) return '';
    return racketDifference(a - b, unit, est(racket, field) || est(first, field));
  }

  function racketDifference(delta, unit, estimate = '') {
    const value = Math.abs(delta).toLocaleString('th-TH', { maximumFractionDigits: 2 });
    return `<span class="compare-tension-meta compare-delta">${estimate}${delta > 0 ? '+' : '−'}${value} ${unit}</span>`;
  }

  function renderCompareRating(rating, proof, racket) {
    const range = `<strong>${tensionText(rating.range)}</strong>`;
    if (!proof) return `${range}<span class="compare-tension-meta">ยังไม่มีแหล่งยืนยัน</span>`;
    if (!proof.entries.length) return `${range}<span class="compare-tension-meta">${link(proof.source, 'แหล่งอ้างอิงของรุ่น')}</span>`;
    const markets = [...new Set(proof.entries.map(row => tensionMarket(row.market)))].join(', ');
    return `${range}<span class="compare-tension-meta">${esc(markets)}</span>
      <details class="compare-proof"><summary>หลักฐาน</summary><ul>${tensionSourceLinks(proof.entries, racket)}</ul></details>`;
  }

  function compareTensionRow(rackets) {
    const ratings = rackets.map(racket => resolveRacketTension(racket, state.compareWeights.get(racket.id)));
    const proofs = rackets.map((racket, index) => racketTensionEvidence(racket, ratings[index]));
    const first = ratings[0];
    const marketOf = proof => [...new Set((proof?.entries || []).map(row => row.market))].sort().join(',');
    const firstMarket = marketOf(proofs[0]);
    return `<tr data-compare-tension><th scope="row">เพดานเวตที่เลือก</th>${rackets.map((racket, i) => {
      const rating = ratings[i], proof = proofs[i];
      if (rating.needsWeight) return '<td class="muted">เลือกเวตไม้</td>';
      if (rating.status !== 'rated') return '<td class="muted">ยังไม่ยืนยัน</td>';
      const scope = rating.choices.length > 1 && !rating.hasWeightCap && !proof?.entries.length
        ? '<span class="compare-tension-meta">เพดานรวมของรุ่น</span>' : '';
      const delta = rating.range[1] - first.range[1];
      const difference = delta && rating.weight === first.weight && firstMarket && firstMarket === marketOf(proof)
        ? racketDifference(delta, 'lbs') : '';
      return `<td>${renderCompareRating(rating, proof, racket)}${scope}${difference}</td>`;
    }).join('')}</tr>`;
  }

  function exactWeightRating(racket, weight) {
    const rating = resolveRacketTension(racket, weight);
    if (rating.weight !== weight || rating.needsWeight) return { status: 'absent' };
    if (rating.status !== 'rated') return { status: 'unconfirmed' };
    const proof = racketTensionEvidence(racket, rating);
    if (rating.choices.length > 1 && !rating.hasWeightCap && !proof?.entries.length) return { status: 'unconfirmed' };
    return { status: 'rated', rating, proof };
  }

  function compareWeightRows(rackets) {
    const weights = [...new Set(rackets.flatMap(racket => [...statedWeights(racket), ...matchWeights(racket)]))].sort();
    return weights.map(weight => {
      const values = rackets.map(racket => exactWeightRating(racket, weight));
      const cells = values.map(({ status, rating, proof }, i) => {
        if (status === 'absent') return '<span class="muted">—</span>';
        if (status === 'unconfirmed') return '<span class="muted">ยังไม่ยืนยัน</span>';
        return renderCompareRating(rating, proof, rackets[i]);
      });
      const keys = values.map(({ status, rating, proof }) => JSON.stringify([status, rating?.range, [...new Set((proof?.entries || []).map(row => row.market))].sort()]));
      return compareSpecRow(weight, cells, keys);
    }).join('');
  }

  function compareMarketRow(rackets) {
    const sources = rackets.map(racket => {
      const original = BASE.r.find(row => row.id === racket.id);
      return original && ['brand', 'name', 'modelCode'].every(key => sameField(original[key], racket[key]))
        ? (original.otherMarketTension || []) : [];
    });
    if (!sources.some(rows => rows.length)) return '';
    const cells = sources.map((rows, index) => {
      if (!rows.length) return '—';
      const groups = new Map();
      rows.forEach(row => {
        const key = `${row.market}:${row.weight}`;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(row);
      });
      return `<details class="compare-proof compare-market"><summary>ดูหลักฐานต่างตลาด</summary><ul>${[...groups.values()].map(entries => {
        const { market, weight, value } = entries[0];
        return `<li><strong>${esc(tensionMarket(market))} ${esc(weight)} ${tensionText(value)}</strong><ul>${tensionSourceLinks(entries, rackets[index])}</ul></li>`;
      }).join('')}</ul><p class="small muted">ค่าอ้างอิงตามตลาดที่ระบุ</p></details>`;
    });
    return compareSpecRow('ตลาดอื่น', cells);
  }

  function renderCompare(kind) {
    const cfg = KIND[kind], sel = state.sel[kind].map(id => byId(kind, id)).filter(Boolean);
    const box = view.querySelector('#cmp');
    const rackets = kind === 'r';
    updateTray(kind);
    if (!sel.length) state.open[kind] = false;
    if (!sel.length || !state.open[kind]) { box.innerHTML = ''; watchSheet(); remember(kind); return; }
    const rd = cfg.radar ? cfg.radar(sel) : null;
    const gap = rd ? rd.series.map(s => { const m = rd.axes.filter((_, i) => s.values[i] == null); return m.length ? `${esc(s.name)} ขาด ${m.map(esc).join(', ')}` : ''; }).filter(Boolean).join('; ') : '';
    const fresh = !box.firstElementChild;
    const chartsOpen = box.querySelector('.compare-charts')?.open;
    const scrollLeft = box.querySelector('.tbl-wrap')?.scrollLeft || 0;
    const charts = `<div class="two${rd ? '' : ' solo'}">
      ${rd ? `<div class="radar"><h3>${rd.title}</h3>${radar(rd.axes, rd.series, 340, true)}${legend(sel)}<p class="small muted">กดที่ชื่อแกนเพื่อดูอันดับ</p><p class="small muted">${rd.note}</p>${gap ? `<p class="small muted">แกนที่สเปกไม่พอจะไม่ถูกวาด: ${gap}</p>` : ''}</div>` : ''}
      <div class="bars"><h3>กราฟเทียบ</h3>${rd ? '' : legend(sel)}${bars(cfg.bars, sel, db[kind])}</div>
    </div><div id="rank"></div>`;
    const table = `<div class="${state.hideSame ? 'hide-same' : ''}">${specTable(cfg.spec, sel, rackets)}</div>`;
    const overview = rackets ? '' : `<div class="heads" style="grid-template-columns:repeat(${sel.length},minmax(0,1fr))">
          ${sel.map((x, i) => `<div class="head" style="--c:${COLORS[i]}">
            <button class="x" data-rm="${esc(x.id)}" aria-label="เอาออก">×</button>
            <div class="nm">${esc(full(x))}</div>
            <div class="small muted">${KIND[kind].sub(x)}</div>
          </div>`).join('')}
        </div>
        ${cfg.keys ? `<div class="keys" style="grid-template-columns:repeat(${sel.length},minmax(0,1fr))">${sel.map(x => `<div class="k">${cfg.keys.map(k => {
          const v = k.get(x);
          return `<div>${v ? `<div class="kn"><b${v[2] ? ` class="${v[2]}"` : ''}>${esc(v[0])}</b>${v[1] ? `<span>${v[1]}</span>` : ''}</div>` : '<div class="kn"><b class="none">—</b></div>'}<span class="kl">${k.l}</span></div>`;
        }).join('')}</div>`).join('')}</div>` : ''}`;
    box.innerHTML = `
      <section class="panel${rackets ? ' racket-compare' : fresh ? ' fresh' : ''}">
        ${overview}
        <div class="sheet-tools">
          ${rackets ? '<h2>ตารางเทียบไม้</h2>' : sel.length < 2 ? '<p class="small muted">เลือกเพิ่มอีกอย่างน้อย 1 รุ่นเพื่อเทียบ</p>' : '<span></span>'}
          <span class="tools-r">${sel.length > 1 ? `<button class="btn sm ghost" type="button" data-same aria-pressed="${!!state.hideSame}">${rackets ? 'เฉพาะจุดต่าง' : 'ซ่อนแถวที่เหมือนกัน'}</button>` : ''}
          ${kind === 's' ? `<button class="btn sm ghost" type="button" data-tomatch>ไปจับคู่ไม้ + เอ็น</button>` : ''}
          <button class="btn sm${rackets ? ' ghost' : ''}" type="button" data-share>${rackets ? 'แชร์' : 'แชร์ลิงก์เทียบ'}</button>
          <button class="btn sm ghost" type="button" data-close>${rackets ? 'ปิดตาราง' : 'ปิดผลเทียบ'}</button></span>
        </div>
        ${rackets ? `<p class="small muted compare-guide">— ยังไม่มีข้อมูล &nbsp; ≈ ค่าประเมิน${sel.length > 1 ? ' &nbsp; + / − เทียบกับคอลัมน์แรก' : ''}</p>${table}
          <details class="compare-charts"${chartsOpen ? ' open' : ''}><summary>กราฟภาพรวมของแต่ละรุ่น</summary>${charts}</details>
          ${similar(sel)}${whoFor(sel)}` : `${charts}<p class="small muted sheet-key">ช่องที่ขึ้น — คือยังไม่มีข้อมูล ช่องที่ไฮไลต์คือค่าที่ต่างกัน ค่าที่มี ≈ คือค่าประเมิน</p>${table}`}
      </section>`;
    if (scrollLeft) box.querySelector('.tbl-wrap').scrollLeft = scrollLeft;
    renderRank(kind);
    watchSheet();
    remember(kind);
  }

  // ---------- rackets like the ones picked: nearest on the radar profile, then the cheaper of the close ones ----------
  function similar(sel) {
    const base = sel[0], bp = racketProfile(base), ids = new Set(sel.map(x => x.id));
    // distance over the axes both rackets have (at least 4 of 7), scaled as if all 7 were there
    const dist = (a, b) => { let s = 0, n = 0; a.forEach((v, i) => { if (v != null && b[i] != null) { s += (v - b[i]) ** 2; n++; } }); return n >= 4 ? Math.sqrt(s / n * a.length) : Infinity; };
    const near = db.r.filter(x => !ids.has(x.id) && x.balance && x.flex)
      .map(x => ({ x, d: dist(racketProfile(x), bp) })).filter(o => o.d < Infinity)
      .sort((a, b) => a.d - b.d).slice(0, 12);
    if (!near.length) return '';   // a racket with under 4 axes of data has nothing to be near
    const alike = near.slice(0, 4);
    const cheaper = Number(base.price) ? near.filter(a => Number(a.x.price) && Number(a.x.price) < Number(base.price) * 0.85)
      .sort((a, b) => Number(a.x.price) - Number(b.x.price)).slice(0, 4) : [];
    const row = list => `<div class="simrow">${list.map(({ x }) => `<button type="button" class="sim" data-add="${esc(x.id)}">
        ${x.img ? `<img src="${esc(x.img)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : '<span class="mimg-empty"></span>'}
        <span class="sim-n">${esc(full(x))}</span><span class="small muted">${[lab(x, 'balance'), lab(x, 'flex'), x.price ? est(x, 'price') + baht(x.price) : ''].filter(Boolean).join(', ')}</span></button>`).join('')}</div>`;
    return `<section class="similar"><h3>ไม้ที่สเปกใกล้ ${esc(full(base))}</h3><p class="small muted">กดเพื่อเพิ่มเข้าตารางเทียบ</p>${row(alike)}
      ${cheaper.length ? `<h3>ใกล้กันแต่ถูกกว่า</h3>${row(cheaper)}` : ''}</section>`;
  }

  // ---------- plain-words "who is it for", one per picked racket, from the specs it has ----------
  const W_TXT = {
    flex: { flexible: 'ก้านอ่อน งอตัวช่วยดีดลูก ตีไกลได้ง่ายแม้สวิงไม่แรง เหมาะกับคนเริ่มเล่นหรือคนที่อยากถนอมแขน', medium: 'ก้านกลาง ให้ทั้งแรงดีดและความแม่นพอกัน ใช้ได้กับคนส่วนใหญ่', stiff: 'ก้านแข็ง ควบคุมทิศทางได้แม่นและตอบสนองไว แต่ต้องอาศัยความเร็วสวิงและการสะบัดข้อมือ เหมาะกับคนที่มีพื้นฐานดีแล้ว', 'extra-stiff': 'ก้านแข็งมาก แม่นและคมที่สุดแต่ไม่ช่วยดีดเลย ต้องสวิงเร็วและแรงจริง เหมาะกับผู้เล่นฝีมือสูง' },
    balance: { 'head-light': 'หัวเบา สะบัดไว รับลูกและแลกลูกหน้าตาข่ายได้เร็ว แต่ลูกตบจะหนักน้อยกว่า', even: 'สมดุล ไม่หนักหัวไม่เบาหัว เล่นได้ทั้งบุกและรับ', 'head-heavy': 'หัวหนัก ลูกตบและลูกโยนหลังหนักแน่น แต่สะบัดช้ากว่าและล้าข้อมือเร็วกว่า' },
  };
  const W_FIT = {
    style: { attack: 'คนที่ชอบตบและเล่นเกมบุกจากหลังคอร์ต', speed: 'คนที่ชอบแลกลูกเร็วและเล่นหน้าตาข่าย หรือเล่นคู่ตำแหน่งหน้า', control: 'คนที่เน้นวางลูกแม่นและคุมจังหวะเกม', allround: 'คนที่เล่นได้ทุกแบบ ทั้งบุก รับ และวางลูก' },
    level: { beginner: 'มือใหม่ที่เพิ่งเริ่มตีหรือตีเป็นงานอดิเรก', intermediate: 'คนที่ตีเป็นประจำและเริ่มมีพื้นฐานแล้ว', advanced: 'คนที่สวิงเร็วและมีพื้นฐานดีแล้ว', pro: 'ผู้เล่นฝีมือสูงหรือนักกีฬาที่ตีแข่ง' },
  };
  const U_G = { '2U': '90–94', '3U': '85–89', '4U': '80–84', '5U': '75–79', '6U': '70–74' };
  const series = x => x.name.split(/\s+/)[0].toLowerCase();
  function whoOne(r, open, pick = 'data-add') {
      const e = f => est(r, f), parts = [];
      const us = String(r.weights || '').match(/[2-6]U/g) || [];
      if (us.length) parts.push(['น้ำหนัก', `${us.length > 1 ? 'มีให้เลือก ' : ''}${us.map(u => `${u} (ราว ${U_G[u]} กรัม)`).join(' และ ')} ตัวเลขหน้า U ยิ่งมากไม้ยิ่งเบา ไม้ที่หนักขึ้นให้ความนิ่งตอนกระทบลูกและส่งแรงได้มากกว่า แลกกับการสวิงที่ต้องใช้แรงมากขึ้น`]);
      if (r.balance) parts.push(['สมดุลไม้', e('balance') + W_TXT.balance[r.balance]]);
      if (r.flex) parts.push(['ความแข็งก้าน', e('flex') + W_TXT.flex[r.flex]]);
      const cap = r.tension && r.tension[1];
      if (cap) parts.push(['ความตึงเอ็น', `${e('tension') ? 'เพดานเอ็นโดยประมาณ' : 'เพดานเอ็นตามสเปก'} ${cap} ปอนด์ เอ็นที่ตึงน้อยกว่าจะส่งลูกได้ไกลกว่าและให้อภัยเวลาตีไม่โดนกลางหน้าไม้ ส่วนเอ็นตึงให้ความแม่นมากกว่าแต่ต้องตีให้โดนกลางหน้าไม้${r.tensionNote ? ' (' + r.tensionNote + ')' : ''}`]);
      const fit = [W_FIT.style[r.style], W_FIT.level[r.level], lvHi(r) > lvLo(r) ? W_FIT.level[r.levelTo] : ''].filter(Boolean);
      const sib = db.r.filter(x => x.id !== r.id && x.brand === r.brand && series(x) === series(r)).slice(0, 6);
      const desc = [r.style && `ในสาย${L.style[r.style]}`, r.flex && `เน้น${{ control: 'การวางลูกแม่นและคุมจังหวะ', attack: 'ลูกตบหนัก', speed: 'ความไวในการสวิงและการแลกลูกเร็ว' }[r.style] || (r.flex === 'flexible' ? 'ตีง่ายและแรงดีด' : r.balance === 'head-heavy' ? 'ลูกตบหนัก' : r.balance === 'head-light' ? 'ความไวในการสวิงและการแลกลูกเร็ว' : 'ความสมดุลระหว่างบุกกับรับ')}`, r.level && `เหมาะกับ${lvText(r)}`].filter(Boolean).join(' ');
      return `<details class="who"${open ? ' open' : ''}><summary><h3>${esc(full(r))} เหมาะกับใคร</h3></summary>
        <p>${esc(full(r))} เป็นไม้แบดมินตันจาก ${esc(r.brand)}${desc ? ' ' + desc : ''} ด้านล่างคือคำอธิบายสเปกแต่ละข้อว่ามีผลกับการตีจริงอย่างไร</p>
        ${parts.length ? `<h4>อธิบายสเปกแบบเข้าใจง่าย</h4><dl>${parts.map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`).join('')}</dl>` : ''}
        ${fit.length ? `<h4>ไม้รุ่นนี้น่าจะเหมาะกับ</h4><ul>${fit.map(f => `<li>${f}</li>`).join('')}</ul>` : ''}
        ${sib.length ? `<h4>ไม้ซีรีส์เดียวกันที่น่าเทียบ</h4><div class="simrow">${sib.map(x => `<button type="button" class="sim" ${pick}="${esc(x.id)}">${x.img ? `<img src="${esc(x.img)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : '<span class="mimg-empty"></span>'}<span class="sim-n">${esc(full(x))}</span><span class="small muted">${[x.style && 'สาย' + L.style[x.style], x.price ? est(x, 'price') + baht(x.price) : ''].filter(Boolean).join(', ')}</span></button>`).join('')}</div>` : ''}
        <p class="small muted">สรุปจากสเปกในแคตตาล็อก ค่าที่มี ≈ คือค่าประเมิน ความรู้สึกตอนตีจริงขึ้นกับเอ็น ความตึง และสไตล์ของแต่ละคน ควรลองจับไม้จริงก่อนซื้อถ้าทำได้</p>
      </details>`;
  }
  const whoFor = sel => `<section class="similar">${sel.map((r, i) => whoOne(r, i === 0)).join('')}</section>`;
  // the same text from a racket card, in a dialog; same-series rackets open their own
  function showWho(id) {
    let d = document.getElementById('whoDlg');
    if (!d) {
      d = document.createElement('dialog'); d.id = 'whoDlg'; d.className = 'whodlg';
      document.body.append(d);
      d.addEventListener('click', e => {
        const w = e.target.closest('[data-who]');
        if (w) showWho(w.dataset.who);
        else if (e.target === d || e.target.closest('[data-close-who]')) d.close();
      });
    }
    const r = byId('r', id); if (!r) return;
    const local = thaiRacketListing(r);
    d.innerHTML = `<button class="btn sm ghost x-btn" type="button" data-close-who aria-label="ปิด">×</button>${whoOne(r, true, 'data-who')}<p class="who-shop">${local ? link(local, 'ดูหน้าร้านไทย') : shopee(r)}</p>`;
    if (!d.open) d.showModal();
    d.scrollTop = 0;
  }

  // ---------- shareable link ----------
  const ROUTE = { r: 'rackets', s: 'strings', h: 'shuttles', o: 'shoes', k: 'socks' };
  function compareSelection(values, variants, find) {
    const ids = [], weights = new Map();
    values.split(',').slice(0, 3).forEach((id, index) => {
      const item = find(id);
      if (!item || ids.includes(id)) return;
      ids.push(id);
      const weight = variants[index];
      if (weight && matchWeights(item).includes(weight)) weights.set(id, weight);
    });
    return { ids, weights };
  }

  function remember(kind) {
    const ids = state.sel[kind];
    const weights = kind === 'r' ? ids.map(id => state.compareWeights.get(id) || '') : [];
    const query = ids.length ? '?c=' + ids.map(encodeURIComponent).join(',') : '';
    history.replaceState(null, '', '#' + ROUTE[kind] + query + (weights.some(Boolean) ? '&w=' + weights.join(',') : ''));
  }

  // ---------- top 10 per radar axis ----------
  // a model counts only when the specs behind the axis are known (rackets: balance and flex; strings: that rating)
  const rankable = {
    r: (x, i) => x.balance && x.flex && racketProfile(x)[i] != null,
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
  const live = document.getElementById('live');
  const say = msg => { if (live) live.textContent = msg; };
  function updateTray(kind) {
    const n = state.sel[kind].length;
    say(n ? `เลือกไว้ ${n} รุ่น` : '');
    tray.classList.toggle('racket-tray', kind === 'r');
    if (!n) { tray.hidden = true; return; }
    tray.hidden = false;
    tray.innerHTML = `<span class="picks">${state.sel[kind].map((id, i) => {
        const x = byId(kind, id);
        return `<span class="pick" style="--c:${COLORS[i]}"><span class="pn">${esc(x ? x.name : id)}</span><button type="button" data-rm="${esc(id)}" aria-label="เอา ${esc(x ? full(x) : id)} ออก">×</button></span>`;
      }).join('')}</span>
      <button class="btn primary sm" type="button" data-a="go">${n < 2 ? 'ดูสเปก 1 รุ่น' : `เทียบ ${n} รุ่น`}</button>
      <button class="btn ghost sm" type="button" data-a="clear" aria-label="ล้างรายการที่เลือก">ล้าง</button>`;
    tray.onclick = e => {
      const rm = e.target.closest('[data-rm]');
      if (rm) { toggle(kind, rm.dataset.rm); return; }
      const a = e.target.closest('[data-a]')?.dataset.a;
      if (a === 'go') {
        state.open[kind] = true;
        renderCompare(kind);
        view.querySelector('#cmp').scrollIntoView({ behavior: reduceMotion() ? 'auto' : 'smooth', block: 'start' });
        if (kind === 'r') view.querySelector('.racket-compare .tbl-wrap').focus({ preventScroll: true });
      }
      if (a === 'clear') {
        state.sel[kind] = [];
        if (kind === 'r') state.compareWeights.clear();
        renderGrid(kind); renderCompare(kind);
      }
    };
  }
  function flashTray(kind, msg) {
    say(msg);
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

  const tensionText = ([min, max]) => min && max ? `${min}–${max} lbs` : max ? `≤ ${max} lbs` : min ? `≥ ${min} lbs` : '—';
  const statedWeights = r => (r.est || []).includes('weights') ? []
    : [...new Set((r.weights || '').toUpperCase().match(/\b(?:[2-8][UF]|U|F)\b/g) || [])];
  function matchWeights(r) {
    const rated = Object.keys(r.tensionByWeight || {});
    const classes = [...new Set([...statedWeights(r), ...rated])].sort();
    return rated.length || classes.length > 1 ? classes : [];
  }

  function resolveRacketTension(r, selection) {
    const choices = matchWeights(r);
    const needsWeight = choices.length > 0 && !choices.includes(selection);
    const weight = needsWeight ? '' : choices.length ? selection : statedWeights(r)[0] || '';
    const caps = r.tensionByWeight || {};
    const hasWeightCap = Object.hasOwn(caps, weight);
    // Keep the model range for the score while an unverified variant is withheld from recommendations.
    const range = hasWeightCap ? caps[weight] : r.tension || [null, null];
    const hasCap = Number.isFinite(range[1]) && range[1] >= 2;
    const missingWeightCap = !needsWeight && !hasWeightCap && Object.keys(caps).length > 0;
    const estimated = Boolean(est(r, 'tension'));
    const status = !hasCap || missingWeightCap ? 'missing' : estimated ? 'estimated' : 'rated';
    return { choices, needsWeight, weight, range, hasCap, hasWeightCap, estimated, status };
  }

  function racketTensionEvidence(r, rating) {
    const catalogue = BASE.r.find(row => row.id === r.id);
    const { weight, range } = rating;
    if (rating.needsWeight || rating.status !== 'rated' || !catalogue ||
        !['brand', 'name', 'modelCode'].every(key => sameField(catalogue[key], r[key]))) return null;
    const official = resolveRacketTension(catalogue, weight);
    if (official.needsWeight || official.weight !== weight || official.status !== 'rated' || !sameField(range, official.range)) return null;
    const entries = (catalogue.researchEvidence || []).filter(row => row.field === 'tension' &&
      row.status === 'confirmed' && row.weight === weight && sameField(row.value, range) && link(row.source, ''));
    // Do not promote a model-level link to proof of a particular weight.
    const source = catalogue.tensionSrc === r.tensionSrc ? catalogue.tensionSrc : '';
    return entries.length || link(source, '') ? { weight, range, entries, source } : null;
  }

  const regionNames = typeof Intl.DisplayNames === 'function' ? new Intl.DisplayNames('th', { type: 'region' }) : null;
  const sourceTypes = { manufacturer: 'ผู้ผลิต', catalog: 'แคตตาล็อกผู้ผลิต', distributor: 'ตัวแทนทางการ', retailer: 'ร้านค้า' };
  const tensionMarket = market => 'ตลาด' + (market === 'GLOBAL' ? 'สากล' : regionNames?.of(market) || market);
  function tensionSourceLinks(entries, racket) {
    return entries.map(row => {
      const host = new URL(row.source).hostname.replace(/^www\./, '');
      const type = sourceTypes[row.sourceType];
      const meta = [tensionMarket(row.market), row.checkedOn && `ตรวจ ${row.checkedOn}`,
        codeKey(row.sourceCode) !== codeKey(racket.modelCode) && row.sourceCode && `รหัสในแหล่ง ${row.sourceCode}`].filter(Boolean);
      return `<li>${link(row.source, esc(type ? `${type} · ${host}` : host))}
        <span class="muted">${esc(meta.join(' · '))}</span>
        ${row.locator ? `<span class="muted">${esc(row.locator)}</span>` : ''}</li>`;
    }).join('');
  }

  function renderTensionEvidence(r, selection, open) {
    const proof = racketTensionEvidence(r, resolveRacketTension(r, selection));
    if (!proof) return '';
    const { weight, range, entries, source } = proof;
    return `<details class="mtension-evidence mfeel" data-racket="${esc(r.id)}"${open ? ' open' : ''}>
      <summary>ดูที่มาเพดานเอ็นของไม้${entries.length && weight ? ' ' + esc(weight) : ''}</summary>
      <p>${r.modelCode ? `<span class="muted">${esc(r.modelCode)} · </span>` : ''}${!entries.length && weight ? esc(weight) + ' · ' : ''}<strong>${esc(tensionText(range))}</strong></p>
      ${entries.length ? `<ul>${tensionSourceLinks(entries, r)}</ul>` : `<p>${link(source, 'แหล่งอ้างอิงของรุ่น')}</p>`}
    </details>`;
  }

  const canRecommendTension = ({ limits }) => !limits.needsWeight && !limits.unconfirmed.length && !limits.incompatibleRange;

  function score(r, s, level, style, shuttle = 'feather', climate = 'normal', game = 'doubles', arm = 'none', headPick = '', weight = '') {
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
    // no rating: start from the gauge, then lean on the maker's own words (Victor's "Feature"/"Feel", Li-Ning's blurbs), +-1 or 2
    const WORD_R = { feature: { repulsion: { repulsion: 2, durability: -1 }, control: { control: 2 }, durability: { durability: 2, repulsion: -1 } },
      feel: { soft: { shock: 2, sound: -1 }, hard: { shock: -2, control: 1, sound: 1 } } };
    const lean = k => ['feature', 'feel'].reduce((a, f) => a + (((WORD_R[f][s[f]] || {})[k]) || 0), 0);
    const sr = k => Number(s[k]) || Math.max(1, Math.min(10, GAUGE_R[k][gk] + lean(k)));
    const shock = sr('shock'), rep = sr('repulsion');

    // 1. string for the player: half what the level needs, half what the style wants
    const W = {};
    for (const [k, w] of Object.entries(LEVEL_W[level])) W[k] = (W[k] || 0) + w / 2;
    for (const [k, w] of Object.entries(STYLE_W[style])) W[k] = (W[k] || 0) + w / 2;
    const fit = Object.entries(W).reduce((a, [k, w]) => a + w * sr(k), 0);
    let pP = (fit - 4) * 20; // fit 6.5 of 10 -> 50, 9 -> 100
    if (arm === 'care') {
      if (shock >= 8) { pP += 8; ok('เอ็นซับแรงดี ช่วยถนอมข้อมือ'); }
      else if (shock <= 5) { pP -= 10; wn('มีปัญหาข้อมือหรือไหล่: เอ็นนี้ซับแรงน้อย'); }
    }
    if (game === 'singles' && sr('control') >= 8) pP += 3;
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
      const fw = rEst.includes('flex') ? 0.5 : 1;                        // an estimated flex counts half, like balance and style
      if (gap <= 0.5) { pR += 10 * fw; ok(`${L.flex[r.flex]} เหมาะกับ${L.level[level]}`); }
      else if (gap >= 1.5) { pR -= (gap >= 2.5 ? 25 : 15) * fw; wn(fx > ideal ? `${L.flex[r.flex]} ต้องใช้แรงสวิงมากสำหรับ${L.level[level]}` : `${L.flex[r.flex]} อาจนิ่มไปสำหรับ${L.level[level]}`); }
      else pR -= 2;
    }
    // singles rewards a stable, slightly heavier head; doubles rewards a quick head [medium: retail guides, Yonex series copy]
    if (game === 'doubles' && bal === 'head-light' && style !== 'control') pR += 4;
    if (game === 'singles' && bal === 'head-heavy') pR += 4;
    if (game === 'doubles' && bal === 'head-heavy' && lv <= 1) { pR -= 4; wn('เกมคู่ต้องตอบโต้เร็ว ไม้หัวหนักอาจยกไม้ไม่ทันสำหรับระดับนี้'); }
    // arm care: a stiff shaft and a heavy head pass more shock to the wrist and elbow
    if (arm === 'care') {
      if (fx >= 2) { pR -= 12; wn('มีปัญหาข้อมือหรือไหล่: ก้านแข็งส่งแรงสะเทือนมาก ลองก้านกลางหรือก้านอ่อน'); }
      if (bal === 'head-heavy') { pR -= 6; wn('มีปัญหาข้อมือหรือไหล่: ไม้หัวหนักออกแรงที่ข้อมือมากขึ้น'); }
      if (fx <= 1 && bal !== 'head-heavy') ok('ก้านไม่แข็งและหัวไม่หนัก ถนอมข้อมือและไหล่');
    }
    const g8 = Number(r.weight) || 0;
    if (g8 && lv <= 1 && g8 >= 87) { pR -= 8; wn(`ไม้หนัก (${g8} g) สวิงเหนื่อยสำหรับ${L.level[level]} ลองรุ่น 4U หรือ 5U`); }
    else if (g8 && lv === 0 && g8 <= 84) pR += 4;
    // the racket's named technologies, at most +6 in all: each counts only where it serves this player
    {
      const tags = Object.fromEntries(techTags(r)); let tb = 0; const why = [];
      const add = (k, n) => { if (tags[k]) { tb += n; why.push(tags[k]); } };
      if (arm === 'care') add('shock', 4);
      if (lv <= 1) add('sweet', 3);
      if (style === 'control') add('stable', 3);
      if (style === 'speed' || (game === 'doubles' && style !== 'control')) add('aero', 3);
      if (style === 'attack') add('rebound', 3);
      if (bal === 'head-heavy') add('counter', 3);
      if (tb) { pR += Math.min(tb, 6); ok('เทคโนโลยีของไม้ (ตามผู้ผลิต): ' + why.join(', ')); }
    }
    if (r.style) {
      const sf = r.style === style ? 14 : (r.style === 'allround' || style === 'allround') ? 2 : -10;  // the maker's own label outweighs a guess from specs
      pR += rEst.includes('style') ? sf / 2 : sf;
      if (r.style === style) ok(`ไม้เป็นสาย${L.style[r.style]} ตรงกับสไตล์ที่เลือก`);
      else if (sf < 0) wn(`ไม้วางตัวเป็นสาย${L.style[r.style]} แต่เลือกสไตล์${L.style[style]}`);
    }
    // a range ("intermediate - advanced") fits every level inside it, a little less than one exact level (the wider the claim, the
    // less it says); outside it, the distance to its nearest end counts as the gap
    const lo = lvLo(r), hi = lvHi(r), width = Math.max(0, hi - lo), LT = lvText(r);
    const d = lo < 0 ? -9 : lv < lo ? lo - lv : lv > hi ? hi - lv : 0, half = rEst.includes('level') ? 0.5 : 1;
    if (d === 0) { pR += [10, 8, 6][Math.min(width, 2)] * half; if (half === 1) ok(`ผู้ผลิตทำไม้รุ่นนี้สำหรับ${LT} ตรงกับระดับที่เลือก`); }
    else if (d === 1) { pR -= 4 * half; if (half === 1) wn(`ไม้ทำมาสำหรับ${LT} สูงกว่าระดับที่เลือกหนึ่งขั้น`); }
    else if (d >= 2) { pR -= 18 * half; wn(`ไม้สำหรับ${LT}${half < 1 ? ' (ค่าประเมิน)' : ''} อาจตีหนักมือสำหรับ${L.level[level]}`); }
    else if (d === -1) pR -= 4 * half;
    else if (d <= -2 && d > -9) { pR -= (d <= -3 ? 30 : 18) * half; wn(`ไม้สำหรับ${LT} อาจไม่ตอบโจทย์${L.level[level]}`); }

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
    // head size: a larger head has longer strings, so the same pounds give a softer, more trampoline-like bed;
    // one pound up keeps the feel of a standard head, one down for a small head [medium: string-bed stiffness
    // falls with string length; shop and maker stringing advice for oversize frames]. Applied after the level
    // band on purpose: it is the same feel at a different number, not a different feel.
    const head = headPick || r.head || '';
    if (head === 'large') nudge(1, 'หน้าไม้กว้าง เอ็นยาวกว่า ปอนด์เท่ากันจะรู้สึกหย่อนกว่า');
    else if (head === 'small') nudge(-1, 'หน้าไม้เล็ก เอ็นสั้นกว่า ปอนด์เท่ากันจะรู้สึกตึงกว่า');
    if (head === 'large' && lv <= 1) ok('หน้าไม้กว้าง จุดหวานใหญ่ ตีพลาดกลางหน้าไม้แล้วยังไปได้');
    if (climate === 'hot') nudge(1, 'สนามร้อนชื้น (ความเชื่อของช่าง ยังไม่มีหลักฐานยืนยัน)');               // [low, T7]
    if (arm === 'care') nudge(-1, 'ถนอมข้อมือ/ไหล่ ขึ้นเอ็นหย่อนลงลดแรงสะเทือน');      // [medium] lower tension = less vibration
    if (shuttle === 'nylon') nudge(-2, 'ลูกไนลอน');                                                          // [medium, two sources]
    const rating = resolveRacketTension(r, weight);
    const [tmin, tmax] = rating.range;
    const hasStringCap = Number.isFinite(s.tensionMax) && s.tensionMax >= 2;
    const rCap = rating.hasCap ? tmax : 30, sCap = hasStringCap ? Number(s.tensionMax) : Infinity;
    const cap = Math.min(rCap, sCap);
    const capEstimated = rCap <= sCap ? !rating.hasCap || rating.estimated : (s.est || []).includes('tensionMax');
    const unconfirmed = [];
    if (rating.status !== 'rated') unconfirmed.push('ไม้');
    if (!hasStringCap || (s.est || []).includes('tensionMax')) unconfirmed.push('เอ็น');
    const incompatibleRange = Boolean(tmin && tmin <= 22 && tmin > cap);
    const limits = { cap, capEstimated, unconfirmed, needsWeight: rating.needsWeight, incompatibleRange };
    const publishTension = canRecommendTension({ limits });
    const capLabel = capEstimated ? `ประมาณ ${cap}` : String(cap);
    const floor = tmin && tmin <= 22 && tmin <= cap ? tmin : null;
    const upper = Math.max(cap - 1, floor || 0);
    if (t > upper) {
      nudge(upper - t, upper < cap
        ? `เผื่อ 1 ปอนด์จากเพดาน ${capLabel} lbs ของ${rCap <= sCap ? 'ไม้' : 'เอ็น'}`
        : `จำกัดที่เพดาน ${capLabel} lbs`);
      if (upper < bLo) {
        pS -= 15;
        if (publishTension) wn(`เพดาน ${capLabel} lbs ต่ำกว่าช่วงที่${L.level[level]}มักใช้ (${bLo}–${bHi} lbs)`);
      }
    }
    // a low end of 22 lbs or less is a stringing range (Yonex 19-27); a high one ("26-38 lbs") is what the frame
    // is rated for, and stringing below it is safe, so it only earns a note
    if (floor != null && t < floor) nudge(floor - t, `ใช้ค่าต่ำสุดของไม้ ${floor} lbs`);
    else if (tmin > 22 && t < tmin) {
      // For a high range, move toward its lower end without forcing the user to reach it.
      const up = Math.min(tmin - t, lv >= 1 ? 2 : 1, Math.max(0, upper - t));
      if (up > 0) nudge(up, `ขยับเข้าใกล้ช่วงความตึงของไม้ (${tensionText([tmin, tmax])})`);
      if (publishTension && t < tmin) ok(`ค่าที่แนะนำต่ำกว่าช่วงความตึงของไม้ (${tensionText([tmin, tmax])})`);
    }
    if (low && shock <= 4 && t >= bHi) wn(publishTension ? 'เอ็นแข็งที่ตึงสูง อาจสะเทือนข้อมือ ลองลดลง 1–2 ปอนด์' : 'เอ็นแข็งที่ตึงสูง อาจสะเทือนข้อมือ');

    const parts = { player: Math.round(clamp(pP, 0, 100)), racket: Math.round(clamp(pR, 0, 100)), pair: Math.round(clamp(pS, 0, 100)) };
    let total = PARTS.reduce((a, [k, , w]) => a + w * parts[k], 0);
    // a racket far off the player cannot be rescued by a good string: three levels apart, or a frame that cannot
    // take the level's tension (a 20 lb aluminium frame for a pro), caps the whole score
    if ((d <= -3 && d > -9 && half === 1) || cap < bLo - 3) {
      total = Math.min(total, 50);
      if (publishTension && cap < bLo - 3) wn(`เพดานของชุดนี้ ${capLabel} lbs ต่ำกว่าที่${L.level[level]}ใช้มาก ไม่เหมาะกับระดับนี้`);
      else if (d <= -3 && d > -9 && half === 1) wn(`ไม้สำหรับ${lvText(r)} ห่างจากระดับ${L.level[level]}มาก`);
    }

    // how sure: the inputs that weigh most, counted when they are estimates or missing
    const guess = [];
    const sEst = s.est || [];
    Object.entries(W).filter(([, w]) => w >= 0.1).forEach(([k]) => { if (sEst.includes(k) || s[k] === '' || s[k] == null) guess.push(`${S_NAME[k]}ของเอ็น`); });
    [['style', 'แนวของไม้'], ['level', 'ระดับของไม้'], ['balance', 'สมดุลไม้'], ['flex', 'ความแข็งก้าน']].forEach(([k, n]) => {
      if (rEst.includes(k) || !r[k]) guess.push(n);
    });
    if (unconfirmed.includes('ไม้')) guess.push('ความตึงสูงสุดของไม้');
    const conf = guess.length <= 1 ? 'สูง' : guess.length <= 3 ? 'ปานกลาง' : 'ต่ำ';

    return { score: Math.round(clamp(total, 0, 100)), parts, tension: t, steps, band: [bLo, bHi], range: [tmin, tmax],
      limits: { ...limits, floor, upper }, reasons, conf, guess };
  }
  // ---------- the player's own tension log ----------
  // Each entry is a setup the player strung and how it felt (loose / good / tight). The model's number for that setup
  // is recomputed from the entry's own choices; "loose" says the right number lies about 1.5 lbs above what was strung,
  // "tight" 1.5 below, "good" at it. The mean gap, shrunk toward zero by one extra entry and capped at 3 lbs, is a personal
  // offset added to every recommendation (never past the racket's or string's ceiling). Stored in this browser only.
  const LOG_KEY = 'rs.tensionlog.v1', FEEL_GAP = 1.5, OFF_MAX = 3;
  const FEEL = { loose: 'หย่อนไป', good: 'พอดี', tight: 'ตึงไป' };
  const mylog = (() => {
    try { const v = JSON.parse(localStorage.getItem(LOG_KEY) || '{}'); return { entries: Array.isArray(v.entries) ? v.entries : [], on: v.on !== false }; } catch (e) { return { entries: [], on: true }; }
  })();
  const logSave = () => { try { localStorage.setItem(LOG_KEY, JSON.stringify(mylog)); } catch (e) {} };
  function calcOffset(entries) {
    const gaps = [];
    for (const e of entries) {
      const r = byId('r', e.r), s = byId('s', e.s), lbs = Number(e.lbs), o = e.o || {};
      if (!r || !s || !(lbs > 0) || !FEEL[e.feel] || !LEVEL_W[e.level] || !STYLE_W[e.style]) continue;
      const result = score(r, s, e.level, e.style, o.shuttle || 'feather', o.climate || 'normal', o.game || 'doubles', o.arm || 'none', o.head || '', o.variant || '');
      if (canRecommendTension(result)) gaps.push((e.feel === 'loose' ? lbs + FEEL_GAP : e.feel === 'tight' ? lbs - FEEL_GAP : lbs) - result.tension);
    }
    const n = gaps.length;
    return { n, off: n ? clamp(Math.round(gaps.reduce((a, b) => a + b, 0) / (n + 1)), -OFF_MAX, OFF_MAX) : 0 };
  }
  // Apply the same limits to the personal recommendation as to the initial result.
  function mineAdj(res, mine, on = mylog.on) {
    if (!on || !mine.off) return res;
    const t = clamp(res.tension + mine.off, res.limits.floor ?? -Infinity, res.limits.upper);
    return t === res.tension ? res : { ...res, tension: t, steps: [...res.steps, [`ปรับตามบันทึกของคุณ (${mine.n} บันทึก)`, t - res.tension]] };
  }
  window.RS_TEST = { score, byId, calcOffset, mineAdj, profile: racketProfile, balPos, lvText, hotBoards, parseImport, matchLinkOptions,
    updateSavedTension, catalogDelta, applyCatalogDelta, migrateCatalog, readCatalogBackup, hotSpans, hotCoverage, canRecommendTension, searchList,
    renderTensionEvidence, resolveRacketTension, compareSelection, thaiRacketListing, racketMatchesFilters, exactWeightRating, racketNumericDifference };
  const verdict = n => n >= 80 ? ['เข้ากันดีมาก', 'var(--color-accent)'] : n >= 65 ? ['เข้ากันดี', 'var(--color-accent)'] : n >= 50 ? ['พอใช้ได้', 'var(--color-ink)'] : ['ไม่ค่อยเหมาะ', 'var(--color-bad)'];

  const MATCH_OPTIONS = [
    ['level', 'ระดับมือ', L.level], ['style', 'สไตล์', L.style],
    ['shuttle', 'ลูกที่ใช้', { feather: 'ขนไก่/ขนเป็ด', nylon: 'ไนลอน' }],
    ['game', 'เล่น', { doubles: 'คู่', singles: 'เดี่ยว' }],
    ['arm', 'ข้อมือ/ไหล่', { none: 'ปกติ', care: 'มีอาการ ต้องถนอม' }],
    ['climate', 'สนาม', { normal: 'ปกติ/ห้องแอร์', hot: 'ร้อนชื้น' }],
    ['head', 'หน้าไม้', { '': 'ตามข้อมูลไม้', large: 'กว้าง', standard: 'มาตรฐาน', small: 'เล็ก' }],
    ['cur', 'ไม้ที่ใช้อยู่หนัก', { '': 'ไม่ระบุ', '3U': '3U', '4U': '4U', '5U': '5U' }],
    ['budget', 'งบไม้', { '': 'ไม่จำกัด', 2000: '≤ 2,000', 4000: '≤ 4,000', 7000: '≤ 7,000' }],
  ];
  const MATCH_DEFAULTS = { level: 'intermediate', style: 'attack', shuttle: 'feather', climate: 'normal', game: 'doubles', arm: 'none' };

  function matchLinkOptions(link) {
    const options = { ...MATCH_DEFAULTS };
    for (const [key, , values] of MATCH_OPTIONS) {
      if (Object.hasOwn(values, link[key])) options[key] = link[key];
    }
    for (const key of ['r', 's', 'variant']) {
      if (typeof link[key] === 'string' && link[key]) options[key] = link[key];
    }
    return options;
  }

  function viewMatch() {
    if (!state.m || state.linkM) {
      const pick = (kind, id) => (byId(kind, id) || [...db[kind]].sort(sortName)[0] || {}).id;
      state.m = { r: pick('r', 'yonex-astrox-99-game'), s: pick('s', 'yonex-bg66-ultimax'), ...matchLinkOptions(state.linkM || {}) };
      state.linkM = null;
    }
    if (!db.r.length || !db.s.length) { view.innerHTML = '<h1>จับคู่ไม้ + เอ็น</h1><p class="empty">ต้องมีข้อมูลไม้และเอ็นอย่างน้อยอย่างละ 1 รายการ</p>'; return; }
    // Keep the current playing preferences when coming from a comparison.
    if (state.mPick) {
      const [kind, id, variant] = state.mPick;
      if (byId(kind, id)) {
        if (kind === 'r') state.m.variant = variant || '';
        state.m[kind] = id;
      }
      state.mPick = null;
    }
    if (!byId('r', state.m.r)) { state.m.r = db.r[0].id; state.m.variant = ''; }
    if (!byId('s', state.m.s)) state.m.s = db.s[0].id;
    if (!matchWeights(byId('r', state.m.r)).includes(state.m.variant)) state.m.variant = '';
    const seg = (key, label, map) => `<div class="mseg"><span class="mseg-l">${label}</span><div class="mseg-b" role="group" aria-label="${label}">${
      Object.entries(map).map(([k, v]) => `<button type="button" data-k="${key}" data-v="${k}" aria-pressed="${(state.m[key] || '') === k}">${v}</button>`).join('')}</div></div>`;

    const matchSettings = rows => rows.map(([key, label, values]) => seg(key, label, values)).join('');
    view.innerHTML = `
      <div class="match-heading"><h1>จับคู่ไม้ + เอ็น</h1><button class="btn sm ghost" type="button" data-mshare>แชร์ผล</button></div>
      <div class="mpick">
        <div class="mcard" id="pick-r"></div>
        <div class="mcard" id="pick-s"></div>
      </div>
      <div class="match-options" id="mopts">
        <div class="msegs match-basic">${matchSettings(MATCH_OPTIONS.slice(0, 2))}</div>
        <details class="match-more"><summary>ตั้งค่าเพิ่มเติม <span class="muted small" data-more-count hidden></span></summary>
          <div class="msegs">${matchSettings(MATCH_OPTIONS.slice(2))}</div>
        </details>
      </div>
      <div id="mres"></div>
      <section class="mlog" id="mlog"></section>`;
    logEvents();

    // each picker: the chosen item as a card, and a search box that lists matches with their pictures
    const card = kind => {
      const x = byId(kind, state.m[kind]);
      const variants = kind === 'r' ? matchWeights(x) : [];
      const bands = kind === 'r' ? x.tensionByWeight || {} : {};
      const spec = kind === 'r'
        ? [x.modelCode, lab(x, 'style'), lab(x, 'balance'), lab(x, 'flex'), L.head[x.head], estimatedValue(x, 'weights'), x.tension && !Object.keys(bands).length ? estimatedValue(x, 'tension', tensionText(x.tension)) : ''].filter(Boolean)
        : [gaugeLabel(x), L.material[x.material], x.tensionMax ? estimatedValue(x, 'tensionMax', '≤ ' + x.tensionMax + ' lbs') : ''].filter(Boolean);
      view.querySelector('#pick-' + kind).innerHTML = `
        <h2 class="mcard-k">${kind === 'r' ? 'ไม้แบด' : 'เอ็น'}</h2>
        <div class="mcard-in">
          ${x.img ? `<img src="${esc(x.img)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : '<div class="mimg-empty" aria-hidden="true"></div>'}
          <div class="mcard-t"><div class="mcard-b">${esc(x.brand)}</div><div class="mcard-n">${esc(x.name)}</div>
            <div class="mcard-s">${spec.map(esc).join(', ')}</div>
            <div class="mcard-p">${x.price ? est(x, 'price') + baht(x.price) : ''}</div></div>
        </div>
        ${variants.length ? `<label class="small match-variant">เวตไม้
          <select class="input" data-variant aria-required="true">
            <option value="">เลือกเวตเพื่อดูปอนด์แนะนำ</option>
            ${variants.map(key => {
              const range = Object.hasOwn(bands, key) ? bands[key] : null;
              return `<option value="${esc(key)}"${state.m.variant === key ? ' selected' : ''}>${esc(key)}${range ? ` (${esc(estimatedValue(x, 'tension', tensionText(range)))})` : ''}</option>`;
            }).join('')}
          </select>
        </label>` : ''}
        <div class="msearch"><input type="search" placeholder="${kind === 'r' ? 'เปลี่ยนไม้ด้วยชื่อหรือรหัสรุ่น' : 'ค้นหาเอ็นรุ่นอื่น'}" aria-label="ค้นหา${kind === 'r' ? 'ไม้' : 'เอ็น'}" data-q="${kind}"><div class="mlist" role="listbox" hidden></div></div>`;
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
    const choose = (kind, id) => {
      if (kind === 'r' && state.m.r !== id) state.m.variant = '';
      state.m[kind] = id;
      card(kind);
      renderMatch();
    };
    ['r', 's'].forEach(card);
    view.querySelector('.mpick').addEventListener('input', e => { if (e.target.dataset.q) search(e.target.dataset.q, e.target.value); });
    view.querySelector('.mpick').addEventListener('change', e => {
      if (!e.target.matches('[data-variant]')) return;
      state.m.variant = e.target.value;
      renderMatch();
    });
    view.querySelector('.mpick').addEventListener('keydown', e => {
      if (e.key === 'Enter' && e.target.dataset.q) { const first = view.querySelector(`#pick-${e.target.dataset.q} .mlist [data-pick]`); if (first) { e.preventDefault(); first.click(); } }
      if (e.key === 'Escape' && e.target.dataset.q) { e.target.value = ''; search(e.target.dataset.q, ''); }
    });
    view.querySelector('.mpick').addEventListener('click', e => {
      const b = e.target.closest('[data-pick]'); if (!b) return;
      const [kind, id] = b.dataset.pick.split(':'); choose(kind, id);
    });
    view.querySelector('[data-mshare]').onclick = e => shareLink(e.currentTarget, 'แชร์ผลนี้');
    view.querySelector('#mopts').addEventListener('click', e => {
      const b = e.target.closest('[data-k]'); if (!b) return;
      state.m[b.dataset.k] = b.dataset.v;
      b.parentElement.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', x === b));
      renderMatch();
    });
    view.querySelector('#mres').addEventListener('click', e => {
      if (e.target.closest('[data-focus-variant]')) {
        view.querySelector('[data-variant]')?.focus();
        return;
      }
      const a = e.target.closest('[data-pick]'); if (!a) return;
      const [kind, id] = a.dataset.pick.split(':'); choose(kind, id);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
    renderMatch();
  }

  function renderMatch() {
    const { level, style } = state.m, shuttle = state.m.shuttle || 'feather', climate = state.m.climate || 'normal';
    const game = state.m.game || 'doubles', arm = state.m.arm || 'none';
    const r = byId('r', state.m.r), s = byId('s', state.m.s);
    const advanced = MATCH_OPTIONS.slice(2).filter(([key]) => (state.m[key] || '') !== (MATCH_DEFAULTS[key] || '')).length;
    const moreCount = view.querySelector('[data-more-count]');
    moreCount.hidden = !advanced;
    moreCount.textContent = advanced ? `ปรับแล้ว ${advanced}` : '';
    const mo = calcOffset(mylog.entries);   // the player's own offset, from the tension log
    const scoreFor = (racket, string) => mineAdj(score(racket, string, level, style, shuttle, climate, game, arm,
      state.m.head || '', racket.id === r.id ? state.m.variant : ''), mo);
    const res = scoreFor(r, s);
    history.replaceState(null, '', '#match?' + new URLSearchParams(Object.entries(state.m).filter(([, v]) => v)));
    const [vt, vc] = verdict(res.score);
    const allS = db.s.filter(x => x.id !== s.id).map(x => ({ x, ...scoreFor(r, x) })).sort((a, b) => b.score - a.score || a.guess.length - b.guess.length);
    // rank by score less 2 points per racket spec that is a guess, so a racket whose specs are stated beats one guessed to tie it
    // on a tie: a real Thai price first, then the racket with more of its specs known
    const known = x => (Number(x.price) && !(x.est || []).includes('price') ? 5 : 0) + ['tension', 'weights', 'weight', 'length', 'year', 'frame', 'shaft', 'level'].filter(f => x[f]).length;
    const sure = a => a.score - 2 * (a.x.est || []).filter(f => f !== 'price').length - (a.x.flex && a.x.balance ? 0 : 4);
    // the racket finder: every racket with this string, inside the budget (rackets with no price stay in), best first
    const budget = Number(state.m.budget) || 0, cur = state.m.cur || '';
    const ranked = db.r.map(x => ({ x, ...scoreFor(x, s) }))
      .filter(a => !budget || !Number(a.x.price) || Number(a.x.price) <= budget)
      .sort((a, b) => sure(b) - sure(a) || b.score - a.score || known(b.x) - known(a.x));
    const altR = ranked.slice(0, 5);
    const mine = ranked.find(a => a.x.id === r.id) || { x: r, ...res };
    // what one result wins on over another: the part with the biggest gap, then the racket spec behind it
    const edge = (a, b) => {
      const [k, n] = PARTS.map(([k, n]) => [k, n, a.parts[k] - b.parts[k]]).sort((p, q) => q[2] - p[2])[0];
      const d = a.parts[k] - b.parts[k];
      if (d <= 0) return a.score === b.score ? 'คะแนนเท่ากัน แต่ข้อมูลครบกว่าหรือมีราคาไทยจริง' : 'คะแนนรวมสูงกว่าเล็กน้อย';
      const tx = z => z.range[1] || 0, rec = z => z.reasons.some(([, t]) => t.includes('แนะนำเอ็นนี้'));
      const spec = k === 'racket' ? [['balance', ''], ['flex', ''], ['weights', 'น้ำหนัก ']]
        .filter(([f]) => a.x[f] && a.x[f] !== b.x[f]).map(([f, t]) => t + (f === 'weights' ? a.x[f] : lab(a.x, f))).join(', ')
        : k === 'pair' && rec(a) && !rec(b) ? 'ผู้ผลิตหรือร้านแนะนำเอ็นนี้คู่กับไม้นี้'
        : k === 'pair' && canRecommendTension(a) && canRecommendTension(b) && tx(a) !== tx(b) ? `รับความตึงได้ ${tx(a)} lbs เทียบ ${tx(b)} lbs` : '';
      return `ชนะที่${n} (+${d})${spec ? ': ' + spec : ''}${a.guess.length < b.guess.length ? ', ข้อมูลจริงมากกว่า' : ''}`;
    };
    // a weight class unlike the racket in hand changes swing and timing, so say so
    const ws = String(r.weights || '').toUpperCase().match(/\dU/g) || [];
    const curNote = cur && ws.length && !ws.includes(cur)
      ? `ไม้นี้มี ${ws.join('/')} แต่ไม้ที่ใช้อยู่ ${cur}: ${Number(cur[0]) > Math.max(...ws.map(w => Number(w[0]))) ? 'ไม้นี้หนักกว่า ช่วงแรกจะเหวี่ยงช้าลงและล้าข้อมือง่ายขึ้น ค่อยๆ ปรับ' : 'ไม้นี้เบากว่า สวิงเร็วขึ้นแต่ลูกตบอาจเบาลง ต้องปรับจังหวะ'}` : '';
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
          <span class="malt-m">${kind === 's' ? [gaugeLabel(a.x), a.x.price ? baht(a.x.price) : ''].filter(Boolean).map(esc).join(', ') : [L.style[a.x.style], lvText(a.x)].filter(Boolean).join(', ')}</span></span>
        <span class="malt-s"><b class="fig">${a.score}</b><span>คะแนน</span>${canRecommendTension(a) ? `<span class="fig">${a.tension} lbs</span>` : ''}</span>
      </button>`;
    // what the recommended tension feels like, and what 2 lbs either way changes (general string physics, not a maker's claim)
    function tensionFeel(res, s) {
      const t = res.tension, lo = Math.max(t - 2, res.limits.floor ?? 2), hi = Math.min(t + 2, res.limits.upper);
      const soft = ['ลูกเด้งออกจากหน้าเอ็นแรงขึ้น ตีไกลง่ายโดยไม่ต้องออกแรงมาก', 'จุดหวานกว้างขึ้น ตีไม่เต็มหน้าก็ยังไปได้', 'สะเทือนข้อมือน้อยลง เอ็นขาดยากขึ้น',
        'แต่คุมทิศทางและน้ำหนักลูกยากขึ้น ลูกตบหัวทิ่มลงน้อยลง'];
      const hard = ['คุมลูกได้แม่นขึ้น ลูกหยอดและลูกตัดคม เสียงเอ็นแน่นขึ้น', 'แต่จุดหวานแคบลง ต้องตีให้ตรงกลางหน้าเอ็น', 'ต้องใช้แรงและจังหวะมากขึ้น ข้อมือรับแรงสะเทือนมากขึ้น',
        Number(s.shock) && Number(s.shock) <= 4 ? 'เอ็นนี้ซับแรงน้อยอยู่แล้ว ยิ่งตึงยิ่งสะเทือน' : 'เอ็นขาดเร็วขึ้น'];
      return `<details class="mfeel"><summary>ความรู้สึกเมื่อขึ้น ${t} lbs</summary>
        <p class="small"><b>${t} lbs</b>: สมดุลระหว่างแรงส่งกับการคุมลูกสำหรับระดับและสไตล์ที่เลือก</p>
        ${lo < t ? `<p class="small"><b>หย่อนลง ~${lo} lbs</b></p><ul class="small">${soft.map(x => `<li>${x}</li>`).join('')}</ul>` : ''}
        ${hi > t ? `<p class="small"><b>ตึงขึ้น ~${hi} lbs</b></p><ul class="small">${hard.map(x => `<li>${x}</li>`).join('')}</ul>` : ''}
        <p class="small muted">หลักทั่วไป: ทุก 1–2 lbs รู้สึกต่างได้ เอ็นจะหย่อนลงเองราว 1–2 lbs ใน 1–2 วันแรก</p></details>`;
    }
    const { cap, unconfirmed, needsWeight, incompatibleRange } = res.limits;
    const showTension = canRecommendTension(res);
    const lo = Math.min(16, res.tension), hi = Math.max(36, cap);
    const pos = v => ((v - lo) / (hi - lo) * 100).toFixed(1);
    const ok = res.reasons.filter(x => x[0] === 'ok'), wn = res.reasons.filter(x => x[0] === 'wn');
    const sign = v => v > 0 ? '+' + v : String(v);

    const previousProof = view.querySelector('.mtension-evidence');
    const evidence = renderTensionEvidence(r, state.m.variant, previousProof?.dataset.racket === r.id && previousProof.open);
    view.querySelector('#mres').innerHTML = `
      <section class="mhero">
        <div class="mten">
          <div class="mten-k">${showTension ? 'ความตึงที่แนะนำ' : 'ยังไม่มีปอนด์แนะนำ'}</div>
          ${showTension ? `<div class="tension">${res.tension} <span>lbs</span></div>
          <div class="mscale" aria-hidden="true">
            <span class="mscale-band" style="left:${pos(res.band[0])}%;width:${(pos(res.band[1]) - pos(res.band[0])).toFixed(1)}%"></span>
            <span class="mscale-cap" style="left:${pos(cap)}%"></span>
            <span class="mscale-dot" style="left:${pos(res.tension)}%"></span>
          </div>
          <div class="mscale-l small muted"><span>${lo}</span><span>ช่วง${L.level[level]} ${res.band[0]}–${res.band[1]}, เพดาน ${cap}</span><span>${hi}</span></div>
          ${tensionFeel(res, s)}
          <details class="mfeel match-steps"><summary>วิธีคำนวณปอนด์</summary><ul class="steps">${res.steps.map(([why, v], i) => `<li><span>${esc(why)}</span><b class="fig">${i ? sign(v) : v}</b></li>`).join('')}</ul></details>` : `
          ${needsWeight ? '<p class="small note">เลือกเวตที่ระบุบนไม้เพื่อดูปอนด์แนะนำ <button class="btn sm ghost match-choose-weight" type="button" data-focus-variant>เลือกเวต</button></p>' : ''}
          ${unconfirmed.length ? `<p class="small note">เช็กความตึงสูงสุดที่${unconfirmed.join('และ')}รองรับจากสเปกตรงรุ่นก่อนขึ้นเอ็น</p>` : ''}
          ${incompatibleRange && !needsWeight && !unconfirmed.length ? '<p class="small note">ช่วงความตึงของไม้กับเอ็นไม่ทับกัน ลองเลือกเอ็นรุ่นอื่น</p>' : ''}`}
          ${evidence}
        </div>
        <div class="mscore match-score">
          <div><p class="mten-k">ความเข้ากัน</p><div class="match-score-value">${res.score}<span> / 100</span></div>
          <p class="verdict" style="--verdict-color:${vc}">${vt}</p></div>
          <details class="mfeel"><summary>ที่มาของคะแนน</summary>
            <div class="parts">${PARTS.map(([k, n, w]) => `
              <div class="part"><span>${n} <span class="muted">${Math.round(w * 100)}%</span></span><span class="bar"><i style="--w:${res.parts[k]}"></i></span><b class="fig">${res.parts[k]}</b></div>`).join('')}
            </div>
            <p class="small muted">${S_KEYS.filter(key => s[key] !== '' && s[key] != null).map(key => `${S_NAME[key]} ${estimatedValue(s, key)}`).map(esc).join(' / ')}</p>
            <p class="small muted">ความมั่นใจ: <b>${res.conf}</b>${res.guess.length ? `, ค่าประเมิน: ${esc(res.guess.join(', '))}` : ''}</p>
          </details>
        </div>
      </section>
      <section class="mwhy">
        <div><h3>ทำไมเข้ากัน</h3><ul class="reasons">${ok.map(([, t]) => `<li><span class="ok">✓</span><span>${esc(t)}</span></li>`).join('') || '<li class="muted">ไม่มีจุดเด่นเป็นพิเศษ</li>'}</ul></div>
        <div><h3>ข้อควรระวัง</h3><ul class="reasons">${curNote ? `<li><span class="wn">!</span><span>${esc(curNote)}</span></li>` : ''}${wn.map(([, t]) => `<li><span class="wn">!</span><span>${esc(t)}</span></li>`).join('') || (curNote ? '' : '<li class="muted">ไม่มีข้อควรระวัง</li>')}</ul></div>
      </section>
      <h2>เอ็นที่น่าลองกับไม้นี้</h2>
      <div class="malts">${goals.map(([tag, a]) => altCard(a, 's', tag)).join('')}</div>
      <h2>ไม้ที่เหมาะกับคุณ 5 อันดับ${budget ? ` (งบ ≤ ${baht(budget)})` : ''}</h2>
      <p class="small muted">จับกับเอ็นที่เลือก${budget ? ' ไม้ที่ยังไม่มีราคารวมอยู่ด้วย' : ''}${altR[0] && altR[0].x.id !== r.id ? `. ไม้ที่เลือกอยู่อันดับ ${ranked.indexOf(mine) + 1 || '-'} แพ้อันดับ 1 เพราะอันดับ 1 ${esc(edge(altR[0], mine))}` : ''}</p>
      <ol class="mrank">${altR.map((a, i) => `<li>${altCard(a, 'r', a.x.id === r.id ? 'ที่เลือกอยู่' : '')}<p class="small muted">${i < altR.length - 1 ? esc(edge(a, altR[i + 1])) + ' เทียบกับอันดับ ' + (i + 2) : ''}</p></li>`).join('')}</ol>
      <p class="note">คะแนนและปอนด์ที่แนะนำคำนวณจากสเปกไม้ คะแนนเอ็น และระดับ/สไตล์ที่เลือก ไม่ใช่ตัวเลขที่ผู้ผลิตประกาศ ควรปรึกษาช่างขึงเอ็นประกอบ</p>`;
    renderLog(r, s, res, mo);
  }

  // the log form, the entries, the offset in force and the export, under the results
  function renderLog(r, s, res, mo) {
    const box = view.querySelector('#mlog'); if (!box) return;
    const es = mylog.entries, msg = state.mlogMsg || ''; state.mlogMsg = '';
    const sign = v => v > 0 ? '+' + v : String(v);
    box.innerHTML = `
      <h2>บันทึกการขึ้นเอ็นของฉัน</h2>
      <p class="small muted">ขึ้นเอ็นแล้วลองตีสักพัก มาบอกว่ารู้สึกยังไง ค่าที่แนะนำจะขยับตามความชอบของคุณ เก็บไว้ในเบราว์เซอร์นี้เท่านั้น</p>
      <form class="mlogf" id="mlogf">
        <p class="small">บันทึกชุดนี้: <b>${esc(full(r))} + ${esc(full(s))}</b>, ${L.level[state.m.level]}สาย${L.style[state.m.style]}</p>
        <label class="mlogl">ขึ้นกี่ปอนด์ <input class="input" type="number" name="lbs" min="14" max="40" step="any" value="${canRecommendTension(res) ? res.tension : ''}" required></label>
        <fieldset class="mlogfeel"><legend class="small">ตีแล้วรู้สึก</legend>
          ${Object.entries(FEEL).map(([k, v]) => `<label><input type="radio" name="feel" value="${k}"${k === 'good' ? ' checked' : ''}> ${v}</label>`).join('')}
        </fieldset>
        <label class="mlogl">หมายเหตุ <input class="input" type="text" name="note" maxlength="120" placeholder="เช่น ตีสองสัปดาห์แล้ว"></label>
        <button class="btn" type="submit">บันทึก</button> <span class="small" role="status">${esc(msg)}</span>
      </form>
      ${es.length ? `
        <p class="small"><b>${mo.n ? (mo.off ? `ค่าที่แนะนำปรับ ${sign(mo.off)} lbs` : 'ยังไม่ปรับค่าแนะนำ') + ` จาก ${mo.n} บันทึก` : 'ยังไม่มีบันทึกที่ข้อมูลพอใช้ปรับปอนด์แนะนำ'}</b>
          <label class="mlogon"><input type="checkbox" data-logon ${mylog.on ? 'checked' : ''}> ใช้ค่าปรับนี้</label></p>
        <ul class="mloglist">${es.slice().reverse().map(e => `<li>
          <span><b class="fig">${esc(e.lbs)} lbs</b> ${esc(FEEL[e.feel] || '')}, ${esc(e.rn || '')} + ${esc(e.sn || '')}<span class="small muted"> ${esc(e.date || '')}${e.note ? ', ' + esc(e.note) : ''}</span></span>
          <button type="button" class="btn sm" data-logdel="${esc(e.id)}" aria-label="ลบบันทึกนี้">ลบ</button></li>`).join('')}</ul>
        <p><button type="button" class="btn sm" data-logcopy>คัดลอกเป็นแถวสำหรับ tests/feedback.js</button>
          <button type="button" class="btn sm" data-logclear>ล้างบันทึกทั้งหมด</button></p>
        <p class="small muted">ค่าปรับเฉลี่ยจากทุกบันทึก ไม่เกิน ±${OFF_MAX} lbs และไม่เกินเพดานของไม้และเอ็น "หย่อนไป" ถือว่าที่พอดีอยู่สูงกว่าที่ขึ้นราว ${FEEL_GAP} lbs "ตึงไป" ต่ำกว่าราว ${FEEL_GAP} lbs</p>` : ''}`;
  }
  // one row of tests/feedback.js for each entry, options only where they are not the defaults
  function logRows() {
    const q = x => "'" + String(x).replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'";
    const DEF = { shuttle: 'feather', climate: 'normal', game: 'doubles', arm: 'none', head: '', variant: '' };
    return mylog.entries.filter(e => e.rn && e.sn).map(e => {
      const o = Object.entries(e.o || {}).filter(([k, v]) => v && DEF[k] !== v).map(([k, v]) => `${k}: ${q(v)}`).join(', ');
      return `  { racket: ${q(e.rn)}, string: ${q(e.sn)}, level: ${q(e.level)}, style: ${q(e.style)}, lbs: ${Number(e.lbs)}, feel: ${q(e.feel)}${o ? `, options: { ${o} }` : ''}, who: '', date: ${q(e.date || '')} },`;
    }).join('\n');
  }
  function logEvents() {
    const box = view.querySelector('#mlog');
    box.addEventListener('submit', e => {
      e.preventDefault();
      const f = new FormData(e.target), lbs = Number(f.get('lbs')), feel = f.get('feel');
      const r = byId('r', state.m.r), s = byId('s', state.m.s);
      if (!(lbs >= 14 && lbs <= 40) || !FEEL[feel] || !r || !s) { state.mlogMsg = 'ปอนด์ต้องอยู่ระหว่าง 14–40'; renderMatch(); return; }
      const o = {}; for (const k of ['shuttle', 'climate', 'game', 'arm', 'head', 'variant']) if (state.m[k]) o[k] = state.m[k];
      mylog.entries.push({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), r: r.id, s: s.id, rn: full(r), sn: full(s),
        level: state.m.level, style: state.m.style, o, lbs, feel, note: String(f.get('note') || '').trim().slice(0, 120), date: new Date().toISOString().slice(0, 10) });
      logSave(); state.mlogMsg = 'บันทึกแล้ว'; renderMatch();
    });
    box.addEventListener('change', e => { if (e.target.matches('[data-logon]')) { mylog.on = e.target.checked; logSave(); renderMatch(); } });
    box.addEventListener('click', e => {
      const del = e.target.closest('[data-logdel]'), cp = e.target.closest('[data-logcopy]'), clr = e.target.closest('[data-logclear]');
      if (del) { mylog.entries = mylog.entries.filter(x => x.id !== del.dataset.logdel); logSave(); renderMatch(); }
      else if (clr) { if (confirm('ล้างบันทึกการขึ้นเอ็นทั้งหมด?')) { mylog.entries = []; logSave(); renderMatch(); } }
      else if (cp) {
        const txt = logRows(), done = () => { cp.textContent = 'คัดลอกแล้ว'; setTimeout(() => { cp.textContent = 'คัดลอกเป็นแถวสำหรับ tests/feedback.js'; }, 1600); };
        navigator.clipboard?.writeText(txt).then(done, () => { prompt('คัดลอกแถวนี้', txt); });
      }
    });
  }

  // ---------- manage ----------
  const FIELDS = {
    r: [
      ['brand', 'แบรนด์ *', 'text', { list: 1 }], ['name', 'ชื่อรุ่น *', 'text'], ['year', 'ปีที่ออก', 'number'],
      ['style', 'แนวการเล่น', 'select', L.style], ['balance', 'สมดุล', 'select', L.balance], ['bp', 'จุดสมดุล (mm)', 'number', { step: '0.5' }],
      ['flex', 'ความแข็งก้าน', 'select', L.flex], ['level', 'ระดับผู้เล่น', 'select', L.level], ['levelTo', 'ระดับผู้เล่น (ถึง ถ้าเป็นช่วง)', 'select', L.level],
      ['weights', 'น้ำหนัก (เช่น 3U, 4U)', 'text'], ['weight', 'น้ำหนักเฉลี่ย (g)', 'number'], ['grips', 'ขนาดด้าม', 'text'],
      ['tmin', 'ความตึงต่ำสุด (lbs)', 'number'], ['tmax', 'ความตึงสูงสุด (lbs)', 'number'], ['price', 'ราคาประมาณ (บาท)', 'number'],
      ['frame', 'วัสดุเฟรม', 'text'], ['shaft', 'วัสดุก้าน', 'text'], ['joint', 'ข้อต่อเฟรม-ก้าน', 'text'], ['length', 'ความยาว', 'text'],
      ['head', 'ขนาดหน้าไม้', 'select', L.head], ['pattern', 'ผังเอ็น', 'text'], ['madeIn', 'ผลิตที่', 'text'], ['recString', 'เอ็นที่ผู้ผลิตแนะนำ', 'text'],
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
  const NUMERIC = new Set(['year', 'bp', 'weight', 'tmin', 'tmax', 'price', 'gauge', 'repulsion', 'control', 'durability', 'sound', 'shock', 'tensionMax']);
  const slug = s => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9ก-๙]+/g, '-').replace(/^-|-$/g, '') || 'item';

  function viewManage() {
    const mg = state.mg, kind = mg.kind;
    const query = searchQuery(mg.q);
    const list = db[kind].filter(x => !mg.q || matchScore(x, query) > 0).sort(sortName);
    const editing = mg.edit === 'new' ? {} : mg.edit ? byId(kind, mg.edit) : null;

    view.innerHTML = `
      <h1>จัดการข้อมูล</h1>
      <div class="subtabs">
        <button class="btn ${kind === 'r' ? 'on' : ''}" data-k="r">ไม้แบด (${db.r.length})</button>
        <button class="btn ${kind === 's' ? 'on' : ''}" data-k="s">เอ็น (${db.s.length})</button>
      </div>
      <div class="note">
        เว็บใช้แคตตาล็อกล่าสุดร่วมกับรายการที่คุณเพิ่ม แก้ หรือลบในเบราว์เซอร์นี้ ${isCustom(kind) ? '<b>(มีข้อมูลส่วนตัว)</b>' : ''}
        ${pendingLegacy.has(kind) ? '<p>กำลังแสดงข้อมูลเดิม ลองรีเฟรชเพื่อย้ายรายการแก้ไข หรือกด Export ชุดเดิมเพื่อสำรอง</p>' : ''}
        ใช้ <b>Export</b> สำรองข้อมูล แล้วใช้ <b>Import</b> ในหมวดเดียวกันเมื่อต้องการกู้คืนหรือย้ายเครื่อง
      </div>
      <div class="toolbar">
        <button class="btn primary" data-a="new">+ เพิ่ม${kind === 'r' ? 'ไม้' : 'เอ็น'}ใหม่</button>
        <input type="search" id="mq" class="input grow" placeholder="ค้นหา…" value="${esc(mg.q)}">
        <span class="sp"></span>
        <button class="btn" data-a="export">Export</button>
        ${legacy.has(kind) ? '<button class="btn" data-a="export-legacy">Export ชุดเดิม</button>' : ''}
        <button class="btn" type="button" data-a="import">Import</button>
        <input type="file" id="imp" accept=".js,.json" hidden>
        <button class="btn danger" data-a="reset">รีเซ็ต</button>
      </div>
      <div id="edit">${editing ? formHtml(kind, editing) : ''}</div>
      <div class="tbl-wrap">
        <table class="list">
          <thead><tr><th>รุ่น</th><th>${kind === 'r' ? 'แนว / ระดับ' : 'ขนาด / วัสดุ'}</th><th>ราคา</th><th></th></tr></thead>
          <tbody>${list.map(x => `<tr>
            <td><b>${esc(full(x))}</b>${x.year ? ` <span class="muted small">${esc(estimatedValue(x, 'year'))}</span>` : ''}</td>
            <td class="small">${kind === 'r' ? [L.style[x.style], lvText(x)].filter(Boolean).join(', ') : esc(gaugeLabel(x)) + ', ' + esc(L.material[x.material] || '')}</td>
            <td class="small">${kind === 'r' ? baht(x.price) : (x.price ? esc(x.price) + ' บาท' : '—')}</td>
            <td><button class="btn sm" data-ed="${esc(x.id)}">แก้ไข</button> <button class="btn sm" data-dup="${esc(x.id)}">ทำสำเนา</button> <button class="btn sm danger" data-del="${esc(x.id)}">ลบ</button></td>
          </tr>`).join('') || '<tr><td colspan="4" class="empty">ไม่มีรายการ</td></tr>'}</tbody>
        </table>
      </div>`;

    view.querySelector('.subtabs').onclick = e => { const k = e.target.dataset.k; if (k) { mg.kind = k; mg.edit = null; viewManage(); } };
    view.querySelector('#mq').oninput = e => { mg.q = e.target.value; const p = e.target.selectionStart; viewManage(); const n = view.querySelector('#mq'); n.focus(); n.setSelectionRange(p, p); };
    view.querySelector('#imp').onchange = e => {
      const file = e.target.files[0];
      e.target.value = '';
      if (file) importFile(kind, file);
    };
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
    else if (t.dataset.a === 'export-legacy' && legacy.has(kind)) {
      const backup = legacy.get(kind);
      try { exportFile(kind, backup.items || JSON.parse(backup.cache), '-legacy'); }
      catch { alert('อ่านข้อมูลชุดเดิมไม่ได้'); }
    }
    else if (t.dataset.a === 'import') view.querySelector('#imp').click();
    else if (t.dataset.a === 'reset') {
      if (confirm('ล้างข้อมูลที่แก้ในเบราว์เซอร์ แล้วกลับไปใช้ไฟล์ต้นฉบับ? (ควร Export เก็บไว้ก่อน)')) {
        if (storeCatalog(kind, catalogDelta(BASE[kind], BASE[kind]))) {
          pendingLegacy.delete(kind);
          db[kind] = clone(BASE[kind]);
          mg.edit = null;
          viewManage();
        } else alert('รีเซ็ตไม่ได้ ข้อมูลในเบราว์เซอร์อาจเต็มหรือเปลี่ยนจากแท็บอื่น');
      }
    }
    else if (t.dataset.ed) { mg.edit = t.dataset.ed; viewManage(); }
    else if (t.dataset.dup) {
      const src = byId(kind, t.dataset.dup); if (!src) return;
      const copy = { ...clone(src), name: src.name + ' (สำเนา)' };
      copy.id = uniqueId(kind, slug(full(copy)));
      const items = [...db[kind], copy];
      if (!persist(kind, items)) return;
      mg.edit = copy.id;
      viewManage();
    }
    else if (t.dataset.del) {
      const x = byId(kind, t.dataset.del);
      if (x && confirm(`ลบ ${full(x)}?`)) {
        const items = db[kind].filter(y => y.id !== x.id);
        if (!persist(kind, items)) return;
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
      if (old && k !== 'tmin' && k !== 'tmax' && raw === String(old[k] ?? '').trim()) continue;
      item[k] = NUMERIC.has(k) ? (raw === '' ? '' : Number(raw)) : raw;
    }
    for (const key of ['year', 'price']) {
      if (old && !sameField(item[key], old[key])) for (const dependent of catalogSources.get(key)) delete item[dependent];
    }
    if (kind === 's' && item.tensionMax !== '' && (!Number.isFinite(item.tensionMax) || item.tensionMax < 2)) {
      alert('ความตึงสูงสุดของเอ็นต้องมีค่าอย่างน้อย 2 lbs');
      return;
    }
    if (kind === 'r') {
      if (!(ordIdx('level', item.levelTo, -1) > ordIdx('level', item.level, 99))) item.levelTo = '';   // only a higher level makes a range
      item.tension = item.tmin !== '' || item.tmax !== ''
        ? [item.tmin === '' ? null : item.tmin, item.tmax === '' ? null : item.tmax] : null;
      if (!validTension(item.tension)) {
        alert('ความตึงต้องเป็นจำนวนบวก และค่าต่ำสุดต้องไม่เกินค่าสูงสุด');
        return;
      }
      delete item.tmin; delete item.tmax;
      const tensionChanged = JSON.stringify(old?.tension || null) !== JSON.stringify(item.tension);
      if (tensionChanged) {
        item.tensionNote = '';
        item.tensionByWeight = {};
        delete item.tensionSrc;
      }
      // a field the user set by hand is no longer an estimate
      item.est = (item.est || []).filter(f => old && (f === 'tension' ? !tensionChanged : old[f] === item[f]));
    }
    if (!old) item.id = uniqueId(kind, slug(full(item)));
    const items = old ? db[kind].map(x => x.id === old.id ? item : x) : [...db[kind], item];
    if (!persist(kind, items)) return;
    mg.edit = null;
    viewManage();
  }

  function exportFile(kind, rows = db[kind], suffix = '') {
    const name = kind === 'r' ? 'rackets' : 'strings';
    const head = kind === 'r'
      ? '// ข้อมูลไม้แบด — style: attack|speed|control|allround, balance: head-light|even|head-heavy,\n// flex: flexible|medium|stiff|extra-stiff, level: beginner|intermediate|advanced|pro (levelTo: the top of a range)\n'
      : '// ข้อมูลเอ็น — material: multi|mono|braided|hybrid|coated, คะแนน 1–10\n';
    const delta = suffix || pendingLegacy.has(kind) ? null : edits[kind] || catalogDelta(BASE[kind], rows);
    const backup = delta ? `// RacketS v2: ${JSON.stringify({ kind, added: delta.added.map(x => x.id),
      changed: delta.changed.map(({ item, fields }) => [item.id, fields]), removed: delta.removed })}\n` : '';
    const text = `${head}${backup}window.${name.toUpperCase()} = ${JSON.stringify(rows, null, 2)};\n`;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: 'text/javascript' }));
    a.download = `${name}${suffix}.js`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  function validTension(range) {
    if (range == null) return true;
    if (!Array.isArray(range) || range.length !== 2) return false;
    const [min, max] = range;
    return (min != null || max != null) &&
      range.every(value => value === null || (Number.isFinite(value) && value > 0)) &&
      (max === null || (max >= 2 && (min === null || min <= max)));
  }

  function parseImport(kind, text) {
    const expected = kind === 'r' ? 'RACKETS' : 'STRINGS';
    const js = text.match(/^\s*(?:\/\/[^\r\n]*(?:\r?\n|$)\s*)*window\.(RACKETS|STRINGS)\s*=\s*(\[[\s\S]*\])\s*;?\s*$/);
    if (js && js[1] !== expected) throw new Error('ไฟล์อยู่คนละหมวดกับแท็บที่เปิด');
    const rows = JSON.parse(js ? js[2] : text);
    if (!Array.isArray(rows)) throw new Error('ไฟล์ต้องมีรายการอุปกรณ์');
    const gearFields = { r: ['balance', 'flex', 'weights', 'tension', 'tensionByWeight'], s: ['gauge', 'gaugeText', 'material', 'repulsion', 'tensionMax'] };
    const ownFields = gearFields[kind], otherFields = gearFields[kind === 'r' ? 's' : 'r'];
    const ids = new Set();
    for (const [i, row] of rows.entries()) {
      const invalid = () => new Error(`ข้อมูลรายการที่ ${i + 1} ไม่ถูกต้อง`);
      if (!row || typeof row !== 'object' || Array.isArray(row) || Object.hasOwn(row, '__proto__') ||
          typeof row.id !== 'string' || !row.id || /[\s,:]/.test(row.id) || ids.has(row.id) ||
          !['brand', 'name'].every(key => typeof row[key] === 'string' && row[key].trim())) throw invalid();
      if (otherFields.some(key => Object.hasOwn(row, key))) throw new Error(`รายการที่ ${i + 1} อยู่คนละหมวดกับแท็บที่เปิด`);
      if (!js && !ownFields.some(key => Object.hasOwn(row, key))) throw new Error(`ระบุหมวดของรายการที่ ${i + 1} จากไฟล์ JSON นี้ไม่ได้`);
      ids.add(row.id);
      for (const [key, , type] of FIELDS[kind]) {
        const value = row[key];
        if (value == null || value === '' || (key === 'img' && value === false)) continue;
        if (type === 'number' ? !Number.isFinite(value) : typeof value !== 'string') throw invalid();
      }
      if (row.year != null && row.year !== '' && !Number.isFinite(row.year)) throw invalid();
      if (row.modelCode != null && typeof row.modelCode !== 'string') throw invalid();
      if (row.aliases != null && (!Array.isArray(row.aliases) || row.aliases.some(value => typeof value !== 'string' || !value.trim()))) throw invalid();
      if (row.generation != null && (!Number.isInteger(row.generation) || row.generation <= 0)) throw invalid();
      if (row.est != null && (!Array.isArray(row.est) || row.est.some(value => typeof value !== 'string'))) throw invalid();
      if (row.shopLinks != null && row.shopLinks !== '' &&
          (!Array.isArray(row.shopLinks) || row.shopLinks.some(value => !value || typeof value.url !== 'string' || typeof value.shop !== 'string'))) throw invalid();
      if (kind === 'r' && !validTension(row.tension)) throw invalid();
      if (row.tensionMax != null && row.tensionMax !== '' && row.tensionMax < 2) throw invalid();
      if (row.tensionByWeight != null) {
        if (!row.tensionByWeight || typeof row.tensionByWeight !== 'object' || Array.isArray(row.tensionByWeight) ||
            Object.entries(row.tensionByWeight).some(([weight, range]) =>
              !/^(?:[2-8][UF]|U)$/.test(weight) || !range?.[1] || !validTension(range)) ||
            (Object.keys(row.tensionByWeight).length && (!row.tension?.[1] ||
              Object.values(row.tensionByWeight).some(range => range[1] < row.tension[1])))) throw invalid();
      }
    }
    return rows;
  }

  function readCatalogBackup(kind, text, rows) {
    const header = text.match(/^\/\/ RacketS v2: ([^\r\n]+)$/m);
    if (!header) return null;
    const saved = JSON.parse(header[1]), items = new Map(rows.map(item => [item.id, item]));
    const seen = new Set();
    const validId = id => {
      if (typeof id !== 'string' || !id || /[\s,:]/.test(id) || seen.has(id)) return false;
      seen.add(id);
      return true;
    };
    const invalid = () => new Error('ข้อมูลการแก้ไขในไฟล์สำรองไม่ถูกต้อง');
    if (!saved || saved.kind !== kind || !['added', 'changed', 'removed'].every(key => Array.isArray(saved[key]))) throw invalid();
    if (!saved.removed.every(id => validId(id) && !items.has(id))) throw invalid();
    const added = saved.added.map(id => {
      if (!validId(id) || !items.has(id)) throw invalid();
      return items.get(id);
    });
    const changed = saved.changed.map(entry => {
      if (!Array.isArray(entry) || entry.length !== 2) throw invalid();
      const [id, fields] = entry, item = items.get(id);
      if (!validId(id) || !item || !Array.isArray(fields) || !fields.length || new Set(fields).size !== fields.length ||
          !fields.every(key => typeof key === 'string' && key !== 'id' && Object.hasOwn(item, key))) throw invalid();
      return { item, fields };
    });
    return { added, changed, removed: saved.removed };
  }

  async function importFile(kind, file) {
    let rows, delta;
    try {
      const text = await file.text();
      rows = parseImport(kind, text);
      delta = readCatalogBackup(kind, text, rows);
      if (!delta && kind === 'r') rows = updateSavedTension(rows);
    }
    catch (err) { alert(err instanceof SyntaxError ? 'อ่านไฟล์ไม่ได้ ตรวจรูปแบบ JSON หรือใช้ไฟล์จาก Export' : err.message); return; }
    const stillHere = () => location.hash.split('?')[0] === '#manage' && state.mg.kind === kind;
    if (!stillHere()) return;
    const message = delta ? 'แทนรายการแก้ไขส่วนตัวด้วยข้อมูลจากไฟล์ แล้วใช้ร่วมกับแคตตาล็อกปัจจุบัน?'
      : `แทนข้อมูลเดิม ${db[kind].length} รายการด้วยข้อมูลจากไฟล์ ${rows.length} รายการ?`;
    if (!confirm(message) || !saveCatalog(kind, delta || catalogDelta(BASE[kind], rows))) return;
    state.mg.edit = null;
    viewManage();
  }

  // ---------- ไม้น่าสนใจช่วงนี้: a top 5 per board among the newer models ----------
  // The data holds no sales or review numbers, so a board ranks on what is there: the radar profile worked out from the specs,
  // or the price. Only models with a known year (so "recent" means something) are in the pool; the profile leaves out an input a racket lacks,
  // and a racket needs its balance and one of flex or weight, so a missing flex does not keep a new model off the page
  // but one number alone cannot score 100; a row that still lacks one of them says so.
  function hotSpans(year = new Date().getFullYear()) {
    return [
      ['current', `ปี ${year}`, y => y === year],
      ['recent', `ปี ${year - 1}–${year}`, y => y >= year - 1 && y <= year],
      ['all', 'ทุกปีที่รู้', y => y > 0],
    ];
  }
  const HOT_BOARDS = [
    { title: 'ตบหนักสุด', hint: 'หัวหนัก ก้านแข็ง ไม้หนัก', axis: 0 },
    { title: 'คล่องตัวสุด', hint: 'หัวเบา ไม้เบา สะบัดไว', axis: 1 },
    { title: 'คุมลูกแม่นสุด', hint: 'สายคอนโทรล หัวสมดุล ก้านแข็ง', axis: 2 },
    { title: 'ตีง่ายสุด', hint: 'ก้านอ่อน ไม้เบา ระดับผู้เล่นไม่สูง', axis: 3 },
    { title: 'ราคาต่ำสุด', hint: 'เฉพาะรุ่นที่สเปกพอให้เทียบได้', price: true },
  ];
  // Junior rackets are a separate category and would otherwise dominate the price board.
  const hotHasYear = x => Number(x.year) > 0 && !(x.est || []).includes('year');
  const hotEligible = (x, inSpan) => hotHasYear(x) && inSpan(Number(x.year)) && x.balance &&
    (x.flex || Number(x.weight) > 0) && !/(^|[\s\d])jr(\s|$)|junior/i.test(x.name);
  function hotPeriod(span, year) {
    const spans = hotSpans(year);
    return (spans.find(([key]) => key === span) || spans[0])[2];
  }

  function hotCoverage(span, year, items = db.r) {
    const inSpan = hotPeriod(span, year), brands = new Map();
    for (const item of items) {
      if (!brands.has(item.brand)) brands.set(item.brand, { brand: item.brand, total: 0, dated: 0, eligible: 0 });
      const row = brands.get(item.brand);
      row.total++;
      if (hotHasYear(item)) row.dated++;
      if (hotEligible(item, inSpan)) row.eligible++;
    }
    return [...brands.values()].sort((a, b) => a.brand.localeCompare(b.brand));
  }

  function hotBoards(span, year) {
    const inSpan = hotPeriod(span, year);
    const pool = db.r.filter(x => hotEligible(x, inSpan));
    const prof = new Map(pool.map(x => [x, racketProfile(x)]));
    return HOT_BOARDS.map(b => {
      const rows = b.price
        ? pool.filter(x => Number(x.price) > 0).map(x => ({ x, v: Number(x.price) })).sort((a, c) => a.v - c.v || known(c.x) - known(a.x) || sortName(a.x, c.x))
        : pool.filter(x => prof.get(x)[b.axis] != null).map(x => ({ x, v: Math.round(prof.get(x)[b.axis] * 10) })).sort((a, c) => c.v - a.v || known(c.x) - known(a.x) || sortName(a.x, c.x));
      return { ...b, rows: rows.slice(0, 5), n: rows.length };
    });
  }
  function viewHot() {
    const total = db.r.length, dated = db.r.filter(hotHasYear).length;
    const year = new Date().getFullYear();
    view.innerHTML = `
      <h1>ไม้น่าสนใจช่วงนี้</h1>
      <p class="muted">จัดอันดับจากสเปก ตัดปีที่ยังไม่ยืนยันออก เหลือ ${dated} จาก ${total} รุ่นก่อนกรองสมดุล ความแข็งก้าน และน้ำหนัก</p>
      <div class="hot-span" role="group" aria-label="ช่วงปีที่ออก">${hotSpans(year).map(([k, t]) => `<button type="button" class="btn sm" data-span="${k}">${t}</button>`).join('')}</div>
      <details class="note">
        <summary>จำนวนรุ่นที่เข้าเกณฑ์แยกตามแบรนด์</summary>
        <div class="tbl-wrap">
          <table class="list">
            <thead><tr><th scope="col">แบรนด์</th><th scope="col">เข้าเกณฑ์ในช่วงนี้</th><th scope="col">มีปีเปิดตัว</th><th scope="col">ทั้งหมด</th></tr></thead>
            <tbody id="hot-coverage"></tbody>
          </table>
        </div>
      </details>
      <div class="hot-grid" id="hot-boards" aria-live="polite"></div>`;
    const paint = () => {
      view.querySelectorAll('[data-span]').forEach(b => { const on = b.dataset.span === state.hotSpan; b.classList.toggle('primary', on); b.classList.toggle('ghost', !on); b.setAttribute('aria-pressed', on); });
      view.querySelector('#hot-coverage').innerHTML = hotCoverage(state.hotSpan, year).map(row =>
        `<tr><th scope="row">${esc(row.brand)}</th><td>${row.eligible}</td><td>${row.dated}</td><td>${row.total}</td></tr>`).join('');
      view.querySelector('#hot-boards').innerHTML = hotBoards(state.hotSpan, year).map(b => `
        <section class="hot-board">
          <div class="hot-head"><h2>${b.title}</h2><span class="small muted">${b.hint}</span></div>
          ${b.rows.length ? `<ol class="hot-list">${b.rows.map(({ x, v }, i) => `
            <li><button type="button" class="hot-row" data-who="${esc(x.id)}">
              <span class="pos pos-${i + 1}">${i + 1}</span>
              ${x.img ? `<img class="hot-img" src="${esc(x.img)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : '<span class="hot-img hot-ph" aria-hidden="true"></span>'}
              <span class="hot-txt"><span class="nm">${esc(full(x))}</span><span class="small muted">${[L.style[x.style] && est(x, 'style') + 'สาย' + L.style[x.style], x.year, lab(x, 'level') || 'ไม่ระบุระดับ', !b.price && !(x.flex && Number(x.weight) > 0) && 'สเปกยังไม่ครบ', b.price ? '' : (x.price ? est(x, 'price') + baht(x.price) : '')].filter(Boolean).map(esc).join(', ')}</span></span>
              <b class="fig">${b.price ? est(x, 'price') + baht(v) : v}</b>
            </button></li>`).join('')}</ol>
            <p class="small muted">จาก ${b.n} รุ่น กดชื่อรุ่นเพื่อดูว่าเหมาะกับใคร</p>` : '<p class="small muted">ช่วงนี้ยังไม่มีรุ่นที่ข้อมูลพอ</p>'}
        </section>`).join('');
    };
    view.onclick = e => {
      const s = e.target.closest('[data-span]');
      if (s) { state.hotSpan = s.dataset.span; paint(); return; }
      const w = e.target.closest('[data-who]');
      if (w) showWho(w.dataset.who);
    };
    paint();
  }

  // ---------- router ----------
  const navMore = document.querySelector('.nav-more');
  document.addEventListener('click', e => {
    if (navMore?.open && (!navMore.contains(e.target) || e.target.closest('.nav-more a'))) navMore.open = false;
  });
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape' || !navMore?.open) return;
    navMore.open = false;
    if (navMore.contains(document.activeElement)) navMore.querySelector('summary').focus();
  });
  function route() {
    const [v0, qs] = location.hash.slice(1).split('?');
    const v = v0 || 'rackets';
    const params = new URLSearchParams(qs || '');
    state.linkSel = params.get('c');
    state.linkWeights = (params.get('w') || '').split(',');
    state.linkM = v === 'match' && qs ? Object.fromEntries(params) : null;
    document.querySelectorAll('#tabs a').forEach(a => {
      if (a.dataset.v === v) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    });
    if (navMore) navMore.open = false;
    tray.hidden = true;
    view.onclick = null;
    view.onpointermove = null;
    view.classList.remove('has-hero', 'racket-catalog');
    if (v === 'strings') viewCompare('s');
    else if (v === 'shuttles') viewCompare('h');
    else if (v === 'shoes') viewCompare('o');
    else if (v === 'socks') viewCompare('k');
    else if (v === 'hot') viewHot();
    else if (v === 'match') viewMatch();
    else if (v === 'manage') viewManage();
    else viewCompare('r');
    window.scrollTo(0, 0);
  }
  function start() {
    for (const kind of pendingLegacy) {
      const { items } = legacy.get(kind), reference = window.RS_CATALOG_V1?.[kind];
      if (reference) {
        const delta = migrateCatalog(BASE[kind], items, reference);
        if (storeCatalog(kind, delta)) {
          pendingLegacy.delete(kind);
          db[kind] = applyCatalogDelta(BASE[kind], delta);
          continue;
        }
      }
      db[kind] = kind === 'r' ? updateSavedTension(items) : items;
    }
    window.addEventListener('hashchange', route);
    route();
  }

  if (pendingLegacy.size && !window.RS_CATALOG_V1) {
    const appUrl = new URL(document.currentScript.src);
    const url = new URL('data/catalog-v1.js', appUrl);
    url.search = appUrl.search;
    const script = document.createElement('script');
    script.src = url.href;
    script.onload = start;
    script.onerror = start;
    document.head.append(script);
  } else start();
})();
