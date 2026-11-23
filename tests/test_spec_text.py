import unittest

from scripts.spec_text import parse


class BalanceSpecTests(unittest.TestCase):
    def test_stated_balance_wins_over_number(self):
        for lines in (
            ['Balance: Even Balance (302 mm)'],
            ['Balance point: 302 mm', 'Balance: Even Balance'],
            ['Balance: Even Balance', 'Balance point: 302 mm'],
        ):
            with self.subTest(lines=lines):
                result = parse(lines)
                self.assertEqual(result['balance'], 'even')
                self.assertEqual(result['bp'], 302)
                self.assertNotIn('balance', result['fromProse'])

    def test_balance_inferred_from_number_is_an_estimate(self):
        result = parse(['Balance point: 300 mm'])
        self.assertEqual(result['balance'], 'head-heavy')
        self.assertEqual(result['bp'], 300)
        self.assertIn('balance', result['fromProse'])
