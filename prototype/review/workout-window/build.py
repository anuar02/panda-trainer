"""Publish actual minimized-workout screenshots after a successful browser run."""
from pathlib import Path
import hashlib
import html
import json
import shutil

DEST = Path(__file__).resolve().parent
ROOT = DEST.parents[2]
RESULTS = ROOT / 'output/design-review/results'
SCREENS = [
    ('personal-start', 'Рабочее окно: «Свернуть» вверху'),
    ('workout-minimized', 'Тренировка свёрнута: можно работать с расписанием'),
    ('workout-profile-dock', 'Возврат остаётся доступным в профиле'),
    ('workout-client-card-dock', 'Карточка другого клиента не теряет текущую тренировку'),
    ('workout-group-dock', 'Время занятия и черновики всех участников'),
    ('review-draft', 'В строке виден введённый черновик'),
    ('review-scroll', 'Имя остаётся в шапке при прокрутке'),
    ('review-fallback', 'После завершения другого журнала возвращается Дана'),
    ('review-stale-completed', 'Завершение во второй вкладке: результаты и копия местных правок'),
]
manifest = {'date': '2026-09-24', 'captures': [], 'source_sha256': {}}
sections = []
for width in (320, 375):
    figures = []
    for name, label in SCREENS:
        matches = list(RESULTS.glob(f'*-mobile-{width}/{name}.png'))
        if len(matches) != 1:
            raise RuntimeError(f'Expected one capture: {width}/{name}, got {matches}')
        target = DEST / str(width) / (name + '.png')
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(matches[0], target)
        file = str(target.relative_to(DEST))
        manifest['captures'].append({'file': file, 'source': str(matches[0].relative_to(ROOT)),
            'sha256': hashlib.sha256(target.read_bytes()).hexdigest()})
        figures.append(f'<figure><figcaption>{html.escape(label)}</figcaption><a href="{file}"><img src="{file}" width="{width}" height="844" loading="lazy" alt="{html.escape(label)}, {width} px"></a></figure>')
    sections.append(f'<section id="w{width}"><h2>{width} px</h2><div class="screens">{"".join(figures)}</div></section>')
for pattern in ('prototype/js/**/*.js', 'prototype/css/*.css'):
    for path in sorted(ROOT.glob(pattern)):
        manifest['source_sha256'][str(path.relative_to(ROOT))] = hashlib.sha256(path.read_bytes()).hexdigest()
(DEST / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
page = '''<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Свернуть тренировку и вернуться</title><link rel="stylesheet" href="../../css/fonts.css">
<style>*{box-sizing:border-box}body{margin:0;background:#f4f2ed;color:#111110;font-family:Inter,sans-serif}main{max-width:1200px;margin:auto;padding:40px 24px}h1,h2{font-family:Montserrat,sans-serif;letter-spacing:-.03em}h1{font-size:clamp(28px,5vw,44px)}p{max-width:70ch;color:#5c5a55;line-height:1.6}nav{display:flex;gap:20px;flex-wrap:wrap;margin:24px 0}a{color:#2b48d6;text-underline-offset:4px}a:focus-visible{outline:3px solid #2b48d6;outline-offset:4px}.screens{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,280px),1fr));gap:32px 24px}figure{margin:0}figcaption{min-height:72px;font-weight:600;line-height:1.5}img{display:block;width:100%;max-width:375px;height:auto;border:1px solid #e3dfd6;border-radius:12px}section{margin-top:40px}@media(max-width:600px){main{padding:24px 16px}figcaption{min-height:0;margin-bottom:12px}}</style>
<main><a href="../index.html">Общий обзор</a><h1>Свернуть и вернуться</h1>
<p>Тренировка остаётся отдельным рабочим окном. «Свернуть» открывает «Сегодня», а полоса возврата остаётся доступной в других разделах. Возврат сохраняет участника, черновик и прокрутку текущего сеанса.</p>
<nav><a href="../workout-polish/index.html">Сравнение визуального прохода</a><a href="#w320">320 px</a><a href="#w375">375 px</a><a href="../../TRAINING-WINDOW.md">Поведение и ограничения</a><a href="../../index.html">Открыть прототип</a></nav>
''' + ''.join(sections) + '''<p>Снимки Chromium от 24 сентября 2026. Включены исправления ревью Claude. Это действующий прототип, не проверка физического телефона. После перезагрузки журнал восстанавливается, позиция прокрутки — нет.</p></main></html>'''
(DEST / 'index.html').write_text(page)
