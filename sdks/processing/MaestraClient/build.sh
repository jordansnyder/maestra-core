#!/usr/bin/env bash
#
# Build the Maestra Processing library jar and assemble a Contribution-Manager
# distributable under dist/MaestraClient/.
#
# Dependencies (compile-time classpath):
#   - Processing core.jar          -> set PROCESSING_CORE_JAR, or pass --core <path>
#   - processing-mqtt library jar  -> set MQTT_JAR, or pass --mqtt <path>
#
# In Processing 4 these live at:
#   core.jar : <Processing.app>/Contents/Java/core/library/core.jar
#   mqtt.jar : <sketchbook>/libraries/mqtt/library/mqtt.jar  (256dpi/processing-mqtt)
#
# Usage:
#   ./build.sh                       # uses env vars
#   ./build.sh --core /path/core.jar --mqtt /path/mqtt.jar
set -euo pipefail
cd "$(dirname "$0")"

CORE="${PROCESSING_CORE_JAR:-}"
MQTT="${MQTT_JAR:-}"
while [ $# -gt 0 ]; do
  case "$1" in
    --core) CORE="$2"; shift 2;;
    --mqtt) MQTT="$2"; shift 2;;
    *) echo "unknown arg: $1" >&2; exit 2;;
  esac
done

[ -n "$CORE" ] && [ -f "$CORE" ] || { echo "ERROR: Processing core.jar not found. Set PROCESSING_CORE_JAR or pass --core." >&2; exit 1; }
[ -n "$MQTT" ] && [ -f "$MQTT" ] || { echo "ERROR: processing-mqtt jar not found. Set MQTT_JAR or pass --mqtt." >&2; exit 1; }

VERSION="$(grep '^prettyVersion=' library.properties | cut -d= -f2)"
echo "Building Maestra Client ${VERSION}"

rm -rf build dist
mkdir -p build/classes dist/MaestraClient/library

echo "Compiling..."
javac -source 11 -target 11 -cp "${CORE}:${MQTT}" -d build/classes src/maestra/*.java

echo "Packaging jar..."
jar cf dist/MaestraClient/library/MaestraClient.jar -C build/classes .

echo "Assembling distributable..."
cp library.properties dist/MaestraClient/
cp -r examples dist/MaestraClient/examples
cp -r src dist/MaestraClient/src
cp README.md LICENSE dist/MaestraClient/ 2>/dev/null || true

( cd dist && zip -r "MaestraClient-${VERSION}.zip" MaestraClient >/dev/null )
echo "Done -> dist/MaestraClient-${VERSION}.zip"
