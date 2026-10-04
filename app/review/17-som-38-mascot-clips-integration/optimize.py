import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[3]
SOURCE = ROOT / 'design-exploration/mascot-motion-2026-10-04/candidates'
DEST = ROOT / 'app/assets/mascot/clips'
RANGES = {'wave': (0, 61), 'thumbs': (6, 42), 'jump': (1, 54), 'sit': (6, 58), 'sleep': (11, 51), 'stretch': (8, 49), 'listen': (3, 45)}


def delta(a, b):
    aa = np.asarray(a, dtype=float)
    bb = np.asarray(b, dtype=float)
    mask = (aa[:, :, 3] > 8) | (bb[:, :, 3] > 8)
    rgb = np.abs(aa[:, :, :3] * aa[:, :, 3:] / 255 - bb[:, :, :3] * bb[:, :, 3:] / 255)
    return float(rgb[mask].mean())


def build(pose, start, end):
    source = SOURCE / pose / 'animation.webp'
    frames = []
    with Image.open(source) as animation:
        original_count = animation.n_frames
        for index in range(original_count):
            animation.seek(index)
            animation.load()
            frames.append(animation.convert('RGBA'))
    original_seam = delta(frames[0], frames[-1])
    trimmed = frames[start:end + 1]
    attempts = []
    result = DEST / f'{pose}.webp'
    for fps, quality in [(12, 60), (10, 60), (10, 50), (10, 40)]:
        count = round(len(trimmed) * fps / 12)
        selected = [trimmed[round(i * (len(trimmed) - 1) / (count - 1))] for i in range(count)]
        durations = [round((i + 1) * 1000 / fps) - round(i * 1000 / fps) for i in range(count)]
        selected[0].save(result, format='WEBP', save_all=True, append_images=selected[1:], duration=durations, loop=0, quality=quality, method=4)
        attempts.append({'fps': fps, 'quality': quality, 'bytes': result.stat().st_size})
        if result.stat().st_size <= 300000:
            break
    if result.stat().st_size > 300000:
        quality = 60
        selected[0].save(result, format='WEBP', save_all=True, append_images=selected[1:], duration=durations, loop=0, quality=quality, method=4)
    selected[0].save(DEST / f'{pose}-poster.png')
    with Image.open(result) as decoded:
        duration = 0
        for index in range(decoded.n_frames):
            decoded.seek(index)
            decoded.load()
            assert decoded.convert('RGBA').getchannel('A').getextrema() == (0, 255)
            duration += decoded.info['duration']
        assert duration == sum(durations)
    sheet = Image.new('RGBA', (320 * 4, selected[0].height * 2 + 48), '#eeeeee')
    draw = ImageDraw.Draw(sheet)
    for slot, index in enumerate(np.linspace(0, count - 1, 8, dtype=int)):
        x, y = slot % 4 * 320, slot // 4 * (selected[0].height + 24)
        sheet.alpha_composite(selected[index], (x, y))
        draw.text((x + 8, y + selected[0].height + 4), f'{pose} {index}', fill='#222222')
    sheet.convert('RGB').save(f'/tmp/som38-{pose}-contact.webp')
    boundary = Image.new('RGBA', (640, selected[0].height), '#eeeeee')
    boundary.alpha_composite(selected[-1], (0, 0))
    boundary.alpha_composite(selected[0], (320, 0))
    boundary.convert('RGB').save(f'/tmp/som38-{pose}-seam.webp')
    return {'pose': pose, 'sourceSha256': hashlib.sha256(source.read_bytes()).hexdigest(), 'originalFrames': original_count, 'startFrame': start, 'endFrame': end, 'frames': count, 'fps': fps, 'quality': quality, 'durationMs': duration, 'bytes': result.stat().st_size, 'posterBytes': (DEST / f'{pose}-poster.png').stat().st_size, 'seamMae': round(delta(selected[-1], selected[0]), 4), 'originalSeamMae': round(original_seam, 4), 'attempts': attempts, 'loop': True}


DEST.mkdir(parents=True, exist_ok=True)
results = [build(pose, *span) for pose, span in RANGES.items()]
(Path(__file__).parent / 'assets.json').write_text(json.dumps(results, indent=2) + '\n')
print(json.dumps(results, indent=2))
