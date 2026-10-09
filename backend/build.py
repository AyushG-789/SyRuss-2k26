"""Build packaging script for Vercel deployment.

Packages the repository-level seed data into backend/data so that
it is included in the deployed Vercel serverless function package.
"""
from __future__ import annotations

import shutil
import sys
from pathlib import Path


def package_seed_data(
    backend_dir: Path | None = None,
    source_data_dir: Path | None = None,
) -> Path | None:
    """Copy repo-level data/ into backend/data/ for serverless packaging."""
    if backend_dir is None:
        backend_dir = Path(__file__).resolve().parent

    if source_data_dir is None:
        source_data_dir = backend_dir.parent / "data"

    repo_data_dir = source_data_dir.resolve()
    target_data_dir = (backend_dir / "data").resolve()

    if repo_data_dir.is_dir() and (repo_data_dir / "network" / "lines.yaml").is_file():
        if repo_data_dir == target_data_dir:
            return target_data_dir

        if target_data_dir.exists():
            shutil.rmtree(target_data_dir)
        shutil.copytree(repo_data_dir, target_data_dir)
        print(f"[build] Packaged seed data: {repo_data_dir} -> {target_data_dir}")
        return target_data_dir
    elif target_data_dir.is_dir() and (target_data_dir / "network" / "lines.yaml").is_file():
        print(f"[build] Seed data already present in {target_data_dir}")
        return target_data_dir
    else:
        print(
            f"[build] ERROR: Could not locate seed data at {repo_data_dir} or {target_data_dir}",
            file=sys.stderr,
        )
        return None


if __name__ == "__main__":
    res = package_seed_data()
    if res is None:
        sys.exit(1)
