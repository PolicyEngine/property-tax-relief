"""Pin source audits to committed content without constructing a model."""

import importlib.util
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location(
    "build_inventory", ROOT / "scripts/build_inventory.py"
)
assert SPEC is not None and SPEC.loader is not None
BUILD = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(BUILD)


def git(directory, *args):
    """Run Git only within the test's disposable repository."""
    return subprocess.check_output(
        [
            "git",
            "-c",
            "core.hooksPath=/dev/null",
            "-c",
            "commit.gpgsign=false",
            "-c",
            "user.name=Provenance fixture",
            "-c",
            "user.email=provenance@example.invalid",
            *args,
        ],
        cwd=directory,
        text=True,
        timeout=10,
    ).strip()


def variable_source(name, year):
    """Return declarations only; the audit must never execute their bodies."""
    return (
        f"class {name}(Variable):\n"
        f"    def formula_{year}(entity, period, parameters):\n"
        "        raise AssertionError('Source audit executed model code')\n"
    )


@pytest.fixture
def model_repo(tmp_path):
    """Commit one small source declaration, without loading PolicyEngine."""
    git(tmp_path, "init")
    variables = tmp_path / "policyengine_us/variables"
    variables.mkdir(parents=True)
    source = variables / "credit.py"
    source.write_text(variable_source("committed_credit", 2025))
    git(tmp_path, "add", "policyengine_us/variables/credit.py")
    git(tmp_path, "commit", "-m", "Fixture source")
    return tmp_path, variables, git(tmp_path, "rev-parse", "HEAD")


def test_dirty_and_staged_files_cannot_change_a_pinned_audit(model_repo):
    """Read HEAD's declarations even when every local source layer differs."""
    directory, variables, commit = model_repo
    source = variables / "credit.py"
    source.write_text(variable_source("staged_credit", 2025))
    git(directory, "add", "policyengine_us/variables/credit.py")
    source.write_text(variable_source("dirty_credit", 2025))
    (variables / "untracked.py").write_text(variable_source("untracked_credit", 2025))

    resolved, index = BUILD.canonical_variable_index(directory)

    assert resolved == commit
    assert index == {
        "committed_credit": {
            "file": "credit.py",
            "methods": ["formula_2025"],
            "computableIn2025": True,
        }
    }
    assert source.read_text() == variable_source("dirty_credit", 2025)


def test_requested_commit_can_differ_from_the_checkout_head(model_repo):
    """An upstream-style ref can exclude committed local repair work too."""
    directory, variables, canonical_commit = model_repo
    git(directory, "update-ref", "refs/remotes/upstream/main", canonical_commit)
    (variables / "credit.py").write_text(variable_source("local_repair_credit", 2025))
    git(directory, "add", "policyengine_us/variables/credit.py")
    git(directory, "commit", "-m", "Local repair fixture")

    resolved, index = BUILD.canonical_variable_index(directory, "upstream/main")

    assert git(directory, "rev-parse", "HEAD") != canonical_commit
    assert resolved == canonical_commit
    assert set(index) == {"committed_credit"}
