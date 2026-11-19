"""Loopback preview for four pinned 2025 PolicyEngine-US household rules."""

import argparse
import hashlib
import importlib.metadata
import inspect
import json
import logging
import math
import os
import sys
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

DIRECTORY = Path(os.environ["PROPERTY_TAX_CANDIDATE_DIR"]).resolve()
MODEL_SOURCE = DIRECTORY / "model-source"
LOGGER = logging.getLogger(__name__)
YEAR = "2025"
SAFE_JSON_INTEGER = 2**53 - 1
ENTITIES = {
    "person": ("people", "claimant"),
    "family": ("families", "family"),
    "marital_unit": ("marital_units", "marital_unit"),
    "tax_unit": ("tax_units", "tax_unit"),
    "spm_unit": ("spm_units", "spm_unit"),
    "household": ("households", "household"),
}
FIXED = {
    "is_tax_unit_head": ("person", True),
    "is_tax_unit_spouse": ("person", False),
    "is_tax_unit_dependent": ("person", False),
    "filing_status": ("tax_unit", "SINGLE"),
    "cohabitating_spouses": ("tax_unit", False),
}
STATE_INPUTS = {
    "MN": {
        "real_estate_taxes": ("person", 0, SAFE_JSON_INTEGER),
        "mn_personal_property_taxes": ("person", 0, 0),
    },
    "RI": {
        "age": ("person", 65, 120),
        "real_estate_taxes": ("person", 0, SAFE_JSON_INTEGER),
        "rent": ("person", 0, 0),
        "ri_property_tax_household_income": ("tax_unit", 0, SAFE_JSON_INTEGER),
    },
    "VT": {
        "county": ("household", ("ADDISON_COUNTY_VT", "CHITTENDEN_COUNTY_VT")),
        "vt_renter_credit_income": ("tax_unit", 0, SAFE_JSON_INTEGER),
        "vt_renter_credit_months_rented": ("tax_unit", 0, 12),
        "vt_renter_credit_domicile_status": (
            "tax_unit",
            ("FULL_YEAR", "NOT_FULL_YEAR"),
        ),
        "rent": ("person", 0, SAFE_JSON_INTEGER),
        "claimed_as_dependent_on_another_return": ("person",),
        "housing_assistance": ("spm_unit", 0, 0),
    },
    "WA": {
        "wa_pte_assessment_year_age": ("person", 18, 120),
        "wa_pte_owner_occupant": ("tax_unit",),
        "wa_pte_reported_combined_disposable_income": (
            "tax_unit",
            -SAFE_JSON_INTEGER,
            SAFE_JSON_INTEGER,
        ),
        "wa_pte_assessor_approved_value": ("tax_unit", 0, SAFE_JSON_INTEGER),
        "county_fips": ("household",),
    },
}
STATE_OUTPUTS = {
    "MN": {"mn_property_tax_deduction": float},
    "RI": {"ri_property_tax_credit": float},
    "VT": {"vt_renter_credit": float},
    "WA": {
        "wa_pte_additional_regular_tax_exempt_assessed_value": float,
        "wa_pte_reported_tier": int,
    },
}


class InvalidHousehold(ValueError):
    """The request is outside the four candidate contracts."""


def load_model():
    provenance = json.loads((DIRECTORY / "model-source-provenance.json").read_text())
    for package, key in (
        ("policyengine-core", "coreVersion"),
        ("spm-calculator", "spmVersion"),
    ):
        if importlib.metadata.version(package) != provenance[key]:
            raise RuntimeError(f"Unexpected installed version of {package}")
    for path, evidence in provenance["overlayFiles"].items():
        if (
            hashlib.sha256((MODEL_SOURCE / path).read_bytes()).hexdigest()
            != evidence["sha256"]
        ):
            raise RuntimeError(f"Candidate overlay has changed at {path}")

    sys.path.insert(0, str(MODEL_SOURCE))
    import policyengine_us
    from policyengine_us.system import system
    from policyengine_us.tools.geography.county_helpers import load_county_fips_dataset

    if (
        Path(policyengine_us.__file__).resolve()
        != MODEL_SOURCE / "policyengine_us/__init__.py"
    ):
        raise RuntimeError("The interpreter did not load the isolated US model")
    counties = load_county_fips_dataset()
    washington = counties.loc[counties["state"] == "WA", ["county_fips", "county_name"]]
    washington_names = dict(zip(washington["county_fips"], washington["county_name"]))
    if len(washington_names) != 39 or any(
        type(fips) is not str or not fips.startswith("53") or len(fips) != 5
        for fips in washington_names
    ):
        raise RuntimeError("Could not verify the 39 Washington county FIPS codes")

    addresses = {name: entity for name, (entity, _) in FIXED.items()}
    addresses["state_code"] = "household"
    for inputs in STATE_INPUTS.values():
        for name, (entity, *_) in inputs.items():
            if addresses.setdefault(name, entity) != entity:
                raise RuntimeError(f"Conflicting entity declarations for {name}")
    for state_outputs in STATE_OUTPUTS.values():
        for name, expected_type in state_outputs.items():
            addresses[name] = "tax_unit"
            if system.get_variable(name).value_type is not expected_type:
                raise RuntimeError(f"Unexpected output type for {name}")

    metadata = {
        **provenance,
        "year": int(YEAR),
        "variables": {},
        "sourceFileHashes": {},
        "variableSourceFiles": {},
    }
    for name, entity in sorted(addresses.items()):
        variable = system.get_variable(name)
        if variable.entity.key != entity or variable.definition_period != "year":
            raise RuntimeError(f"Unexpected model declaration for {name}")
        file = Path(inspect.getsourcefile(type(variable))).resolve()
        relative = file.relative_to(MODEL_SOURCE / "policyengine_us").as_posix()
        metadata["sourceFileHashes"][relative] = hashlib.sha256(
            file.read_bytes()
        ).hexdigest()
        metadata["variableSourceFiles"][name] = relative
        declaration = {
            "entity": variable.entity.key,
            "definitionPeriod": variable.definition_period,
            "valueType": variable.value_type.__name__,
            "unit": variable.unit,
        }
        possible_values = getattr(variable, "possible_values", None)
        if possible_values is not None:
            declaration["possibleValues"] = [
                {"label": member.value, "value": member.name}
                for member in possible_values
            ]
        if name == "county_fips":
            declaration["possibleValues"] = [
                {"label": label, "value": value}
                for value, label in sorted(washington_names.items())
            ]
            declaration["possibleValuesScope"] = "Washington preview county allowlist"
        metadata["variables"][name] = declaration
    for path, entry in provenance["overlayFiles"].items():
        metadata["sourceFileHashes"][path.removeprefix("policyengine_us/")] = entry[
            "sha256"
        ]
    return PreviewModel(policyengine_us.Simulation, system, metadata, washington_names)


def same_type_and_value(value, expected):
    return type(value) is type(expected) and value == expected


class PreviewModel:
    def __init__(self, simulate, system, metadata, washington_names):
        self.simulate = simulate
        self.system = system
        self.metadata = metadata
        self.washington_names = washington_names

    def validate(self, payload):
        if (
            type(payload) is not dict
            or set(payload) != {"country", "household"}
            or payload["country"] != "us"
        ):
            raise InvalidHousehold("Expected a US household request")
        raw = payload["household"]
        if type(raw) is not dict or set(raw) != {
            plural for plural, _ in ENTITIES.values()
        }:
            raise InvalidHousehold("Expected the six single-member household entities")

        facts = {}
        for entity, (plural, member) in ENTITIES.items():
            group = raw[plural]
            if (
                type(group) is not dict
                or set(group) != {member}
                or type(group[member]) is not dict
            ):
                raise InvalidHousehold(
                    "Each group must use the calculator’s single-member schema"
                )
            fields = group[member]
            if entity != "person" and fields.get("members") != ["claimant"]:
                raise InvalidHousehold("Each group must contain only the claimant")
            for name, periods in fields.items():
                if name == "members" and entity != "person":
                    continue
                if type(periods) is not dict or set(periods) != {YEAR} or name in facts:
                    raise InvalidHousehold("Each variable must appear once for 2025")
                facts[name] = (entity, periods[YEAR])

        state_entity, state = facts.pop("state_code", (None, None))
        if (
            state_entity != "household"
            or type(state) is not str
            or state not in STATE_INPUTS
        ):
            raise InvalidHousehold(
                "This preview serves only Minnesota, Rhode Island, Vermont and Washington"
            )
        for name, (entity, expected) in FIXED.items():
            sent_entity, value = facts.pop(name, (None, None))
            if sent_entity != entity or not same_type_and_value(value, expected):
                raise InvalidHousehold(f"Unexpected single-filer value for {name}")
        for name, specification in STATE_INPUTS[state].items():
            entity, value = facts.pop(name, (None, None))
            if entity != specification[0] or not self.valid_input(
                name, value, specification[1:]
            ):
                raise InvalidHousehold(f"Invalid or missing candidate input {name}")
        if (
            not facts
            or not facts.keys() <= STATE_OUTPUTS[state].keys()
            or any(
                entity != "tax_unit" or value is not None
                for entity, value in facts.values()
            )
        ):
            raise InvalidHousehold(
                "Request only the declared candidate outputs as null"
            )
        return raw, STATE_OUTPUTS[state], list(facts)

    def valid_input(self, name, value, limits):
        declared = self.system.get_variable(name).value_type
        if declared is bool:
            return type(value) is bool
        if name == "county_fips":
            return type(value) is str and value in self.washington_names
        if declared.__name__ == "Enum":
            return type(value) is str and value in limits[0]
        if declared is int:
            return type(value) is int and limits[0] <= value <= limits[1]
        return (
            declared is float
            and type(value) in (int, float)
            and limits[0] <= value <= limits[1]
        )

    def calculate(self, payload):
        household, types, outputs = self.validate(payload)
        simulation = self.simulate(situation=household)
        for name in outputs:
            array = simulation.calculate(name, period=YEAR)
            if len(array) != 1 or not math.isfinite(array[0]):
                raise RuntimeError(f"Candidate output {name} is not a finite scalar")
            household["tax_units"]["tax_unit"][name][YEAR] = types[name](array[0])
        return household


class CandidateHandler(BaseHTTPRequestHandler):
    def send_json(self, status, payload):
        body = json.dumps(payload, allow_nan=False).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def allow_local_request(self):
        return self.headers.get(
            "Host"
        ) == f"127.0.0.1:{self.server.server_port}" and not self.headers.get("Origin")

    def do_GET(self):
        if not self.allow_local_request():
            return self.send_json(
                403, {"status": "error", "message": "Loopback requests only"}
            )
        if self.path == "/health":
            return self.send_json(
                200,
                {
                    "status": "ok",
                    "modelVersion": self.server.preview.metadata["modelVersion"],
                },
            )
        if self.path == "/metadata":
            return self.send_json(
                200, {"status": "ok", "result": self.server.preview.metadata}
            )
        return self.send_json(404, {"status": "error"})

    def do_POST(self):
        if not self.allow_local_request():
            return self.send_json(
                403, {"status": "error", "message": "Loopback requests only"}
            )
        if self.path != "/calculate":
            return self.send_json(404, {"status": "error"})
        if self.headers.get_content_type() != "application/json" or self.headers.get(
            "Transfer-Encoding"
        ):
            return self.send_json(
                415, {"status": "error", "message": "Expected plain JSON"}
            )
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            length = 0
        if not 0 < length <= 16_384:
            return self.send_json(
                400, {"status": "error", "message": "Invalid request size"}
            )
        try:
            payload = json.loads(self.rfile.read(length))
            result = self.server.preview.calculate(payload)
        except (
            InvalidHousehold,
            ValueError,
            UnicodeDecodeError,
            RecursionError,
        ) as error:
            return self.send_json(400, {"status": "error", "message": str(error)})
        except Exception:
            LOGGER.exception("Candidate household calculation failed")
            return self.send_json(
                500, {"status": "error", "message": "Candidate calculation failed"}
            )
        self.send_json(200, {"status": "ok", "result": result})


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=3090)
    parser.add_argument("--metadata-only", action="store_true")
    args = parser.parse_args()
    preview = load_model()
    (DIRECTORY / "runtime-metadata.json").write_text(
        json.dumps(preview.metadata, indent=2, sort_keys=True, allow_nan=False) + "\n"
    )
    if not args.metadata_only:
        with HTTPServer(("127.0.0.1", args.port), CandidateHandler) as server:
            server.preview = preview
            print(
                f"Candidate PolicyEngine model ready at http://127.0.0.1:{args.port}",
                flush=True,
            )
            server.serve_forever()


if __name__ == "__main__":
    main()
