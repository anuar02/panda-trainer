"""Publish verified Chromium pairs; refuse stale captures and default regressions."""
from pathlib import Path
from datetime import datetime
from zoneinfo import ZoneInfo
import hashlib
import html
import json
import shutil
from PIL import Image, ImageChops

DEST = Path(__file__).resolve().parent
ROOT = DEST.parents[2]
SOURCE = ROOT / 'output/playwright/visual-firmness'
SCREENS = [
    ('today', 'Сегодня · 08:00', 'Почти нейтральный фон, радиусы карточек 16 px и кнопок 12 px; статус показан точкой и текстом.'),
    ('journal', 'Личный журнал · два записанных подхода', 'Карточки 14 px; у следующего подхода убрана заливка; вторичная кнопка белая с рамкой.'),
    ('set-sheet', 'Шторка записи подхода', 'Верхние углы шторки 20 px; поля и кнопки используют более компактные радиусы, тень нейтральная.'),
    ('workout-dock', 'Сегодня · свёрнутая тренировка', 'Полоса с радиусом 12 px и графитовой подписью; единственный синий акцент остаётся слева.'),
    ('client-card', 'Карточка клиента · пакет и занятия', 'Карточки 14 px; статусы без пастельных заливок; фильтры остаются капсулами.'),
    ('group-journal', 'Мини-группа · 20:30', 'Карточки упражнений 14 px, участников 8 px; следующий подход отмечен синей чертой без заливки.'),
]

def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def read(name):
    return json.loads((SOURCE / name).read_text())

reports = {phase: read(f'{phase}/capture.json') for phase in ('baseline', 'tokenized', 'current', 'firm')}
for phase, report in reports.items():
    assert len(report['captures']) == 12 and not report['errors'], phase
    for capture in report['captures']:
        assert sha(ROOT / capture['source']) == capture['sha256'], capture['source']
for phase in ('current', 'firm'):
    for file, digest in reports[phase]['source_sha256'].items():
        assert sha(ROOT / file) == digest, f'Source changed since {phase} capture: {file}'
assert reports['current']['source_sha256'] == reports['firm']['source_sha256']

pixels = []
for baseline in reports['baseline']['captures']:
    for phase in ('tokenized', 'current'):
        after = next(c for c in reports[phase]['captures'] if (c['width'], c['name']) == (baseline['width'], baseline['name']))
        a, b = (Image.open(ROOT / c['source']).convert('RGB') for c in (baseline, after))
        assert a.size == b.size
        difference = ImageChops.difference(a, b)
        assert difference.getbbox() is None, f'Default pixel regression: {phase}/{baseline["width"]}/{baseline["name"]}'
        pixels.append({'phase': phase, 'width': baseline['width'], 'screen': baseline['name'], 'different_pixels': 0,
                       'before_sha256': baseline['sha256'], 'after_sha256': after['sha256']})

def luminance(color):
    rgb = [int(color[i:i+2], 16) / 255 for i in (1, 3, 5)]
    linear = [v / 12.92 if v <= .04045 else ((v + .055) / 1.055) ** 2.4 for v in rgb]
    return sum(v * w for v, w in zip(linear, (.2126, .7152, .0722)))

def contrast(a, b):
    low, high = sorted([luminance(a), luminance(b)])
    return (high + .05) / (low + .05)

contrasts = [{'foreground': foreground, 'background': background, 'ratio': round(contrast(foreground, background), 3)}
             for foreground, background in [('#5c5a55', '#f3f3f1'), ('#5c5a55', '#ededeb'),
                                            ('#8a8a85', '#f3f3f1'), ('#8a8a85', '#ffffff'), ('#e2e2df', '#f3f3f1')]]
assert all(c['ratio'] >= 4.5 for c in contrasts[:2])
assert contrasts[2]['ratio'] >= 3

manifest = {'date': datetime.now(ZoneInfo('Asia/Almaty')).isoformat(),
            'browser': reports['current']['browser'], 'viewport_height': 844,
            'source_sha256': reports['current']['source_sha256'], 'captures': []}
sections = []
for width in (375, 320):
    pairs = []
    for name, label, note in SCREENS:
        figures = []
        for phase, title in [('current', 'Текущий'), ('firm', 'Строгий')]:
            capture = next(c for c in reports[phase]['captures'] if c['name'] == name and c['width'] == width)
            file = f'{phase}/{width}/{name}.png'
            target = DEST / file
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(ROOT / capture['source'], target)
            manifest['captures'].append({'file': file, 'source': capture['source'], 'sha256': sha(target),
                                         'width': width, 'screen': name, 'visual': phase, 'url': capture['url']})
            alt = html.escape(f'{title}: {label}, {width} px')
            figures.append(f'<figure><figcaption>{title}</figcaption><a href="{file}" aria-label="{alt}: открыть оригинал"><img src="{file}" width="{width}" height="844" loading="lazy" alt="{alt}"></a></figure>')
        pairs.append(f'<article id="{name}-{width}"><h3>{html.escape(label)}</h3><div class="pair" style="--capture-width:{width}px">{"".join(figures)}</div><p class="change">{html.escape(note)}</p></article>')
    sections.append(f'<section id="w{width}"><h2>{width} px</h2>{"".join(pairs)}</section>')

# Keep original baseline evidence alongside the review, even if ignored output/ is cleaned.
for capture in reports['baseline']['captures']:
    file = f'evidence/baseline/{capture["width"]}/{capture["name"]}.png'
    target = DEST / file
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(ROOT / capture['source'], target)
    manifest['captures'].append({'file': file, 'source': capture['source'], 'sha256': sha(target), 'visual': 'baseline'})
evidence = DEST / 'evidence'
for phase, report in reports.items():
    (evidence / f'{phase}-capture.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
for name in ('radius-map.json', 'interaction-verification.json'):
    shutil.copyfile(SOURCE / name, evidence / name)
(evidence / 'pixel-verification.json').write_text(json.dumps(pixels, ensure_ascii=False, indent=2) + '\n')
(evidence / 'contrast.json').write_text(json.dumps(contrasts, indent=2) + '\n')
(DEST / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')

page = '''<!doctype html>
<html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Текущий / строгий — сравнение оформления</title><link rel="stylesheet" href="../../css/fonts.css">
<style>
*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:#f3f3f1;color:#111110;font-family:Inter,sans-serif}
main{max-width:1000px;margin:auto;padding:40px 24px}h1,h2,h3{font-family:Montserrat,sans-serif;letter-spacing:-.03em}
h1{font-size:clamp(28px,5vw,44px);line-height:1.15}h2{font-size:32px}h3{font-size:20px;margin:0 0 16px}
p{max-width:78ch;color:#5c5a55;line-height:1.6}nav{display:flex;gap:12px 24px;flex-wrap:wrap;margin:24px 0}
a{color:#2b48d6;text-underline-offset:4px}a:focus-visible{outline:3px solid #2b48d6;outline-offset:4px}
section{margin-top:48px;scroll-margin-top:24px}article{margin:32px 0 48px;scroll-margin-top:24px}
.pair{display:grid;grid-template-columns:repeat(2,minmax(0,var(--capture-width)));gap:24px}
figure{margin:0;min-width:0}figcaption{font-weight:600;margin-bottom:12px}
img{display:block;width:100%;height:auto;outline:1px solid #e2e2df}.change{margin:16px 0 0;font-size:14px}
.evidence{border-top:1px solid #e2e2df;padding-top:20px}
@media(max-width:700px){main{padding:24px 16px}.pair{grid-template-columns:minmax(0,var(--capture-width));gap:24px}}
@media(prefers-reduced-motion:reduce){html{scroll-behavior:auto}}
</style></head><body><main>
<h1>Текущий / строгий</h1>
<p>Шесть одинаковых состояний на двух ширинах. Слева — текущий «Чернильный блокнот», справа — эксперимент «Строгий». На узком экране пары расположены друг под другом. Нажмите на снимок, чтобы открыть оригинал.</p>
<nav aria-label="Просмотр"><a href="#w375">375 px</a><a href="#w320">320 px</a><a href="../../index.html?now=08:00">Открыть текущий</a><a href="../../index.html?now=08:00&amp;visual=firm">Открыть строгий</a><a href="../../VISUAL-FIRMNESS.md">Отчёт</a></nav>
<p>Оформление по умолчанию сохранено. Примеры получены через интерфейс Chromium на чистых демоданных, с локальными шрифтами. Время зафиксировано: 08:00 для личной тренировки, 20:30 для мини-группы.</p>
''' + ''.join(sections) + '''
<div class="evidence"><p>Проверка текущего оформления: ноль изменённых пикселей в 12 снимках после токенизации и в 12 снимках после добавления строгого режима. Это сравнение браузерного прототипа, а не проверка физического телефона.</p>
<nav aria-label="Проверки"><a href="manifest.json">Источники и SHA-256</a><a href="evidence/pixel-verification.json">Сравнение пикселей</a><a href="evidence/contrast.json">Контраст</a><a href="evidence/interaction-verification.json">Переключение режима</a></nav></div>
</main></body></html>'''
(DEST / 'index.html').write_text(page)
print(f'Published 24 comparison PNGs + 12 baselines; {len(pixels)} exact pixel comparisons passed.')
