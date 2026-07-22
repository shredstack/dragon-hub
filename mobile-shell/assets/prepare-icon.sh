#!/usr/bin/env bash
# Derives every @capacitor/assets source image from the one master logo.
#
# Input:  mobile-shell/assets/dragonhub_icon.png
#           square PNG with a real transparent background
#
# Output: icon.png             1024x1024, logo on white, alpha stripped (iOS
#                              rejects app icons with an alpha channel)
#         icon-foreground.png  1024x1024, transparent, logo inset to the
#                              Android adaptive-icon safe zone
#         icon-background.png  1024x1024, solid white
#
# Requires ImageMagick (`brew install imagemagick`) — the flattening and
# padding here are beyond what `sips` can do.

set -euo pipefail

cd "$(dirname "$0")"

SRC="dragonhub_icon.png"
SIZE=1024
BG="white"

if ! command -v magick >/dev/null 2>&1; then
  echo "Error: ImageMagick not found. Run: brew install imagemagick" >&2
  exit 1
fi

if [[ ! -f "$SRC" ]]; then
  echo "Error: $SRC not found in $(pwd)" >&2
  exit 1
fi

WIDTH=$(magick identify -format "%w" "$SRC")
HEIGHT=$(magick identify -format "%h" "$SRC")

if [[ "$WIDTH" != "$HEIGHT" ]]; then
  echo "Error: source is ${WIDTH}x${HEIGHT}, expected a square image" >&2
  exit 1
fi

echo "Generating from $SRC (${WIDTH}x${HEIGHT})..."

# iOS app icon / Android legacy icon: opaque, near-full-bleed.
magick "$SRC" -resize "$((SIZE * 94 / 100))x$((SIZE * 94 / 100))" \
  -background "$BG" -gravity center -extent "${SIZE}x${SIZE}" \
  -alpha remove -alpha off -strip icon.png

# Android adaptive foreground: transparent, inset so the launcher mask can
# crop to a circle/squircle without clipping the dragon.
magick "$SRC" -resize "$((SIZE * 68 / 100))x$((SIZE * 68 / 100))" \
  -background none -gravity center -extent "${SIZE}x${SIZE}" \
  -strip icon-foreground.png

magick -size "${SIZE}x${SIZE}" "xc:$BG" -strip icon-background.png

magick identify icon.png icon-foreground.png icon-background.png

echo ""
echo "Next: from repo root, run:"
echo "  npm run mobile:assets"
