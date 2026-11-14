"""Assemble the national inventory and audit source-level model coverage.

This script computes inventory counts, not tax or benefit entitlements. A matching
model variable establishes implementation presence only. It never validates a
formula or converts a missing implementation into a zero benefit.
"""

from __future__ import annotations

import argparse
import ast
import csv
import importlib.metadata
import io
import json
import subprocess
import tarfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
STATE_CODES = {
    "AL",
    "AK",
    "AZ",
    "AR",
    "CA",
    "CO",
    "CT",
    "DE",
    "DC",
    "FL",
    "GA",
    "HI",
    "ID",
    "IL",
    "IN",
    "IA",
    "KS",
    "KY",
    "LA",
    "ME",
    "MD",
    "MA",
    "MI",
    "MN",
    "MS",
    "MO",
    "MT",
    "NE",
    "NV",
    "NH",
    "NJ",
    "NM",
    "NY",
    "NC",
    "ND",
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
    "VT",
    "VA",
    "WA",
    "WV",
    "WI",
    "WY",
}
CONTEXT_CATEGORIES = {
    "exemption",
    "deduction",
    "deferral",
    "local-option",
    "assessment-limit",
}


def source_variable_index(source: str, filename: str) -> dict[str, dict]:
    """Index declarations from one source file without executing its code."""
    result = {}
    try:
        tree = ast.parse(source)
    except SyntaxError:
        return result
    for node in tree.body:
        if isinstance(node, ast.ClassDef) and any(
            isinstance(base, ast.Name) and base.id == "Variable" for base in node.bases
        ):
            methods = [
                item.name
                for item in node.body
                if isinstance(item, (ast.FunctionDef, ast.AsyncFunctionDef))
            ]
            formulas = [name for name in methods if name.startswith("formula")]
            dated = [
                int(name.split("_")[1])
                for name in formulas
                if name.startswith("formula_") and name.split("_")[1].isdigit()
            ]
            declarative = any(
                isinstance(item, ast.Assign)
                and any(
                    isinstance(t, ast.Name) and t.id in {"adds", "subtracts"}
                    for t in item.targets
                )
                for item in node.body
            ) or any(name in {"adds", "subtracts"} for name in methods)
            result[node.name] = {
                "file": filename,
                "methods": formulas,
                "computableIn2025": "formula" in formulas
                or any(year <= 2025 for year in dated)
                or declarative,
            }
    return result


def variable_index(directory: Path) -> dict[str, dict]:
    """Read installed Variable classes without executing country-model code."""
    result = {}
    for path in directory.rglob("*.py"):
        try:
            source = path.read_text()
        except UnicodeDecodeError:
            continue
        result.update(source_variable_index(source, str(path.relative_to(directory))))
    return result


def canonical_variable_index(
    directory: Path, ref: str = "HEAD"
) -> tuple[str, dict[str, dict]]:
    """Index a resolved Git commit, excluding staged, dirty and untracked files."""
    commit = subprocess.check_output(
        ["git", "rev-parse", "--verify", "--end-of-options", f"{ref}^{{commit}}"],
        cwd=directory,
        text=True,
        timeout=60,
    ).strip()
    prefix = "policyengine_us/variables/"
    content = subprocess.check_output(
        ["git", "archive", "--format=tar", commit, prefix.rstrip("/")],
        cwd=directory,
        timeout=60,
    )
    result = {}
    with tarfile.open(fileobj=io.BytesIO(content), mode="r:") as archive:
        for member in archive:
            if not (
                member.isfile()
                and member.name.startswith(prefix)
                and member.name.endswith(".py")
            ):
                continue
            source_file = archive.extractfile(member)
            if source_file is None:
                continue
            try:
                source = source_file.read().decode("utf-8")
            except UnicodeDecodeError:
                continue
            result.update(source_variable_index(source, member.name[len(prefix) :]))
    return commit, result


def main() -> None:
    """Require national coverage and export the source inventory and audit."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--canonical-model",
        type=Path,
        help="Optional Git model checkout to compare with the installed release",
    )
    parser.add_argument(
        "--canonical-ref",
        default="HEAD",
        help="Committed model ref to inspect with --canonical-model (default: HEAD)",
    )
    args = parser.parse_args()
    if args.canonical_model is None and args.canonical_ref != "HEAD":
        parser.error("--canonical-ref requires --canonical-model")
    states = [
        json.loads(p.read_text()) for p in sorted((ROOT / "data/states").glob("*.json"))
    ]
    actual = {s["code"] for s in states}
    if actual != STATE_CODES or len(states) != len(STATE_CODES):
        raise ValueError(
            f"National coverage required; missing={sorted(STATE_CODES - actual)}, extra={sorted(actual - STATE_CODES)}"
        )
    states.sort(key=lambda s: s["name"])
    released = Path(
        importlib.metadata.distribution("policyengine-us").locate_file(
            "policyengine_us/variables"
        )
    )
    index = variable_index(released)
    commit, canonical_index = (
        canonical_variable_index(args.canonical_model, args.canonical_ref)
        if args.canonical_model
        else ("not-inspected", {})
    )
    rows = []
    for state in states:
        for program in state["programs"]:
            context = (
                program["scope"] != "statewide"
                or program["category"] in CONTEXT_CATEGORIES
            )
            variables = program["modelVariables"]
            missing = [v for v in variables if v not in index]
            unsupported = [
                v for v in variables if v in index and not index[v]["computableIn2025"]
            ]
            present = bool(variables) and not missing and not unsupported
            rows.append(
                {
                    "id": program["id"],
                    "state": state["code"],
                    "variables": variables,
                    "missingVariables": missing,
                    "inputOnlyOrLaterFormula": unsupported,
                    "variableDetails": {v: index[v] for v in variables if v in index},
                    "status": "context"
                    if context
                    else "implementation-found"
                    if present
                    else "implementation-missing",
                    "canonicalVariables": [
                        v for v in variables if v in canonical_index
                    ],
                    "validated": False,
                }
            )
    audit = {
        "interfaceVersion": importlib.metadata.version("policyengine"),
        "modelVersion": importlib.metadata.version("policyengine-us"),
        "canonicalModelCommit": commit,
        "canonicalModelRef": args.canonical_ref
        if args.canonical_model
        else "not-inspected",
        "canonicalModelSource": "committed-git-tree"
        if args.canonical_model
        else "not-inspected",
        "programs": rows,
        "releaseReady": False,
        "limitations": [
            "A matching formula declaration available by 2025 confirms source-level implementation presence only; it does not validate legal correctness, parameters, eligibility or interactions.",
            "Research records program-specific 2025 reference periods. Assessment, tax-payment, income and filing years can differ; read each program-year field.",
            "The national relief calculator requires missing implementations, tax-year checks, source-derived household tests, interaction checks and independent review.",
            "Source research describes identified statewide programs and selected context; it does not enumerate every local program or establish exhaustive absence.",
        ],
    }
    cash = [r for r in rows if r["status"] != "context"]
    summary = {
        "jurisdictions": len(states),
        "programRecords": len(rows),
        "comparisonPrograms": len(cash),
        "implementationFound": sum(r["status"] == "implementation-found" for r in cash),
        "implementationMissing": sum(
            r["status"] == "implementation-missing" for r in cash
        ),
        "partialProfiles": sum(s["inventoryStatus"] == "partial" for s in states),
    }
    out = ROOT / "public/data"
    out.mkdir(parents=True, exist_ok=True)
    for name, content in [
        ("inventory", states),
        ("coverage", audit),
        ("summary", summary),
    ]:
        (out / f"{name}.json").write_text(json.dumps(content, indent=2) + "\n")
    stream = io.StringIO(newline="")
    writer = csv.writer(stream, lineterminator="\n")
    writer.writerow(
        [
            "state",
            "code",
            "reference_year",
            "program",
            "category",
            "scope",
            "tenures",
            "refundable",
            "income_limits",
            "maximum_benefit",
            "program_year",
            "sources",
        ]
    )
    for state in states:
        for p in state["programs"] or [None]:
            if p is None:
                writer.writerow(
                    [
                        state["name"],
                        state["code"],
                        2025,
                        "No program recorded",
                        "",
                        "",
                        "",
                        "",
                        "",
                        "",
                        "",
                        " | ".join(s["url"] for s in state["sources"]),
                    ]
                )
            else:
                writer.writerow(
                    [
                        state["name"],
                        state["code"],
                        2025,
                        p["name"],
                        p["category"],
                        p["scope"],
                        " | ".join(p["tenures"]),
                        p["refundable"],
                        p["incomeLimits"],
                        p["maximumBenefit"],
                        p["programYear"],
                        " | ".join(s["url"] for s in p["sources"]),
                    ]
                )
    (out / "inventory.csv").write_text(stream.getvalue())
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
