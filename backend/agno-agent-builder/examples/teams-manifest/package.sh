#!/usr/bin/env bash
# Package the Teams app manifest into a .zip ready to sideload.
#
# Usage:
#   ./package.sh <teams-app-id> <azure-bot-app-id> [output-path]
#
# Arguments:
#   teams-app-id      A GUID identifying THIS app package in Teams. Generate
#                     once with `uuidgen` and reuse for upgrades.
#   azure-bot-app-id  The Microsoft App ID of the Azure Bot resource (the
#                     same value that goes in the TeamsBotInstallations row).
#   output-path       Optional output .zip path. Defaults to ./teams-agent.zip.
#
# Requirements: bash, sed, zip. Run from this directory or pass an absolute
# path to the output.
#
# The script reads manifest.template.json, substitutes the two placeholders,
# writes a manifest.json next to color.png + outline.png, and zips them.

set -euo pipefail

if [ "$#" -lt 2 ]; then
  echo "usage: $0 <teams-app-id> <azure-bot-app-id> [output-path]" >&2
  exit 64
fi

TEAMS_APP_ID="$1"
AZURE_BOT_APP_ID="$2"
OUTPUT_PATH="${3:-$(pwd)/teams-agent.zip}"

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"

for f in manifest.template.json color.png outline.png; do
  if [ ! -f "$f" ]; then
    echo "error: $f not found in $DIR — see README.md for how to add the icons" >&2
    exit 66
  fi
done

# Materialize manifest.json from the template with placeholders replaced.
sed \
  -e "s/__TEAMS_APP_ID__/$TEAMS_APP_ID/g" \
  -e "s/__AZURE_BOT_APP_ID__/$AZURE_BOT_APP_ID/g" \
  manifest.template.json > manifest.json

rm -f "$OUTPUT_PATH"
zip -j "$OUTPUT_PATH" manifest.json color.png outline.png > /dev/null
rm manifest.json

echo "Wrote $OUTPUT_PATH"
echo "Upload this to Teams: Apps → Manage your apps → Upload a custom app."
