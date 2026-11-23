import unittest

from scripts.plaza_match import match_generation


class MatchGenerationTests(unittest.TestCase):
    models = {
        'Astrox 99 Pro': {'generation': 3, 'year': 2025, 'modelCode': '3AX99-P'},
        'Astrox 99 Pro (2021)': {'generation': 2, 'year': 2021, 'modelCode': 'AX99-P'},
    }

    def test_code_in_title_or_url_identifies_exact_generation(self):
        self.assertEqual(match_generation('Astrox 99 Pro AX99-P', '', 'Astrox 99 Pro', self.models),
                         'Astrox 99 Pro (2021)')
        self.assertEqual(match_generation('Astrox 99 Pro', 'https://example.test/3ax99-p-racket',
                                          'Astrox 99 Pro (2021)', self.models), 'Astrox 99 Pro')

    def test_generation_or_year_can_identify_the_release(self):
        self.assertEqual(match_generation('Astrox 99 Pro Gen II', '', 'Astrox 99 Pro', self.models),
                         'Astrox 99 Pro (2021)')
        self.assertEqual(match_generation('Astrox 99 Pro (2025)', '', 'Astrox 99 Pro (2021)', self.models),
                         'Astrox 99 Pro')

    def test_ambiguous_or_conflicting_titles_are_skipped(self):
        for title in ('Astrox 99 Pro', 'Astrox 99 Pro Gen 3 (2021)', 'Astrox 99 Pro AX99-P / 3AX99-P'):
            with self.subTest(title=title):
                self.assertIsNone(match_generation(title, '', 'Astrox 99 Pro', self.models))
