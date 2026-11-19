"""Serve a candidate export and forward its calculations to the local engine."""

import argparse
from functools import partial
from http.client import HTTPConnection, HTTPException
from http.server import ThreadingHTTPServer
from pathlib import Path

from serve_export import ExportHandler


class CandidateExportHandler(ExportHandler):
    def do_POST(self):
        port = self.server.server_address[1]
        local_hosts = {f"localhost:{port}", f"127.0.0.1:{port}"}
        host = self.headers.get("Host")
        origin = self.headers.get("Origin")
        if (
            self.path != "/__candidate/api/household/calculate"
            or host not in local_hosts
            or (origin is not None and origin != f"http://{host}")
        ):
            self.send_error(404)
            return
        length = self.headers.get("Content-Length", "")
        if (
            self.headers.get_content_type() != "application/json"
            or not length.isascii()
            or not length.isdecimal()
            or len(length) > 5
            or not 0 < int(length) <= 16_384
        ):
            self.send_error(400, "Expected a bounded JSON request")
            return

        self.connection.settimeout(15)
        engine = HTTPConnection("127.0.0.1", 3090, timeout=110)
        try:
            request = self.rfile.read(int(length))
            if len(request) != int(length):
                self.send_error(400, "Incomplete request")
                return
            engine.request(
                "POST", "/calculate", request, {"Content-Type": "application/json"}
            )
            reply = engine.getresponse()
            payload = reply.read(512_001)
        except (OSError, HTTPException):
            self.send_error(502, "The local PolicyEngine model is unavailable")
            return
        finally:
            engine.close()
        if len(payload) > 512_000 or not 200 <= reply.status < 600:
            self.send_error(502, "The local model returned an invalid response")
            return
        self.send_response(reply.status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(payload)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("directory", type=Path, help="Candidate static export")
    parser.add_argument("--port", type=int, default=3085)
    args = parser.parse_args()
    if not (args.directory / "calculator" / "index.html").is_file():
        parser.error("Provide a built calculator export")
    handler = partial(CandidateExportHandler, directory=str(args.directory.resolve()))
    ThreadingHTTPServer(("127.0.0.1", args.port), handler).serve_forever()
