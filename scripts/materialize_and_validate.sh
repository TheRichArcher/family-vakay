#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "Family Vakay recovery check"
echo "Root: $ROOT"
echo

required_files=(
  "$ROOT/package.json"
  "$ROOT/src/App.tsx"
  "$ROOT/api/main.py"
  "$ROOT/firestore.rules"
  "$ROOT/storage.rules"
)

missing_bytes=0
for file in "${required_files[@]}"; do
  if [[ ! -s "$file" ]]; then
    echo "BLOCKED: missing or unreadable bytes: $file"
    missing_bytes=1
    continue
  fi

  if ! head -c 1 "$file" >/dev/null 2>&1; then
    echo "BLOCKED: filesystem cannot read: $file"
    missing_bytes=1
  fi
done

if [[ "$missing_bytes" -ne 0 ]]; then
  echo
  echo "Stop here. macOS still sees source files as placeholders/corrupt dataless files."
  echo "Restore this folder from the cloud provider, Time Machine, or a clean Git clone first."
  exit 2
fi

echo "Source bytes are readable."
echo

if command -v node >/dev/null 2>&1; then
  node_major="$(node -p "process.versions.node.split('.')[0]")"
  if [[ "$node_major" != "20" ]]; then
    echo "BLOCKED: package.json requires Node 20.x, but current node is $(node -v)."
    echo "Install/use Node 20 before running frontend validation."
    exit 3
  fi
else
  echo "BLOCKED: node is not installed."
  exit 3
fi

if command -v git >/dev/null 2>&1; then
  if git -C "$ROOT" status --short --branch >/dev/null 2>&1; then
    git -C "$ROOT" status --short --branch
  else
    echo "WARN: Git metadata is not usable. Recreate the repo before shipping."
  fi
fi

echo
echo "Running frontend install/checks..."
cd "$ROOT"
rm -rf node_modules
npm ci
npm test -- --watchAll=false

if npm run | grep -q "^  typecheck"; then
  npm run typecheck
fi

if npm run | grep -q "^  lint"; then
  npm run lint
fi

echo
echo "Running backend tests..."
cd "$ROOT/api"
python_bin="${PYTHON_BIN:-python3.13}"
if ! command -v "$python_bin" >/dev/null 2>&1; then
  echo "BLOCKED: $python_bin is required for backend validation."
  exit 4
fi

venv_dir="${TMPDIR:-/tmp}/family-vakay-api-venv"
rm -rf "$venv_dir"
"$python_bin" -m venv "$venv_dir"
"$venv_dir/bin/python" -m pip install --upgrade pip >/dev/null
"$venv_dir/bin/python" -m pip install -r requirements.txt >/dev/null
"$venv_dir/bin/python" -m pytest -p no:cacheprovider

echo
echo "Validation complete."
