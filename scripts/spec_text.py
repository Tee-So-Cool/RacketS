# Read racket specs from a shop's product description, in three passes:
#   1. labelled lines, matched by the words in the label ("Balance Point (mm)", "Shaft Stiffness", "จุดสมดุล")
#   2. the prose, for whatever is still empty ("At 5U (78 grams) ... head-heavy ... up to 30 lbs")
#   3. the variant options ("4U / G5") for weight class and grip
# A prose value counts only when the page gives one answer; two different balances or flexes leave it empty.
import re

# label words -> field; the first rule that matches the label wins
LABEL_RULES = [
    (r'จุดเด่น|key features?', 'highlights'),
    (r'balance|สมดุล|บาลานซ์', 'balance'),
    (r'flex|stiff|ความแข็ง', 'flex'),
    (r'tension|ขึ้นเอ็น|ความตึง|ปอนด์', 'tension'),
    (r'grip|ด้าม', 'grips'),
    (r'weight|น้ำหนัก', 'weight'),
    (r'frame|เฟรม', 'frame'),
    (r'shaft|ก้าน', 'shaft'),
    (r'joint|ข้อต่อ', 'joint'),
    (r'length|ความยาว', 'length'),
    (r'made in|origin|ผลิต', 'madeIn'),
    (r'technolog|เทคโนโลยี', 'tech'),
    (r'player level|playing level|^level$|^grade$|ระดับ', 'level'),
    (r'used by|endorse|^players?$|นักกีฬา', 'players'),
    (r'recommended string|เอ็นแนะนำ', 'recText'),
    (r'string pattern|grommet', 'pattern'),
    # one material for the whole racket ("วัสดุ") counts for frame and shaft alike
    (r'^material$|^วัสดุ$', 'material'),
]
SKIP_LABEL = re.compile(r'recommended tension|stringing advice|suggested tension|colou?r|size$|ไซส์|สี', re.I)

def label_field(lab):
    lab = lab.strip().strip(':：').strip().lower()
    if not lab or len(lab) > 40 or SKIP_LABEL.search(lab): return ''
    return next((f for rx, f in LABEL_RULES if re.search(rx, lab)), '')

def balance_of(t, prose=False):
    t = (t or '').lower()
    m = re.search(r'(2[6-9]\d|3[0-2]\d)\s*(?:±|\+-|\+/-)?\s*\d*\s*mm', t) or re.match(r'\s*(2[6-9]\d|3[0-2]\d)\b', t)
    if m:
        v = int(m.group(1)); return 'head-heavy' if v >= 295 else 'head-light' if v <= 285 else 'even'
    hits = set()
    if re.search(r'head[\s-]*heavy|หัวหนัก|poids en t', t): hits.add('head-heavy')
    if re.search(r'head[\s-]*light|หัวเบา|poids en manche', t): hits.add('head-light')
    # in prose "even" and "balanced" are everyday words, so only "even balance" counts there
    if re.search(r'even[\s-]*balance' if prose else r'\beven\b|even[\s-]*balance|\bbalanced\b|neutral|สมดุลกลาง|^สมดุล$|neutre', t): hits.add('even')
    return hits.pop() if len(hits) == 1 else ''

def flex_of(t):
    t = (t or '').lower()
    if re.search('[ก-๙]', t):
        if 'กลาง' in t and ('แข็ง' in t or 'อ่อน' in t): return ''
        return 'extra-stiff' if 'แข็งมาก' in t else 'stiff' if 'แข็ง' in t else 'medium' if 'กลาง' in t else 'flexible' if 'อ่อน' in t else ''
    hits = set()
    if re.search(r'(extra|very|super|ultra)[\s-]*stiff|hard\s*\+|extra hard', t): hits.add('extra-stiff')
    elif re.search(r'\bstiff|\bhard\b|rigid', t): hits.add('stiff')
    if re.search(r'\bmedium\b|\bmiddle\b|\bmid\b|semi[\s-]*rigid', t) and 'stiff' not in t: hits.add('medium')
    if re.search(r'\bflexible\b|\bflex\b(?!ibility)|\bsoft\b|\bflexi\b', t) and not hits: hits.add('flexible')
    return hits.pop() if len(hits) == 1 else ''

def flex_prose(t):
    # prose names a flex only as a phrase about the shaft: "stiff shaft", "medium flex", "ก้านแข็ง"
    t = (t or '').lower()
    hits = set()
    for w in re.findall(r'(extra[\s-]*stiff|very[\s-]*stiff|stiff|medium|middle|flexible|soft)[\s-]*(?:flex\b|shaft)', t):
        hits.add('extra-stiff' if re.match(r'extra|very', w) else 'stiff' if 'stiff' in w else 'medium' if w in ('medium', 'middle') else 'flexible')
    for w in re.findall(r'ก้าน(แข็งมาก|แข็ง|กลาง|อ่อน)(?!ค่อน)', t):
        hits.add({'แข็งมาก': 'extra-stiff', 'แข็ง': 'stiff', 'กลาง': 'medium', 'อ่อน': 'flexible'}[w])
    return hits.pop() if len(hits) == 1 else ''

def weights_of(t):
    us = sorted(set(re.findall(r'(?<![\w.])([2-7])\s?U(?![a-z])', t or '')), key=int)
    return ', '.join(u + 'U' for u in us)

def grams_of(t):
    # the 4U figure when the text gives several, else the only one
    m = re.search(r'4U[^0-9]{0,6}\(?\s*(?:avg\.?\s*)?(\d{2})(?:[.,]\d)?\s*(?:g|grams?|กรัม)?', t or '')
    if m and 70 <= int(m.group(1)) <= 95: return int(m.group(1))
    gs = {int(g) for g in re.findall(r'(?<!\d)(\d{2})(?:[.,]\d)?\s*(?:g|grams?|กรัม)\b', t or '') if 70 <= int(g) <= 95}
    return gs.pop() if len(gs) == 1 else ''

def tmax_of(t, prose=False):
    t = t or ''
    ns = [int(n) for n in re.findall(r'(?:max(?:imum)?\.?|up to|≤|<=|สูงสุด)[^0-9]{0,25}(\d{2})\s*(?:lbs?|ปอนด์|lb)?', t, re.I)]
    ns += [int(n) for n in re.findall(r'(\d{2})\s*(?:lbs?|ปอนด์)\.?\s*(?:tension\s*)?(?:ceiling|max)', t, re.I)]
    # a range ("22-27 lbs") under a tension label is the racket's range; in prose it is usually stringing advice
    if not prose: ns += [int(b) for a, b in re.findall(r'(\d{2})\s*(?:-|–|~|to)\s*(\d{2})\s*(?:lbs?|ปอนด์)', t, re.I)]
    ns = [n for n in ns if 20 <= n <= 40]
    return max(ns) if ns else ''

def grips_of(t):
    return ', '.join(sorted({'G' + g for g in re.findall(r'\bG\s?([1-7])\b', t or '')}))

def length_of(t):
    m = re.search(r'(6[5-9]\d)\s*(?:±\s*\d+\s*)?mm', t or '')
    return m.group(1) + ' mm' if m else ''

# label phrases that start a new "Label: value" inside one line, longest first so "Shaft Material" beats "Shaft"
SPLIT_AT = re.compile(r'(?<![A-Za-z])(frame material|frame composition|shaft material|shaft flexibility|shaft stiffness|racket balance|'
                      r'balance point|max(?:imum)?\.? (?:string(?:ing)? )?tension|string(?:ing)? tension|weight ?/ ?grip(?: size)?|grip size|'
                      r'made in|country of origin|recommended strings?|balance|flexibility|flex|stiffness|weight|frame|shaft|joint|length|'
                      r'technology|technologies|tension|วัสดุเฟรม|วัสดุก้าน|จุดสมดุล|น้ำหนัก|ความยาว|ขึ้นเอ็น|ด้าม|ก้าน)\s*[:：]', re.I)
def split_line(l):
    # "Frame Material : HM Graphite Shaft Material: HM Graphite Flex: Medium" -> one "Label: value" per label
    cuts = [m.start(1) for m in SPLIT_AT.finditer(l)]
    if len(cuts) < 2: return [l]
    return [seg for a, b in zip(cuts, cuts[1:] + [len(l)]) if (seg := l[a:b].strip(' .,|/'))]

def expand(lines):
    out = []
    for l in lines:
        # "30T Carbon (Frame) / 30T Carbon (Shaft)": the label follows its value in brackets
        pairs = re.findall(r'([^/()]{3,80}?)\s*\((frame|shaft|joint)\)', l, re.I)
        if len(pairs) >= 1 and len(l) < 200:
            out += [f'{lab}: {val.strip(" 🔹-•")}' for val, lab in pairs]
            continue
        out += split_line(l)
    return out

def parse(lines, options=()):
    out = {}
    lines = expand(lines)
    # pass 1: labelled lines, "Label: value" or a label line followed by its value
    i = 0
    while i < len(lines):
        l = lines[i]; i += 1
        m = re.match(r'^[-•*]?\s*([^:：]{2,40}?)\s*[:：]\s*(.+)$', l)
        if m: lab, val = m.group(1), m.group(2)
        # a label on its own line takes the next line as its value, unless that line is itself a "Label:" line
        elif i < len(lines) and len(l.split()) <= 4 and not re.search(r'\d(?!\s*mm\))', l) and label_field(l) and not re.search(r'[:：]\s*$', lines[i]):
            lab, val = l, lines[i]; i += 1
        else: continue
        f = label_field(lab)
        if f and f not in out: out[f] = val.strip()
    # normalise the labelled values; a "shaft" label holding a stiffness word is the flex, not the material
    if out.get('shaft') and not out.get('flex') and flex_of(out['shaft']) and not re.search(r'graphite|carbon|fib|nano|titan', out['shaft'], re.I):
        out['flex'] = out.pop('shaft')
    res = {
        'balance': balance_of(out.get('balance')), 'flex': flex_of(out.get('flex')),
        'weights': weights_of(out.get('weight', '')), 'weight': grams_of(out.get('weight', '')),
        'tmax': tmax_of(out.get('tension', '')) or (int(out['tension'][:2]) if re.match(r'\d{2}\b', out.get('tension', '')) else ''),
        'grips': grips_of(out.get('grips', '') + ' ' + out.get('weight', '')), 'length': length_of(out.get('length', '')) or out.get('length', ''),
        **{f: out.get(f, '') for f in ('frame', 'shaft', 'joint', 'madeIn', 'tech', 'players', 'level', 'recText', 'pattern')},
        'frame': out.get('frame') or out.get('material', ''), 'shaft': out.get('shaft') or out.get('material', ''),
        'tech': out.get('highlights') or out.get('tech', ''),
    }
    if res['shaft'] and not re.search(r'[a-zก-๙]{3}', res['shaft'], re.I): res['shaft'] = ''  # "6.8mm" is a diameter
    # pass 2: the prose, for what the labels left empty
    text = ' \n'.join(lines)
    made = re.findall(r'made in ([A-Z][a-z]+)', text)
    longer = re.search(r'\+\s?(\d{1,2})\s?mm\b[^.]{0,20}(?:length|longer)|(\d{1,2})\s?mm longer', text, re.I)
    prose = {'balance': balance_of(text, prose=True), 'flex': flex_prose(text), 'weights': weights_of(text), 'weight': grams_of(text),
             'tmax': tmax_of(text, prose=True), 'grips': grips_of(text),
             'length': length_of(text) or (f'+{longer.group(1) or longer.group(2)} mm (ยาวกว่ามาตรฐาน)' if longer else ''),
             'madeIn': made[0] if len(set(made)) == 1 else ''}
    # pass 3: variant options ("4U / G5")
    opt = ' '.join(options)
    prose['weights'] = prose['weights'] or weights_of(opt)
    prose['grips'] = prose['grips'] or grips_of(opt)
    from_prose = []
    for f, v in prose.items():
        if not res.get(f) and v not in ('', None):
            res[f] = v; from_prose.append(f)
    res['fromProse'] = from_prose
    return res
