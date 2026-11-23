import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from urllib.parse import parse_qs, urlparse

from scripts import fetch_shops


class FetchShopsTests(unittest.TestCase):
    def test_partial_fetch_preserves_previous_shop_rows(self):
        def get(url):
            parsed = urlparse(url)
            page = parse_qs(parsed.query)['page'][0]
            if page == '1':
                return {'products': [{
                    'title': 'Badminton Racket', 'handle': 'new-model',
                    'body_html': '<p>Weight: 85g</p>', 'variants': [{'price': '1200'}],
                }]}
            if parsed.hostname == 'cached.example':
                raise TimeoutError('page timed out')
            return {'products': []}

        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / 'shops.json'
            cached = {'shop': 'cached.example', 'name': 'Old model'}
            unrelated = {'shop': 'untouched.example', 'name': 'Other model'}
            output.write_text(json.dumps([cached, unrelated]), encoding='utf-8')
            shops = [('cached.example', 'THB', 'VS'), ('fresh.example', 'THB', 'VS')]
            with patch.object(fetch_shops, 'OUT', str(output)), patch.object(fetch_shops, 'SHOPS', shops), \
                    patch.object(fetch_shops, 'get', get), patch.object(sys, 'argv', ['fetch_shops.py']):
                self.assertEqual(fetch_shops.main(), 1)
            rows = json.loads(output.read_text(encoding='utf-8'))
            self.assertEqual(rows[0], cached)
            self.assertEqual(rows[1]['url'], 'https://fresh.example/products/new-model')
            self.assertEqual(rows[2], unrelated)

    def test_empty_refresh_leaves_snapshot_untouched(self):
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / 'shops.json'
            original = json.dumps([{'shop': 'cached.example', 'name': 'Old model'}])
            output.write_text(original, encoding='utf-8')
            with patch.object(fetch_shops, 'OUT', str(output)), \
                    patch.object(fetch_shops, 'SHOPS', [('cached.example', 'THB', 'VS')]), \
                    patch.object(fetch_shops, 'get', return_value={'products': []}), \
                    patch.object(sys, 'argv', ['fetch_shops.py']):
                self.assertEqual(fetch_shops.main(), 1)
            self.assertEqual(output.read_text(encoding='utf-8'), original)
