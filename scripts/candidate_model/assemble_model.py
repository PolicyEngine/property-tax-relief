"""Assemble a local candidate from immutable Git objects without editing the repo."""

import hashlib
import json
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

DIRECTORY = Path(os.environ["PROPERTY_TAX_CANDIDATE_DIR"]).resolve()
BASE = "d1e89b3585c4b3ae87b9ae263000aef173a246e7"
OVERLAYS = {
    "ri": "a7d375ca2c5590cc7791d8c8baa1ea9759864495",
    "vt": "c817a3f15982b070f2d7d7b1d0f27dcbc9f339b5",
    "wa": "af67c293a0cc7dcc328009ffe5d9ea25abeb05fc",
}
MODEL_VERSION = "2.145.3+preview.d1e89b3.a7d375c.c817a3f.af67c29"


def sha256(data):
    return hashlib.sha256(data).hexdigest()


def assemble(repo):
    def git(*arguments):
        return subprocess.check_output(["git", "-C", repo, *arguments])

    destination = DIRECTORY / "model-source"
    if destination.exists():
        raise FileExistsError(f"Candidate source already exists at {destination}")
    base_tree = git("rev-parse", f"{BASE}:policyengine_us").decode().strip()
    with tempfile.TemporaryDirectory(dir=DIRECTORY) as temporary:
        stage = Path(temporary) / "model-source"
        stage.mkdir()
        with subprocess.Popen(
            ["git", "-C", repo, "archive", BASE, "policyengine_us"],
            stdout=subprocess.PIPE,
        ) as archive:
            subprocess.run(
                ["tar", "-xf", "-", "-C", str(stage)], stdin=archive.stdout, check=True
            )
            archive.stdout.close()
            if archive.wait() != 0:
                raise RuntimeError("Could not export the pinned US model")

        overlay_files = {}
        for state, revision in OVERLAYS.items():
            parent = git("rev-parse", f"{revision}^").decode().strip()
            prefixes = tuple(
                f"policyengine_us/{kind}/gov/states/{state}/"
                for kind in ("parameters", "variables")
            )
            changes = (
                git(
                    "diff-tree",
                    "-r",
                    "--no-commit-id",
                    "--name-status",
                    "--no-renames",
                    parent,
                    revision,
                )
                .decode()
                .splitlines()
            )
            for change in changes:
                status, path = change.split("\t")
                if not path.startswith(prefixes):
                    continue
                local = stage / path
                if status == "M":
                    parent_bytes = git("show", f"{parent}:{path}")
                    if local.read_bytes() != parent_bytes:
                        raise RuntimeError(
                            f"Base diverges from the candidate parent at {path}"
                        )
                elif status != "A" or local.exists():
                    raise RuntimeError(f"Unexpected candidate change {change}")
                data = git("show", f"{revision}:{path}")
                local.parent.mkdir(parents=True, exist_ok=True)
                local.write_bytes(data)
                overlay_files[path] = {
                    "revision": revision,
                    "status": status,
                    "sha256": sha256(data),
                }
        shutil.move(stage, destination)

    provenance = {
        "modelVersion": MODEL_VERSION,
        "baseRevision": BASE,
        "baseCountryTree": base_tree,
        "baseVersion": "2.145.3",
        "coreVersion": "3.36.0",
        "spmVersion": "1.1.0",
        "overlayRevisions": OVERLAYS,
        "overlayFiles": overlay_files,
    }
    (DIRECTORY / "model-source-provenance.json").write_text(
        json.dumps(provenance, indent=2, sort_keys=True) + "\n"
    )


if __name__ == "__main__":
    assemble(sys.argv[1])
