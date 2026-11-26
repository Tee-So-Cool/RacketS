// Scoring and data tests. Shared by tests/match.html (browser) and tests/run.js (node, CI).
// Needs window.RS_TEST (from app.js), the data globals and window.RS_FEEDBACK. Sets window.RS_CASES = [[name, fn], ...].
(() => {
const { score } = window.RS_TEST;
const sc2 = (r, lv) => score(r, S('Yonex BG66 Ultimax'), lv, 'attack').tension;
const R = n => RACKETS.find(x => (x.brand + ' ' + x.name).toLowerCase() === n.toLowerCase()) || (() => { throw new Error('no racket ' + n); })();
const S = n => STRINGS.find(x => (x.brand + ' ' + x.name).toLowerCase() === n.toLowerCase()) || (() => { throw new Error('no string ' + n); })();
const sc = (r, s, level, style, o = {}) => score(R(r), S(s), level, style, o.shuttle || 'feather', o.climate || 'normal', o.game || 'doubles', o.arm || 'none', o.head || '', o.variant || '');
const rejects = fn => {
  try { fn(); return false; } catch { return true; }
};
const cases = [
  ['มือใหม่: ไม้มือใหม่ดีกว่าไม้โปร', () => sc('Yonex Nanoflare 001 Clear', 'Yonex BG65', 'beginner', 'allround').score > sc('Yonex Astrox 100ZZ', 'Yonex BG65', 'beginner', 'allround').score],
  ['โปรสายบุก: Astrox 100ZZ ดีกว่า Muscle Power 2', () => sc('Yonex Astrox 100ZZ', 'Yonex Exbolt 63', 'pro', 'attack').score > sc('Yonex Muscle Power 2', 'Yonex Exbolt 63', 'pro', 'attack').score],
  ['โปรกับไม้อะลูมิเนียม ไม่เกิน 50', () => sc('Yonex Muscle Power 2', 'Yonex Exbolt 63', 'pro', 'attack').score <= 50],
  ['มือใหม่: BG65 (ทน) ดีกว่า Aerosonic (บาง)', () => sc('Yonex Muscle Power 2', 'Yonex BG65', 'beginner', 'allround').score > sc('Yonex Muscle Power 2', 'Yonex Aerosonic', 'beginner', 'allround').score],
  ['โปรสายบุก: Exbolt 63 ดีกว่า BG65', () => sc('Yonex Astrox 100ZZ', 'Yonex Exbolt 63', 'pro', 'attack').score > sc('Yonex Astrox 100ZZ', 'Yonex BG65', 'pro', 'attack').score],
  ['สายสปีด: Nanoflare 800 Pro ดีกว่า Astrox 100ZZ', () => sc('Yonex Nanoflare 800 Pro', 'Yonex BG66 Ultimax', 'advanced', 'speed').score > sc('Yonex Astrox 100ZZ', 'Yonex BG66 Ultimax', 'advanced', 'speed').score],
  ['ถนอมข้อมือ: Skyarc ดีกว่า BG80 Power', () => sc('Yonex Arcsaber 11 Pro', 'Yonex Skyarc', 'intermediate', 'control', { arm: 'care' }).score > sc('Yonex Arcsaber 11 Pro', 'Yonex BG80 Power', 'intermediate', 'control', { arm: 'care' }).score],
  ['ถนอมข้อมือ: ความตึงต่ำลง', () => sc('Yonex Arcsaber 11 Pro', 'Yonex BG66 Ultimax', 'intermediate', 'control', { arm: 'care' }).tension < sc('Yonex Arcsaber 11 Pro', 'Yonex BG66 Ultimax', 'intermediate', 'control').tension],
  ['ถนอมข้อมือ: ไม้ก้านแข็งคะแนนลด', () => sc('Yonex Astrox 100ZZ', 'Yonex BG66 Ultimax', 'advanced', 'attack', { arm: 'care' }).score < sc('Yonex Astrox 100ZZ', 'Yonex BG66 Ultimax', 'advanced', 'attack').score],
  ['หน้าไม้กว้าง: ขึ้นตึงกว่าหน้ามาตรฐาน 1 ปอนด์', () => sc('VS Kriss Sword XP Pro', 'Yonex BG66 Ultimax', 'intermediate', 'attack', { head: 'large' }).tension === sc('VS Kriss Sword XP Pro', 'Yonex BG66 Ultimax', 'intermediate', 'attack', { head: 'standard' }).tension + 1],
  ['หน้าไม้เล็ก: หย่อนกว่าหน้ามาตรฐาน 1 ปอนด์', () => sc('Yonex Astrox 77 Pro', 'Yonex BG66 Ultimax', 'advanced', 'attack', { head: 'small', variant: '3U' }).tension === sc('Yonex Astrox 77 Pro', 'Yonex BG66 Ultimax', 'advanced', 'attack', { variant: '3U' }).tension - 1],
  ['เทคโนโลยี: ไม้ที่ผู้ผลิตบอกว่าซับแรง (Free Core) ได้คะแนนไม้เพิ่มเมื่อถนอมข้อมือ', () => { const r = R('Victor Thruster Ryuga III'), t = { ...r, tech: '' }; const f = x => score(x, S('Yonex BG66 Ultimax'), 'intermediate', 'attack', 'feather', 'normal', 'doubles', 'care').parts.racket; return f(r) > f(t); }],
  ['เทคโนโลยี: ไม่เปลี่ยนความตึงที่แนะนำ', () => { const r = R('Victor Thruster Ryuga III'), t = { ...r, tech: '' }; const f = x => score(x, S('Yonex BG66 Ultimax'), 'intermediate', 'attack', 'feather', 'normal', 'doubles', 'care').tension; return f(r) === f(t); }],
  ['ไม้ที่ผู้ผลิตให้ขึ้น 26-38: ระดับกลางได้ความตึงสูงขึ้นแต่ไม่เกินขั้นต่ำ', () => { const r = R('VS Kriss Sword XP Pro'), lo = { ...r, tension: [null, 38] }; const f = x => sc2(x, 'intermediate'); return f(r) > f(lo) && f(r) <= 26 && f(r) - f(lo) <= 2; }],
  ['ลูกไนลอน: ความตึงต่ำลง', () => sc('Yonex Astrox 77 Pro', 'Yonex BG66 Ultimax', 'intermediate', 'attack', { shuttle: 'nylon' }).tension < sc('Yonex Astrox 77 Pro', 'Yonex BG66 Ultimax', 'intermediate', 'attack').tension],
  ['มือใหม่: ความตึงอยู่ในช่วง 19-23', () => { const t = sc('Yonex Nanoflare 001 Clear', 'Yonex BG65', 'beginner', 'allround').tension; return t >= 19 && t <= 23; }],
  ['ถนอมข้อมือ: เอ็นนุ่ม VBS-70 Power ดีกว่าเอ็นแข็ง VBS-68', () => sc('Victor Thruster K 110', 'Victor VBS-70 Power', 'intermediate', 'attack', { arm: 'care' }).score > sc('Victor Thruster K 110', 'Victor VBS-68', 'intermediate', 'attack', { arm: 'care' }).score],
  ['เอ็นที่มีคะแนนจริงไม่ถูกนับเป็นค่าประเมิน (No.3 Boost)', () => !sc('Li-Ning Axforce 80', 'Li-Ning No.3 Boost', 'advanced', 'attack').guess.some(g => g.includes('ของเอ็น'))],
  ['สายคอนโทรล: Arcsaber 11 Pro ดีกว่า Astrox 100ZZ', () => sc('Yonex Arcsaber 11 Pro', 'Yonex BG80', 'advanced', 'control').score > sc('Yonex Astrox 100ZZ', 'Yonex BG80', 'advanced', 'control').score],
  ['มือใหม่: ช่วง 26-38 lbs ของ VS ไม่บังคับให้ขึ้น 26', () => sc('VS Kriss Sword XP Pro', 'Yonex BG65', 'beginner', 'allround').tension < 26],
  ['Victor สายสปีด: Auraspeed 100X Ultra ดีกว่า Ryuga III', () => sc('Victor Auraspeed 100X Ultra', 'Yonex BG66 Ultimax', 'advanced', 'speed').score > sc('Victor Thruster Ryuga III', 'Yonex BG66 Ultimax', 'advanced', 'speed').score],
  ['Victor สายบุก: Ryuga III ดีกว่า Auraspeed 100X Ultra', () => sc('Victor Thruster Ryuga III', 'Yonex BG66 Ultimax', 'advanced', 'attack').score > sc('Victor Auraspeed 100X Ultra', 'Yonex BG66 Ultimax', 'advanced', 'attack').score],
  ['มือใหม่: Ryuga CLS ดีกว่า Ryuga III', () => sc('Victor Thruster Ryuga CLS', 'Yonex BG65', 'beginner', 'allround').score > sc('Victor Thruster Ryuga III', 'Yonex BG65', 'beginner', 'allround').score],
  ['Li-Ning: ไม้โปรที่ Li-Ning เรียก Flexible นับเป็นก้านกลาง (≈)', () => { const r = R('Li-Ning Axforce 90'); return r.flex === 'medium' && r.est.includes('flex'); }],
  ['Halbertec 9000 Power: ใช้ป้ายสมดุลของ Li-Ning เมื่อร้านให้ป้ายต่างกัน', () => {
    const racket = R('Li-Ning Halbertec 9000 Power');
    return racket.balance === 'even' && !racket.est.includes('balance');
  }],
  ['VS: Kriss Sword XP Pro เป็นสายบุก (≈ แหล่งของ VS ขัดกัน)', () => { const r = R('VS Kriss Sword XP Pro'); return r.style === 'attack' && r.est.includes('style'); }],
  ['ทุกไม้: คะแนน 0-100 และความตึงไม่เกินเพดานไม้', () => RACKETS.every(r => { for (const lv of ['beginner', 'pro']) {
      const x = score(r, S('Yonex BG66 Ultimax'), lv, 'attack'); const max = r.tension ? r.tension[1] : 30;
      if (!(x.score >= 0 && x.score <= 100) || x.tension > max) { console.log('bad', r.name, lv, x); return false; } } return true; })],
  ['Fantôme J: ใช้เพดาน 3U/4U จาก Victor ไทย', () => {
    const model = R('Victor Auraspeed Fantôme J');
    const match = variant => sc('Victor Auraspeed Fantôme J', 'VS BG65', 'pro', 'control', { head: 'large', variant });
    return model.tensionSrc === 'https://th.victorsport.com/product/auraspeed-fant-me-j' && match('').tension === 28 &&
      match('4U').limits.cap === 29 && match('3U').limits.cap === 30;
  }],
  ['Fantôme J และ F AC: ค้นรหัสตรงรุ่นและแยกเพดานกับลิงก์ร้าน', () => {
    const first = query => RS_TEST.searchList(RACKETS, query)[0]?.id;
    const j = R('Victor Auraspeed Fantôme J'), ac = R('Victor Auraspeed Fantôme F AC');
    const urls = item => [item.shopUrl, ...item.shopLinks.map(link => link.url)].filter(Boolean);
    return first('ARS-FANTOME-J') === j.id && first('ARS-FANTÔME J') === j.id && first('ARS-FANTOME-F-AC') === ac.id &&
      ac.tension[1] === 28 && ac.weights === '4U' && ac.tensionSrc === 'https://th.victorsport.com/product/auraspeed-fantme-f-ac' &&
      urls(j).every(url => !/4713|fantome-f-ac|hyq/i.test(url)) && urls(ac).every(url => !/4713|hyq/i.test(url));
  }],
  ['Astrox 77 Pro: เพดานเริ่มต้น 27 lbs และขยับเป็น 28 lbs เมื่อเลือก 3U', () => {
    const tension = variant => sc('Yonex Astrox 77 Pro', 'VS BG65', 'pro', 'control', { variant }).limits.cap;
    return tension('') === 27 && tension('4U') === 27 && tension('3U') === 28;
  }],
  ['Axforce 80 Light: เพดานเริ่มต้น 29 lbs และขยับเป็น 30 lbs เมื่อเลือก 4U', () => {
    const tension = variant => sc('Li-Ning Axforce 80 Light', 'VS BG65', 'pro', 'control', { variant }).limits.cap;
    return tension('') === 29 && tension('5U') === 29 && tension('4U') === 30;
  }],
  ['ค้น Axforce 80 Gen 2 ได้ทั้งชื่อที่ร้านใช้ ชื่อรุ่นทางการ และรหัส AYPW049', () => {
    const search = query => RS_TEST.searchList(RACKETS, query).map(r => r.id);
    const id = 'li-ning-axforce-80-ii';
    return ['lining 80 gen 2', 'Axforce 80 Gen 2', 'Axforce 80 II', 'Axforce80Ⅱ', 'AYPW049'].every(query => search(query)[0] === id) &&
      search('lining 80 gen 2').join() === id && !search('Axforce 80 Gen 3').includes(id);
  }],
  ['ค้นรุ่นตามเจเนอเรชัน แยก Pro/TD และไม่อ่านชื่อ Tectonic 3 เป็น Gen 3', () => {
    const first = query => RS_TEST.searchList(RACKETS, query)[0]?.id;
    return first('victor ryuga gen2 td') === 'victor-thruster-ryuga-ii-td' &&
      first('victor ryuga gen 2 pro') === 'victor-thruster-ryuga-ii-pro' &&
      first('halbertec 7000 gen 2') === 'li-ning-halbertec-7000-ii' &&
      first('nanoflare 700 gen 2 pro') === 'yonex-nanoflare-700-pro' &&
      first('yonex astrox 99 gen 2 pro') === 'yonex-astrox-99-pro-2021' &&
      first('yonex astrox 99 3rd gen pro') === 'yonex-astrox-99-pro' &&
      first('tectonic 3') === 'li-ning-tectonic-iii' && !first('tectonic gen 3');
  }],
  ['รหัส Yonex ค้นตรงรุ่นและแยก Astrox 99 ต่างเจเนอเรชัน', () => {
    const search = query => RS_TEST.searchList(RACKETS, query).map(r => r.id);
    return search('Yonex 3AX99-P').join() === 'yonex-astrox-99-pro' &&
      search('2NF700PL').join() === 'yonex-nanoflare-700-play' &&
      search('AX99-P').join() === 'yonex-astrox-99-pro-2021' &&
      search('AX 99-P').join() === 'yonex-astrox-99-pro-2021';
  }],
  ['Astrox 99 Game ปี 2021 มี 3U ส่วน Game ปี 2025 มี 4U ตามตารางของแต่ละรุ่น', () => {
    const oldGame = R('Yonex Astrox 99 Game (2021)'), newGame = R('Yonex Astrox 99 Game');
    return oldGame.weights.includes('3U') && oldGame.tensionByWeight?.['3U']?.[1] === 29 &&
      newGame.weights === '4U' && newGame.tension[1] === 28;
  }],
  ['เพดานแยกเวตของ Ryuga II, Pro และ TD ไม่ไหลข้ามรุ่น', () => {
    const cap = (name, weight) => R('Victor Thruster Ryuga II' + name).tensionByWeight?.[weight]?.[1];
    return cap('', '3U') === 32 && cap('', '4U') === 30 &&
      cap(' Pro', '4U') === 31 && cap(' TD', '4U') === 29;
  }],
  ['เพดานอ้างอิงตรงรุ่น: Arcsaber 11 เดิม และ BladeX 73 Light', () => {
    const arc = R('Yonex Arcsaber 11'), blade = R('Li-Ning BladeX 73 Light');
    return arc.tension[1] === 24 && arc.tensionByWeight['2U'][1] === 25 && arc.tensionByWeight['3U'][1] === 24 &&
      blade.tension[1] === 26 && !arc.est.includes('tension') && !blade.est.includes('tension');
  }],
  ['ข้อมูลจากซีรีส์: สมดุล แนวการเล่น และระดับที่อนุมานต้องมีเครื่องหมาย', () => {
    const racket = R('Yonex Muscle Power 5 LT');
    return ['style', 'balance', 'level'].every(field => racket.est.includes(field));
  }],
  ['ข้อมูลเพดาน: ค่าตั้งต้นทุกไม้ไม่สูงกว่าเพดานของรุ่นน้ำหนักย่อย', () => RACKETS.every(r =>
    Object.values(r.tensionByWeight || {}).every(([, max]) => r.tension[1] <= max))],
  ['ปอนด์แนะนำ: รอเลือกเวต และไม่ใช้เพดานรวมแทนตารางของเวตที่ไม่ครอบคลุม', () => {
    const racket = { ...R('Yonex Astrox 77 Pro'), weights: '3U, 4U, 5U' };
    const string = S('Yonex BG66 Ultimax');
    const match = weight => score(racket, string, 'intermediate', 'attack', 'feather', 'normal', 'doubles', 'none', '', weight);
    const ready = RS_TEST.canRecommendTension;
    return !ready(match('')) && match('').limits.needsWeight && !ready(match('6U')) &&
      !ready(match('5U')) && match('5U').limits.unconfirmed.includes('ไม้') && ready(match('4U'));
  }],
  ['ปอนด์แนะนำ: ไม้หลายเวตที่มีเพดานรวมต้องเลือกเวตก่อน', () => {
    const racket = { ...R('Yonex Astrox 77 Pro'), tensionByWeight: null };
    const string = S('Yonex BG66 Ultimax');
    const match = weight => score(racket, string, 'intermediate', 'attack', 'feather', 'normal', 'doubles', 'none', '', weight);
    return !RS_TEST.canRecommendTension(match('')) && RS_TEST.canRecommendTension(match('4U'));
  }],
  ['ตัวอ่านเพดาน: แยกค่ารายเวต ค่ารวม ค่าประเมิน และเวตที่ยังขาดหลักฐาน', () => {
    const resolve = RS_TEST.resolveRacketTension;
    const racket = { ...R('Yonex Astrox 77 Pro'), weights: '3U, 4U, 5U' };
    const three = resolve(racket, '3U');
    const overall = resolve({ ...racket, tensionByWeight: {} }, '4U');
    return resolve(racket, '').needsWeight && three.status === 'rated' && three.hasWeightCap && three.range[1] === 28 &&
      resolve(racket, '5U').status === 'missing' && overall.status === 'rated' && !overall.hasWeightCap && overall.range[1] === 27 &&
      resolve(R('Victor Auraspeed Aurora Ultra'), '3U').status === 'estimated' &&
      resolve(R('Yonex Astrox 99 Game'), '').weight === '4U';
  }],
  ['ลิงก์เทียบไม้: เวตอยู่กับรุ่นเดิมเมื่อมีรายการผิดหรือซ้ำ', () => {
    const a = R('Yonex Astrox 77 Pro'), b = R('Victor Thruster Ryuga Muse II');
    const find = id => [a, b].find(item => item.id === id);
    const selected = RS_TEST.compareSelection(`${a.id},removed,${b.id}`, ['3U', '4U', '5U'], find);
    const duplicate = RS_TEST.compareSelection(`${a.id},${a.id},${b.id}`, ['5U', '3U', '4U'], find);
    return selected.ids.join() === `${a.id},${b.id}` && selected.weights.get(a.id) === '3U' && selected.weights.get(b.id) === '5U' &&
      duplicate.ids.length === 2 && !duplicate.weights.has(a.id) && duplicate.weights.get(b.id) === '4U';
  }],
  ['ตัวกรองไม้: เวตต้องตรง และหน้าร้านไทยต้องเป็นลิงก์สินค้า', () => {
    const find = RS_TEST.thaiRacketListing, match = RS_TEST.racketMatchesFilters;
    const tiger = R('Li-Ning Axforce Tiger');
    const shopee = 'https://shopee.co.th/ไม้แบด-i.904404648.45869824367';
    const away = { ...tiger, shopUrl: 'https://shopee.co.th/search?keyword=ไม้แบด', shopLinks: [{ url: 'https://in.lining.studio/products/axforce-tiger-4u' }] };
    return find(tiger).endsWith('products_id=5117') && find({ shopLinks: [{ url: shopee }] }) === shopee && !find(away) &&
      match(tiger, { variant: '5U', thaiShop: '1' }) && !match(tiger, { variant: '3U', thaiShop: '1' }) &&
      !match(away, { thaiShop: '1' }) && !match({ weights: '4U', est: ['weights'] }, { variant: '4U' });
  }],
  ['ปอนด์แนะนำ: ทั้งไม้กับเอ็นต้องยืนยันได้ และช่วงความตึงต้องเข้ากัน', () => {
    const racket = { ...R('Yonex Astrox 77 Pro'), weights: '4U', tensionByWeight: null, tension: [20, 27], est: [] };
    const string = { ...S('Yonex BG66 Ultimax'), tensionMax: 28, est: [] };
    const ready = (r, s) => RS_TEST.canRecommendTension(score(r, s, 'intermediate', 'attack'));
    return ready(racket, string) && !ready({ ...racket, tension: null }, string) &&
      !ready({ ...racket, est: ['tension'] }, string) && !ready(racket, { ...string, tensionMax: null }) &&
      !ready(racket, { ...string, est: ['tensionMax'] }) && !ready(racket, { ...string, tensionMax: 18 });
  }],
  ['ข้อมูลเดิม: อัปเดตเพดาน Fantôme J โดยเก็บหมายเหตุของผู้ใช้', () => {
    const { tensionByWeight, tensionSrc, ...old } = R('Victor Auraspeed Fantôme J');
    const [updated] = RS_TEST.updateSavedTension([{ ...old, name: 'Auraspeed Fantome', tension: [null, 32], note: 'หมายเหตุของฉัน' }]);
    const [withLabels] = RS_TEST.updateSavedTension([{ ...old, tensionByWeight: {}, note: 'หมายเหตุของฉัน' }]);
    return updated.tension[1] === 29 && updated.note === 'หมายเหตุของฉัน' && withLabels.tensionByWeight['3U'][1] === 30;
  }],
  ['ลิงก์จับคู่: ใช้ค่าเริ่มต้นเมื่อระดับหรือสไตล์ไม่ถูกต้อง', () => {
    const options = RS_TEST.matchLinkOptions({ level: 'unknown', style: 'toString', head: 'large', budget: '-1' });
    return options.level === 'intermediate' && options.style === 'attack' && options.head === 'large' && options.budget === undefined;
  }],
  ['Import: รับไฟล์ไม้และเอ็นที่ถูกหมวด ปฏิเสธไฟล์ผิดหมวดและ ID ซ้ำ', () => {
    const parse = RS_TEST.parseImport;
    const js = '// backup\nwindow.STRINGS = ' + JSON.stringify(STRINGS) + ';';
    return parse('r', JSON.stringify(RACKETS)).length === RACKETS.length && parse('s', js).length === STRINGS.length &&
      rejects(() => parse('r', js)) && rejects(() => parse('r', JSON.stringify(STRINGS))) &&
      rejects(() => parse('s', JSON.stringify([STRINGS[0], STRINGS[0]])));
  }],
  ['ข้อมูลส่วนตัว: รุ่นใหม่และสเปกใหม่ยังเข้าได้ พร้อมเก็บการแก้ เพิ่ม และลบ', () => {
    const before = [{ id: 'a', note: '', year: '' }, { id: 'b' }];
    const edited = [{ ...before[0], note: 'โน้ตของฉัน' }, { id: 'custom' }];
    const delta = RS_TEST.catalogDelta(before, edited);
    const after = [{ id: 'a', year: 2021, note: 'โน้ตจากแคตตาล็อก' }, { id: 'b' }, { id: 'c' }];
    const merged = RS_TEST.applyCatalogDelta(after, delta);
    return delta.changed[0].fields.join() === 'note' && merged.map(x => x.id).join() === 'a,c,custom' &&
      merged[0].year === 2021 && merged[0].note === 'โน้ตของฉัน';
  }],
  ['ข้อมูลส่วนตัว: การแก้สเปกไม่ลบเครื่องหมายของปีที่ยังไม่ยืนยัน', () => {
    const base = [{ id: 'a', weight: 84, year: 2022, est: ['weight', 'year'] }];
    const changed = [{ item: { id: 'a', weight: 83, est: [] }, fields: ['weight', 'est'] }];
    const [updated] = RS_TEST.applyCatalogDelta(base, { added: [], changed, removed: [] });
    return updated.weight === 83 && updated.est.join() === 'year';
  }],
  ['ไฟล์สำรอง: คืนเฉพาะข้อมูลส่วนตัวพร้อมรับข้อมูลแคตตาล็อกใหม่', () => {
    const model = { id: 'a', brand: 'A', name: 'A', note: 'โน้ตของฉัน', year: '' };
    const data = { kind: 'r', added: [], changed: [['a', ['note']]], removed: ['b'] };
    const text = '// RacketS v2: ' + JSON.stringify(data) + '\nwindow.RACKETS = ' + JSON.stringify([model]) + ';';
    const delta = RS_TEST.readCatalogBackup('r', text, RS_TEST.parseImport('r', text));
    const result = RS_TEST.applyCatalogDelta([{ ...model, year: 2026, note: '' }, { id: 'b' }, { id: 'new' }], delta);
    return result.map(x => x.id).join() === 'a,new' && result[0].year === 2026 && result[0].note === 'โน้ตของฉัน';
  }],
  ['ข้อมูลเอ็น: เพดาน Signature Pro 66 และ 70 มาจากแคตตาล็อก Apacs', () =>
    [['Apacs Signature Pro 66', 33], ['Apacs Signature Pro 70', 38]].every(([name, cap]) => {
      const item = S(name);
      return item.tensionMax === cap && item.specSrc.includes('apacs.pnxbadminton.com');
    })],
  ['ย้ายข้อมูลเดิม: โหลดปี Tectonic 9 และ Halbertec 900 พร้อมเก็บโน้ตและการลบ', () => {
    const deleted = 'yonex-astrox-100zz';
    const snapshot = RACKETS.filter(x => ![deleted, 'li-ning-halbertec-900'].includes(x.id)).map(x =>
      x.id === 'li-ning-tectonic-9' ? { ...x, year: '', yearSrc: '', note: 'โน้ตเดิมของฉัน' } : x);
    const delta = RS_TEST.migrateCatalog(RACKETS, snapshot, window.RS_CATALOG_V1.r);
    const rows = RS_TEST.applyCatalogDelta(RACKETS, delta);
    const tectonic = rows.find(x => x.id === 'li-ning-tectonic-9');
    return tectonic.year === 2021 && tectonic.note === 'โน้ตเดิมของฉัน' &&
      rows.some(x => x.id === 'li-ning-halbertec-900') && !rows.some(x => x.id === deleted);
  }],
  ['เพดานเอ็น: บอกว่าไม้ เอ็น หรือทั้งสองอย่างที่ขาดค่าที่รับรอง', () => {
    const r = { ...R('Yonex Astrox 77 Pro'), tensionByWeight: null, tension: null };
    const s = { ...S('Yonex BG66 Ultimax'), tensionMax: null };
    const f = (racket, string) => score(racket, string, 'pro', 'control').limits.unconfirmed.join(',');
    return f(r, s) === 'ไม้,เอ็น' && f(r, { ...s, tensionMax: 28, est: [] }) === 'ไม้' &&
      f({ ...r, tension: [null, 28], est: [] }, s) === 'เอ็น' &&
      f({ ...r, tension: [null, 28], est: ['tension'] }, { ...s, tensionMax: 28, est: [] }) === 'ไม้';
  }],
  ['ที่มาเพดานเอ็น: หน้า Match แสดงหลักฐานตามเวตที่เลือก', () => {
    const show = RS_TEST.renderTensionEvidence;
    const tour = R('Yonex Astrox 99 Tour');
    const three = show(tour, '3U'), four = show(tour, '4U');
    return !show(tour, '') && three.includes('21–29 lbs') && !three.includes('20–28 lbs') &&
      four.includes('20–28 lbs') && four.includes('ตลาดสากล') && four.includes('ผู้ผลิต · yonex.com');
  }],
  ['ที่มาเพดานเอ็น: แสดงร้านค้า และเวตเดียวดูหลักฐานได้ทันที', () => {
    const show = RS_TEST.renderTensionEvidence;
    const thai = show(R('Li-Ning Halbertec 9000 Power'), '4U');
    const game = show(R('Yonex Astrox 99 Game'), '');
    return thai.includes('ร้านค้า · badmintonplaza.com') && thai.includes('ตลาดไทย') &&
      game.includes('ของไม้ 4U') && game.includes('20–28 lbs');
  }],
  ['ที่มาเพดานเอ็น: ไม้ที่ยังไม่ยืนยันหรือค่าที่แก้เองไม่ใช้หลักฐานเดิม', () => {
    const show = RS_TEST.renderTensionEvidence;
    const tour = R('Yonex Astrox 99 Tour');
    return !show(R('Li-Ning Halbertec 900'), '') && !show(R('Victor Auraspeed Aurora Ultra'), '4U') &&
      !show({ ...tour, tensionByWeight: { ...tour.tensionByWeight, '4U': [20, 27] } }, '4U') &&
      !show({ ...tour, modelCode: 'AX99-T' }, '4U');
  }],
  ['ที่มาเพดานเอ็น: ลิงก์เดิมของทั้งรุ่นแสดงเป็นแหล่งอ้างอิงของรุ่น', () => {
    const proof = RS_TEST.renderTensionEvidence(R('Li-Ning Tectonic III'), '4U');
    return proof.includes('≤ 25 lbs') && proof.includes('แหล่งอ้างอิงของรุ่น');
  }],
  ['Axforce Tiger: หน้าร้านไทยและหลักฐานปอนด์ตรงกับรหัส AYPW057', () => {
    const item = R('Li-Ning Axforce Tiger');
    const proof = RS_TEST.renderTensionEvidence(item, '5U');
    return item.modelCode === 'AYPW057' && item.shopUrl.endsWith('products_id=5117') &&
      item.shopLinks.every(link => !link.url.includes('products_id=5122')) &&
      item.tensionByWeight['4U'][1] === 30 && item.tensionByWeight['5U'][1] === 30 &&
      proof.includes('ตลาดอินเดีย') && proof.includes('axforce-tiger-5u');
  }],
  ['Halbertec 7000 II: แสดงเพดาน 3U และ 4U ของ AYPW015 ตามแคตตาล็อกไต้หวัน', () => {
    const item = R('Li-Ning Halbertec 7000 II');
    const show = weight => RS_TEST.renderTensionEvidence(item, weight);
    return item.modelCode === 'AYPW015' && item.year === 2026 && !item.est.includes('year') &&
      Object.keys(item.tensionByWeight).sort().join() === '3U,4U' &&
      show('3U').includes('≤ 31 lbs') && show('4U').includes('≤ 30 lbs') &&
      show('4U').includes('ตลาดไต้หวัน') && !show('5U');
  }],
  ['Victor LJH E: ใช้รหัสและเพดานเอ็น 5U ของรุ่นปี 2025 จาก Victor ไทย', () => {
    const item = R('Victor Auraspeed LJH E');
    const proof = RS_TEST.renderTensionEvidence(item, '');
    const result = score(item, S('Yonex BG66 Ultimax'), 'advanced', 'speed');
    return item.id === 'victor-auraspeed-ljh' && item.modelCode === 'ARS-LJH E' && item.year === 2025 &&
      item.weights === '5U' && !item.est.includes('year') && !item.est.includes('tension') &&
      RS_TEST.canRecommendTension(result) && proof.includes('ของไม้ 5U') && proof.includes('≤ 29 lbs') &&
      proof.includes('ผู้ผลิต · th.victorsport.com') && proof.includes('ตลาดไทย');
  }],
  ['Yonex GR-303i: ยืนยันรหัสกับเวต U โดยเว้นปีและเพดานที่ยังไม่ยืนยัน', () => {
    const item = R('Yonex GR-303i');
    return item.modelCode === 'GR303I' && item.weights === 'U' && !item.year &&
      !RS_TEST.renderTensionEvidence(item, '') &&
      !RS_TEST.canRecommendTension(score(item, S('Yonex BG66 Ultimax'), 'beginner', 'control'));
  }],
  // a racket's level can be a range (level..levelTo)
  ...(() => {
    const { lvText } = window.RS_TEST, base = R('Yonex Arcsaber 11 Pro');   // a racket part that stays clear of the 0-100 limits at every level
    const mk = (level, levelTo = '') => ({ ...base, level, levelTo, est: (base.est || []).filter(f => f !== 'level') });
    const part = (r, lv) => score(r, S('Yonex BG66 Ultimax'), lv, 'attack').parts.racket;
    return [
      ['ระดับแบบช่วง: ข้อความ (กลาง–สูง, มือใหม่–กลาง, ค่าเดียว, ช่วงที่ไม่ขึ้น)', () => lvText(mk('intermediate', 'advanced')) === 'ระดับกลาง–สูง' && lvText(mk('beginner', 'intermediate')) === 'มือใหม่–ระดับกลาง' && lvText(mk('intermediate')) === 'ระดับกลาง' && lvText(mk('advanced', 'intermediate')) === 'ระดับสูง' && lvText(mk('advanced', 'advanced')) === 'ระดับสูง'],
      ['ระดับแบบช่วง: ทั้งสองปลายของช่วงได้ต่างจากค่าเดียวเท่ากัน (−2 คะแนนไม้)', () => part(mk('intermediate', 'advanced'), 'intermediate') - part(mk('intermediate'), 'intermediate') === -2 && part(mk('intermediate', 'advanced'), 'advanced') - part(mk('advanced'), 'advanced') === -2],
      ['ระดับแบบช่วง: ช่วงที่ครอบระดับผู้เล่น ดีกว่าค่าเดียวที่ห่างสองขั้น', () => part(mk('intermediate', 'advanced'), 'advanced') > part(mk('beginner'), 'advanced')],
      ['ระดับแบบช่วง: ได้น้อยกว่าไม้ที่ระบุระดับนั้นตรง ๆ หนึ่งระดับ (ช่วงกว้างบอกน้อยกว่า)', () => part(mk('intermediate', 'advanced'), 'intermediate') < part(mk('intermediate'), 'intermediate')],
      ['ระดับแบบช่วง: นอกช่วงนับจากปลายที่ใกล้ที่สุด (มือใหม่กับ กลาง–สูง = มือใหม่กับ กลาง)', () => part(mk('intermediate', 'advanced'), 'beginner') === part(mk('intermediate'), 'beginner')],
      ['ระดับแบบช่วง: ช่วงกว้างสามระดับได้น้อยกว่าช่วงสองระดับ', () => part(mk('beginner', 'advanced'), 'intermediate') < part(mk('beginner', 'intermediate'), 'intermediate')],
      ['ข้อมูล: levelTo ทุกอันสูงกว่า level และมีค่าถูกต้อง', () => RACKETS.filter(r => r.levelTo).every(r => ['beginner', 'intermediate', 'advanced', 'pro'].indexOf(r.levelTo) > ['beginner', 'intermediate', 'advanced', 'pro'].indexOf(r.level) && ['beginner', 'intermediate', 'advanced', 'pro'].indexOf(r.level) >= 0)],
      ['ข้อมูล: Ryuga CLS เป็นช่วงมือใหม่–กลาง และไม่ใช่ค่าประเมิน', () => { const r = R('Victor Thruster Ryuga CLS'); return r.level === 'beginner' && r.levelTo === 'intermediate' && !r.est.includes('level'); }],
    ];
  })(),
  // radar: the balance point in mm only refines within a balance class, and the tension axis keeps 35 and 38 lbs apart
  ...(() => {
    const { profile, balPos } = window.RS_TEST;
    const mk = (balance, bp, extra = {}) => ({ balance, bp, flex: 'medium', level: 'advanced', weight: 83, style: 'allround', tension: [null, 30], ...extra });
    const eMed = RACKETS.filter(r => r.balance === 'even' && r.bp && !(r.est || []).includes('balance')).map(r => r.bp).sort((a, b) => a - b);
    return [
      ['เรดาร์: จุดสมดุลเป็น mm แยกไม้กลุ่มเดียวกัน (สมดุล 292 กับ 302 mm)', () => balPos(mk('even', 292)) < balPos(mk('even', 302)) && profile(mk('even', 292)).join() !== profile(mk('even', 302)).join()],
      ['เรดาร์: ไม่มี mm ได้ค่าตามกลุ่มเดิม', () => balPos(mk('even', '')) === 0.5 && balPos(mk('head-heavy', '')) === 1 && balPos(mk('head-light', '')) === 0],
      ['เรดาร์: mm ไม่ข้ามเส้นกลุ่ม (หัวหนักที่ mm ต่ำยังหนักหัวกว่าสมดุลที่ mm สูง)', () => balPos(mk('head-heavy', 270)) > balPos(mk('even', 330))],
      ['เรดาร์: แกนรับเอ็นตึงแยก 35 กับ 38 lbs', () => profile(mk('even', '', { tension: [null, 38] }))[4] > profile(mk('even', '', { tension: [null, 35] }))[4] && profile(mk('even', '', { tension: [null, 38] }))[4] < 10],
      ['ข้อมูล: ไม้ที่มี mm เกือบทั้งหมดอยู่ในช่วง 260-339', () => RACKETS.filter(r => r.bp).every(r => r.bp >= 260 && r.bp <= 339)],
      ['ข้อมูล: Felet 3K Nevow Fence มีเทคโนโลยีและ mm จากตารางผู้ผลิต', () => { const r = R('Felet 3K Nevow Fence'); return r.bp === 295 && /aero/i.test(r.tech) && !r.est.includes('balance'); }],
    ];
  })(),
  // the player's own tension log: a personal offset from how setups felt
  ...(() => {
    const { calcOffset, mineAdj } = window.RS_TEST;
    const base = { r: R('Yonex Astrox 77 Pro').id, s: S('Yonex BG66 Ultimax').id, level: 'advanced', style: 'attack', o: { variant: '4U' } };
    const rec = () => sc('Yonex Astrox 77 Pro', 'Yonex BG66 Ultimax', 'advanced', 'attack', base.o).tension;
    const E = (feel, lbs = rec(), more = {}) => ({ ...base, lbs, feel, ...more });
    const adj = off => { const res = sc('Yonex Astrox 77 Pro', 'Yonex BG66 Ultimax', 'advanced', 'attack'); return [res, mineAdj(res, { off, n: 1 }, true)]; };
    return [
      ['บันทึกส่วนตัว: ไม่มีบันทึก ไม่ปรับ', () => { const o = calcOffset([]); return o.off === 0 && o.n === 0; }],
      ['บันทึกส่วนตัว: "หย่อนไป" ที่ขึ้นตามค่าแนะนำ → ปรับขึ้น 1 lb', () => calcOffset([E('loose')]).off === 1],
      ['บันทึกส่วนตัว: "ตึงไป" ที่ขึ้นตามค่าแนะนำ → ปรับลง 1 lb', () => calcOffset([E('tight')]).off === -1],
      ['บันทึกส่วนตัว: "พอดี" ที่ขึ้นตามค่าแนะนำ → ไม่ปรับ', () => calcOffset([E('good')]).off === 0],
      ['บันทึกส่วนตัว: "พอดี" ที่ขึ้นสูงกว่าค่าแนะนำ 3 lbs → ปรับขึ้น ไม่เกิน 3', () => { const o = calcOffset([E('good', rec() + 3)]).off; return o > 0 && o <= 3; }],
      ['บันทึกส่วนตัว: ไม้หรือเอ็นที่หายไปจากข้อมูลไม่นับ', () => { const o = calcOffset([E('loose', rec(), { r: 'no-such-racket' })]); return o.n === 0 && o.off === 0; }],
      ['บันทึกส่วนตัว: ชุดที่ยังเลือกเวตไม่ครบไม่นำไปปรับปอนด์แนะนำ', () => {
        const result = calcOffset([E('loose', rec(), { o: {} })]);
        return result.n === 0 && result.off === 0;
      }],
      ['บันทึกส่วนตัว: ปรับไม่เกิน ±3 lbs', () => calcOffset(Array.from({ length: 10 }, () => E('loose', 40))).off === 3 && calcOffset(Array.from({ length: 10 }, () => E('tight', 12))).off === -3],
      ['บันทึกส่วนตัว: ค่าปรับไม่ดันความตึงเกินเพดานไม้/เอ็น −1 lb', () => { const [res, a] = adj(3); const cap = Math.min(res.range[1] || 30, Number(S('Yonex BG66 Ultimax').tensionMax) || 99); return a.tension <= cap - 1; }],
      ['บันทึกส่วนตัว: ปรับลงแล้วมีขั้นตอนอธิบาย', () => { const [res, a] = adj(-2); const last = a.steps[a.steps.length - 1]; return a.tension === res.tension - 2 && last[0].includes('ปรับตามบันทึก') && last[1] === -2; }],
      ['บันทึกส่วนตัว: ค่าปรับไม่ลดต่ำกว่าค่าต่ำสุดของไม้', () => {
        const res = sc('Forza Aero Power 776', 'Apacs Lethal 63', 'beginner', 'allround', { shuttle: 'nylon', arm: 'care', head: 'small' });
        return res.tension === 20 && mineAdj(res, { off: -3, n: 1 }, true).tension === 20;
      }],
      ['บันทึกส่วนตัว: ปิดการปรับแล้วได้ค่าเดิม', () => {
        const res = sc('Yonex Astrox 77 Pro', 'Yonex BG66 Ultimax', 'advanced', 'attack');
        return mineAdj(res, { off: 2, n: 3 }, false) === res;
      }],
      ['ไม้น่าสนใจ: ทุกอันดับอยู่ในช่วงปีที่เลือก', () => ['current', 'recent', 'all'].every(sp => RS_TEST.hotBoards(sp, 2026).every(b => b.rows.every(({ x }) => (sp === 'current' ? x.year === 2026 : sp === 'recent' ? x.year >= 2025 && x.year <= 2026 : x.year > 0))))],
      ['ไม้น่าสนใจ: ตัวกรองขยับตามปี และช่วงล่าสุดไม่รับปีถัดไป', () => {
        const [current, recent] = RS_TEST.hotSpans(2027);
        return current[1] === 'ปี 2027' && current[2](2027) && !current[2](2026) &&
          recent[1] === 'ปี 2026–2027' && recent[2](2026) && recent[2](2027) && !recent[2](2028);
      }],
      ['ไม้น่าสนใจ: จำนวนรุ่นแยกตามแบรนด์นับปีและเกณฑ์ชุดเดียวกับอันดับ', () => {
        const base = { balance: 'even', weight: 85 };
        const rows = [
          { ...base, brand: 'A', name: 'Current', year: 2027 },
          { ...base, brand: 'A', name: 'Future', year: 2028 },
          { ...base, brand: 'A', name: 'Junior', year: 2027 },
          { ...base, brand: 'A', name: 'Unverified', year: 2027, est: ['year'] },
          { ...base, brand: 'B', name: 'Earlier', year: 2026 },
        ];
        const [a, b] = RS_TEST.hotCoverage('recent', 2027, rows);
        return a.total === 4 && a.dated === 3 && a.eligible === 1 && b.eligible === 1;
      }],
      ['ไม้น่าสนใจ: อันดับเรียงคะแนนมากไปน้อย ส่วนราคาเรียงต่ำไปสูง', () => RS_TEST.hotBoards('recent', 2026).every(b => b.rows.every((o, i, a) => !i || (b.price ? o.v >= a[i - 1].v : o.v <= a[i - 1].v)))],
      ['ไม้น่าสนใจ: ไม่มีรุ่นที่ปีไม่ชัดหรือไม่มีราคาหลุดเข้ามา', () => RS_TEST.hotBoards('all').every(b => b.rows.every(({ x }) => Number(x.year) > 0 && !x.est.includes('year') && (!b.price || Number(x.price) > 0)))],
      ['ไม้น่าสนใจ: Li-Ning Axforce 80 II เข้าอันดับตบหนักปี 2026', () => RS_TEST.hotBoards('current', 2026)[0].rows.some(({ x }) => x.id === 'li-ning-axforce-80-ii')],
      ['ไม้น่าสนใจ: ทุกอันดับรู้สมดุลและอย่างน้อยหนึ่งในความแข็งก้านหรือน้ำหนัก', () => RS_TEST.hotBoards('all').every(b => b.rows.every(({ x }) => x.balance && (x.flex || Number(x.weight) > 0)))],
      ['ไม้น่าสนใจ: ไม้เด็ก (JR) ไม่เข้าอันดับ', () => RS_TEST.hotBoards('all').every(b => b.rows.every(({ x }) => !/(^|[\s\d])jr(\s|$)|junior/i.test(x.name)))],
    ];
  })(),
];
// real play reports (tests/feedback.js): the recommended tension must agree with how the setup felt
for (const f of window.RS_FEEDBACK || []) {
  const want = { good: 'ห่างไม่เกิน 1 lb', loose: 'สูงกว่า', tight: 'ต่ำกว่า' }[f.feel];
  cases.push([`ตีจริง: ${f.racket} + ${f.string} ${f.lbs} lbs รู้สึก ${f.feel} → แนะนำ${want} ${f.lbs}${f.who ? ' (' + f.who + ')' : ''}`, () => {
    const t = sc(f.racket, f.string, f.level, f.style, f.options || {}).tension;
    return f.feel === 'good' ? Math.abs(t - f.lbs) <= 1 : f.feel === 'loose' ? t > f.lbs : f.feel === 'tight' ? t < f.lbs : false;
  }]);
}
window.RS_CASES = cases;
})();
