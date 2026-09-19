#!/usr/bin/env python3
"""Static Alembic graph validation; does not connect to any database."""

from __future__ import annotations

import ast
import collections
import pathlib
import sys


ROOT = pathlib.Path(__file__).resolve().parents[1]
VERSIONS = ROOT / "app" / "backend" / "alembic" / "versions"


def migration_metadata(path: pathlib.Path) -> tuple[str | None, tuple[str, ...]]:
    tree = ast.parse(path.read_text(encoding="utf-8-sig"), filename=str(path))
    values: dict[str, object] = {}
    for node in tree.body:
        targets: list[ast.expr] = []
        value: ast.expr | None = None
        if isinstance(node, ast.Assign):
            targets, value = node.targets, node.value
        elif isinstance(node, ast.AnnAssign):
            targets, value = [node.target], node.value
        if value is None:
            continue
        for target in targets:
            if isinstance(target, ast.Name) and target.id in {"revision", "down_revision"}:
                try:
                    values[target.id] = ast.literal_eval(value)
                except (ValueError, TypeError):
                    pass
    revision = values.get("revision")
    down = values.get("down_revision")
    parents = (down,) if isinstance(down, str) else tuple(down or ()) if isinstance(down, (tuple, list)) else ()
    return revision if isinstance(revision, str) else None, parents


def main() -> int:
    revisions: dict[str, pathlib.Path] = {}
    duplicates: dict[str, list[str]] = collections.defaultdict(list)
    parents: set[str] = set()
    missing_revision_files: list[str] = []

    for path in sorted(VERSIONS.glob("*.py")):
        revision, down_revisions = migration_metadata(path)
        if not revision:
            missing_revision_files.append(path.name)
            continue
        duplicates[revision].append(path.name)
        revisions.setdefault(revision, path)
        parents.update(down_revisions)

    duplicate_ids = {key: files for key, files in duplicates.items() if len(files) > 1}
    missing_parents = sorted(parents.difference(revisions))
    heads = sorted(set(revisions).difference(parents))
    errors: list[str] = []
    if missing_revision_files:
        errors.append("files without a revision: " + ", ".join(missing_revision_files))
    if duplicate_ids:
        errors.extend(f"duplicate revision {revision}: {', '.join(files)}" for revision, files in duplicate_ids.items())
    if missing_parents:
        errors.append("missing down_revision targets: " + ", ".join(missing_parents))
    if len(heads) != 1:
        errors.append("expected exactly one Alembic head, found: " + (", ".join(heads) or "none"))

    if errors:
        print("Migration graph is unsafe:")
        for error in errors:
            print(f"- {error}")
        return 1

    print(f"Migration graph OK: {len(revisions)} revisions, head={heads[0]}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
