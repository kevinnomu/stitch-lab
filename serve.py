"""Serve the editor and a local, read-only JEF inspection API."""
import argparse
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
from urllib.parse import urlsplit

from jef import MAX_BYTES, inspect_jef


ROOT = Path(__file__).resolve().parent


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def json_response(self, status, payload):
        body = json.dumps(payload).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        if urlsplit(self.path).path != '/api/jef/inspect':
            return self.json_response(404, {'error': 'Unknown endpoint.'})
        port = self.server.server_port
        allowed = {f'http://127.0.0.1:{port}', f'http://localhost:{port}'}
        host = 'http://' + self.headers.get('Host', '')
        origin = self.headers.get('Origin', host)
        if host not in allowed or origin != host:
            return self.json_response(403, {'error': 'Use the same local editor address.'})
        if self.headers.get_content_type() != 'application/octet-stream':
            return self.json_response(415, {'error': 'Send raw JEF bytes as application/octet-stream.'})
        try:
            size = int(self.headers.get('Content-Length', '0'))
        except ValueError:
            return self.json_response(400, {'error': 'Invalid Content-Length.'})
        if not 124 <= size <= MAX_BYTES:
            return self.json_response(413, {'error': 'Expected a JEF between 124 bytes and 4 MiB.'})
        try:
            self.connection.settimeout(10)
            body = self.rfile.read(size)
            if len(body) != size:
                return self.json_response(400, {'error': 'Incomplete request body.'})
            return self.json_response(200, inspect_jef(body))
        except TimeoutError:
            return self.json_response(408, {'error': 'Request body timed out.'})
        except ValueError as exc:
            return self.json_response(422, {'error': str(exc)})


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--port', type=int, default=8000)
    args = parser.parse_args()
    with ThreadingHTTPServer(('127.0.0.1', args.port), Handler) as server:
        print(f'Open http://127.0.0.1:{server.server_port}/', flush=True)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass


if __name__ == '__main__':
    main()
