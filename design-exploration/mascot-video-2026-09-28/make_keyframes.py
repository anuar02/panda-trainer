"""Render mascot poses onto a flat chroma-green square, used as start/end frames for image-to-video."""
import sys
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / 'prototype-fresh/assets/mascot'
OUT = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).parent / 'keyframes'
POSES = ['wave', 'thumbs', 'jump', 'clipboard', 'sit', 'sleep', 'stretch']
GREEN = (0, 177, 64, 255)  # #00B140, keyed out later
SIZE = 1024

OUT.mkdir(parents=True, exist_ok=True)
for name in POSES:
    im = Image.open(SRC / f'{name}.png').convert('RGBA')
    im = im.crop(im.getbbox())
    # Leave room around the character so motion does not leave the frame.
    scale = min(SIZE * 0.72 / im.width, SIZE * 0.78 / im.height)
    im = im.resize((int(im.width * scale), int(im.height * scale)), Image.LANCZOS)
    bg = Image.new('RGBA', (SIZE, SIZE), GREEN)
    bg.alpha_composite(im, ((SIZE - im.width) // 2, int(SIZE * 0.9) - im.height))
    bg.convert('RGB').save(OUT / f'{name}-green.png')
    print(OUT / f'{name}-green.png')
