#!/usr/bin/env bash
# Usage: key_video.sh input.mp4 output-basename
# Removes the #00B140 background and writes transparent WebM (Chrome/Android/Firefox)
# plus animated WebP (Safari fallback) and a poster PNG.
set -euo pipefail
FFMPEG="${FFMPEG:-$(python3 -c 'import imageio_ffmpeg as f; print(f.get_ffmpeg_exe())')}"
IN="$1"; OUT="$2"
ERODE="${ERODE:-3}"
CHOKE="$(printf 'erosion,%.0s' $(seq 1 "$ERODE"))"
KEY="format=rgba,chromakey=0x00B140:0.13:0.06,despill=type=green:mix=0.6:expand=0.1,split[c][m];[m]alphaextract,${CHOKE}gblur=sigma=0.8[a];[c][a]alphamerge,scale=512:-2:flags=lanczos"
"$FFMPEG" -y -i "$IN" -vf "$KEY,format=yuva420p" -c:v libvpx-vp9 -pix_fmt yuva420p -b:v 0 -crf 34 -row-mt 1 -an "$OUT.webm"
"$FFMPEG" -y -i "$IN" -vf "$KEY,fps=12,scale=320:-2:flags=lanczos" -c:v libwebp_anim -lossless 0 -q:v 60 -compression_level 6 -loop 0 -an "$OUT.webp"
"$FFMPEG" -y -i "$IN" -vf "$KEY" -frames:v 1 "$OUT-poster.png"
ls -la "$OUT".webm "$OUT".webp "$OUT"-poster.png
