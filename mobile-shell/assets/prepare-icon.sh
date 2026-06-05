#!/usr/bin/env bash
# Resizes and renames the source icon to what @capacitor/assets expects.
#
# Input:  mobile-shell/assets/dragonhub_icon.png  (any square size)
# Output: mobile-shell/assets/icon.png            (1024x1024, no alpha)

set -euo pipefail

cd "$(dirname "$0")"

SRC="dragonhub_icon.png"
DST="icon.png"
SIZE=1024

if [[ ! -f "$SRC" ]]; then
  echo "Error: $SRC not found in $(pwd)" >&2
  exit 1
fi

WIDTH=$(sips -g pixelWidth "$SRC" | awk '/pixelWidth/ {print $2}')
HEIGHT=$(sips -g pixelHeight "$SRC" | awk '/pixelHeight/ {print $2}')

if [[ "$WIDTH" != "$HEIGHT" ]]; then
  echo "Error: source is ${WIDTH}x${HEIGHT}, expected a square image" >&2
  exit 1
fi

echo "Resizing $SRC (${WIDTH}x${HEIGHT}) -> $DST (${SIZE}x${SIZE})..."
sips --resampleHeightWidth "$SIZE" "$SIZE" "$SRC" --out "$DST" >/dev/null

# Verify
OUT_W=$(sips -g pixelWidth "$DST" | awk '/pixelWidth/ {print $2}')
OUT_H=$(sips -g pixelHeight "$DST" | awk '/pixelHeight/ {print $2}')
OUT_ALPHA=$(sips -g hasAlpha "$DST" | awk '/hasAlpha/ {print $2}')

echo "Done: $DST is ${OUT_W}x${OUT_H}, hasAlpha=${OUT_ALPHA}"
echo ""
echo "Next: from repo root, run:"
echo "  npm run mobile:assets"
