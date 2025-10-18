#!/usr/bin/env bash
set -euo pipefail

# Usage: scripts/push-vercel-envs.sh [path-to-env-file]
# Requires: Logged-in Vercel CLI, and project linked (./.vercel/project.json).
# Optional: export VERCEL_TOKEN to run non-interactively without login.

ENV_FILE="${1:-.env}"
ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

if [ ! -f "$ENV_FILE" ]; then
  echo "Env file not found: $ENV_FILE" >&2
  exit 1
fi

# Ensure Vercel CLI is available
if ! command -v vercel >/dev/null 2>&1; then
  echo "Vercel CLI not found, installing via npx..." >&2
  npx -y vercel@latest --version >/dev/null
fi

# Ensure project is linked
if [ ! -f ".vercel/project.json" ]; then
  echo "Vercel project is not linked. Run: npx vercel link --yes (in $(pwd))" >&2
  exit 2
fi

add_or_update() {
  local name="$1"; shift
  local value="$1"; shift
  local env="$1"; shift

  # Try update first (non-interactive, supply value via stdin)
  if printf '%s\n' "$value" | npx -y vercel@latest env update "$name" "$env" ${VERCEL_TOKEN:+--token "$VERCEL_TOKEN"} --cwd . >/dev/null 2>&1; then
    echo "Updated $name in $env"
    return 0
  fi
  # Fallback to add (requires type + value). Use 'plain' type.
  if printf 'plain\n%s\n' "$value" | npx -y vercel@latest env add "$name" "$env" ${VERCEL_TOKEN:+--token "$VERCEL_TOKEN"} --cwd . >/dev/null; then
    echo "Added $name in $env"
    return 0
  fi
  echo "Failed to set $name in $env" >&2
  return 1
}

# Read key=value pairs from the env file
while IFS= read -r line; do
  # Trim leading/trailing whitespace
  line="${line%%[$'\r\n']*}"
  case "$line" in
    ''|'#'*) continue;;
  esac
  # Split on first '=' only
  name="${line%%=*}"
  value="${line#*=}"
  # Strip surrounding quotes if present
  if [[ "$value" =~ ^\".*\"$ ]]; then
    value="${value:1:${#value}-2}"
  fi
  # Skip export keyword if used
  name="${name#export }"

  # Push to Preview and Production
  add_or_update "$name" "$value" preview || true
  add_or_update "$name" "$value" production || true
done < "$ENV_FILE"

echo "Done. Verify on Vercel: vercel env list preview && vercel env list production"

