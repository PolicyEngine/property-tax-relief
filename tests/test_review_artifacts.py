"""Check that the saved review package contains the complete national data."""

import base64
import importlib.util
import json
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


class ArtifactParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.profile_count = 0
        self.external_scripts = []

    def handle_starttag(self, tag, attrs):
        values = dict(attrs)
        if "report-profile" in values.get("class", "").split():
            self.profile_count += 1
        if tag == "script" and "src" in values:
            self.external_scripts.append(values["src"])


def test_saved_report_has_all_51_profiles():
    parser = ArtifactParser()
    parser.feed((ROOT / "artifacts/report.html").read_text())
    assert parser.profile_count == 51
    assert not parser.external_scripts


def test_interactive_embeds_its_bundle_and_matching_source_data():
    html = (ROOT / "artifacts/index.html").read_text()
    parser = ArtifactParser()
    parser.feed(html)
    assert not parser.external_scripts
    assert '<script type="module">' in html
    assert '<div id="root"></div>' in html
    data = json.loads((ROOT / "artifacts/inventory.json").read_text())
    canonical = json.loads((ROOT / "public/data/inventory.json").read_text())
    assert data == canonical
    assert len(data) == 51


def test_offline_font_packaging_preserves_class_and_embeds_local_asset(
    tmp_path, monkeypatch
):
    spec = importlib.util.spec_from_file_location(
        "font_packager", ROOT / "scripts/package_artifacts.py"
    )
    package = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(package)
    monkeypatch.setattr(package, "OUT", tmp_path)
    (tmp_path / "styles").mkdir()
    (tmp_path / "media").mkdir()
    font = b"MOCK font bytes for packaging only"
    (tmp_path / "media/font.woff2").write_bytes(font)
    (tmp_path / "styles/font.css").write_text(
        "@font-face {font-family: Inter; src: url(../media/font.woff2)}"
    )
    source = '<html><head><link rel="stylesheet" href="/styles/font.css"></head><body class="inter-fixture"><main>Fixture</main></body></html>'
    result = package.inline_styles(source)
    assert base64.b64encode(font).decode() in result
    assert "data:font/woff2;base64," in result
    assert package.body_class(result) == ' class="inter-fixture"'
    assert "../media/font.woff2" not in result
