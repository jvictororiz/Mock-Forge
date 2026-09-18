#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VENV="$ROOT/.icon-venv"
SVG="$ROOT/resources/icon.svg"
OUT="$ROOT/resources/icon-1024.png"

if [[ ! -d "$VENV" ]]; then
  python3 -m venv "$VENV"
  "$VENV/bin/pip" install -q cairosvg pillow
fi

ROOT="$ROOT" "$VENV/bin/python" - <<'PY'
import os
import cairosvg
from PIL import Image
from io import BytesIO
from pathlib import Path

root = Path(os.environ['ROOT'])
svg_path = root / 'resources/icon.svg'
out_path = root / 'resources/icon-1024.png'

png = cairosvg.svg2png(url=str(svg_path), output_width=1024, output_height=1024)
img = Image.open(BytesIO(png)).convert('RGBA')
w, h = img.size
radius = int(112 * (w / 512))
for y in range(h):
    for x in range(w):
        inside = True
        r = radius
        if x < r and y < r:
            inside = (x - r) ** 2 + (y - r) ** 2 <= r * r
        elif x >= w - r and y < r:
            inside = (x - (w - r - 1)) ** 2 + (y - r) ** 2 <= r * r
        elif x < r and y >= h - r:
            inside = (x - r) ** 2 + (y - (h - r - 1)) ** 2 <= r * r
        elif x >= w - r and y >= h - r:
            inside = (x - (w - r - 1)) ** 2 + (y - (h - r - 1)) ** 2 <= r * r
        if not inside:
            img.putpixel((x, y), (0, 0, 0, 0))
img.save(out_path)
PY

SRC="$OUT"
cp "$SRC" "$ROOT/resources/icon.png"
cp "$SRC" "$ROOT/public/icon.png"
mkdir -p "$ROOT/src/assets"
cp "$SRC" "$ROOT/src/assets/app-icon.png"
sips -z 32 32 "$SRC" --out "$ROOT/public/favicon.png" >/dev/null

ICONSET="$ROOT/resources/icon.iconset"
rm -rf "$ICONSET" && mkdir -p "$ICONSET"
sips -z 16 16 "$SRC" --out "$ICONSET/icon_16x16.png" >/dev/null
sips -z 32 32 "$SRC" --out "$ICONSET/icon_16x16@2x.png" >/dev/null
sips -z 32 32 "$SRC" --out "$ICONSET/icon_32x32.png" >/dev/null
sips -z 64 64 "$SRC" --out "$ICONSET/icon_32x32@2x.png" >/dev/null
sips -z 128 128 "$SRC" --out "$ICONSET/icon_128x128.png" >/dev/null
sips -z 256 256 "$SRC" --out "$ICONSET/icon_128x128@2x.png" >/dev/null
sips -z 256 256 "$SRC" --out "$ICONSET/icon_256x256.png" >/dev/null
sips -z 512 512 "$SRC" --out "$ICONSET/icon_256x256@2x.png" >/dev/null
sips -z 512 512 "$SRC" --out "$ICONSET/icon_512x512.png" >/dev/null
cp "$SRC" "$ICONSET/icon_512x512@2x.png"
iconutil -c icns "$ICONSET" -o "$ROOT/resources/icon.icns"
rm -rf "$ICONSET"

echo "Generated icon assets in resources/ and public/"
