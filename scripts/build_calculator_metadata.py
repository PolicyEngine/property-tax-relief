"""Extract calculator contracts from a captured dashboard metadata response."""

import hashlib
import json
import sys
from pathlib import Path

root = Path(__file__).resolve().parents[1]
raw = Path(sys.argv[1]).read_bytes()
answer = json.loads(raw)
if answer.get("status") != "ok":
    raise ValueError("Metadata response did not succeed")
metadata = answer["result"]
contracts = json.loads((root / "data/calculator/contracts.json").read_text())
if metadata["version"] != contracts["metadataVersion"]:
    raise ValueError("New model release requires another contract audit")
names = {
    "state_code",
    "filing_status",
    "is_tax_unit_head",
    "is_tax_unit_spouse",
    "is_tax_unit_dependent",
    "cohabitating_spouses",
}
for contract in contracts["contracts"]:
    names.add(contract["modelVariable"])
    names.update(field["variable"] for field in contract["inputs"])
keys = {
    "name",
    "entity",
    "valueType",
    "unit",
    "definitionPeriod",
    "possibleValues",
    "isInputVariable",
}
snapshot = {
    "source": "https://www.policyengine.org/api/metadata/us",
    "checkedAt": sys.argv[2],
    "modelVersion": metadata["version"],
    "sourceSha256": hashlib.sha256(raw).hexdigest(),
    "variables": {
        name: {
            key: value
            for key, value in metadata["variables"][name].items()
            if key in keys
        }
        for name in sorted(names)
    },
}
(root / "data/calculator/model-metadata.json").write_text(
    json.dumps(snapshot, indent=2) + "\n"
)
