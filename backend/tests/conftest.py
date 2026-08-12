"""
conftest.py — no test infrastructure existed in this repo before the
streak-freeze rework (see streak-freeze-fix-prompt.md deliverable 6); this
file just makes `app.*` importable regardless of the directory pytest is
invoked from, since there's no pyproject.toml/pytest.ini establishing that.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
