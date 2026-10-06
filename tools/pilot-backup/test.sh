#!/usr/bin/env bash
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
for script in "$root"/*.sh; do
  bash -n "$script"
done
python3 - "$root" <<'PY'
import ast
import pathlib
import sys
root = pathlib.Path(sys.argv[1])
for source in root.rglob('*.py'):
    ast.parse(source.read_text(encoding='utf-8'), filename=str(source))
PY
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s "$root/tests" -v
