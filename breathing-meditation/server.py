import os
import json
import uuid
import base64
from http.server import HTTPServer, BaseHTTPRequestHandler
import urllib.request
import urllib.error

YOOKASSA_API = 'https://api.yookassa.ru/v3/payments'

class Handler(BaseHTTPRequestHandler):
	def _set_cors(self):
		self.send_header('Access-Control-Allow-Origin', '*')
		self.send_header('Access-Control-Allow-Methods', 'POST, OPTIONS')
		self.send_header('Access-Control-Allow-Headers', 'Content-Type')

	def do_OPTIONS(self):
		self.send_response(204)
		self._set_cors()
		self.end_headers()

	def do_POST(self):
		if self.path != '/api/create-payment':
			self.send_response(404)
			self._set_cors()
			self.send_header('Content-Type', 'application/json; charset=utf-8')
			self.end_headers()
			self.wfile.write(b'{"error":"not_found"}')
			return

		length = int(self.headers.get('Content-Length') or 0)
		try:
			raw = self.rfile.read(length) if length > 0 else b'{}'
			data = json.loads(raw.decode('utf-8') or '{}')
			amount = float(data.get('amount', 0))
			amount = max(10.0, amount)
			amount_str = f"{amount:.2f}"
		except Exception as e:
			self.send_response(400)
			self._set_cors()
			self.send_header('Content-Type', 'application/json; charset=utf-8')
			self.end_headers()
			self.wfile.write(json.dumps({'error':'invalid_request','details':str(e)}).encode('utf-8'))
			return

		shop_id = os.getenv('YOOKASSA_SHOP_ID') or os.getenv('YOOKASSA_ACCOUNT_ID') or os.getenv('SHOP_ID')
		secret_key = os.getenv('YOOKASSA_SECRET_KEY') or os.getenv('SECRET_KEY')
		if not shop_id or not secret_key:
			self.send_response(500)
			self._set_cors()
			self.send_header('Content-Type', 'application/json; charset=utf-8')
			self.end_headers()
			self.wfile.write(json.dumps({'error':'missing_credentials','hint':'Set env vars YOOKASSA_SHOP_ID and YOOKASSA_SECRET_KEY'}).encode('utf-8'))
			return

		payload = {
			'amount': { 'value': amount_str, 'currency': 'RUB' },
			'capture': True,
			'confirmation': {
				'type': 'redirect',
				'return_url': os.getenv('RETURN_URL') or 'http://localhost:8000'
			},
			'description': 'Donation to breathing meditation'
		}

		idem_key = str(uuid.uuid4())
		basic = base64.b64encode(f"{shop_id}:{secret_key}".encode('utf-8')).decode('utf-8')
		headers = {
			'Content-Type': 'application/json',
			'Idempotence-Key': idem_key,
			'Authorization': f'Basic {basic}',
			'Accept': 'application/json'
		}

		req = urllib.request.Request(YOOKASSA_API, data=json.dumps(payload).encode('utf-8'), headers=headers, method='POST')
		try:
			with urllib.request.urlopen(req, timeout=20) as resp:
				resp_body = resp.read().decode('utf-8')
				resp_json = json.loads(resp_body)
				confirmation_url = (resp_json.get('confirmation') or {}).get('confirmation_url')
				self.send_response(200)
				self._set_cors()
				self.send_header('Content-Type', 'application/json; charset=utf-8')
				self.end_headers()
				self.wfile.write(json.dumps({
					'confirmation_url': confirmation_url,
					'payment_id': resp_json.get('id')
				}).encode('utf-8'))
		except urllib.error.HTTPError as e:
			err = e.read().decode('utf-8', errors='ignore')
			try:
				err_json = json.loads(err)
			except Exception:
				err_json = {'raw': err}
			self.send_response(e.code)
			self._set_cors()
			self.send_header('Content-Type', 'application/json; charset=utf-8')
			self.end_headers()
			self.wfile.write(json.dumps({'error':'yookassa_error','status': e.code, 'details': err_json}).encode('utf-8'))
		except Exception as e:
			self.send_response(502)
			self._set_cors()
			self.send_header('Content-Type', 'application/json; charset=utf-8')
			self.end_headers()
			self.wfile.write(json.dumps({'error':'gateway_error','details': str(e)}).encode('utf-8'))


def run():
	port = int(os.getenv('PORT') or '8787')
	server = HTTPServer(('', port), Handler)
	print(f"YooKassa API server on http://localhost:{port}")
	server.serve_forever()

if __name__ == '__main__':
	run()