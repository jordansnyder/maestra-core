#!/usr/bin/env bash
#
# Verify every SDK manifest declares the same version, so the SDK suite never
# drifts apart. Optionally assert they all equal an expected version.
#
# Usage:
#   ./scripts/check-sdk-versions.sh            # all manifests must agree
#   ./scripts/check-sdk-versions.sh 0.2.0      # ...and must all equal 0.2.0
#
# TouchDesigner has no version field (tracked via git tag only) and is skipped.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
EXPECTED="${1:-}"

json_version() {
  node -e "process.stdout.write(JSON.parse(require('fs').readFileSync('$1','utf8')).version || '')"
}

# name|version pairs
declare -a NAMES VERSIONS

add() { NAMES+=("$1"); VERSIONS+=("$2"); }

add "python"        "$(grep -E '^version = ' "$REPO_ROOT/sdks/python/pyproject.toml" | head -1 | sed -E 's/version = "([^"]+)"/\1/')"
add "js"            "$(json_version "$REPO_ROOT/sdks/js/package.json")"
add "unity"         "$(json_version "$REPO_ROOT/sdks/unity/package.json")"
add "arduino"       "$(json_version "$REPO_ROOT/sdks/arduino/MaestraClient/library.json")"
add "arduino-props" "$(grep -E '^version=' "$REPO_ROOT/sdks/arduino/MaestraClient/library.properties" | head -1 | cut -d= -f2)"
add "unreal"        "$(grep -E '"VersionName"' "$REPO_ROOT/sdks/unreal/MaestraPlugin/MaestraPlugin.uplugin" | head -1 | sed -E 's/.*"VersionName": "([^"]+)".*/\1/')"
add "processing"    "$(grep -E '^prettyVersion=' "$REPO_ROOT/sdks/processing/MaestraClient/library.properties" | head -1 | cut -d= -f2)"
add "maxmsp"        "$(json_version "$REPO_ROOT/sdks/maxmsp/package-info.json")"
add "openframeworks" "$(grep -E '^[[:space:]]*ADDON_VERSION' "$REPO_ROOT/sdks/openframeworks/ofxMaestra/addon_config.mk" | head -1 | sed -E 's/.*=[[:space:]]*//' | tr -d '[:space:]')"

echo "SDK manifest versions:"
fail=0
ref="${VERSIONS[0]}"
for i in "${!NAMES[@]}"; do
  v="${VERSIONS[$i]}"
  printf '  %-16s %s\n' "${NAMES[$i]}" "${v:-<empty>}"
  if [ -z "$v" ]; then
    echo "::error::${NAMES[$i]} has no parseable version"
    fail=1
  elif [ "$v" != "$ref" ]; then
    fail=1
  fi
done

# How many distinct non-empty versions are there?
distinct="$(printf '%s\n' "${VERSIONS[@]}" | grep -v '^$' | sort -u | wc -l | tr -d '[:space:]')"
if [ "$distinct" -gt 1 ]; then
  echo "::error::SDK versions are not all identical (found $distinct distinct values — see list above)"
fi

if [ -n "$EXPECTED" ]; then
  for i in "${!NAMES[@]}"; do
    if [ "${VERSIONS[$i]}" != "$EXPECTED" ]; then
      echo "::error::${NAMES[$i]} is ${VERSIONS[$i]:-<empty>}, expected $EXPECTED"
      fail=1
    fi
  done
fi

if [ "$fail" -ne 0 ]; then
  echo "Version check FAILED."
  exit 1
fi

echo "All SDK versions agree${EXPECTED:+ at $EXPECTED}: $ref"
