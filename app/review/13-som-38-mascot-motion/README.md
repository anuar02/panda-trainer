# SOM-38 · движение PNG-панды

Дата: 04.10.2026. Ветка: `agent/13-som-38-mascot-motion`.
Эталон: `prototype-fresh/index.html` без параметров; `js/mascot.js:3–41`,
`css/fresh.css:74–76, 554–696, 747–810`, `js/fx.js:1–67`.
Проверены `review/parity/spec-dark.json` поля `panda__body`, `panda__glow`,
`panda__shadow`, `panda__img`; числа движения берутся из CSS, поскольку spec
снимает только один момент анимации.

## Reference lock и реализация

Сохранены утверждённые PNG, геометрия caller и движения единственного эталона.
Новые изображения/направления дизайна не создавались. Body и poke — отдельные
вложенные слои с origin `50% 100%`. Shadow и glow — отдельные siblings;
shadow шириной 58%, высотой 12, bottom −3; glow шириной 92%, квадратный,
left/top 50%, смещение −50%/−48%. Остальные transform-origin — центр.
Glow radial: rgba(255,178,61,.35) 0%, rgba(255,122,31,.12) 45%, transparent 70%;
shadow closest-side rgba(90,40,10,.28) → transparent.
SVG из существующей зависимости, новый native модуль не добавляется.

Каждый слой имеет один linear shared clock. Worklet вычисляет property tracks
с bezier **между соседними точками каждой property**, не easing всего цикла.
Opacity у pandaIn имеет 0/60/100%, а transform — только 0/100%.
fxPanda opacity имеет неявное начало 1, 78%=1, 100%=0.
Poke порядок scale → translate → rotate; wave rotate → translate;
остальные translate → rotate → scale. `withSpring` не используется.
`withRepeat` бесконечен и отменяется при blur/unmount/смене motion policy.
Вход повторяется на focus; задержка 120 мс. Тап повторно запускает poke.
`accessible={false}`, accessibilityElementsHidden и no-hide-descendants
сохраняют декоративность; никакого setState на кадр.

| Поза / слой | Режим | Длительность, мс | Easing |
| --- | --- | --- | --- |
| front, clipboard, side, three-quarter | idle | 3400 | (.42,0,.58,1) |
| idle shadow | shadowIdle | 3400 | (.42,0,.58,1) |
| sit | breathe | 3000 | (.42,0,.58,1) |
| wave | wave | 2400 | (.42,0,.58,1) |
| thumbs | nod | 2600 | (.2,.8,.2,1) |
| jump + shadow | hop + shadowHop | 1300 | (.3,0,.5,1) |
| stretch | sway | 3200 | (.42,0,.58,1) |
| sleep | sleep | 4000 | (.42,0,.58,1) |
| glow | glowPulse | 4000 | (.42,0,.58,1) |
| три z | zFloat | 3600, delays 0/1200/2400 | (.42,0,1,1) |
| появление | pandaIn | 800, delay 120 | (.34,1.56,.64,1) |
| тап | poke | 700 | (.34,1.56,.64,1) |
| celebration panda | fxPanda | 2200 | (.34,1.56,.64,1) |
| celebration overlay | fxFade | 2200 | (.25,.1,.25,1) |
| 34 confetti | confetti | 1800, random delay 0–120 | (.15,.7,.3,1) |
| 12 spark | spark | 700 | (0,0,.58,1) |

Sleep z: right 8%, top 0, box 40×60, color #b8866a,
Montserrat 800, sizes 15/14/18. Glyph z декоративный, без пользовательского текста.
Faces neutral/laugh/excited/smile/calm/worried/surprised/sad и back не имеют режима.
Rive-модуль и флаг EXPO_PUBLIC_MASCOT_RIVE сохранены, front/wave native selection
не заменяется PNG-анимацией при включённом экспериментальном пути.

Празднование: только новый finished edge, не сохранённый результат;
2200 мс, 170×200, bottom 170, left 50%, margin-left −85, overlay radius 36.
Background circle at 50% 70%, rgba(255,178,61,.2) → transparent 60%.
Confetti burst left 50%, top 62%; 34 частицы, цвета
#e0561b/#ff7a1f/#ffb23d/#5b3a29/#1f9d55/#f6d9b8, углы 200–340°,
расстояние 140–320, rotation −360…360°, round/strip/square по i%3.
Размер 10×10, strip 6×14, left/top −5, radius 50%/2/2.
12 spark: радиус траектории 46, угол i/12×2π, размер 6×6, left/top −3,
первые четыре цвета. По брифу spark размещён в celebration burst;
в прототипе Fx.sparkle(el) отдельный helper, другие действия здесь не меняются.

## Политика движения

Reduce motion: plain PNG, без entrance/poke/body/glow/shadow/z animation;
празднование не запускается. Calm: движения нет вообще; явные empty/onboarding
сохраняют static PNG, hero/inline/celebration скрываются.
Existing callers не выражают контекст: сохранено прежнее скрытие при неуказанном
контексте; вопрос карты вставок записан в OPEN-QUESTIONS. Никаких экранных
правок или угадывания контекста по позе/размеру нет.

## Дословные кейфреймы, перенесённые в property tracks

Значения px передаются в RN logical px; проценты ниже — проценты времени.
Неанимируемые translateX(−50%)/translate(−50%,−48%) слоёв переданы layout.
`--dx/--dy/--r` confetti сгенерированы один раз с диапазонами js/fx.js;
после 45% x=dx×1.1, y=dy+220 и rotation=r.

```css
@keyframes pandaIn {
  0% { opacity: 0; transform: translateY(26px) scale(.7); }
  60% { opacity: 1; }
  100% { opacity: 1; transform: none; }
}

@keyframes pandaIdle {
  0%, 100% { transform: translateY(0) scale(1, 1); }
  50% { transform: translateY(-5px) scale(1.01, .995); }
}

@keyframes shadowIdle {
  0%, 100% { transform: translateX(-50%) scale(1); opacity: 1; }
  50% { transform: translateX(-50%) scale(.86); opacity: .75; }
}

@keyframes pandaBreathe {
  0%, 100% { transform: scale(1, 1); }
  50% { transform: scale(1.015, 1.03); }
}

@keyframes pandaWave {
  0%, 100% { transform: rotate(0deg); }
  15% { transform: rotate(-4deg); }
  30% { transform: rotate(3deg); }
  45% { transform: rotate(-3deg); }
  60% { transform: rotate(2deg); }
  75% { transform: rotate(0deg) translateY(-3px); }
}

@keyframes pandaNod {
  0%, 60%, 100% { transform: translateY(0) scale(1); }
  70% { transform: translateY(2px) scale(1.03, .96); }
  82% { transform: translateY(-8px) scale(.98, 1.03); }
  92% { transform: translateY(0) scale(1.01, .99); }
}

@keyframes pandaHop {
  0%, 100% { transform: translateY(0) scale(1.06, .92); }
  15% { transform: translateY(0) scale(.96, 1.05); }
  50% { transform: translateY(-22px) scale(.98, 1.03); }
  85% { transform: translateY(0) scale(1.04, .95); }
}

@keyframes shadowHop {
  0%, 15%, 85%, 100% { transform: translateX(-50%) scale(1); opacity: 1; }
  50% { transform: translateX(-50%) scale(.6); opacity: .45; }
}

@keyframes pandaSway {
  0%, 100% { transform: rotate(-3deg); }
  50% { transform: rotate(3deg); }
}

@keyframes pandaSleep {
  0%, 100% { transform: scale(1, 1); }
  50% { transform: scale(1.02, 1.05); }
}

@keyframes zFloat {
  0% { opacity: 0; transform: translate(0, 0) scale(.6); }
  20% { opacity: 1; }
  100% { opacity: 0; transform: translate(22px, -56px) scale(1.2) rotate(12deg); }
}

@keyframes glowPulse {
  0%, 100% { transform: translate(-50%, -48%) scale(.94); opacity: .85; }
  50% { transform: translate(-50%, -48%) scale(1.06); opacity: 1; }
}

@keyframes poke {
  0% { transform: scale(1); }
  25% { transform: scale(1.12, .86) translateY(4px); }
  55% { transform: scale(.92, 1.1) translateY(-16px) rotate(-4deg); }
  80% { transform: scale(1.04, .97) rotate(2deg); }
  100% { transform: scale(1); }
}

@keyframes confetti {
  0% { opacity: 1; transform: translate(0, 0) rotate(0) scale(.4); }
  45% { opacity: 1; transform: translate(var(--dx), var(--dy)) rotate(calc(var(--r) * .6)) scale(1); }
  100% { opacity: 0; transform: translate(calc(var(--dx) * 1.1), calc(var(--dy) + 220px)) rotate(var(--r)) scale(.9); }
}

@keyframes fxPanda {
  0% { transform: translateY(260px) scale(.8); }
  22% { transform: translateY(0) scale(1); }
  78% { transform: translateY(0) scale(1); opacity: 1; }
  100% { transform: translateY(280px) scale(.9); opacity: 0; }
}

@keyframes fxFade { 0% { opacity: 0; } 8% { opacity: 1; } 85% { opacity: 1; } 100% { opacity: 0; } }

@keyframes spark {
  0% { opacity: 1; transform: translate(0, 0) scale(1); }
  100% { opacity: 0; transform: translate(var(--dx), var(--dy)) scale(.2); }
}
```

## Проверки

- `graft map`, `graft ask "SOM-38 Mascot mascot motion celebration Reanimated" --source`:
  command not found; графа `graft/` тоже нет, использованы точные пути из брифа.
- Linear connector отсутствует: live project/issue/dependencies не прочитаны;
  записи Linear не менялись, scope взят из брифа и локальных документов.
- `cd app && npx jest --runInBand tests/mascot-motion.test.tsx`:
  source-parity tests напрямую разбирают кейфреймы CSS; component tests проверяют
  gates, три z, повторный poke, отмену циклов, 20 панд и 2200 мс;
  32 новых теста пройдены в общем check.
- `cd app && npm run check`: **пройдено**, typecheck/lint/format check,
  246 suites / 3155 tests, 0 failures.
- `cd app && npx expo export --platform web`: **пройдено**, Metro static export
  в `dist`; предупреждение существующего expo-asset resolveAssetSource exports,
  ошибок сборки нет.
- Browser smoke: headless Chromium 153, 390×844; локальные `/schedule`, `/clients`,
  `/today` с `?scenario=empty`, no-preference/reduce; DOM transform выборка в два
  момента с интервалом 550 мс. Для no-preference sleep/breathe меняются;
  reduce показывает PNG без изменяющегося transform, page errors=0.
  Poke и hot-switch reduce: **пройдено** на всех трёх маршрутах.
  После click наблюдается scaleX около 1.126 и scaleY около .853 (spring overshoot);
  после emulateMedia(reduce) анимированные ancestors удаляются, transform=none
  и повторные выборки через 350 мс совпадают. Во всех шести сценариях page errors=0.
  Команда: `LD_LIBRARY_PATH=/tmp/som38-chromium-libs/root/usr/lib/aarch64-linux-gnu:/tmp/som38-chromium-libs/root/lib/aarch64-linux-gnu node /tmp/som38-smoke.cjs`.
  Playwright установлен только в `/tmp/som38-browser` командой
  `npm install --prefix /tmp/som38-browser --no-audit --no-fund playwright`;
  Chromium: `/tmp/som38-browser/node_modules/.bin/playwright install chromium`.
  Первый запуск обнаружил отсутствующие libnspr4 и другие системные библиотеки;
  `.deb` загружены через `apt-get download -o Dir::State::lists=/tmp/som38-apt-lists`
  и извлечены `dpkg-deb -x` в `/tmp`, без установки в систему или изменения package.json.
- `git diff --check`: пройдено.

Общий Jest mock дополнен Reanimated cancelAnimation/withDelay/withRepeat/set и
bezier factory для проверки новых shared values; production motion.tsx не изменён.
Промежуточные ошибки нового harness (Jest hoist, SVG hidden query, implicit CSS
opacity stop) исправлены; lint потребовал sharedValue.set в event callback.

## Не проверено / приёмка

Нативная проверка: **не проверено**. iPhone 14 Pro Release, Android, native FPS,
скролл списков и много панд на устройстве — не проверено; unit-test 20 панд
доказывает запуск/очистку циклов, а не FPS. Rive runtime не перепроверен.
Сравнение градиентов, alpha drop-shadow PNG, glyph bounds и движения на native,
темы/крупный шрифт/VoiceOver/TalkBack требуют проверки владельцем.
Пары снимков не создают приёмку; новых PNG/снимков в git нет (ADR 0066).
Экран или полная визуальная эквивалентность не объявлены принятыми.
