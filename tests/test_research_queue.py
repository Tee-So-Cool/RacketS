import unittest

from scripts.research_queue import build_queue


class ResearchQueueTests(unittest.TestCase):
    def setUp(self):
        self.racket = {
            'id': 'victor-demo', 'brand': 'Victor', 'name': 'Demo', 'modelCode': 'DEMO',
            'year': 2026, 'yearSrc': 'https://maker.example/launch/demo', 'weights': '3U, 4U',
            'tension': [None, 30], 'est': ['tension'],
        }
        self.listing = 'https://shopee.co.th/product/123/456'

    def observation(self, weight='3U', **changes):
        return {'field': 'tension', 'market': 'TH', 'weight': weight, 'unit': 'lbs',
                'status': 'missing', 'checkedOn': '2026-11-24', **changes}

    def confirmed(self, weight='3U', **changes):
        return {**self.observation(weight), 'status': 'confirmed', 'value': [None, 29],
                'sourceCode': 'DEMO', 'source': 'https://maker.example/spec/demo',
                'locator': 'Specifications', **changes}

    def record(self, *observations, market='TH'):
        return {'racketId': self.racket['id'], 'modelCode': 'DEMO', 'market': market,
                'evidence': list(observations)}

    def report(self, *observations, **racket_changes):
        racket = {**self.racket, **racket_changes}
        model_id = racket['id']
        return build_queue({model_id: racket}, {model_id: self.record(*observations)} if observations else {})

    def test_recent_thai_listing_keeps_model_even_without_year_and_prioritizes_it(self):
        thai = {**self.racket, 'year': None, 'yearSrc': ''}
        other = {**self.racket, 'id': 'yonex-demo', 'brand': 'Yonex'}
        ledger = {thai['id']: self.record(self.observation(source=self.listing))}
        rows = build_queue({row['id']: row for row in (other, thai)}, ledger)
        self.assertEqual([row['id'] for row in rows], [thai['id'], other['id']])
        self.assertEqual(rows[0]['thaiListings'], [self.listing])
        self.assertEqual(rows[0]['yearStatus'], 'missing')

    def test_confirmed_old_launch_and_undated_or_foreign_leads_stay_out(self):
        self.assertFalse(self.report(self.observation(source=self.listing), year=2024))
        self.assertFalse(self.report(year=None, yearSrc='', shopUrl=self.listing))
        self.assertFalse(self.report(self.observation(source='https://example.com/cn-model'), year=None, yearSrc=''))

    def test_thai_availability_is_a_dated_lead_even_with_a_global_hostname(self):
        availability = self.confirmed(field='availableOn', value='2026-06-15')
        item, = self.report(availability, year=None, yearSrc='')
        self.assertEqual(item['thaiListings'], [availability['source']])

    def test_new_evidence_closes_only_the_matching_weight_and_market(self):
        missing = (self.observation(), self.observation('4U'))
        other_market = self.confirmed('4U', market='MM')
        item, = self.report(*missing, self.confirmed(), other_market)
        gap, = item['gaps']
        self.assertEqual(gap, {'field': 'tension', 'market': 'TH', 'weight': '4U',
                               'status': 'missing', 'blocksMatch': True})
        self.assertFalse(self.report(*missing, self.confirmed(), self.confirmed('4U'), other_market))

    def test_conflicting_values_reopen_only_the_disputed_weight(self):
        competing = self.confirmed(source='https://retailer.example/demo', value=[None, 31])
        item, = self.report(self.confirmed(), competing, self.confirmed('4U'))
        gap, = item['gaps']
        self.assertEqual((gap['weight'], gap['status'], gap['blocksMatch']), ('3U', 'conflicting', True))

    def test_generic_legacy_cap_leaves_weight_proof_to_check_without_blocking_match(self):
        legacy = {'est': [], 'tensionSrc': 'https://maker.example/spec/demo'}
        item, = self.report(**legacy)
        self.assertFalse(item['blocksMatch'])
        self.assertEqual([(gap['weight'], gap['status']) for gap in item['gaps']],
                         [('3U', 'needs-source'), ('4U', 'needs-source')])
        self.assertFalse(self.report(**legacy, tensionByWeight={'3U': [None, 30], '4U': [None, 29]}))
