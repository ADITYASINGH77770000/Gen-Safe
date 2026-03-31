from __future__ import annotations

import os
import shutil
import subprocess
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
FRONTEND_DIR = ROOT / "frontend"
FRONTEND_BUILD_DIR = FRONTEND_DIR / "build"
PUBLIC_DIR = ROOT / "public"
FRONTEND_NODE_MODULES = FRONTEND_DIR / "node_modules"


def run(command: list[str], cwd: Path) -> None:
    subprocess.run(command, cwd=str(cwd), check=True)


def main() -> None:
    npm = shutil.which("npm") or shutil.which("npm.cmd")
    if not npm:
        raise RuntimeError("npm was not found on PATH")

    if not FRONTEND_NODE_MODULES.exists():
        run([npm, "ci"], FRONTEND_DIR)
    if os.getenv("VERCEL") or not FRONTEND_BUILD_DIR.exists():
        run([npm, "run", "build"], FRONTEND_DIR)

    if PUBLIC_DIR.exists():
        shutil.rmtree(PUBLIC_DIR)
    PUBLIC_DIR.mkdir(parents=True, exist_ok=True)

    for item in FRONTEND_BUILD_DIR.iterdir():
        dest = PUBLIC_DIR / item.name
        if item.is_dir():
            shutil.copytree(item, dest)
        else:
            shutil.copy2(item, dest)

    print(f"Copied frontend build to {PUBLIC_DIR}")


if __name__ == "__main__":
    main()
