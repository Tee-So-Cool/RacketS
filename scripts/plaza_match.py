# Shared by build_rackets.py: clean Badminton Plaza titles and match them to our model names.
import re

COLOURS = r'black|white|red|blue|green|yellow|pink|purple|grey|gray|gold|silver|orange|navy|lime|cyan|teal|mint|maroon|brown|beige|ivory|bronze|matte|glossy|dark|deep|pearl|rose|sky|sakura|turquoise|aqua|violet|lavender|peach|cream|charcoal|coral|jade|olive|base|lake|molten|jungle|pale|hyacinth|aurora|crystal|ice|jelly'
NOISE = r'badminton|racket|recket|racquet|free!?.*$|limited edition|limited|ltd|gift ?box|gift set|box set|special edition|edition|new|collection|super ?light|\d+\s*grams?|\b[2-8]u\d?\b|\bg[4-6]\b|/g\d|\bstrung\b|\bunstrung\b|venson|maxbolt'
BRAND_WORDS = r'yonex|victor|li-?ning|mizuno|apacs|vs'

ALIASES = [(r'high carbon', 'hc'), (r'sward', 'sword'), (r"lee zii jia'?s( game)?", ' '), (r'tai tzu ying( tribute)?', ' '),
           (r'pre-?string', ' '), (r'\bseries\b', ' '), (r'\bjin hong\b', ' '), (r'\bgen ?3\b', ' '), (r'\btk-(?=[a-z])', 'thruster '), (r'\bthruster k\b', 'thruster'), (r'\bars-', 'auraspeed '), (r'\bastrox 22\b(?! rx)', 'astrox 22 rx'), (r'\bdragon primer\b', 'dragon p')]
SKIP = r'^x |\bx (doraemon|ultraman|one piece|demon slayer|pokemon|butterbear|dragon ball|b\.duck)|merchandise|world tour finals|china open|training|felet|kumpoo|starbucks|^all|^flare$|^woven$|^$|drm set|gb$|^astrox (clear|feel)$|hammer light mi|hwqkl|^astrox 88 tour$'

def clean(title):
    t = re.sub(r'\(.*?\)', ' ', title or '')
    t = t.lower()
    for a, b in ALIASES: t = re.sub(a, b, t)
    t = re.sub(NOISE, ' ', t)
    t = re.sub(BRAND_WORDS, ' ', t)
    t = re.sub(r'\b(' + COLOURS + r')\b', ' ', t)
    t = re.sub(r'[/,+]', ' ', t)
    return re.sub(r'\s+', ' ', t).strip()

def key(s):
    return re.sub(r'[^a-z0-9]', '', s.lower())

def tokens(s):
    return re.findall(r'[a-z]+|\d+(?:\.\d+)?', clean(s))

def match(title, names):
    """names: {model name: model}. The longest model name whose tokens run, in order, inside the title's tokens wins."""
    tt = ' ' + ' '.join(tokens(title)) + ' '
    fwd = [n for n in names if tokens(n) and ' ' + ' '.join(tokens(n)) + ' ' in tt]
    return (max(fwd, key=lambda n: len(tokens(n))) if fwd else None), key(clean(title))

def skip(title):
    return bool(re.search(SKIP, clean(title))) or bool(re.search(r'maxbolt|felet|kumpoo|training racket|gift box|box set|merchandise', (title or '').lower()))

# shop listings that are real models we do not have yet: cleaned title -> display name
NEW_NAMES = {
    'auraspeed 3100': 'Auraspeed 3100', 'auraspeed 70k f': 'Auraspeed 70K', 'auraspeed hang': 'Auraspeed Hang',
    'auraspeed hypersonic b': 'Auraspeed Hypersonic', 'game thruster ryuga ii': 'Thruster Ryuga II', 'jetspeed s 09l q': 'Jetspeed S 09L',
    'mjolnir metallic': 'Mjolnir Metallic', 'thruster 15l': 'Thruster K 15L', 'thruster f claw': 'Thruster F Claw',
    'thruster f hs hendra setiawan': 'Thruster F HS', 'thruster onigiri pro': 'Thruster K Onigiri Pro', 'thruster ryuga': 'Thruster Ryuga',
    'thruster tty': 'Thruster TTY', 'thruster tty ultima': 'Thruster TTY Ultima', 'tk-66 i 66': 'TK-66', 'tk-66 y': 'TK-66', 'tk-70 u': 'TK-70',
    '3d calibar x boost': '3D Calibar X Boost', 'windstorm 700': 'Windstorm 700', 'acroforce 200 power': 'Acroforce 200 Power',
    'nano fusion speed 722': 'Nano Fusion Speed 722', 'nano fusion speed 722 light': 'Nano Fusion Speed 722', 'z-ziggler': 'Z-Ziggler',
    'blade 9300': 'Blade 9300', 'energetic horse': 'Energetic Horse',
}
