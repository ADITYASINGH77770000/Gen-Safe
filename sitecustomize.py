from __future__ import annotations

import sys
from pathlib import Path


def _add_venv_site_packages() -> None:
    backend_dir = Path(__file__).resolve().parent / "backend"
    venv_site_packages = backend_dir / ".venv" / "Lib" / "site-packages"
    if venv_site_packages.is_dir():
        path = str(venv_site_packages)
        if path not in sys.path:
            sys.path.insert(0, path)


_add_venv_site_packages()
