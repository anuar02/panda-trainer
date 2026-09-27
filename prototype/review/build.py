"""Build a review of real Playwright captures; no generated UI mockups."""
from pathlib import Path
import hashlib
import html
import json
import shutil

ROOT = Path(__file__).resolve().parents[2]
DEST = Path(__file__).resolve().parent
RESULTS = ROOT / 'output/design-review/results'
GROUPS = [
    ('Знакомство', 'Иллюстрации GPT Image появляются до первой тренировки. В повторяющейся работе внимание остаётся на данных.', [
        ('invitation', 'Приглашение', 'Общий блокнот связывает тренера и клиента. Название gymGO пока рабочее.'),
        ('first-plan', 'Первый план', 'Пустое состояние объясняет следующий шаг; иллюстрация поддерживает знакомство.'),
    ]),
    ('Работа тренера', 'От расписания к записи подхода и результатам. Главный критерий — быстро записать факт и вернуться к клиенту.', [
        ('trainer-home', 'Сегодня', 'Время отделено от имени; статусы помогают выбрать следующее действие.'),
        ('personal-start', 'Журнал тренировки', 'Показанный прошлый результат записывается одним нажатием; карандаш открывает изменение. Посещение и списание — отдельно.'),
        ('set-editor', 'Один подход', 'Контекст клиента и упражнения остаётся рядом с полями и действием записи.'),
        ('group-start', 'Мини-группа', 'Активный участник виден явно; черновики и факты у каждого свои.'),
        ('personal-results', 'Результаты', 'Частичный результат остаётся частичным. Завершение не дописывает отсутствующие подходы.'),
    ]),
    ('У клиента', 'Следующее занятие, программа и история используют одну типографику и спокойную иерархию.', [
        ('client-home', 'Ближайшее занятие', 'Время — главный ориентир. Действующее и предложенное время переноса показаны раздельно.'),
        ('client-program', 'Программа', 'Полные названия упражнений и назначенная программа; отсутствие плана не скрывается подстановкой.'),
        ('client-history', 'История', 'Запись в расписании, посещение и операция пакета — разные факты.'),
        ('client-progress', 'Прогресс', 'Значения и даты читаются явно. Пока это демонстрационная история, без новых журналов.'),
        ('client-profile', 'Профиль', 'Личные данные и остаток пакета видны сразу. Баланс остаётся данными демосеанса.'),
    ]),
    ('Дополнительные состояния', 'Только текущая версия: для этих состояний старые снимки не создавались. История снята в демовремя 20:30, пустые экраны — в сценарии без данных.', [
        ('client-history-ledger', 'История к вечеру', 'Дата и время на полях реестра. Прошедшее занятие само по себе не означает посещение.'),
        ('client-empty-program', 'Пока нет программы', 'Готовый рисунок GPT Image поддерживает начало работы; переход к расписанию остаётся явным.'),
        ('client-empty-progress', 'Пока нет результатов', 'Пустой блокнот вместо выдуманного графика. Посещения по-прежнему учитываются отдельно.'),
    ]),
]
CURRENT_ONLY = {'client-history-ledger', 'client-empty-program', 'client-empty-progress'}

manifest = {'capture_date': '2026-09-24', 'viewport_height': 844,
            'direction': 'Чернильный блокнот',
            'baseline_manifest': 'before/manifest.json',
            'verification': '110 Playwright checks passed; desktop and mobile-320/375/390/430',
            'captures': [], 'source_sha256': {}}
for _, _, screens in GROUPS:
    for name, _, _ in screens:
        for width in (320, 390):
            matches = list(RESULTS.glob(f'*-mobile-{width}/{name}.png'))
            if len(matches) != 1:
                raise RuntimeError(f'Expected one fresh capture for {name}/{width}: {matches}')
            target = DEST / 'captures' / str(width) / f'{name}.png'
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(matches[0], target)
            manifest['captures'].append({'file': str(target.relative_to(DEST)),
                'current_only': name in CURRENT_ONLY,
                'source': str(matches[0].relative_to(ROOT)),
                'sha256': hashlib.sha256(target.read_bytes()).hexdigest()})
for pattern in ('prototype/js/**/*.js', 'prototype/css/*.css', 'prototype/index.html', 'prototype/assets/illustrations/*', 'prototype/assets/fonts/*'):
    for path in sorted(ROOT.glob(pattern)):
        if path.is_file():
            manifest['source_sha256'][str(path.relative_to(ROOT))] = hashlib.sha256(path.read_bytes()).hexdigest()
(DEST / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')

sections = []
for i, (title, intro, screens) in enumerate(GROUPS):
    figures = []
    for name, label, note in screens:
        figures.append(f'''<figure>
          <figcaption><h3>{html.escape(label)}</h3><p>{html.escape(note)}</p></figcaption>
          <a class="capture" href="captures/390/{name}.png" target="_blank" rel="noopener" aria-label="{html.escape(label)}: открыть снимок целиком">
            <img src="captures/390/{name}.png" data-name="{name}" data-current-only="{str(name in CURRENT_ONLY).lower()}" width="390" height="844" loading="lazy" alt="{html.escape(label)}, снимок прототипа на ширине 390 пикселей">
          </a>
        </figure>''')
    sections.append(f'<section id="part-{i}"><h2>{title}</h2><p class="intro">{intro}</p><div class="screens">{"".join(figures)}</div></section>')

page = '''<!doctype html>
<html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>gymGO — обзор визуального направления</title>
<link rel="stylesheet" href="../css/fonts.css">
<style>
:root{font-family:Inter,sans-serif;color:#111110;background:#f4f2ed;font-synthesis:none}
*{box-sizing:border-box}body{margin:0}main{max-width:1320px;margin:auto;padding:56px 32px 80px}
h1,h2,h3{font-family:Montserrat,sans-serif;letter-spacing:-.035em}h1{font-size:clamp(30px,4.5vw,58px);line-height:1.08;max-width:900px;margin:16px 0 24px;font-weight:800}
h2{font-size:30px;margin:0 0 12px}h3{font-size:18px;margin:0 0 10px}p{font-size:15px;line-height:1.6;max-width:70ch;color:#5e5f60;margin:0 0 16px}
a{color:inherit;text-underline-offset:4px}a:focus-visible,input:focus-visible{outline:3px solid #2b48d6;outline-offset:5px}
.brand{font-family:Montserrat,sans-serif;font-size:24px;font-weight:800;letter-spacing:-.07em}.brand span{color:#0c8d20}
.meta{font-size:13px;margin-top:8px}.intro{max-width:70ch}.lead{font-size:18px;max-width:65ch}
nav{display:flex;gap:12px 24px;flex-wrap:wrap;padding:20px 0 28px}nav a{font-size:14px}
.toolbar{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:16px;background:white;border-radius:16px;padding:18px 24px;margin:12px 0 48px}
fieldset{display:flex;gap:16px;border:0;padding:0;margin:0;flex-wrap:wrap}legend{font-size:13px;color:#5e5f60;margin-bottom:10px}label{display:flex;align-items:center;gap:8px;min-height:32px;font-size:14px;cursor:pointer}input{accent-color:#050505;width:18px;height:18px}
.toolbar p{margin:0;font-size:13px}section{margin:0 0 64px}.screens{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,300px),1fr));gap:40px 32px;align-items:start;margin-top:28px}
figure{margin:0;max-width:430px}figcaption{min-height:138px}figcaption p{font-size:14px;line-height:1.55}.capture{display:block;width:100%;max-width:390px;border:1px solid #dedee1;border-radius:12px;overflow:hidden;background:white}.capture img{display:block;width:100%;height:auto}
.decisions{background:white;padding:32px;border-radius:20px}.decisions ol{padding-left:22px;max-width:75ch}.decisions li{padding:0 0 18px 8px;font-size:16px;line-height:1.5}.decisions li:last-child{padding-bottom:0}.decisions li span{display:block;color:#5e5f60;font-size:14px;margin-top:4px}
footer{border-top:1px solid #dedee1;padding-top:24px}footer p{font-size:13px}
@media(max-width:600px){main{padding:28px 16px 40px}h2{font-size:26px}.toolbar{padding:16px;margin-bottom:36px}figcaption{min-height:0}.screens{gap:32px}.decisions{padding:24px 20px}}
</style>
<main><header><div class="brand">gym<span>GO</span></div><p class="meta">Рабочее название · Обзор от 24 сентября 2026</p>
<h1>Чернильный блокнот</h1>
<p class="lead">Тёплая бумага, синие чернила и строки подходов. Сравните реальные экраны до и после визуального прохода.</p>
<p>Это материалы для выбора направления. Бренд и иллюстрации ещё не утверждены; Swift или React Native пока не выбран.</p>
<nav aria-label="Разделы обзора"><a href="#part-0">Знакомство</a><a href="#part-1">Работа тренера</a><a href="#part-2">У клиента</a><a href="#part-3">Дополнительные состояния</a><a href="#decisions">Что решить</a><a href="../index.html">Открыть прототип</a></nav></header>
<div class="toolbar"><fieldset><legend>Визуальный проход</legend><label><input type="radio" name="version" value="after" checked>После</label><label><input type="radio" name="version" value="before">До</label></fieldset><fieldset><legend>Ширина исходного экрана</legend><label><input type="radio" name="width" value="390" checked>390 px</label><label><input type="radio" name="width" value="320">320 px</label></fieldset><p id="width-note" aria-live="polite">После · 390 × 844 px. Нажмите на экран, чтобы открыть оригинал.</p></div>
''' + ''.join(sections) + '''
<section class="decisions" id="decisions"><h2>Что решить по этому обзору</h2>
<ol><li>Подходит ли характер «Чернильного блокнота»?<span>Сравните температуру фона, синий акцент и новый таб-бар. В журнале оцените различие предложения «Как в прошлый раз» и записанного факта.</span></li>
<li>Подходит ли характер иллюстраций GPT Image?<span>Общий блокнот и взаимодействие людей — в приглашении и первом плане. Выбор касается стиля, а не добавления картинок во все разделы.</span></li>
<li>Оставляем ли gymGO рабочим названием?<span>Текущее написание не является утверждённым логотипом. Его можно отложить и отдельно принять UX-направление.</span></li></ol>
<p>Для обратной связи достаточно назвать экран и конкретное изменение. Решение о нативном стеке не требуется для обсуждения этих экранов.</p></section>
<footer><p><a href="workout-polish/index.html">Журнал спокойнее и компактнее: сравнение до / после</a></p><p><a href="workout-window/index.html">Свернуть и вернуть тренировку: экраны на 320 и 375 px</a></p><p><a href="quick-entry/index.html">Отдельное сравнение быстрого ввода: до / после на 320 и 375 px</a></p><p>110 браузерных проверок на desktop и 320/375/390/430 px прошли. На странице 12 состояний на 320/390 px до и после прохода, ещё три — только в текущей версии. Это снимки Chromium, не проверка физического телефона. Работа анимаций оценивается в прототипе.</p>
<p>Данные демонстрационные. Реальной авторизации, доставки уведомлений, синхронизации и финансового учёта нет. Прогресс пока не объединён с новыми журналами.</p>
<p><a href="manifest.json">Источники новых снимков</a> · <a href="before/manifest.json">Источники снимков до прохода</a></p></footer></main>
<script>
function updateCaptures() {
  const width = document.querySelector('input[name="width"]:checked').value;
  const before = document.querySelector('input[name="version"]:checked').value === 'before';
  const version = before ? 'До' : 'После';
  document.querySelectorAll('img[data-name]').forEach(img => {
    const showBefore = before && img.dataset.currentOnly !== 'true';
    const source = `${showBefore ? 'before/' : ''}captures/${width}/${img.dataset.name}.png`;
    img.src = source; img.width = Number(width);
    const title = img.closest('figure').querySelector('h3').textContent;
    img.alt = `${title}, ${showBefore ? 'до визуального прохода' : 'текущая версия'}, ширина ${width} пикселей`;
    img.parentElement.href = source; img.parentElement.style.maxWidth = `${width}px`;
  });
  document.getElementById('width-note').textContent = `${version} · ${width} × 844 px. Дополнительные состояния — только текущие. Нажмите на экран, чтобы открыть оригинал.`;
}
document.querySelectorAll('input[name="width"], input[name="version"]').forEach(input => input.addEventListener('change', updateCaptures));
updateCaptures();
</script></html>
'''
(DEST / 'index.html').write_text(page)
print(f'Built {len(manifest["captures"])} captures and review/index.html')
