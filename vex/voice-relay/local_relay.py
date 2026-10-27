"""
Tiny local relay so VEX (in your browser) can talk to a voice server on your own computer.

It adds the browser permission headers (CORS) and forwards requests to your local
Fish Speech server. No extra packages needed; just Python 3.

    python local_relay.py                       # forwards to http://127.0.0.1:8080 (Fish Speech default)
    python local_relay.py --target http://127.0.0.1:9000 --port 8787

Then in VEX: Settings → Voice → Voice server URL = http://localhost:8787
"""
import argparse
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

parser = argparse.ArgumentParser()
parser.add_argument("--target", default="http://127.0.0.1:8080", help="your local voice server")
parser.add_argument("--port", type=int, default=8787)
args = parser.parse_args()


class Relay(BaseHTTPRequestHandler):
    def cors(self):
        self.send_header("Access-Control-Allow-Origin", self.headers.get("Origin") or "*")
        self.send_header("Access-Control-Allow-Methods", "POST, GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "authorization, content-type, model")
        self.send_header("Access-Control-Allow-Private-Network", "true")

    def do_OPTIONS(self):
        self.send_response(204)
        self.cors()
        self.end_headers()

    def do_GET(self):
        self.forward(None)

    def do_POST(self):
        body = self.rfile.read(int(self.headers.get("Content-Length") or 0))
        self.forward(body)

    def forward(self, body):
        headers = {k: v for k, v in self.headers.items() if k.lower() in ("authorization", "content-type", "model")}
        req = urllib.request.Request(args.target.rstrip("/") + self.path, data=body, headers=headers, method=self.command)
        try:
            with urllib.request.urlopen(req, timeout=300) as r:
                status, ctype, data = r.status, r.headers.get("Content-Type", "audio/mpeg"), r.read()
        except urllib.error.HTTPError as e:
            status, ctype, data = e.code, e.headers.get("Content-Type", "text/plain"), e.read()
        except Exception as e:
            status, ctype, data = 502, "text/plain", f"Voice server not reachable at {args.target}: {e}".encode()
        self.send_response(status)
        self.cors()
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)


print(f"VEX voice relay on http://localhost:{args.port} -> {args.target}")
ThreadingHTTPServer(("127.0.0.1", args.port), Relay).serve_forever()
