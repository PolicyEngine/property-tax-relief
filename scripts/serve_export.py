"""Serve the export locally, including the same path aliases as the Vercel zone."""

from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit

ROOT = Path(__file__).resolve().parents[1]


class ExportHandler(SimpleHTTPRequestHandler):
    def translate_path(self, path):
        parsed = urlsplit(path)
        route = parsed.path
        for prefix, replacement in (
            ("/_zones/property-tax-relief/_next/", "/_next/"),
            ("/us/rent-and-property-taxes/", "/"),
        ):
            if route.startswith(prefix):
                route = replacement + route[len(prefix) :]
                break
        if route == "/us/rent-and-property-taxes":
            route = "/"
        return super().translate_path(
            urlunsplit(("", "", route, parsed.query, parsed.fragment))
        )


if __name__ == "__main__":
    handler = partial(ExportHandler, directory=str(ROOT / "out"))
    ThreadingHTTPServer(("127.0.0.1", 3075), handler).serve_forever()
