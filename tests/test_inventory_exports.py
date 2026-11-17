"""Verify national data completeness and generated-artifact consistency."""

import csv
import importlib.util
import io
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def load_builder():
    """Load export functions without running the inventory generator."""
    spec = importlib.util.spec_from_file_location(
        "csv_builder", ROOT / "scripts/build_inventory.py"
    )
    assert spec is not None and spec.loader is not None
    build = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(build)
    return build


def test_exports_reproduce_every_source_record():
    """Downloads must contain the current source records, with no omitted state."""
    sources = [json.loads(p.read_text()) for p in (ROOT / "data/states").glob("*.json")]
    exported = json.loads((ROOT / "public/data/inventory.json").read_text())
    assert len(exported) == 51
    assert sorted(sources, key=lambda s: s["code"]) == sorted(
        exported, key=lambda s: s["code"]
    )
    program_ids = [p["id"] for state in exported for p in state["programs"]]
    assert len(program_ids) == len(set(program_ids))
    assert (
        ROOT / "public/data/inventory.csv"
    ).read_bytes() == load_builder().inventory_csv(exported)


def test_audit_counts_and_rows_match_the_source_inventory():
    """Audit rows and displayed counts must derive from the same records."""
    states = json.loads((ROOT / "public/data/inventory.json").read_text())
    audit = json.loads((ROOT / "public/data/coverage.json").read_text())
    summary = json.loads((ROOT / "public/data/summary.json").read_text())
    programs = [p for state in states for p in state["programs"]]
    assert {p["id"] for p in programs} == {p["id"] for p in audit["programs"]}
    assert summary["jurisdictions"] == len(states)
    assert summary["programRecords"] == len(programs)
    assert summary["comparisonPrograms"] == sum(
        p["status"] != "context" for p in audit["programs"]
    )
    assert (
        summary["implementationFound"] + summary["implementationMissing"]
        == summary["comparisonPrograms"]
    )


def test_unvalidated_inventory_cannot_claim_calculation_readiness():
    """Presence is not correctness, and missing model results are never zero."""
    audit = json.loads((ROOT / "public/data/coverage.json").read_text())
    assert audit["releaseReady"] is False
    assert all(p["validated"] is False for p in audit["programs"])
    assert all("benefit" not in p and "amount" not in p for p in audit["programs"])


def test_shared_chrome_excludes_tool_specific_provenance():
    """Version pins, caveats and tax-year scope belong in the methods footnote."""
    chrome = (ROOT / "components/Chrome.tsx").read_text()
    for text in ["6.19.0", "2.2.1", "2025", "unvalidated", "Research draft"]:
        assert text not in chrome


def test_housing_expense_csv_resolves_its_source_references():
    """Committed CSV records resolve cited sources and retain validation limits."""
    canonical = json.loads(
        (ROOT / "data/housing-expense-model-routes.json").read_text(encoding="utf-8")
    )
    sources = {source["id"]: source for source in canonical["sources"]}
    with (ROOT / "public/data/housing-expense-model-routes.csv").open(
        encoding="utf-8"
    ) as stream:
        rows = list(csv.DictReader(stream))
    assert {row["state"] for row in rows} == {
        row["state"] for row in canonical["jurisdictions"]
    }
    observed = set()
    for row in rows:
        assert json.loads(row["validation"]) == canonical["audit"]["validation"]
        assert json.loads(row["calculator_coverage_added"]) is False
        assert json.loads(row["interpretation"]) == canonical["audit"]["interpretation"]
        records = json.loads(row["source_records"])
        assert [record["id"] for record in records] == json.loads(row["source_refs"])
        for record in records:
            assert set(record) == {
                "id",
                "path",
                "url",
                "sha256",
                "git_blob",
                "line_ranges",
            }
            assert all(
                sources[record["id"]][key] == value for key, value in record.items()
            )
            assert f"/blob/{canonical['audit']['model_commit']}/" in record["url"]
            observed.add(record["id"])
    assert observed == set(sources)


def test_static_csv_uses_browser_schema_and_escaping():
    build = load_builder()
    fixture = {
        "name": 'Fixture,\n"state"',
        "code": "ZZ",
        "taxYear": 2025,
        "inventoryStatus": "partial",
        "sources": [{"url": "https://example.invalid/state"}],
        "researchNotes": ["Fixture boundary"],
        "programs": [
            {
                "id": "fixture-id",
                "name": "=1+1",
                "category": "rebate",
                "scope": "statewide",
                "tenures": ["renter"],
                "refundable": None,
                "paymentMechanism": "property-tax-bill-reduction",
                "ageRule": 'First\n"second"',
                "incomeDefinition": "",
                "incomeLimits": "",
                "maximumBenefit": "",
                "formulaSummary": "",
                "application": "",
                "programYear": "2025",
                "sources": [
                    {"url": "https://example.invalid/program"},
                    {"url": "https://example.invalid/state"},
                ],
            }
        ],
    }
    empty = {**fixture, "code": "ZY", "programs": []}
    content = build.inventory_csv([fixture, empty])
    assert content.startswith(b"\xef\xbb\xbf")
    assert b"\r\n" in content
    rows = list(csv.DictReader(io.StringIO(content.decode("utf-8-sig"), newline="")))
    assert len(rows) == 2
    assert all(len(row) == 20 for row in rows)
    assert rows[0]["program_id"] == "fixture-id"
    assert rows[0]["state"] == fixture["name"]
    assert rows[0]["age_rule"] == fixture["programs"][0]["ageRule"]
    assert rows[0]["program"] == "'=1+1"
    assert rows[0]["refundable"] == ""
    assert rows[0]["payment_mechanism"] == "property-tax-bill-reduction"
    assert rows[0]["state_research_notes"] == "Fixture boundary"
    assert (
        rows[0]["source_urls"]
        == "https://example.invalid/program | https://example.invalid/state"
    )
    assert rows[1]["program_id"] == ""
    assert rows[1]["state_research_notes"] == "Fixture boundary"
