from http.client import HTTPConnection
from http.server import ThreadingHTTPServer
import json
from pathlib import Path
from threading import Thread
from unittest import TestCase

from jef import inspect_jef
from serve import Handler


EXAMPLE = (Path(__file__).resolve().parents[1] / 'samples' / 'Gallop-90mm.jef').read_bytes()


class JefTests(TestCase):
    def test_gallop_fixture(self):
        result = inspect_jef(EXAMPLE)
        self.assertEqual((result['width_mm'], result['height_mm']), (89.9, 69.2))
        self.assertEqual(result['stitches'], 2242)

    def test_bad_header_count(self):
        bad = bytearray(EXAMPLE)
        bad[28:32] = b'\x00' * 4
        with self.assertRaisesRegex(ValueError, 'command units'):
            inspect_jef(bad)


class ApiTests(TestCase):
    def setUp(self):
        self.server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
        self.worker = Thread(target=self.server.serve_forever, daemon=True)
        self.worker.start()
        self.addCleanup(self.server.server_close)
        self.addCleanup(self.server.shutdown)

    def post(self, data, content_type='application/octet-stream', **headers):
        connection = HTTPConnection('127.0.0.1', self.server.server_port, timeout=4)
        try:
            connection.request('POST', '/api/jef/inspect', data, {'Content-Type': content_type, **headers})
            response = connection.getresponse()
            return response.status, json.loads(response.read())
        finally:
            connection.close()

    def test_readback_matches_fixture(self):
        self.assertEqual(self.post(EXAMPLE), (200, inspect_jef(EXAMPLE)))

    def test_rejects_cross_origin(self):
        self.assertEqual(self.post(EXAMPLE, Origin='https://example.com')[0], 403)

    def test_wrong_type_and_bad_metadata(self):
        self.assertEqual(self.post(EXAMPLE, 'text/plain')[0], 415)
        self.assertEqual(self.post(b'\x00' * len(EXAMPLE))[0], 422)
