#!/usr/bin/env python3
"""Rebuild derived candidates only; sources/out are never written.

Requires Python Pillow, numpy and imageio-ffmpeg. All decoding PNGs live in
TemporaryDirectory outside this repository. FFmpeg decoding/filter threads = 1.
"""
import hashlib
import argparse
import json
import math
import os
from pathlib import Path
import subprocess
import tempfile

os.environ.setdefault("OMP_NUM_THREADS", "1")
os.environ.setdefault("OPENBLAS_NUM_THREADS", "1")
import imageio_ffmpeg
import numpy as np
from PIL import Image, ImageDraw
import PIL

BASE = Path(__file__).resolve().parent
POSES = ["wave", "thumbs", "jump", "clipboard", "sit", "sleep", "stretch", "front-idle", "listen"]
KEY = "format=rgba,chromakey=0x00B140:0.13:0.06,despill=type=green:mix=0.6:expand=0.1,split[c][m];[m]alphaextract,erosion,erosion,erosion,gblur=sigma=0.8[a];[c][a]alphamerge,fps=12"
TARGET = 300_000


def derived(path):
    path = path.resolve()
    if not path.is_relative_to(BASE / "candidates"):
        raise ValueError(f"Refusing non-candidate output: {path}")
    path.parent.mkdir(parents=True, exist_ok=True)
    return path


def seam(a, b):
    aa, bb = np.asarray(a, dtype=np.float32), np.asarray(b, dtype=np.float32)
    ca = aa[:, :, :3] * aa[:, :, 3:] / 255
    cb = bb[:, :, :3] * bb[:, :, 3:] / 255
    mask = (aa[:, :, 3] > 8) | (bb[:, :, 3] > 8)
    delta = np.abs(ca - cb)
    return float(delta[mask].mean()), float(delta.mean()), float(np.abs(aa[:, :, 3] - bb[:, :, 3]).mean())


def checker(size):
    im = Image.new("RGBA", size, "#eeeeee")
    draw = ImageDraw.Draw(im)
    for y in range(0, size[1], 16):
        for x in range(0, size[0], 16):
            if (x // 16 + y // 16) % 2:
                draw.rectangle((x, y, x + 15, y + 15), fill="#cccccc")
    return im


def build(pose):
    source = (BASE / "out" if pose in ("front-idle", "listen") else BASE.parent / "mascot-video-2026-09-28/out") / f"{pose}-raw.mp4"
    source_hash = hashlib.sha256(source.read_bytes()).hexdigest()
    dest = BASE / "candidates" / pose
    with tempfile.TemporaryDirectory(prefix=f"som38-{pose}-") as tmp:
        subprocess.run([imageio_ffmpeg.get_ffmpeg_exe(), "-hide_banner", "-loglevel", "error", "-threads", "1", "-filter_threads", "1", "-filter_complex_threads", "1", "-i", str(source), "-vf", KEY, "-threads", "1", str(Path(tmp) / "%04d.png")], check=True)
        paths = sorted(Path(tmp).glob("*.png"))
        boxes = []
        for path in paths:
            with Image.open(path) as im:
                box = im.getchannel("A").getbbox()
                if box:
                    boxes.append(box)
        bbox = [min(b[0] for b in boxes), min(b[1] for b in boxes), max(b[2] for b in boxes), max(b[3] for b in boxes)]
        height = round(320 * (bbox[3] - bbox[1]) / (bbox[2] - bbox[0]))
        frames = []
        for path in paths:
            with Image.open(path) as im:
                source_size = list(im.size)
                frame = im.convert("RGBA").crop(bbox).resize((320, height), Image.Resampling.LANCZOS)
                pixels = np.array(frame)
                alpha = pixels[:, :, 3].astype(np.uint16)
                alpha = np.where(alpha <= 8, 0, np.where(alpha >= 247, 255, ((alpha + 8) // 17) * 17)).astype(np.uint8)
                pixels[:, :, 3] = alpha
                pixels[alpha == 0, :3] = 0
                frames.append(Image.fromarray(pixels))
    original_count = len(frames)
    source_seam = seam(frames[0], frames[-1])
    # Keep the complete motion. Only remove up to two redundant endpoint frames
    # when their boundary is materially closer and already below the threshold.
    start, end = 0, len(frames) - 1
    best = source_seam[0]
    for i in range(3):
        for j in range(len(frames) - 3, len(frames)):
            score = seam(frames[i], frames[j])[0]
            if score < best * .8 and score <= 12:
                start, end, best = i, j, score
    frames = frames[start:end + 1]
    metrics = seam(frames[0], frames[-1])
    strategy = "source-loop" if metrics[0] <= 12 else "one-shot"
    loop = metrics[0] <= 12
    if not loop and pose in ("front-idle", "listen", "sleep"):
        frames += frames[-2:0:-1]
        strategy, loop = "pingpong", True
        metrics = seam(frames[0], frames[-1])
    durations = [round((i + 1) * 1000 / 12) - round(i * 1000 / 12) for i in range(len(frames))]
    animation = derived(dest / "animation.webp")
    for quality in (80, 70, 60):
        frames[0].save(animation, format="WEBP", save_all=True, append_images=frames[1:], duration=durations, loop=0 if loop else 1, quality=quality, method=4)
        if animation.stat().st_size <= TARGET:
            break
    if animation.stat().st_size > TARGET:
        quality = 60
        frames[0].save(animation, format="WEBP", save_all=True, append_images=frames[1:], duration=durations, loop=0 if loop else 1, quality=quality, method=4)
    frames[0].save(derived(dest / "poster.png"))
    cols = max(8, math.ceil(len(frames) / max(1, 4096 // height)))
    if cols * 320 > 4096:
        raise ValueError("Atlas cannot fit within 4096 pixels; split-atlas needed")
    atlas = Image.new("RGBA", (320 * cols, height * math.ceil(len(frames) / cols)))
    rectangles = []
    for i, frame in enumerate(frames):
        x, y = i % cols * 320, i // cols * height
        atlas.paste(frame, (x, y))
        rectangles.append({"x": x, "y": y, "width": 320, "height": height, "durationMs": durations[i]})
    atlas.save(derived(dest / "sprite.webp"), format="WEBP", lossless=False, quality=80, method=4)
    sprite = {"width": atlas.width, "height": atlas.height, "frameWidth": 320, "frameHeight": height, "fps": 12, "frameCount": len(frames), "durationMs": sum(durations), "loop": loop, "frames": rectangles}
    derived(dest / "sprite.json").write_text(json.dumps(sprite, indent=2) + "\n")
    samples = np.linspace(0, len(frames) - 1, 8, dtype=int)
    contact = checker((320 * 4, (height + 24) * 2))
    draw = ImageDraw.Draw(contact)
    for slot, index in enumerate(samples):
        x, y = slot % 4 * 320, slot // 4 * (height + 24)
        contact.alpha_composite(frames[index], (x, y))
        draw.text((x + 8, y + height + 4), f"{pose} frame {index + 1} / {len(frames)}", fill="#222222")
    contact.convert("RGB").save(derived(dest / "contact.webp"), quality=85, method=6)
    boundary = checker((640, height + 24))
    boundary.alpha_composite(frames[-1], (0, 0))
    boundary.alpha_composite(frames[0], (320, 0))
    draw = ImageDraw.Draw(boundary)
    draw.text((8, height + 4), "LAST", fill="#222222")
    draw.text((328, height + 4), "FIRST", fill="#222222")
    boundary.convert("RGB").save(derived(dest / "seam.webp"), quality=90, method=6)
    with Image.open(animation) as decoded:
        decoded_count = decoded.n_frames
        decoded_duration = 0
        for index in range(decoded_count):
            decoded.seek(index)
            decoded.load()
            decoded_duration += decoded.info.get("duration", 0)
    assert decoded_duration == sum(durations), (decoded_duration, sum(durations))
    assert source_hash == hashlib.sha256(source.read_bytes()).hexdigest()
    entry = {"pose": pose, "width": 320, "height": height, "fps": 12, "frameCount": len(frames), "bytes": animation.stat().st_size, "loop": loop, "source": os.path.relpath(source, BASE), "sourceSha256": source_hash, "sourceDimensions": source_size, "alphaBBox": bbox, "originalFrameCount": original_count, "startFrame": start, "endFrame": end, "durationMs": sum(durations), "seamMae": round(metrics[0], 4), "seamCanvasMae": round(metrics[1], 4), "seamAlphaMae": round(metrics[2], 4), "sourceSeamMae": round(source_seam[0], 4), "strategy": strategy, "quality": quality, "targetBytes": TARGET, "withinTarget": animation.stat().st_size <= TARGET, "animation": f"candidates/{pose}/animation.webp", "sprite": f"candidates/{pose}/sprite.webp", "spriteMetadata": f"candidates/{pose}/sprite.json", "poster": f"candidates/{pose}/poster.png", "contact": f"candidates/{pose}/contact.webp", "seam": f"candidates/{pose}/seam.webp"}
    entry.update({"decodedFrameCount": decoded_count, "decodedDurationMs": decoded_duration, "atlasWidth": atlas.width, "atlasHeight": atlas.height, "alphaCleanup": "16 levels; <=8 zero, >=247 opaque; no extra erosion", "spriteQuality": 80})
    print(json.dumps(entry), flush=True)
    return entry


def validate(entry):
    animation = BASE / entry["animation"]
    alpha_min, alpha_max, green_pixels = 255, 0, 0
    with Image.open(animation) as im:
        decoded_count = im.n_frames
        duration = 0
        for i in range(decoded_count):
            im.seek(i)
            im.load()
            pixels = np.asarray(im.convert("RGBA"), dtype=np.int16)
            alpha_min = min(alpha_min, int(pixels[:, :, 3].min()))
            alpha_max = max(alpha_max, int(pixels[:, :, 3].max()))
            green_pixels += int(((pixels[:, :, 3] >= 128) & (pixels[:, :, 1] > pixels[:, :, 0] + 30) & (pixels[:, :, 1] > pixels[:, :, 2] + 30)).sum())
            duration += im.info.get("duration", 0)
    assert duration == entry["durationMs"]
    with Image.open(BASE / entry["sprite"]) as atlas:
        atlas_size = atlas.size
        first = np.asarray(atlas.crop((0, 0, entry["width"], entry["height"])).convert("RGBA"), dtype=np.int16)
    with Image.open(BASE / entry["poster"]) as poster:
        reference = np.asarray(poster.convert("RGBA"), dtype=np.int16)
    visible = reference[:, :, 3] > 0
    first_rgb_mae = float(np.abs(first[visible, :3] - reference[visible, :3]).mean())
    first_alpha_max = int(np.abs(first[:, :, 3] - reference[:, :, 3]).max())
    assert first_alpha_max == 0 and first_rgb_mae <= 4
    entry.update({"decodedFrameCount": decoded_count, "decodedDurationMs": duration, "alphaMin": alpha_min, "alphaMax": alpha_max, "greenDominantOpaquePixels": green_pixels, "spriteBytes": (BASE / entry["sprite"]).stat().st_size, "atlasWidth": atlas_size[0], "atlasHeight": atlas_size[1], "decodedAtlasRgbaBytes": atlas_size[0] * atlas_size[1] * 4, "dependencies": {"pillow": PIL.__version__, "numpy": np.__version__, "imageioFfmpeg": imageio_ffmpeg.__version__}})
    entry.update({"spriteFirstFrameRgbMae": round(first_rgb_mae, 4), "spriteFirstFrameAlphaMaxError": first_alpha_max})
    return entry


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--pose", choices=POSES, help="Rebuild one pose, retaining other manifest entries")
    args = parser.parse_args()
    existing = json.loads((BASE / "manifest.json").read_text()) if args.pose and (BASE / "manifest.json").exists() else []
    entries = {entry["pose"]: entry for entry in existing}
    for pose in ([args.pose] if args.pose else POSES):
        entries[pose] = build(pose)
    manifest = [validate(entries[pose]) for pose in POSES if pose in entries]
    payload = json.dumps(manifest, indent=2, ensure_ascii=False)
    (BASE / "manifest.json").write_text(payload + "\n")
    (BASE / "manifest.js").write_text("window.MASCOT_CANDIDATES = " + payload + ";\n")
