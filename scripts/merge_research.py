"""Preview or apply racket research evidence without losing its model, market or weight."""
import argparse
from collections import defaultdict
from datetime import date
from hashlib import sha256
import json
import os
from pathlib import Path
import re
from tempfile import NamedTemporaryFile, gettempdir
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[1]
LEDGER_PATH = Path('data/racket-research.json')
STATUSES = {'confirmed', 'estimated', 'conflicting', 'missing'}
SOURCE_TYPES = {'manufacturer', 'catalog', 'distributor', 'retailer'}
FIELDS = {'modelCode', 'year', 'weights', 'tension', 'availableOn'}
WEIGHT = re.compile(r'[2-8][UF]|U')


def unique_keys(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError(f'Duplicate JSON key: {key}')
        result[key] = value
    return result


def decode(text):
    return json.loads(text, object_pairs_hook=unique_keys)


def code_key(value):
    return re.sub(r'[^a-z0-9]', '', value.lower())


def market_code(value):
    return isinstance(value, str) and re.fullmatch(r'GLOBAL|[A-Z]{2}', value)


def iso_date(value):
    try:
        return date.fromisoformat(value).isoformat() == value
    except (TypeError, ValueError):
        return False


def weight_class(value):
    return isinstance(value, str) and WEIGHT.fullmatch(value)


def valid_value(field, value, model_code):
    if field == 'modelCode':
        return isinstance(value, str) and code_key(value) == code_key(model_code)
    if field == 'year':
        return type(value) is int and 1900 <= value <= 2100
    if field == 'availableOn':
        return iso_date(value)
    if field == 'weights':
        return isinstance(value, list) and value and all(map(weight_class, value)) and len(value) == len(set(value))
    return (isinstance(value, list) and len(value) == 2 and type(value[1]) is int and
            2 <= value[1] and (value[0] is None or type(value[0]) is int and 2 <= value[0] <= value[1]))


def validate_record(record):
    if not isinstance(record, dict):
        raise ValueError('Each research record must be an object')
    model_id = record.get('racketId')
    model_code = record.get('modelCode')
    observations = record.get('evidence')
    if (not isinstance(model_id, str) or not model_id or not isinstance(model_code, str) or
            not code_key(model_code) or not market_code(record.get('market')) or
            not isinstance(observations, list) or not observations):
        raise ValueError('Each record needs racketId, modelCode, market, and a nonempty evidence list')
    for i, row in enumerate(observations, 1):
        label = f'{model_id} evidence {i}'
        if not isinstance(row, dict):
            raise ValueError(f'{label}: expected an object')
        field, status, value = row.get('field'), row.get('status'), row.get('value')
        if (field not in FIELDS or status not in STATUSES or not market_code(row.get('market')) or
                not iso_date(row.get('checkedOn'))):
            raise ValueError(f'{label}: invalid field, status, market or checkedOn date')
        if 'sourceType' in row and (not isinstance(row['sourceType'], str) or row['sourceType'] not in SOURCE_TYPES):
            raise ValueError(f'{label}: invalid sourceType')
        unknown_weight = status == 'missing' and row.get('weight') is None
        if field == 'tension' and not unknown_weight and (not weight_class(row.get('weight')) or row.get('unit') != 'lbs'):
            raise ValueError(f'{label}: tension needs a weight such as 4U and unit lbs')
        if status == 'missing':
            if value is not None:
                raise ValueError(f'{label}: missing evidence cannot have a value')
            continue
        source = row.get('source')
        locator = row.get('locator')
        source_code = row.get('sourceCode')
        if (not isinstance(source, str) or urlsplit(source).scheme not in ('http', 'https') or
                not urlsplit(source).hostname or not isinstance(locator, str) or not locator.strip() or
                not isinstance(source_code, str)):
            raise ValueError(f'{label}: provide the source URL, locator and exact sourceCode')
        # A trailing weight class or numeric suffix may identify a variant SKU.
        parent_code = re.sub(r'[- /](?:\d+[A-Za-z]*|U)$', '', source_code, flags=re.I)
        if code_key(source_code) != code_key(model_code) and code_key(parent_code) != code_key(model_code):
            raise ValueError(f'{label}: {source_code} does not match {model_code}')
        suffix_weight = re.search(r'[- /]([2-8][UF]|U)$', source_code, re.I)
        if field == 'tension' and suffix_weight and suffix_weight[1].upper() != row['weight']:
            raise ValueError(f"{label}: {source_code} does not match weight {row['weight']}")
        if not valid_value(field, value, model_code):
            raise ValueError(f'{label}: invalid value for {field}')


def resolve_observations(rows):
    confirmed = [row for row in rows if row['status'] == 'confirmed']
    values = {json.dumps(sorted(row['value']) if row['field'] == 'weights' else row['value'])
              for row in confirmed}
    if any(row['status'] == 'conflicting' for row in rows) or len(values) > 1:
        return 'conflicting', []
    if confirmed:
        return 'confirmed', confirmed
    if any(row['status'] == 'estimated' for row in rows):
        return 'estimated', []
    return 'missing', []


def tension_summary(ratings):
    cap = min(bounds[1] for bounds in ratings.values())
    low = max((bounds[0] for bounds in ratings.values() if bounds[0] is not None), default=None)
    return [low if low is not None and low <= cap else None, cap]


def project(racket, record):
    """Return catalog fields and review outcomes for the selected market."""
    validate_record(record)
    if racket['id'] != record['racketId']:
        raise ValueError(f"{racket['id']}: research record names {record['racketId']}")
    model_code = record['modelCode']
    current = racket.get('modelCode')
    if current and code_key(current) != code_key(model_code):
        raise ValueError(f"{racket['id']}: catalog code {current} does not match {model_code}")

    evidence = record['evidence']
    code_sources = [row for row in evidence if row['field'] == 'modelCode' and row['status'] == 'confirmed']
    code_disputed = any(row['field'] == 'modelCode' and row['status'] == 'conflicting' for row in evidence)
    if code_disputed or (not current and not code_sources):
        return {}, ['held all values (model code needs confirmation)']

    groups = defaultdict(list)
    for row in evidence:
        field = row['field']
        market = 'GLOBAL' if field == 'year' else record['market']
        if field not in ('availableOn', 'modelCode') and row['market'] == market:
            groups[(field, (row.get('weight') or '') if field == 'tension' else '')].append(row)

    patch, published, report, tension = {}, list(code_sources), [], {}
    flags = list(racket.get('est', []))
    held = set()
    held_weights = set()
    if code_sources:
        patch['modelCode'] = model_code
    for (field, weight), rows in sorted(groups.items()):
        title = ' '.join(filter(None, (field, weight)))
        status, confirmed = resolve_observations(rows)
        if not confirmed:
            reason = 'conflicting evidence' if status == 'conflicting' else 'no confirmed evidence'
            report.append(f'held {title} ({reason})')
            if field == 'tension':
                held_weights.add(weight)
            elif status == 'conflicting':
                held.add(field)
            continue
        first = confirmed[0]
        value = first['value']
        published.extend(confirmed)
        report.append(f'accepted {title} = {json.dumps(value, ensure_ascii=False)} — {first["source"]}')
        if field == 'tension':
            tension[weight] = value
            patch.setdefault('tensionSrc', first['source'])
        elif field == 'year':
            patch.update(year=value, yearSrc=first['source'])
        else:
            patch['weights'] = ', '.join(sorted(value))
        if field in flags:
            flags.remove(field)

    if tension:
        single_weight = len(tension) == 1 and patch.get('weights') in tension and not (held_weights - {''})
        patch['tensionByWeight'] = {} if single_weight else tension
        patch['tension'] = tension_summary(tension)
        labels = [f'{weight}: {low}–{high}' if low is not None else f'{weight} ≤ {high}'
                  for weight, (low, high) in tension.items()]
        patch['tensionNote'] = f"ตามหลักฐานตลาด {record['market']}: " + ', '.join(labels) + ' lbs'
    elif held_weights:
        remaining = {}
        projected_tension = any(row['field'] == 'tension' for row in racket.get('researchEvidence', []))
        # An accepted catalog rating for another weight can survive, but a model-wide range cannot
        # substitute for a held weight. Reprojection must not reuse a previous market's ratings.
        if '' not in held_weights and 'tension' not in flags and not projected_tension:
            remaining = {weight: value for weight, value in (racket.get('tensionByWeight') or {}).items()
                         if weight not in held_weights}
        if 'tensionByWeight' in racket:
            patch['tensionByWeight'] = remaining
        patch['tensionNote'] = ''
        if remaining:
            patch['tension'] = tension_summary(remaining)
        else:
            patch['tensionSrc'] = ''
            held.add('tension')

    for field in sorted(held):
        if racket.get(field) and field not in flags:
            flags.append(field)
    if groups:
        patch['est'] = flags
    if published or 'researchEvidence' in racket:
        patch['researchEvidence'] = published
    other = len(evidence) - len(published)
    if other:
        report.append(f'{other} observation(s) retained in the ledger')
    return patch, report


def observation_key(row):
    return tuple(row.get(key, '') for key in ('field', 'market', 'weight', 'sourceCode', 'source', 'locator'))


def stage(existing, catalog, records):
    if not isinstance(records, list) or not records:
        raise ValueError('Expected a nonempty JSON array of research records')
    ledger = dict(existing)
    owners = defaultdict(set)
    for model_id, row in catalog.items():
        if row.get('modelCode'):
            owners[code_key(row['modelCode'])].add(model_id)
    for model_id, row in ledger.items():
        owners[code_key(row['modelCode'])].add(model_id)
    seen = set()
    report = []
    for record in records:
        validate_record(record)
        model_id = record['racketId']
        if model_id in seen or model_id not in catalog:
            raise ValueError(f'Repeated or unknown racketId: {model_id}')
        seen.add(model_id)
        code = code_key(record['modelCode'])
        if owners[code] - {model_id}:
            raise ValueError(f"{model_id}: {record['modelCode']} already belongs to another racket ID")
        owners[code].add(model_id)
        previous = ledger.get(model_id, {})
        if previous and code_key(previous['modelCode']) != code_key(record['modelCode']):
            raise ValueError(f'{model_id}: modelCode differs from existing research')
        observations = {observation_key(row): row for row in previous.get('evidence', [])}
        batch_checks = {}
        for row in record['evidence']:
            key = observation_key(row)
            check = (*key, row['checkedOn'])
            if check in batch_checks and batch_checks[check] != row:
                raise ValueError(f'{model_id}: conflicting observations at the same source and date')
            batch_checks[check] = row
            old = observations.get(key)
            if not old or old['checkedOn'] <= row['checkedOn']:
                observations[key] = row
        merged = {**record, 'evidence': list(observations.values())}
        patch, outcomes = project(catalog[model_id], merged)
        ledger[model_id] = merged
        changed = ', '.join(key for key, value in patch.items()
                            if key != 'researchEvidence' and catalog[model_id].get(key) != value)
        report.append(f'{model_id} ({merged["market"]}) — ' + (f'catalog fields: {changed}' if changed else 'no catalog value changes'))
        report.extend(f'  {outcome}' for outcome in outcomes)
    return ledger, report


def load_catalog(path):
    source = path.read_text(encoding='utf-8')
    _, marker, data = source.partition('window.RACKETS =')
    if not marker:
        raise ValueError('Cannot read the generated racket catalog')
    return {row['id']: row for row in decode(data.strip().removesuffix(';'))}


def replace_file(path, content):
    with NamedTemporaryFile(mode='w', encoding='utf-8', dir=path.parent, delete=False) as output:
        temporary = Path(output.name)
        try:
            output.write(content)
            output.close()
            temporary.chmod(path.stat().st_mode & 0o777 if path.exists() else 0o644)
            os.replace(temporary, path)
        finally:
            temporary.unlink(missing_ok=True)


def lock_writes(file):
    if os.name == 'nt':
        import msvcrt

        file.seek(0)
        msvcrt.locking(file.fileno(), msvcrt.LK_LOCK, 1)
    else:
        import fcntl

        fcntl.flock(file, fcntl.LOCK_EX)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('input', type=Path, help='JSON evidence, or the brand for a legacy Markdown preview')
    parser.add_argument('legacy_note', nargs='?', type=Path)
    parser.add_argument('--apply', action='store_true', help=f'save validated evidence to {LEDGER_PATH}')
    args = parser.parse_args(argv)
    try:
        if args.legacy_note or args.input.suffix.lower() == '.md':
            if args.apply:
                parser.error('Legacy Markdown is a review source. Convert observations to JSON before applying.')
            print('Legacy note preview. Convert observations to JSON before applying.')
            print((args.legacy_note or args.input).read_text(encoding='utf-8'), end='')
            return
        records = decode(args.input.read_text(encoding='utf-8'))
        path = ROOT / LEDGER_PATH

        def review():
            original = decode(path.read_text(encoding='utf-8')) if path.exists() else {}
            catalog = load_catalog(ROOT / 'data/rackets.js')
            updated, report = stage(original, catalog, records)
            print('\n'.join(report))
            if args.apply and updated != original:
                replace_file(path, json.dumps(updated, ensure_ascii=False, indent=1) + '\n')

        if args.apply:
            digest = sha256(os.fsencode(path.resolve())).hexdigest()
            with (Path(gettempdir()) / f'rackets-research-{digest}.lock').open('a+b') as lock:
                lock_writes(lock)
                review()
            print('Evidence saved. Rebuild with python3 scripts/build_rackets.py.')
        else:
            review()
            print('Preview only. Use --apply to save the evidence.')
    except (OSError, ValueError, TypeError) as error:
        parser.exit(2, f'{error}\n')


if __name__ == '__main__':
    main()
