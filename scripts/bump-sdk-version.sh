#!/usr/bin/env bash
#
# Bump the version number in an SDK's manifest file(s).
#
# Usage:
#   ./scripts/bump-sdk-version.sh <sdk> <version>
#
# Examples:
#   ./scripts/bump-sdk-version.sh python 0.2.0
#   ./scripts/bump-sdk-version.sh js 1.0.0
#   ./scripts/bump-sdk-version.sh all 0.2.0
#
# Supported SDKs: python, js, unity, unreal, arduino, touchdesigner, all

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

if [[ $# -ne 2 ]]; then
    echo "Usage: $0 <sdk> <version>"
    echo "SDKs: python, js, unity, unreal, arduino, touchdesigner, all"
    exit 1
fi

SDK="$1"
VERSION="$2"

# Validate version format (semver-ish)
if ! [[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+(-[a-zA-Z0-9.]+)?$ ]]; then
    echo "Error: Version must be in semver format (e.g., 0.2.0, 1.0.0-beta.1)"
    exit 1
fi

bump_python() {
    local file="$REPO_ROOT/sdks/python/pyproject.toml"
    sed -i.bak -E "s/^version = \"[^\"]+\"/version = \"$VERSION\"/" "$file"
    rm -f "$file.bak"
    echo "  Python SDK → $VERSION ($file)"
}

bump_js() {
    local file="$REPO_ROOT/sdks/js/package.json"
    # Use node to preserve JSON formatting
    node -e "
        const fs = require('fs');
        const pkg = JSON.parse(fs.readFileSync('$file', 'utf8'));
        pkg.version = '$VERSION';
        fs.writeFileSync('$file', JSON.stringify(pkg, null, 2) + '\n');
    "
    echo "  JS/TS SDK → $VERSION ($file)"
}

bump_unity() {
    local file="$REPO_ROOT/sdks/unity/package.json"
    node -e "
        const fs = require('fs');
        const pkg = JSON.parse(fs.readFileSync('$file', 'utf8'));
        pkg.version = '$VERSION';
        fs.writeFileSync('$file', JSON.stringify(pkg, null, 2) + '\n');
    "
    echo "  Unity SDK → $VERSION ($file)"
}

bump_unreal() {
    local file="$REPO_ROOT/sdks/unreal/MaestraPlugin/MaestraPlugin.uplugin"
    # Update VersionName string
    sed -i.bak -E "s/\"VersionName\": \"[^\"]+\"/\"VersionName\": \"$VERSION\"/" "$file"
    rm -f "$file.bak"
    echo "  Unreal Plugin → $VERSION ($file)"
}

bump_arduino() {
    local file="$REPO_ROOT/sdks/arduino/MaestraClient/library.json"
    node -e "
        const fs = require('fs');
        const pkg = JSON.parse(fs.readFileSync('$file', 'utf8'));
        pkg.version = '$VERSION';
        fs.writeFileSync('$file', JSON.stringify(pkg, null, 2) + '\n');
    "
    echo "  Arduino SDK → $VERSION ($file)"
}

bump_touchdesigner() {
    # TouchDesigner has no manifest with a version field.
    # Version is tracked via Git tags only.
    echo "  TouchDesigner → $VERSION (version tracked via Git tag only)"
}

echo "Bumping SDK version to $VERSION:"

case "$SDK" in
    python)        bump_python ;;
    js)            bump_js ;;
    unity)         bump_unity ;;
    unreal)        bump_unreal ;;
    arduino)       bump_arduino ;;
    touchdesigner) bump_touchdesigner ;;
    all)
        bump_python
        bump_js
        bump_unity
        bump_unreal
        bump_arduino
        bump_touchdesigner
        ;;
    *)
        echo "Error: Unknown SDK '$SDK'"
        echo "Valid SDKs: python, js, unity, unreal, arduino, touchdesigner, all"
        exit 1
        ;;
esac

echo "Done."
