# Handoff: видео-анимации панды через Higgsfield

> Актуальная инструкция для Codex (генерация + встраивание): `CODEX-VIDEO-HANDOFF.md`.
> Этот файл — журнал сессий Claude.

28 сентября 2026. Предыдущая сессия подготовила пайплайн, но не сгенерировала ни одного
ролика: у подключённого коннектора Higgsfield 0 кредитов, а сеть контейнера не пускала
к `*.higgsfield.ai`. Пользователь добавляет свой API-ключ в переменные окружения.

## С чего начать

1. Проверь, что ключ есть, **не печатая его значение**:
   `env | grep -i higgsfield | sed 's/=.*/=<set>/'`.
   Ожидаемые имена: `HIGGSFIELD_API_KEY` и, если выдан, `HIGGSFIELD_API_SECRET`.
2. Проверь сеть: `curl -sS -o /dev/null -w "%{http_code}\n" https://platform.higgsfield.ai/`.
   Если `403 CONNECT` — домен не разрешён; попроси пользователя добавить `*.higgsfield.ai`
   в Network access окружения. Домен, с которого скачиваются готовые ролики (CDN),
   станет известен после первой генерации — его тоже может понадобиться разрешить.
3. Эндпоинты и формат авторизации API уточни по официальной документации Higgsfield —
   предыдущая сессия их не проверяла, не угадывай.
4. Альтернатива без ключа: если на аккаунте коннектора (`mcp__Higgsfield__*`) появились
   кредиты (`balance`), можно генерировать через него. Картинки загружаются через
   `media_upload` → PUT на `upload_url` → `media_confirm`.
5. Перед каждой генерацией проверяй цену (`get_cost: true` в коннекторе) и не запускай
   серию без согласия пользователя. Начать с **одной** позы — `wave`.

## Ветка и PR

Работа идёт в `claude/compassionate-bardeen-ngpls4`. Открыт PR
[anuar02/panda-trainer#10](https://github.com/anuar02/panda-trainer/pull/10)
(проход по UI и первый вход тренера). Если он смёрджен — начни ветку заново от `main`
(`git fetch origin main && git checkout -B claude/<ветка> origin/main`).
Этот handoff лежит в той же ветке.

## Что уже готово

- `make_keyframes.py` — кладёт 7 поз из `prototype-fresh/assets/mascot/` на ровный
  зелёный `#00B140` 1024×1024 (персонаж ~75 % высоты, снизу 10 % запаса).
  Запуск: `python3 make_keyframes.py` → `keyframes/<pose>-green.png`.
- `key_video.sh input.mp4 out` — вырезает зелёный и пишет:
  `out.webm` (VP9 с альфой: Chrome, Android, Firefox), `out.webp` (анимированный WebP,
  запасной вариант для Safari) и `out-poster.png` (первый кадр, для reduced motion).
  Проверено на синтетическом ролике: фон прозрачный, края чистые на светлом и тёмном.
- `ffmpeg` ставится так: `pip install imageio-ffmpeg`; скрипт находит бинарник сам.
  В нём есть `libvpx-vp9`, `libwebp_anim`, `apng`, `prores_ks`. HEVC с альфой для Safari
  собрать в Linux нельзя (нужен VideoToolbox на macOS) — поэтому WebP.

## План роликов

| Поза | Где в приложении | Движение (для промпта) |
|---|---|---|
| `wave` | первый вход тренера (`t-welcome`, шаг 0), приглашение клиента | машет поднятой лапой 2 раза, моргает, лёгкий наклон головы |
| `thumbs` | итог первого входа, «принято» | кивает, большой палец чуть вперёд |
| `jump` | итог тренировки | маленький прыжок и приземление, хвост качается |
| `clipboard` | пустая «Программа» у клиента | смотрит в планшет, переводит взгляд на зрителя, моргает |
| `sit` | ожидание, «занятий пока нет» | дыхание, моргание, хвост медленно качается |
| `sleep` | свободный день | дыхание во сне, ухо дёргается |
| `stretch` | прогресс, пустые состояния | тянется вверх и возвращается |

Петля: одна и та же картинка как `start_image` **и** `end_image`, длительность 5 с,
квадрат 1:1, без звука. Рекомендуемая модель — `minimax_h3_max` (768p, 12,5 кредита
за 5 с в коннекторе; поддерживает первый и последний кадр). Дешевле — `kling3_0_turbo`
(4,5 кредита за 3 с), но только первый кадр, петля может не сойтись. Дороже —
`flux_3_video` (1080p, 27,5 кредита). Если через прямой API модели называются иначе —
сверься с документацией.

Черновик промпта (для `wave`):

```
Flat 2D vector cartoon animation of the exact character from the start frame: a compact
red panda with a dark brown headband and an orange wristband. The panda waves its raised
paw twice in a friendly way, blinks once, head tilts slightly, then returns exactly to the
starting pose. Keep the character, proportions, colors and flat style identical to the
image: no shading, no gradients, no texture, no 3D, no new objects. Static camera, no zoom,
no camera movement. Solid flat chroma green background #00B140 for the whole video,
no shadows on the background. Seamless loop.
```

## Ограничения от пользователя и проекта

- Маскот — красная панда с тёмно-коричневой повязкой, оранжевый только напульсник
  (`design-exploration/MASCOT-DECISION.md`). Не менять внешний вид.
- Видео — для крупных моментов (первый вход, итог тренировки, пустые экраны).
  Маленький аватар и лица в интерфейсе остаются картинками / будущим риггом в Rive
  (`design-exploration/red-panda-rig-2026-09-26/`).
- Размер: целиться в ≤ 300 КБ на WebM 512 px; иначе снизить crf/размер.
- Во фронтенд-коде не писать комментарии (правило пользователя).
- Сообщения пользователю — по-русски; ключ никогда не выводить и не коммитить.

## Результат 29 сентября: первый ролик `wave`

Прямой API работает. Проверено по https://docs.higgsfield.ai/docs/models/minimax-h3/image-to-video.md:

- База `https://api.higgsfield.ai`, заголовок `Authorization: Key $HIGGSFIELD_API_KEY`
  (переменная уже содержит `id:secret`). Python `urllib` получает 403 из-за User-Agent —
  использовать `curl`.
- Загрузка: `POST /files/generate-upload-url` `{"content_type":"image/png"}` → PUT файла на
  `upload_url` с заголовками из `upload_headers` → `public_url` в запрос.
- Генерация: `POST /minimax/h3/image-to-video` с `prompt`, `image_url`, `end_image_url`
  (тот же URL для петли), `duration: 5`, `aspect_ratio: "1:1"`. Разрешение всегда `2K`,
  на выходе 1440×1440, 24 fps, 5,17 с, со звуком (скрипт его выкидывает).
- Цена: `POST /estimate/minimax/h3/image-to-video` с тем же телом — 7,28 кредита ≈ $0,455.
- Статус: `status_url` из ответа (`platform.higgsfield.ai/requests/<id>/status`), ~3 мин.
  Видео отдаётся с `d3u0tzju9qaucj.cloudfront.net`, сеть пускает.
- Другие модели с `end_image_url`: Seedance 2.0/2.5, Wan 3.0/2.7, PixVerse v6 (цены не проверены).

Итог в `out/`: `wave-raw.mp4` (исходник), `wave.webm` (~200 КБ, 512 px),
`wave.webp` (12 fps, 320 px, ~550 КБ — WebP тяжёлый, 256 px дают ~440 КБ),
`wave-poster.png`, `wave-contact.png` (раскадровка), `wave-alpha-check.png`
(светлый/кремовый/тёмный фон). Фон ролика держится на `#00AC40`, кей чистый, морда и
уши полностью непрозрачны. Шов петли: средняя разница первого и последнего кадра ≈ 1/255.
Промпт — `prompt-wave.txt`, тело запроса — `out/req-wave.json`.

## Остальные 6 поз (29 сентября)

`gen_pose.sh <pose>` загружает `keyframes/<pose>-green.png`, берёт `prompt-<pose>.txt` и
ставит задачу в MiniMax H3 (те же параметры, что у `wave`). Все 6 сгенерированы, шов петли
у всех ≈ 1/255, фон стабилен. Раскадровка — `out/all-contact.png`.

- `thumbs`, `clipboard`, `sit`, `sleep`, `stretch` — персонаж и стиль держатся.
- `jump` — после приземления хвост перескакивает с левой стороны на правую и обратно
  (`out/jump-mid.png`). Пользователь принял как есть, перегенерация не нужна.

## Белая кайма по контуру (29 сентября)

Пользователь заметил белую обводку у `wave`. Она есть уже в кадрах модели (светлый край
исходного PNG), хромакей её не трогает. `key_video.sh` теперь подрезает альфу на 3 px
(`ERODE`, по умолчанию 3) и слегка размывает край до уменьшения до 512 px. Все 7 поз
перекодированы из `*-raw.mp4`, новых генераций не было. Если кайма ещё видна —
`ERODE=4 bash key_video.sh out/<pose>-raw.mp4 out/<pose>`.

## Встраивание в прототип (после одобрения роликов)

1. Файлы положить в `prototype-fresh/assets/mascot/video/<pose>.webm|.webp|-poster.png`.
2. В `js/mascot.js` для контекстов `onboarding` / `celebration` рендерить
   `<video autoplay loop muted playsinline poster=...>` с `<source type="video/webm">`;
   для Safari — `<img src="<pose>.webp">`. `canPlayType('video/webm; codecs="vp9"')`
   в Safari может вернуть «да», но альфа там ненадёжна, поэтому выбор формата
   проверить в реальном Safari, а не только по `canPlayType`.
3. `prefers-reduced-motion` и «Спокойный интерфейс» — показывать только постер.
4. Сохранить `aria-hidden="true"`, размеры как у текущей `.onboarding-art`, без сдвига вёрстки.
5. Прогнать `cd prototype-fresh && node --test tests/*.test.cjs` и
   `review/instrument/verify.cjs` (копия с путём к playwright и
   `executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'`),
   сервер: `python3 -m http.server 4188 --bind 127.0.0.1` из `prototype-fresh`.
