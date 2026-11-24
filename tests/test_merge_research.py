import unittest

from scripts.merge_research import project, stage


class ResearchEvidenceTests(unittest.TestCase):
    def setUp(self):
        self.racket = {
            'id': 'victor-demo-2026',
            'name': 'Demo (2026)',
            'modelCode': 'DEMO-26',
            'weights': '3U, 4U',
            'tension': [None, 30],
            'est': [],
        }
        self.catalog = {self.racket['id']: self.racket}

    def row(self, caps, weight='3U', **changes):
        return {
            'field': 'tension', 'market': 'TH', 'weight': weight, 'unit': 'lbs',
            'value': caps, 'status': 'confirmed', 'sourceCode': 'DEMO-26',
            'source': 'https://example.com/demo', 'locator': 'Specifications',
            'checkedOn': '2026-11-24', **changes,
        }

    def record(self, *evidence):
        return {
            'racketId': self.racket['id'], 'modelCode': self.racket['modelCode'],
            'market': 'TH', 'evidence': list(evidence),
        }

    def test_keeps_both_weight_caps_and_sources_on_the_exact_model(self):
        first = self.row([None, 31], sourceCode='DEMO-26-3')
        second = self.row([20, 30], '4U', source='https://example.com/demo-4u')
        record = self.record(first, second)
        ledger, _ = stage({}, self.catalog, [record])
        patch, _ = project(self.racket, ledger[self.racket['id']])
        self.assertEqual(patch['tensionByWeight'], {'3U': [None, 31], '4U': [20, 30]})
        self.assertEqual(patch['tension'], [20, 30])
        self.assertEqual(patch['researchEvidence'], [first, second])
        self.assertNotIn('name', patch)
        self.assertEqual(stage(ledger, self.catalog, [record])[0], ledger)

    def test_other_market_and_availability_are_retained_without_replacing_global_year(self):
        thai = self.row([None, 29])
        overseas = self.row([None, 32], market='TW')
        date = self.row('2026-10-01', field='availableOn')
        regional_year = self.row(2026, field='year')
        global_year = self.row(2025, field='year', market='GLOBAL', locator='Launch')
        record = self.record(thai, overseas, date, regional_year, global_year)
        ledger, _ = stage({}, self.catalog, [record])
        saved = ledger[self.racket['id']]
        patch, _ = project(self.racket, saved)
        self.assertEqual(saved['evidence'], record['evidence'])
        self.assertEqual(patch['tensionByWeight'], {'3U': [None, 29]})
        self.assertEqual(patch['year'], 2025)
        self.assertNotIn('availableOn', patch)
        self.assertEqual(patch['researchEvidence'], [thai, global_year])

    def test_disputed_weight_is_held_while_the_other_weight_remains_usable(self):
        first = self.record(self.row([None, 31]), self.row([None, 30], '4U'))
        second = self.record(self.row([None, 32], source='https://example.org/demo'))
        ledger, _ = stage({}, self.catalog, [first])
        ledger, report = stage(ledger, self.catalog, [second])
        patch, _ = project(self.racket, ledger[self.racket['id']])
        self.assertEqual(patch['tensionByWeight'], {'4U': [None, 30]})
        self.assertTrue(any('held tension 3U' in line for line in report))

    def test_estimated_tension_does_not_become_a_confirmed_limit(self):
        patch, _ = project(self.racket, self.record(self.row([None, 31], status='estimated')))
        self.assertNotIn('tensionByWeight', patch)
        self.assertNotIn('tension', patch)
        self.assertNotIn('researchEvidence', patch)

    def test_records_missing_tension_even_when_the_weight_is_unknown(self):
        unknown = {'field': 'tension', 'market': 'TH', 'status': 'missing', 'checkedOn': '2026-11-24'}
        ledger, _ = stage({}, self.catalog, [self.record(unknown)])
        self.assertEqual(ledger[self.racket['id']]['evidence'], [unknown])
        self.assertNotIn('tension', project(self.racket, ledger[self.racket['id']])[0])

    def test_single_confirmed_weight_keeps_proof_without_triggering_a_weight_choice(self):
        caps = self.row([20, 28], '4U')
        weights = self.row(['4U'], field='weights')
        patch, _ = project(self.racket, self.record(caps, weights))
        self.assertEqual(patch['tension'], [20, 28])
        self.assertEqual(patch['tensionByWeight'], {})
        self.assertEqual(patch['researchEvidence'], [caps, weights])

    def test_yonex_u_weight_class_keeps_its_exact_variant_evidence(self):
        caps = self.row([None, 20], 'U', sourceCode='DEMO-26-U')
        weights = self.row(['U'], field='weights')
        patch, _ = project(self.racket, self.record(caps, weights))
        self.assertEqual(patch['weights'], 'U')
        self.assertEqual(patch['researchEvidence'], [caps, weights])
        with self.assertRaisesRegex(ValueError, 'does not match weight'):
            project(self.racket, self.record({**caps, 'weight': '4U'}))

    def test_missing_model_code_requires_its_own_evidence(self):
        racket = {**self.racket, 'modelCode': ''}
        record = self.record(self.row([None, 31]))
        self.assertEqual(project(racket, record)[0], {})
        record['evidence'].append(self.row('DEMO-26', field='modelCode'))
        patch, _ = project(racket, record)
        self.assertEqual(patch['modelCode'], 'DEMO-26')
        self.assertIn('3U', patch['tensionByWeight'])

    def test_rejects_other_model_codes_in_target_or_source(self):
        bad_target = {**self.record(self.row([None, 31], sourceCode='DEMO-27')), 'modelCode': 'DEMO-27'}
        bad_source = self.record(self.row([None, 31], sourceCode='DEMO-25-3U'))
        with self.assertRaisesRegex(ValueError, 'catalog code'):
            stage({}, self.catalog, [bad_target])
        with self.assertRaisesRegex(ValueError, 'does not match'):
            stage({}, self.catalog, [bad_source])
        mismatched_weight = self.record(self.row([None, 31], sourceCode='DEMO-26-4U'))
        with self.assertRaisesRegex(ValueError, 'does not match weight'):
            stage({}, self.catalog, [mismatched_weight])

    def test_a_later_check_updates_the_same_source_without_duplicates(self):
        first = self.record(self.row([None, 31]))
        second = self.record(self.row([None, 29], checkedOn='2026-11-25'))
        ledger, _ = stage({}, self.catalog, [first])
        updated, _ = stage(ledger, self.catalog, [second])
        self.assertEqual(updated[self.racket['id']]['evidence'], second['evidence'])
        self.assertEqual(stage(updated, self.catalog, [first])[0], updated)

    def test_does_not_assign_a_canonical_code_to_a_second_racket(self):
        other = 'victor-demo-later-colour'
        catalog = {**self.catalog, other: {'id': other, 'modelCode': ''}}
        record = {**self.record(self.row('DEMO-26', field='modelCode')), 'racketId': other}
        with self.assertRaisesRegex(ValueError, 'already belongs to another racket ID'):
            stage({}, catalog, [record])
