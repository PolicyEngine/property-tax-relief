"""Check or export the frozen housing-expense source declaration audit.

Run without arguments to check the committed public and offline JSON/CSV exports.
--write refreshes those copies from data/housing-expense-model-routes.json.
--model-repo additionally checks immutable Git blobs without loading the model.
"""

import argparse
import ast
import csv
import hashlib
import io
import json
import re
import subprocess
import sys
from pathlib import Path
from urllib.parse import quote

COMMIT = "5b18694981c758e0ae52042eb103e55e0333c7ef"
MODEL_URL = "https://github.com/PolicyEngine/policyengine-us"
STATES = {
    "AK",
    "AL",
    "AR",
    "AZ",
    "CA",
    "CO",
    "CT",
    "DC",
    "DE",
    "FL",
    "GA",
    "HI",
    "IA",
    "ID",
    "IL",
    "IN",
    "KS",
    "KY",
    "LA",
    "MA",
    "MD",
    "ME",
    "MI",
    "MN",
    "MO",
    "MS",
    "MT",
    "NC",
    "ND",
    "NE",
    "NH",
    "NJ",
    "NM",
    "NV",
    "NY",
    "OH",
    "OK",
    "OR",
    "PA",
    "RI",
    "SC",
    "SD",
    "TN",
    "TX",
    "UT",
    "VA",
    "VT",
    "WA",
    "WI",
    "WV",
    "WY",
}
ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "data/housing-expense-model-routes.json"
PUBLIC_JSON = ROOT / "public/data/housing-expense-model-routes.json"
PUBLIC_CSV = ROOT / "public/data/housing-expense-model-routes.csv"
OFFLINE_JSON = ROOT / "artifacts/housing-expense-model-routes.json"
OFFLINE_CSV = ROOT / "artifacts/housing-expense-model-routes.csv"
PRIVATE = re.compile(
    r"""(?:^|[\s"'])/(?:Users|home|private)/|file://|captured_path|local_source_copy|transcript|\.claude/|~/""",
    re.IGNORECASE,
)
ROUTE_KEYS = {
    "kind",
    "variables",
    "input_dependencies",
    "dependency_chain",
    "description",
    "source_refs",
}


def require(condition, message):
    if not condition:
        raise ValueError(message)


def json_bytes(data):
    return (json.dumps(data, ensure_ascii=False, indent=2) + "\n").encode()


def csv_bytes(data):
    stream = io.StringIO(newline="")
    fields = [
        "state",
        "audit_type",
        "tax_year",
        "model_commit",
        "validation",
        "calculator_coverage_added",
        "interpretation",
        "rent_routes",
        "property_tax_routes",
        "itemization_or_federal_base_route",
        "source_refs",
        "source_records",
        "declared_reference_urls",
        "effective_year_evidence",
        "uncertainties",
    ]
    writer = csv.DictWriter(stream, fieldnames=fields, lineterminator="\n")
    writer.writeheader()
    sources = {source["id"]: source for source in data["sources"]}
    provenance_fields = ("id", "path", "url", "sha256", "git_blob", "line_ranges")
    for row in data["jurisdictions"]:
        item = {
            "state": row["state"],
            "audit_type": data["audit"]["type"],
            "tax_year": data["audit"]["tax_year"],
            "model_commit": COMMIT,
        }
        for field in fields[4:]:
            value = (
                [
                    {key: sources[ref][key] for key in provenance_fields}
                    for ref in row["source_refs"]
                ]
                if field == "source_records"
                else data["audit"][field]
                if field
                in {"validation", "calculator_coverage_added", "interpretation"}
                else row[field]
            )
            item[field] = json.dumps(value, ensure_ascii=False, separators=(",", ":"))
        writer.writerow(item)
    return stream.getvalue().encode()


def validate(data):
    require(
        set(data) == {"schema_version", "audit", "jurisdictions", "sources"},
        "Unexpected top-level schema",
    )
    require(data["schema_version"] == 1, "Unsupported schema version")
    audit = data["audit"]
    require(audit["type"] == "source_declaration_audit", "Audit type changed")
    require(
        audit["tax_year"] == 2025 and audit["model_commit"] == COMMIT,
        "Frozen year or commit changed",
    )
    require(
        audit["validation"]
        == {
            "legal": False,
            "numerical": False,
            "runtime": False,
            "live_api_version": False,
        },
        "Validation scope changed",
    )
    require(audit["calculator_coverage_added"] is False, "Calculator scope changed")
    rows = data["jurisdictions"]
    require(
        len(rows) == 51 and {row["state"] for row in rows} == STATES,
        "Expected all 50 states and DC exactly once",
    )
    require(
        [row["state"] for row in rows] == sorted(STATES),
        "Jurisdictions must use state-code order",
    )
    sources = data["sources"]
    require(
        len(sources) == 370
        and audit["source_count"] == 370
        and audit["jurisdiction_count"] == 51,
        "Audit counts changed",
    )
    require(
        len({source["id"] for source in sources}) == len(sources),
        "Duplicate source identifiers",
    )
    require(
        len({source["path"] for source in sources}) == len(sources),
        "Duplicate source paths",
    )
    require(
        [source["path"] for source in sources]
        == sorted(source["path"] for source in sources),
        "Sources must use path order",
    )
    ids = {source["id"] for source in sources}
    used = set()
    for source in sources:
        path = source["path"]
        require(
            path.startswith("policyengine_us/") and ".." not in Path(path).parts,
            "Invalid repository source path",
        )
        require(
            re.fullmatch(r"[0-9a-f]{64}", source["sha256"]) is not None,
            "Invalid source hash",
        )
        require(
            re.fullmatch(r"[0-9a-f]{40}", source["git_blob"]) is not None,
            "Invalid Git blob identifier",
        )
        require(
            source["id"] == "src_" + hashlib.sha256(path.encode()).hexdigest()[:12],
            "Unstable source identifier",
        )
        url = MODEL_URL + "/blob/" + COMMIT + "/" + quote(path, safe="/")
        require(source["url"] == url, "Noncanonical Git source URL")
        require(bool(source["line_ranges"]), "Source requires line locators")
        for locator in source["line_ranges"]:
            start, end = locator["start"], locator["end"]
            require(
                type(start) is int and type(end) is int and 1 <= start <= end,
                "Invalid line range",
            )
            require(
                locator["url"]
                == url + f"#L{start}" + (f"-L{end}" if end != start else ""),
                "Noncanonical locator URL",
            )
        eligible = [
            method
            for method in source["formula_methods"]
            if method["declared_start"] is None
            or method["declared_start"] <= "2025-12-31"
        ]
        expected = max(
            eligible,
            key=lambda method: method["declared_start"] or "0000-01-01",
            default=None,
        )
        require(
            source["latest_declared_method_not_after_2025"] == expected,
            "Method selector includes a later-year branch",
        )

    def references(values, row_refs=None):
        require(
            isinstance(values, list) and values == sorted(set(values)),
            "Source references must be unique and sorted",
        )
        require(set(values) <= ids, "Unknown source reference")
        if row_refs is not None:
            require(
                set(values) <= row_refs,
                "Sub-route source reference missing from its jurisdiction source_refs",
            )
        used.update(values)

    expected_row_keys = {
        "state",
        "rent_routes",
        "property_tax_routes",
        "itemization_or_federal_base_route",
        "source_refs",
        "declared_reference_urls",
        "effective_year_evidence",
        "uncertainties",
    }
    for row in rows:
        require(set(row) == expected_row_keys, "Unexpected jurisdiction fields")
        references(row["source_refs"])
        row_refs = set(row["source_refs"])
        for field in ("rent_routes", "property_tax_routes"):
            require(isinstance(row[field], list), "Routes must use lists")
            for route in row[field]:
                require(set(route) == ROUTE_KEYS, "Unexpected route fields")
                require(
                    isinstance(route["kind"], str)
                    and re.fullmatch(r"[a-z][a-z0-9_]*", route["kind"]),
                    "Route kind must use a lowercase identifier without spaces",
                )
                require(
                    bool(route["description"].strip()), "Route description required"
                )
                for key in ("variables", "input_dependencies", "dependency_chain"):
                    require(
                        isinstance(route[key], list)
                        and all(isinstance(value, str) for value in route[key]),
                        "Route chains must use string lists",
                    )
                references(route["source_refs"], row_refs)
                require(
                    not route["dependency_chain"] or bool(route["source_refs"]),
                    "Asserted dependency chain requires route source references",
                )
        itemization = row["itemization_or_federal_base_route"]
        require(
            re.fullmatch(r"[a-z][a-z0-9_]*", itemization["kind"]) is not None,
            "Itemization kind must use a lowercase identifier without spaces",
        )
        require(
            bool(itemization["description"].strip()), "Itemization description required"
        )
        references(itemization["source_refs"], row_refs)
        references(row["effective_year_evidence"]["source_refs"], row_refs)
        require(
            row["effective_year_evidence"]["tax_year"] == 2025,
            "Jurisdiction year changed",
        )
        require(
            all(
                url.startswith(("https://", "http://"))
                for url in row["declared_reference_urls"]
            ),
            "Invalid declared reference URL",
        )
    require(used == ids, "Unreferenced provenance entry")
    require(
        not PRIVATE.search(json.dumps(data, ensure_ascii=False)),
        "Private path or capture field in public data",
    )
    require(
        "potential_issue" not in json.dumps(data),
        "Speculative issue field in public data",
    )


def declarations(blob, path):
    text = blob.decode()
    methods, dates = [], []
    if path.endswith(".py"):
        for node in ast.walk(ast.parse(text)):
            if isinstance(node, ast.FunctionDef) and re.fullmatch(
                r"formula(?:_\d{4}(?:_\d{2}){0,2})?", node.name
            ):
                suffix = (
                    node.name.removeprefix("formula_")
                    if node.name != "formula"
                    else None
                )
                start = (suffix.replace("_", "-") + "-01-01")[:10] if suffix else None
                methods.append(
                    {
                        "name": node.name,
                        "line": node.lineno,
                        "end_line": node.end_lineno,
                        "declared_start": start,
                    }
                )
    else:
        for line, text_line in enumerate(text.splitlines(), 1):
            match = re.match(r"\s+(\d{4}-\d{2}-\d{2}):", text_line)
            if match:
                dates.append({"date": match[1], "line": line})
    return methods, dates


def check_model(data, repo):
    queries = (
        "\n".join(COMMIT + ":" + source["path"] for source in data["sources"]) + "\n"
    )
    result = subprocess.run(
        ["git", "-C", str(repo), "cat-file", "--batch"],
        input=queries.encode(),
        capture_output=True,
        check=True,
        timeout=30,
    )
    raw, offset = result.stdout, 0
    for source in data["sources"]:
        line_end = raw.index(b"\n", offset)
        header = raw[offset:line_end].decode().split()
        require(
            len(header) == 3 and header[1] == "blob",
            "Missing frozen Git source: " + source["path"],
        )
        size = int(header[2])
        blob = raw[line_end + 1 : line_end + 1 + size]
        offset = line_end + size + 2
        require(
            hashlib.sha256(blob).hexdigest() == source["sha256"]
            and header[0] == source["git_blob"],
            "Frozen Git hash mismatch: " + source["path"],
        )
        line_count = len(blob.decode().splitlines())
        require(
            all(locator["end"] <= line_count for locator in source["line_ranges"]),
            "Locator outside source: " + source["path"],
        )
        methods, dates = declarations(blob, source["path"])
        require(
            source["formula_methods"] == methods
            and source["parameter_date_declarations"] == dates,
            "Source date or method declaration mismatch: " + source["path"],
        )


def check_exports(data, root=ROOT):
    """Reject a stale committed public or offline copy without regenerating it."""
    expected_json, expected_csv = json_bytes(data), csv_bytes(data)
    for name in ("public/data", "artifacts"):
        for suffix, content in (("json", expected_json), ("csv", expected_csv)):
            path = root / name / f"housing-expense-model-routes.{suffix}"
            require(
                path.read_bytes() == content,
                f"{name} {suffix.upper()} differs; run --write",
            )


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    action = parser.add_mutually_exclusive_group()
    action.add_argument(
        "--check", action="store_true", help="Check committed exports (default)"
    )
    action.add_argument(
        "--write", action="store_true", help="Write deterministic public JSON and CSV"
    )
    parser.add_argument(
        "--model-repo",
        type=Path,
        help="Read immutable Git objects from a local PolicyEngine US checkout",
    )
    args = parser.parse_args()
    data = json.loads(SOURCE.read_text(encoding="utf-8"))
    validate(data)
    expected_json, expected_csv = json_bytes(data), csv_bytes(data)
    require(SOURCE.read_bytes() == expected_json, "Canonical JSON formatting differs")
    require(not PRIVATE.search(expected_csv.decode()), "Private path in CSV export")
    if args.model_repo:
        check_model(data, args.model_repo)
    if args.write:
        PUBLIC_JSON.parent.mkdir(parents=True, exist_ok=True)
        PUBLIC_JSON.write_bytes(expected_json)
        PUBLIC_CSV.write_bytes(expected_csv)
        OFFLINE_JSON.parent.mkdir(parents=True, exist_ok=True)
        OFFLINE_JSON.write_bytes(expected_json)
        OFFLINE_CSV.write_bytes(expected_csv)
    check_exports(data)
    require(
        len(list(csv.DictReader(io.StringIO(PUBLIC_CSV.read_text(encoding="utf-8")))))
        == 51,
        "CSV must contain 51 jurisdictions",
    )
    print(
        json.dumps(
            {
                "status": "ok",
                "mode": "write" if args.write else "check",
                "jurisdictions": 51,
                "sources": 370,
                "model_git_objects_checked": bool(args.model_repo),
            }
        )
    )


if __name__ == "__main__":
    try:
        main()
    except (ValueError, OSError, subprocess.SubprocessError) as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
