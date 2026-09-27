"""Build the quick-entry comparison from actual, successful Playwright runs."""
from pathlib import Path
import hashlib
import html
import json
import shutil

DEST = Path(__file__).resolve().parent
ROOT = DEST.parents[2]
BEFORE = ROOT / 'output/quick-entry/before'
AFTER = ROOT / 'output/design-review/results'
SCREENS = [
    ('before', 'personal-start', 'До: открытие шторки для каждого подхода', BEFORE, 844),
    ('after', 'quick-start', 'После: подтверждение показанных значений', AFTER, 844),
    ('after', 'quick-saved', 'Записанный результат и отмена', AFTER, 844),
    ('after', 'quick-three-sets', 'Три подхода: 50 × 10, 52,5 × 8, 50 × 10', AFTER, 844),
    ('after', 'set-editor', 'Изменение значений в существующей шторке', AFTER, 844),
    ('after', 'quick-short', 'Короткий экран после исправления и перезагрузки', AFTER, 667),
]
manifest = {'date': '2026-09-24', 'verification': '82 unit; 110 browser; both type checks',
            'baseline_source_manifest': 'before-source-manifest.json', 'captures': [], 'source_sha256': {}}
sections = []
for width in (320, 375):
    figures = []
    for version, name, title, source, height in SCREENS:
        target = DEST / version / str(width) / (name + '.png')
        # Keep the comparison baseline stable on subsequent rebuilds.
        if version != 'before' or not target.exists():
            matches = list(source.glob(f'*-mobile-{width}/{name}.png'))
            if len(matches) != 1:
                raise RuntimeError(f'Expected one capture: {source}/{width}/{name}, got {matches}')
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(matches[0], target)
        relative = str(target.relative_to(DEST))
        manifest['captures'].append({'file': relative, 'width': width, 'height': height,
            'source_run': str(source.relative_to(ROOT)), 'sha256': hashlib.sha256(target.read_bytes()).hexdigest()})
        figures.append(f'<figure><figcaption>{html.escape(title)}</figcaption><a href="{relative}"><img src="{relative}" width="{width}" height="{height}" alt="{html.escape(title)}, {width} px" loading="lazy"></a></figure>')
    sections.append(f'<section id="w{width}"><h2>{width} px</h2><div class="screens">{"".join(figures)}</div></section>')
for pattern in ('prototype/js/**/*.js', 'prototype/css/*.css', 'prototype/e2e/*.ts'):
    for path in sorted(ROOT.glob(pattern)):
        manifest['source_sha256'][str(path.relative_to(ROOT))] = hashlib.sha256(path.read_bytes()).hexdigest()
(DEST / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
page = '''<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Запись подходов — до и после</title><link rel="stylesheet" href="../../css/fonts.css">
<style>*{box-sizing:border-box}body{margin:0;background:#f4f2ed;color:#111110;font-family:Inter,sans-serif}main{max-width:1100px;margin:auto;padding:40px 24px}h1,h2{font-family:Montserrat,sans-serif;letter-spacing:-.035em}h1{font-size:clamp(28px,5vw,44px)}p,li{max-width:75ch;line-height:1.6;color:#5c5a55}nav{display:flex;gap:24px;margin:24px 0}a{color:#2b48d6;text-underline-offset:4px}a:focus-visible{outline:3px solid #2b48d6;outline-offset:4px}.screens{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:32px 24px}figure{margin:0}figcaption{min-height:64px;font-weight:600;line-height:1.5}img{display:block;width:100%;max-width:375px;height:auto;border:1px solid #e3dfd6;border-radius:12px}section{margin-top:40px}footer{border-top:1px solid #e3dfd6;margin-top:40px;padding-top:16px}@media(max-width:600px){main{padding:24px 16px}.screens{grid-template-columns:1fr}figcaption{min-height:0;margin-bottom:12px}}</style>
<main><a href="../index.html">Общий обзор</a><h1>Записать подход одним нажатием</h1>
<p>24 сентября 2026. Источник значения всегда указан: «Как в прошлый раз». Кнопка сразу записывает показанный результат; карандаш открывает привычную шторку для изменения.</p>
<p>Первый ряд каждой секции — одинаковое начальное состояние до и после изменения. Остальные снимки показывают только новую версию. Короткий экран имеет высоту 667 px, остальные — 844 px.</p>
<nav><a href="#w320">320 px</a><a href="#w375">375 px</a><a href="../../QUICK-ENTRY-REVIEW.md">Решения и ограничения</a></nav>
<p>Проверочный сценарий: подтвердить прошлый результат → отменить → записать снова → изменить второй подход → записать третий → исправить первый → перезагрузить. Результаты остаются 47,5 × 10, 52,5 × 8 и 50 × 10.</p>
''' + ''.join(sections) + '''<footer><p>82 unit и 110 browser; обе проверки типов. Это Chromium: реальная клавиатура телефона и скорость работы тренера не проверены. Пользовательская приёмка открыта.</p></footer></main></html>'''
(DEST / 'index.html').write_text(page)
