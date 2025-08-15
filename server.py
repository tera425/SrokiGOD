#!/usr/bin/env python3
import json
import os
import time
from http.server import HTTPServer, SimpleHTTPRequestHandler

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
STATIC_DIR = os.path.join(BASE_DIR, '3d-snake')
LOG_FILE = os.path.join(BASE_DIR, 'donations.log')


class AppHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, directory: str | None = STATIC_DIR, **kwargs):
        super().__init__(*args, directory=directory, **kwargs)

    def do_GET(self):
        if self.path == '/':
            self.path = '/index.html'
        return super().do_GET()

    def do_POST(self):
        if self.path.rstrip('/') == '/donate':
            length = int(self.headers.get('Content-Length', '0') or '0')
            body = self.rfile.read(length) if length > 0 else b''
            try:
                data = json.loads(body.decode('utf-8') or '{}')
                amount = float(data.get('amount', 0))
            except Exception:
                self._send_json(400, {"ok": False, "error": "invalid_json"})
                return

            if not amount or amount <= 0:
                self._send_json(400, {"ok": False, "error": "invalid_amount"})
                return

            entry = {
                'ts': int(time.time()),
                'amount': amount,
                'ip': self.client_address[0],
            }
            try:
                with open(LOG_FILE, 'a', encoding='utf-8') as f:
                    f.write(json.dumps(entry, ensure_ascii=False) + '\n')
            except Exception:
                pass

            self._send_json(200, {"ok": True})
            return

        return super().do_POST()

    def _send_json(self, status: int, payload: dict):
        body = json.dumps(payload, ensure_ascii=False).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, format: str, *args):
        # Reduce noise; still show useful info to stdout
        print("%s - - [%s] %s" % (self.client_address[0], self.log_date_time_string(), format % args))


def run():
    port = int(os.environ.get('PORT', '8000'))
    server_address = ('0.0.0.0', port)
    httpd = HTTPServer(server_address, AppHandler)
    print(f"Serving 3d-snake from {STATIC_DIR} at http://localhost:{port}")
    print("POST /donate with JSON {amount: number}")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down...")


if __name__ == '__main__':
    run()