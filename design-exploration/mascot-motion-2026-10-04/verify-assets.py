"""Check packaged candidates without invoking generation or source extraction."""
import hashlib
import json
import numpy as np
from pathlib import Path
from PIL import Image

base = Path(__file__).resolve().parent
manifest = json.loads((base / 'manifest.json').read_text())
assert {item['pose'] for item in manifest} == {'wave', 'thumbs', 'jump', 'clipboard', 'sit', 'sleep', 'stretch', 'front-idle', 'listen'}
for item in manifest:
    folder = base / 'candidates' / item['pose']
    assert hashlib.sha256((base / item['source']).read_bytes()).hexdigest() == item['sourceSha256']
    metadata = json.loads((folder / 'sprite.json').read_text())
    assert metadata['fps'] == 12
    assert metadata['frameCount'] == len(metadata['frames']) == item['frameCount']
    assert sum(frame['durationMs'] for frame in metadata['frames']) == item['durationMs']
    with Image.open(folder / 'sprite.webp') as atlas, Image.open(folder / 'poster.png') as poster:
        assert atlas.size == (metadata['width'], metadata['height'])
        assert max(atlas.size) <= 4096
        for frame in metadata['frames']:
            x, y, w, h = (frame[key] for key in ('x', 'y', 'width', 'height'))
            assert 0 <= x and 0 <= y and x + w <= atlas.width and y + h <= atlas.height
            extrema = atlas.crop((x, y, x+w, y+h)).getchannel('A').getextrema()
            assert extrema == (0, 255), (item['pose'], extrema)
        frame = metadata['frames'][0]
        first = np.asarray(atlas.crop((frame['x'], frame['y'], frame['x']+frame['width'], frame['y']+frame['height'])).convert('RGBA'), dtype=np.int16)
        reference = np.asarray(poster.convert('RGBA'), dtype=np.int16)
        assert np.array_equal(first[:, :, 3], reference[:, :, 3])
        mask = reference[:, :, 3] > 128
        assert np.abs(first[:, :, :3] - reference[:, :, :3])[mask].mean() < 4
    with Image.open(folder / 'animation.webp') as animation:
        assert animation.size == (320, item['height'])
        assert animation.info.get('loop') == (0 if item['loop'] else 1)
        elapsed = 0
        for index in range(animation.n_frames):
            animation.seek(index)
            animation.load()
            assert animation.convert('RGBA').getchannel('A').getextrema() == (0, 255)
            elapsed += animation.info['duration']
        assert elapsed == item['durationMs']
    assert (folder / 'animation.webp').stat().st_size == item['bytes']
print('PASS: nine sources unchanged; RGBA frames, atlas bounds, first frame alpha identity / RGB similarity, WebP loop and complete timeline')
