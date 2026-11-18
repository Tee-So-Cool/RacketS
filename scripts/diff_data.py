# What changed in the racket data between two builds, in plain lines: new and removed models, and every field that moved.
# Run after a refresh:  git show HEAD:data/rackets.js > /tmp/before.js && python3 scripts/build_rackets.py && python3 scripts/diff_data.py /tmp/before.js
# (the second file defaults to data/rackets.js). Needs node, which the site's tests already use.
import json, os, subprocess, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FIELDS = ['year', 'style', 'balance', 'bp', 'flex', 'level', 'levelTo', 'weights', 'weight', 'grips', 'tension', 'price', 'frame', 'shaft', 'length', 'head', 'tech', 'madeIn']

def load(path):
    js = "const w={};new Function('window',require('fs').readFileSync(process.argv[1],'utf8'))(w);console.log(JSON.stringify(w.RACKETS))"
    return {r['id']: r for r in json.loads(subprocess.check_output(['node', '-e', js, path]))}

before, after = load(sys.argv[1]), load(sys.argv[2] if len(sys.argv) > 2 else os.path.join(ROOT, 'data', 'rackets.js'))
new, gone = sorted(set(after) - set(before)), sorted(set(before) - set(after))
print(f'models {len(before)} -> {len(after)}: {len(new)} new, {len(gone)} removed')
for i in new: print('  +', after[i]['brand'], after[i]['name'], after[i].get('year') or '')
for i in gone: print('  -', before[i]['brand'], before[i]['name'])
moved = filled = 0
for i in sorted(set(before) & set(after)):
    a, b = before[i], after[i]
    for f in FIELDS:
        if a.get(f) != b.get(f):
            empty = a.get(f) in ('', None, [None, None])
            moved += not empty; filled += empty
            print(f"  {'filled' if empty else 'changed'} {b['brand']} {b['name']} {f}: {a.get(f)!r} -> {b.get(f)!r}")
print(f'{filled} fields filled, {moved} fields changed')
