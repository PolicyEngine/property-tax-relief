"""Package local review artifacts without a running server or external scripts."""

from __future__ import annotations

import base64
import html
import mimetypes
import re
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "out"
ARTIFACTS = ROOT / "artifacts"


def body_class(text: str) -> str:
    """Preserve the production font class in self-contained documents."""
    match = re.search(r'<body\b[^>]*\bclass="([^"]*)"', text)
    return f' class="{html.escape(match.group(1), quote=True)}"' if match else ""


def inline_styles(text: str) -> str:
    """Use the compiled ui-kit styles from the actual production build."""

    def replace(match: re.Match) -> str:
        href = match.group(1)
        path = OUT / href.lstrip("/")
        css = path.read_text()

        def asset_url(asset: re.Match) -> str:
            url = asset.group(1).strip("\"'")
            if url.startswith("/"):
                local = OUT / url.lstrip("/")
            else:
                local = path.parent / url
            if not local.is_file():
                return asset.group(0)
            mime = mimetypes.guess_type(local)[0] or "application/octet-stream"
            encoded = base64.b64encode(local.read_bytes()).decode()
            return f'url("data:{mime};base64,{encoded}")'

        css = re.sub(r"url\(([^)]+)\)", asset_url, css)
        return f"<style>{css}</style>"

    return re.sub(r'<link[^>]*href="([^"]+\.css(?:\?[^\"]*)?)"[^>]*>', replace, text)


def document(name: str) -> None:
    """Export server-rendered report pages with native disclosure controls."""
    source = (OUT / name / "index.html").read_text()
    source = re.sub(r"<script\b[^>]*>.*?</script>", "", source, flags=re.DOTALL)
    source = re.sub(r'<link[^>]*(?:as="script"|rel="modulepreload")[^>]*>', "", source)
    source = inline_styles(source)
    font_class = body_class(source)
    styles = "\n".join(re.findall(r"<style>.*?</style>", source, flags=re.DOTALL))
    main = re.search(r"<main\b.*?</main>", source, flags=re.DOTALL)
    if main is None:
        raise ValueError(f"No report content in {name}")
    title = (
        "Rent and property taxes across states"
        if name == "report"
        else "Sources and methods"
    )
    source = (
        '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>'
        + title
        + " — research draft</title>"
        + styles
        + f'</head><body{font_class}><nav class="page-width report-toc" aria-label="Research navigation"><a href="index.html">Interactive explorer</a><a href="report.html">Report</a><a href="methods.html">Sources and methods</a><a href="inventory.csv">Download CSV</a></nav>'
        + main.group(0)
        + "</body></html>"
    )
    source = source.replace('href="/report/#', 'href="#')
    source = source.replace('href="/report/"', 'href="report.html"')
    source = source.replace('href="/methods/"', 'href="methods.html"')
    source = source.replace('href="/"', 'href="index.html"')
    source = source.replace('href="/data/', 'href="')
    (ARTIFACTS / f"{name}.html").write_text(source)


def main() -> None:
    """Write the offline explorer, report, methods and matching downloads."""
    ARTIFACTS.mkdir(exist_ok=True)
    document("report")
    document("methods")
    shell = inline_styles((OUT / "index.html").read_text())
    styles = "\n".join(re.findall(r"<style>.*?</style>", shell, flags=re.DOTALL))
    bundle = (ARTIFACTS / "standalone.js").read_text().replace("</script", "<\\/script")
    (ARTIFACTS / "index.html").write_text(
        '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>Rent and property taxes across states — research draft</title>'
        + styles
        + f'</head><body{body_class(shell)}><div id="root"></div><script type="module">'
        + bundle
        + "</script></body></html>"
    )
    for path in (ROOT / "public/data").iterdir():
        shutil.copyfile(path, ARTIFACTS / path.name)
    print(f"Packaged local review artifacts in {ARTIFACTS}")


if __name__ == "__main__":
    main()
