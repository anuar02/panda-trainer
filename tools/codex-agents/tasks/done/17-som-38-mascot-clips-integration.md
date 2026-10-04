# SOM-38 · Подключить выбранные клипы панды

Linear: https://linear.app/something-great/issue/SOM-38
Ветка: agent/17-som-38-mascot-clips-integration. Заголовок PR с SOM-38.

## Решение владельца 05.10.2026

Владелец посмотрел `design-exploration/mascot-motion-2026-10-04/index.html` и выбрал
клипы: **wave, thumbs, jump, sit, sleep, stretch, listen**. Отклонены: **clipboard**
и **front-idle** — их не подключать (там остаётся PNG с Reanimated-движением из #76).
Места — как в prototype-fresh. Формат — анимированный WebP (а) через expo-image.
listen подключить только как ассет/позу без места: голосового экрана в v1 нет
(SOM-54), места не придумывать.

## Эталон мест (prototype-fresh)

- Онбординг: `js/screens/welcome.js:41` wave, `:104` thumbs (approved) — `{ video: true }`.
- Празднование: `js/fx.js:5,23,55` jump, контекст celebration, длительность 2200 мс
  (уже реализовано в `app/src/ui/mascot/celebration.tsx` PNG-версией — заменить
  на клип, сохранив fxPanda/confetti/spark и тайминги).
- Пустые состояния: `js/ui.js:90` — sleep для календаря, иначе sit;
  `js/screens/client.js:278` и `:142` (приглашение: welcome→wave, waiting→sit,
  approved→thumbs); `js/screens/trainer.js:724` inbox-clear.
- `js/screens/client.js:56` hero: wave — клип; clipboard — остаётся PNG.
- stretch: найти в prototype-fresh места позы stretch (`grep -rn "stretch" js`);
  если мест нет — подключить как позу без места, как listen.
Сопоставить каждое место с текущим вызовом `<Mascot pose=...>` в `app/src/**`
(список: `grep -rn "<Mascot" app/src`). Маленькие лица (`face-*`, аватары, тосты,
rail) не трогать — там клипов нет и в эталоне.

## Ассеты

Источник: `design-exploration/mascot-motion-2026-10-04/candidates/<pose>/animation.webp`
(+ poster). Скопировать выбранные в `app/assets/mascot/clips/` (исключение из ADR 0066
для этих ассетов дано владельцем). Вес: сейчас 354–620 КБ на позу. Уменьшить до
≤ 300 КБ, не трогая плавность заметно: сначала укоротить петлю до естественного
цикла движения без скачка (проверить шов), затем fps 12→10, затем quality. Если
поза не укладывается — оставить лучший вариант и записать фактический вес и причину
в отчёт. Конвейер (ffmpeg-static, хромакей) — `design-exploration/mascot-motion-2026-10-04/README.md`
и `build_candidates.py`; исходные mp4 не перегенерировать, Higgsfield не использовать.

## Критерии

- [ ] `Mascot` получает режим клипа для выбранных поз в перечисленных местах; в
  остальных местах — текущее поведение #76 (PNG + Reanimated).
- [ ] Пока клип грузится и при ошибке декодирования — постер/PNG той же позы без
  скачка размера (те же размеры бокса, что сейчас).
- [ ] Reduce motion и «Спокойный интерфейс» — статичный PNG, клип не загружается.
  Правило спокойного режима эталона (`js/mascot.js:22-23`) учитывать; открытый
  вопрос SOM-38 в OPEN-QUESTIONS не решать самостоятельно.
- [ ] Клип не проигрывается вне экрана (смена вкладки/размонтирование
  останавливает), несколько клипов на экране не роняют кадры; память — проверить
  отсутствие удержания декодированных кадров после ухода с экрана.
- [ ] Празднование: клип jump вместо PNG, остальные эффекты и 2200 мс сохранены.
- [ ] Web: тот же WebP или PNG-фоллбек, без ошибок.
- [ ] Тесты: выбор клип/PNG по позе и месту, reduce motion/calm, отклонённые позы
  (clipboard, front-idle) никогда не клип. `npm run check` зелёный. Отчёт
  `app/review/17-som-38-mascot-clips-integration/README.md`: таблица место →
  поза → клип/PNG → вес; нативное ощущение «не проверено».
- [ ] ADR: анимированный WebP для крупных моментов (дополняет 0005/0060), с
  ограничением веса и правилами отключения.

## Границы

`app/src/ui/mascot.tsx`, `app/src/ui/mascot/**`, `app/assets/mascot/clips/**`,
минимальные правки экранов только для передачи контекста места, тесты, docs/ADR/
CHANGELOG/ROADMAP. Не менять анимации интерфейса (#77/#78), `motion.tsx` —
только использовать. `design-exploration/**` не изменять.
