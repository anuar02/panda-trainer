# SOM-38 · Подключение выбранных клипов панды

Ветка: `agent/17-som-38-mascot-clips-integration`.
Основание: решение владельца 05.10.2026 из брифа; проверка в среде 04.10.2026 UTC.
Реализовано; экраны и SOM-38 целиком не приняты. Нативное ощущение **не проверено**.

## Карта мест

`clipPlace` разрешает клип отдельно от существующего `context`, чтобы не закрывать
продуктовый вопрос calm в OPEN-QUESTIONS. Размеры, стили и тексты не менялись.
В режиме reduce motion — исходный PNG; calm сохраняет прежнюю видимость:
для явно заданных context=empty/onboarding статичный PNG, для неизвестного
контекста скрытие. Добавленные clipPlace не меняют это временное правило.

| Место прототипа → текущий вызов в app/src | Поза | Обычный режим | Вес WebP, байт |
| --- | --- | --- | ---: |
| screens/welcome.js:41 → features/onboarding/welcome-screen.tsx, intro | wave | клип | 445248 |
| screens/welcome.js:104 → тот же экран, done | thumbs | клип | 262274 |
| fx.js:5,23,55 → ui/mascot/celebration.tsx | jump | клип, прежние fxPanda/fxFade/confetti/spark, 2200 мс | 286536 |
| ui.js:90, calendar → features/trainer-schedule/trainer-schedule-screen.tsx | sleep | клип | 226394 |
| ui.js:90, calendar → features/trainer-today/trainer-today-screen.tsx, empty | sleep | клип | 226394 |
| ui.js:90, прочие empty → features/trainer-clients/trainer-clients-screen.tsx | sit | клип | 283950 |
| ui.js:90, прочие empty → features/workspace-clients/clients-screen.tsx | sit | клип | 283950 |
| screens/client.js:278, quietEmpty → features/client-home/client-home-screen.tsx, demo empty | sit | клип | 283950 |
| тот же quietEmpty → тот же файл, ControlledClientHome empty | sit | клип | 283950 |
| screens/client.js:142, welcome → features/invitations/screens.tsx, active | wave | клип | 445248 |
| screens/client.js:142, approved → тот же файл, accepted | thumbs | клип | 262274 |
| screens/client.js:142, waiting | sit | ассет и разрешённая пара invitation/sit; текущего вызова Mascot нет, новое состояние не создавалось | 283950 |
| screens/trainer.js:724, inbox-clear → features/trainer-inbox/trainer-inbox-screen.tsx | sit | клип | 283950 |
| screens/client.js:56, hero → features/client-home/client-home-screen.tsx, demo и controlled | wave | клип | 445248 |
| тот же hero, confirmation/proposal → тот же файл, demo и controlled | clipboard | прежний PNG/Reanimated | — |
| features/client-program/client-program-screen.tsx, два вызова | clipboard | прежний PNG/Reanimated | — |
| features/client-progress/client-progress-screen.tsx | front | прежний PNG/Reanimated | — |
| features/trainer-today/trainer-today-screen.tsx, face | calm | прежний статичный PNG | — |
| ui/toast.tsx | front | прежний PNG/Reanimated | — |
| face-*, аватары, rail вне Mascot | лица | прежние ассеты; не менялись | — |
| mascot.js:10, таблица POSES; других stretch-вызовов в js нет | stretch | ассет/поза без места | 298876 |
| голосовой экран отсутствует в v1, SOM-54 | listen | ассет/поза без места; PNG для позы — постер | 281468 |

Отклонённые clipboard/front-idle не скопированы и никогда не выбираются
clipForPlace. Front и экспериментальный Rive вне выбранных мест сохраняют #76.

## Оптимизация

Исходники: `design-exploration/mascot-motion-2026-10-04/candidates/<pose>/animation.webp`.
Работа выполнена с уже хромакеенными кандидатами: исходный README и
build_candidates.py прочитаны, MP4 и design-exploration не менялись.
Новая генерация/кредиты: 0. PNG-постеры — первые кадры итогового клипа;
исключение владельца из ADR 0066 применяется к выбранным ассетам, не скриншотам.

Воспроизводимый конвейер — [optimize.py](optimize.py), Pillow 12.3.0 / numpy 2.4.6.
Параметры, source SHA-256, кадры, длительности, веса и все попытки —
[assets.json](assets.json). Декодирование проверяет все кадры, альфу и сумму
длительностей. Все клипы остаются 320 px шириной, без покадровой обрезки.

Первым шагом удалены хвосты до границы естественного движения (индексы от 0):
thumbs 6–42, jump 1–54, sit 6–58, sleep 11–51, stretch 8–49, listen 3–45.
Wave оставлен целиком 0–61: короткая граница полного жеста не найдена.
Проверены временные контакт-листы и last/first-пары всех семи поз.
Для sit отвергнут короткий цикл 6–47: на шве менялось выражение рта;
6–58 сохраняет совпадающее выражение и меньшую ошибку шва.
Без заметного скачка масштаба; нативная оценка плавности остаётся открытой.

После обрезки, когда бюджет превышен, частота снижена с 12 до 10 fps,
затем quality 60→50→40. Sleep сохранил 12 fps, jump — quality 50,
sit — quality 40, остальные — quality 60. Шесть файлов ≤300000 байт.
Wave: 12 fps/q60 = 528960; 10 fps/q60 = 445248; q50 = 418738;
q40 = 389736. Даже q40 не укладывается; сохранён лучший q60/10 fps,
445248 байт по разрешённому исключению брифа. Дальнейшее снижение качества
или удаление части жеста не применено. Размер PNG-постеров записан отдельно.
Полный jump-цикл 4500 мс проигрывается только внутри прежнего окна 2200 мс.

## Проверки

Команды из корня, если не указан `cd app`:

```sh
command -v graft
npm ci --ignore-scripts
python3 -m venv /tmp/som38-venv
curl -Ls https://bootstrap.pypa.io/get-pip.py -o /tmp/som38-get-pip.py
python3 /tmp/som38-get-pip.py --target /tmp/som38-python pillow numpy
PYTHONPATH=/tmp/som38-python python3 app/review/17-som-38-mascot-clips-integration/optimize.py
cd app && npm test -- --runTestsByPath tests/mascot-clips.test.tsx tests/mascot.test.tsx tests/mascot-motion.test.tsx
cd app && npm run check
cd app && npm run export
npx playwright install chromium
node app/review/17-som-38-mascot-clips-integration/web-smoke.cjs
git diff --check
```

Graft не установлен и graft/ отсутствует. Linear live read недоступен:
инструменты Linear не подключены; записи Linear не менялись.
Создание venv не удалось (нет ensurepip); зависимости Python установлены только
в /tmp. Конвейер успешно выполнен, все кадры итоговых WebP декодированы.
Первый вариант method=6 остановлен из-за длительного кодирования; итоговый
method=4 как в исходном конвейере.

Targeted: 3 suites / 50 tests PASS (первый прогон); добавлена регрессия смены позы после ошибки. Полный check: 250 suites / 3201 tests PASS,
typecheck/lint/format PASS. Export iOS/Android/web PASS.
Tests проверяют матрицу поз/мест, отклонённые позы, calm/reduce без WebP-загрузки,
PNG-фоллбек, poster→clip→error, геометрию, teardown после blur/background/unmount
и три одновременных плеера. Существующий тест празднования подтверждает 2200 мс.

Browser smoke, Chromium headless: normal/reduced/calm/decode-error — PASS,
runtime errors=0. На /schedule?scenario=empty WebP действительно меняет кадр
(сравнение двух буферов screenshot через SHA-256), при переходе на «Библиотека»
анимированный img удалён. Reduce/calm: 0 WebP-запросов. Принудительная ошибка
загрузки WebP: показан sleep-poster PNG, анимированный img удалён.
Скриншоты сравнивались в памяти, в git не сохранены.

Chromium сначала не запустился из-за libnspr4.so; install-deps не смог получить
root. Библиотеки скачаны и распакованы только в /tmp, системные файлы не менялись.
Точные восстановительные команды:

```sh
mkdir -p /tmp/som38-apt-lists/partial /tmp/som38-browser-libs
apt-get -o Dir::State::lists=/tmp/som38-apt-lists -o APT::Get::List-Cleanup=0 update
cd /tmp/som38-browser-libs
apt-get -o Dir::State::lists=/tmp/som38-apt-lists download libnspr4 libnss3 libatk1.0-0 libdbus-1-3 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libgbm1 libxkbcommon0 libasound2 libatspi2.0-0 libdrm2 libwayland-server0 libxi6
for package in /tmp/som38-browser-libs/*.deb; do dpkg-deb -x "$package" /tmp/som38-browser-libs/root; done
cd /home/node/repo
LD_LIBRARY_PATH=/tmp/som38-browser-libs/root/usr/lib/aarch64-linux-gnu:/tmp/som38-browser-libs/root/lib/aarch64-linux-gnu node app/review/17-som-38-mascot-clips-integration/web-smoke.cjs
```

Первый browser-прогон использовал canvas.drawImage: он рисовал default frame,
поэтому проверка движения заменена сравнением буферов снимков элемента.
Скорректирован glob перехвата WebP-запроса. Затем все четыре сценария прошли.
В промежуточном check поправлен путь CJS-harness без __dirname для repo ESLint;
финальный check выполнен после исправления.

## Открытая приёмка

- Нативное ощущение: **не проверено**.
- Native Release FPS нескольких клипов, память SDWebImage/Glide/GPU после ухода:
  **не проверено**. Synthetic teardown доказывает удаление Image и подписок,
  cachePolicy=none запрещает выбранный кеш; отсутствие удержания декодированных
  кадров в нативном процессе не заявляется.
- Visual parity 390×844 по темам/состояниям, устройства iOS/Android,
  screen readers/максимальный шрифт и одобрение владельца: **не проверено**.
- OPEN-QUESTIONS о calm-контекстах не закрыт. Новых мест/сценариев нет.
- ADR 0106 дополняет 0005/0060/0104. Автоматический CI на PR ещё не запускался
  во время локальных проверок; БД этой задачей не изменяется.
