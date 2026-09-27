"""Compare the frozen pre-polish captures with the current full browser run."""
from pathlib import Path
import hashlib
import html
import json
import shutil

DEST = Path(__file__).resolve().parent
ROOT = DEST.parents[2]
RESULTS = ROOT / 'output/design-review/results'
STATES = [
    ('personal-start', 'Личное занятие', 'Синий ведёт к следующему подходу; остальные действия остаются доступными.'),
    ('group-start', 'Начало группы', 'Компактные участники и контекст без повторного времени и аватара.'),
    ('group-draft-return', 'Возврат к черновику', 'Черновик остаётся видимым, выбранный участник однозначен.'),
    ('workout-group-dock', 'Свёрнутая группа', 'Один постоянный синий акцент; время, участник и черновики сохранены.'),
]
baseline = json.loads((DEST / 'baseline-manifest.json').read_text())
manifest = {'date': '2026-09-24', 'verification': '82 unit; 110 browser; both type checks',
            'captures': list(baseline['captures']), 'source_sha256': {}}


def capture(width, name, height=844):
    matches = list(RESULTS.glob(f'*-mobile-{width}/{name}.png'))
    if len(matches) != 1:
        raise RuntimeError(f'Expected one capture: {width}/{name}, got {matches}')
    target = DEST / f'after/{width}/{name}.png'
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(matches[0], target)
    file = str(target.relative_to(DEST))
    manifest['captures'].append({'file': file, 'source': str(matches[0].relative_to(ROOT)),
                                'sha256': hashlib.sha256(target.read_bytes()).hexdigest()})
    return file


def figure(file, label, width, height=844):
    return f'<figure><figcaption>{html.escape(label)}</figcaption><a href="{file}"><img src="{file}" width="{width}" height="{height}" loading="lazy" alt="{html.escape(label)}, {width} px"></a></figure>'


sections = []
for width in (320, 375):
    states = []
    for name, title, description in STATES:
        before = f'before/{width}/{name}.png'
        after = capture(width, name)
        pair = figure(before, 'До', width) + figure(after, 'После', width)
        states.append(f'<article><h3>{title}</h3><p>{description}</p><div class="pair">{pair}</div></article>')
    short = capture(width, 'polish-group-short', 640)
    states.append('<article><h3>Короткий экран: 640 px</h3><p>Первый подход целиком, переключение участников и завершение доступны. Это проверка размеров, не системной клавиатуры.</p>' + figure(short, 'Текущая версия', width, 640) + '</article>')
    sections.append(f'<section id="w{width}"><h2>{width} px</h2>{"".join(states)}</section>')

for pattern in ('prototype/js/**/*.js', 'prototype/css/*.css', 'prototype/e2e/*.ts'):
    for path in sorted(ROOT.glob(pattern)):
        manifest['source_sha256'][str(path.relative_to(ROOT))] = hashlib.sha256(path.read_bytes()).hexdigest()
for item in manifest['captures']:
    assert hashlib.sha256((DEST / item['file']).read_bytes()).hexdigest() == item['sha256'], item['file']
(DEST / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')

page = '''<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Журнал тренировки — спокойнее и компактнее</title><link rel="stylesheet" href="../../css/fonts.css">
<style>*{box-sizing:border-box}body{margin:0;background:#f4f2ed;color:#111110;font-family:Inter,sans-serif}main{max-width:920px;margin:auto;padding:40px 24px}h1,h2,h3{font-family:Montserrat,sans-serif;letter-spacing:-.03em}h1{font-size:clamp(28px,5vw,44px);max-width:700px}p{max-width:70ch;color:#5c5a55;line-height:1.6}nav{display:flex;gap:20px;flex-wrap:wrap;margin:24px 0}a{color:#2b48d6;text-underline-offset:4px}a:focus-visible{outline:3px solid #2b48d6;outline-offset:4px}section{margin-top:56px}article{margin:32px 0 48px}.pair{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:24px}figure{margin:0}figcaption{font-weight:600;line-height:1.5;margin-bottom:12px}img{display:block;width:100%;max-width:375px;height:auto;border:1px solid #e3dfd6;border-radius:12px}@media(max-width:600px){main{padding:24px 16px}.pair{grid-template-columns:1fr;gap:24px}}</style>
<main><a href="../index.html">Общий обзор</a><h1>Журнал тренировки: спокойнее и компактнее</h1>
<p>Точечный проход после исправлений ревью Claude. Сохраняем «Чернильный блокнот» и быстрый ввод; уменьшаем конкуренцию действий и высоту контекста группы.</p>
<nav><a href="#w320">320 px</a><a href="#w375">375 px</a><a href="../../WORKOUT-POLISH.md">Решения и сценарий приёмки</a><a href="../../index.html">Открыть прототип</a></nav>
''' + ''.join(sections) + '''<footer><p>82 unit и 110 браузерных проверок. Снимки Chromium от 24 сентября 2026. Реальный iPhone/Safari, клавиатура и скорость работы тренера ещё требуют проверки.</p></footer></main></html>'''
(DEST / 'index.html').write_text(page)
