"""Check that the saved review package contains the complete national data."""

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
