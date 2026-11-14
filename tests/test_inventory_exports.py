"""Verify national data completeness and generated-artifact consistency."""

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


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
