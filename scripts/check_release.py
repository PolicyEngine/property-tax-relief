"""Enforce the agreed national calculation release boundary."""

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
summary = json.loads((ROOT / "public/data/summary.json").read_text())
audit = json.loads((ROOT / "public/data/coverage.json").read_text())
problems = []
if summary["jurisdictions"] != 51:
    problems.append("National inventory must contain all 50 states plus DC")
if summary["partialProfiles"]:
    problems.append(
        f"{summary['partialProfiles']} state research profiles remain partial"
    )
if summary["implementationMissing"]:
    problems.append(
        f"{summary['implementationMissing']} credit/rebate records lack implementation mappings"
    )
unvalidated = sum(
    not p["validated"] for p in audit["programs"] if p["status"] != "context"
)
if unvalidated:
    problems.append(
        f"{unvalidated} credit/rebate records lack source-derived calculation validation"
    )
if not audit["releaseReady"]:
    problems.append("Independent review and release readiness have not been recorded")
if problems:
    raise SystemExit("National calculator release blocked:\n- " + "\n- ".join(problems))
print("National calculator release requirements satisfied")
