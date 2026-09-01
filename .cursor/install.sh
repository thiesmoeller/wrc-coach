#!/usr/bin/env bash
# Idempotent setup for the WRC Coach dev environment.
# Runs after the repository is checked out. Safe to run repeatedly.
set -euo pipefail

cd "$(dirname "$0")/.."

# --- JavaScript / TypeScript PWA (primary app) ---
# Reproducible install from the committed lockfile.
npm ci

# --- Python offline-analysis scripts (py_scripts/) ---
# The scripts require Python >= 3.13; uv provisions the interpreter and deps.
if ! command -v uv >/dev/null 2>&1; then
  curl -LsSf https://astral.sh/uv/install.sh | sh
fi
export PATH="$HOME/.local/bin:$PATH"
uv sync
