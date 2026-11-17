"""Guard frozen-source provenance, explicit scope and committed export copies."""

import copy
import importlib.util
import json
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]


def load_builder():
    spec = importlib.util.spec_from_file_location(
        "housing_builder", ROOT / "scripts/build_housing_expense_routes.py"
    )
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


@pytest.fixture(scope="module")
def canonical():
    return json.loads(
        (ROOT / "data/housing-expense-model-routes.json").read_text(encoding="utf-8")
    )


@pytest.mark.parametrize(
    "field",
    [
        "rent_routes",
        "property_tax_routes",
        "itemization_or_federal_base_route",
        "effective_year_evidence",
    ],
)
def test_subroute_cannot_cite_a_source_missing_from_its_row(canonical, field):
    builder = load_builder()
    builder.validate(canonical)
    broken = copy.deepcopy(canonical)
    row = broken["jurisdictions"][0]
    outside = next(
        source["id"]
        for source in broken["sources"]
        if source["id"] not in row["source_refs"]
    )
    entry = row[field][0] if isinstance(row[field], list) else row[field]
    entry["source_refs"] = sorted(set(entry["source_refs"]) | {outside})
    with pytest.raises(ValueError, match="missing from its jurisdiction"):
        builder.validate(broken)


@pytest.mark.parametrize(
    "location",
    [
        "public/data/housing-expense-model-routes.json",
        "public/data/housing-expense-model-routes.csv",
        "artifacts/housing-expense-model-routes.json",
        "artifacts/housing-expense-model-routes.csv",
    ],
)
def test_committed_export_drift_fails_without_regeneration(
    canonical, tmp_path, location
):
    builder = load_builder()
    json_content = (ROOT / "data/housing-expense-model-routes.json").read_bytes()
    csv_content = (ROOT / "public/data/housing-expense-model-routes.csv").read_bytes()
    for directory in ["public/data", "artifacts"]:
        folder = tmp_path / directory
        folder.mkdir(parents=True)
        (folder / "housing-expense-model-routes.json").write_bytes(json_content)
        (folder / "housing-expense-model-routes.csv").write_bytes(csv_content)
    builder.check_exports(canonical, tmp_path)
    (tmp_path / location).write_bytes(b"stale copy\n")
    with pytest.raises(ValueError, match="differs; run --write"):
        builder.check_exports(canonical, tmp_path)
    assert (tmp_path / location).read_bytes() == b"stale copy\n"


def test_route_metadata_keeps_mechanisms_and_unknown_boundaries_distinct(canonical):
    rows = {row["state"]: row for row in canonical["jurisdictions"]}
    addbacks = {
        route["variables"][0]: route["kind"]
        for state in ["MT", "NM"]
        for route in rows[state]["property_tax_routes"]
        if route["variables"]
        and route["variables"][0]
        in {"mt_state_income_tax_itemized_add_back", "nm_salt_add_back"}
    }
    assert addbacks == {
        "mt_state_income_tax_itemized_add_back": "income_add_back",
        "nm_salt_add_back": "income_add_back",
    }
    for row in rows.values():
        assert row["rent_routes"] and row["property_tax_routes"]
        assert any(
            route["kind"]
            in {
                "federal_itemization",
                "federal_common_personal_property_tax_itemization",
            }
            for route in row["property_tax_routes"]
        )
        assert row["effective_year_evidence"]["dispatch_notes"]
        for route in (
            row["rent_routes"]
            + row["property_tax_routes"]
            + [row["itemization_or_federal_base_route"]]
        ):
            assert route["description"]
            assert route["kind"] not in {
                "personal_property_tax_deduction_credit_or_refund_source_route",
                "deduction_credit_or_separate_refund_source_route",
                "source_finding",
            }
    for state in ["SD", "WY"]:
        notes = " ".join(rows[state]["effective_year_evidence"]["dispatch_notes"])
        assert "state_income_tax_before_refundable_credits" in notes
        assert "0000-01-01" in notes
        assert "2021-01-01" not in notes
    assert (
        rows["NC"]["itemization_or_federal_base_route"]["dependency_chain"][-1]
        == "nc_standard_or_itemized_deductions"
    )
    assert any(
        "gov.states.nc.tax.income.deductions.deductions" in text
        for text in rows["NC"]["uncertainties"]
    )
    assert canonical["audit"]["validation"] == {
        "legal": False,
        "numerical": False,
        "runtime": False,
        "live_api_version": False,
    }
    assert canonical["audit"]["calculator_coverage_added"] is False
