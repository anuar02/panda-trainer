# Codex: видео-анимации панды — генерация и встраивание в прототип

29 сентября 2026. Инструкция для Codex. Всё, что ниже, проверено вживую, кроме раздела 3
(встраивание) — это план, его ещё никто не делал.

Контекст проекта:
- Маскот — красная панда с тёмно-коричневой повязкой, оранжевый только напульсник.
  Внешний вид не менять (`design-exploration/MASCOT-DECISION.md`).
- Видео — только для крупных моментов (первый вход, итог тренировки, пустые экраны).
  Лица (`Mascot.face`) и маленькие аватары остаются картинками.
- Во фронтенд-коде (`prototype-fresh/js`, `css`) **не писать комментарии** — правило
  пользователя. Сообщения пользователю — по-русски.
- API-ключ никогда не печатать и не коммитить.

Всё лежит в `design-exploration/mascot-video-2026-09-28/`:

| Файл | Что это |
|---|---|
| `make_keyframes.py` | 7 поз из `prototype-fresh/assets/mascot/<pose>.png` → `keyframes/<pose>-green.png` (1024², фон `#00B140`) |
| `prompt-<pose>.txt` | промпты, по которым сделаны текущие ролики |
| `gen_pose.sh <pose>` | загрузка кадра + постановка задачи в Higgsfield |
| `key_video.sh in.mp4 out` | вырезает зелёный → `out.webm`, `out.webp`, `out-poster.png` |
| `out/<pose>-raw.mp4` | исходники от Higgsfield (1440², 24 fps, 5,17 с, со звуком) |
| `out/<pose>.webm/.webp/-poster.png` | готовые файлы для прототипа |
| `out/all-contact.png`, `out/<pose>-contact.png` | раскадровки для проверки |

## 1. Текущее состояние

Готовы и одобрены пользователем все 7 поз: `wave`, `thumbs`, `jump`, `clipboard`, `sit`,
`sleep`, `stretch`. У `jump` хвост после приземления перескакивает на другую сторону —
пользователь сказал «пойдёт», **не перегенерировать**.

| Поза | WebM 512 px | WebP 320 px 12 fps |
|---|---|---|
| wave | 201 КБ | 564 КБ |
| thumbs | 140 КБ | 516 КБ |
| jump | 246 КБ | 495 КБ |
| clipboard | 119 КБ | 507 КБ |
| sit | 135 КБ | 568 КБ |
| sleep | 86 КБ | 388 КБ |
| stretch | 129 КБ | 493 КБ |

Шов петли у всех ≈ 1/255 (первый и последний кадр совпадают). Прозрачность вручную
проверена только у `wave` (`out/wave-alpha-check.png`); у остальных — проверь так же
(шаг 2.5), прежде чем встраивать.

Новые ролики генерировать **только** если пользователь попросит (новая поза, переделка).
Каждая генерация стоит денег — перед запуском назови цену и дождись «да».

## 2. Как сделать новый ролик

### 2.1 Окружение

```bash
cd design-exploration/mascot-video-2026-09-28
pip install pillow imageio-ffmpeg          # ffmpeg берётся из imageio-ffmpeg
env | grep -i higgsfield | sed 's/=.*/=<set>/'   # ключ есть? значение не печатать
```

- `HIGGSFIELD_API_KEY` содержит строку вида `id:secret` целиком — отдельный секрет не нужен.
- Сеть должна пускать `api.higgsfield.ai`, `platform.higgsfield.ai`,
  `*.s3.amazonaws.com` (загрузка кадра) и `d3u0tzju9qaucj.cloudfront.net` (скачивание видео).
- Ходить в API **только через `curl`**. Python `urllib` получает 403 (блок по User-Agent).
- Коннектор `mcp__Higgsfield__*` не использовать — на его аккаунте 0 кредитов.

### 2.2 Кадр и промпт

1. Новая поза: положи плоский PNG в `prototype-fresh/assets/mascot/<pose>.png`, добавь её в
   список в `make_keyframes.py`, запусти `python3 make_keyframes.py`.
2. Напиши `prompt-<pose>.txt`. Шаблон (меняется только середина):

```
Flat 2D vector cartoon animation of the exact character from the start frame: a compact red
panda with a dark brown headband and an orange wristband. <ДВИЖЕНИЕ>, then returns exactly to
the starting pose. Keep the character, proportions, colors and flat style identical to the
image: no shading, no gradients, no texture, no 3D, no new objects. Static camera, no zoom, no
camera movement. Solid flat chroma green background #00B140 for the whole video, no shadows on
the background. Seamless loop.
```

Движение описывай коротко и физически (что делает лапа/голова/хвост). Если модель путает
анатомию, добавь явный запрет, например «the tail stays on the left side the whole time».

### 2.3 Цена (бесплатно)

```bash
curl -sS -X POST https://api.higgsfield.ai/estimate/minimax/h3/image-to-video \
  -H "Authorization: Key $HIGGSFIELD_API_KEY" -H "Content-Type: application/json" \
  -d '{"prompt":"x","image_url":"https://example.com/a.png","end_image_url":"https://example.com/a.png","duration":5,"aspect_ratio":"1:1"}'
```

29.09.2026: 7,28 кредита ≈ $0,455 за 5 с. Покажи цену пользователю и дождись согласия.

### 2.4 Генерация

```bash
./gen_pose.sh <pose>        # печатает "<pose> queued", пишет out/req-<pose>.json и out/submit-<pose>.json
```

Что делает скрипт (если придётся повторить руками):
1. `POST /files/generate-upload-url` `{"content_type":"image/png"}` → `upload_url`,
   `public_url`, `upload_headers`.
2. `PUT` файла на `upload_url` с заголовками `Content-Type: image/png` и
   `x-amz-tagging: retention=temporary`.
3. `POST /minimax/h3/image-to-video` с телом
   `{"prompt", "image_url": public_url, "end_image_url": public_url, "duration": 5, "aspect_ratio": "1:1"}`.
   Одинаковые первый и последний кадр дают петлю. Разрешение у H3 всегда `2K` (выход 1440²).

Опрос статуса и скачивание:

```bash
S=$(python3 -c 'import json;print(json.load(open("out/submit-<pose>.json"))["status_url"])')
curl -sS "$S" -H "Authorization: Key $HIGGSFIELD_API_KEY" -o out/status-<pose>.json
# status: queued | in_progress | completed | failed | nsfw | canceled; опрашивать раз в 10–15 с, обычно ~3 мин
V=$(python3 -c 'import json;print(json.load(open("out/status-<pose>.json"))["video"]["url"])')
curl -sS "$V" -o out/<pose>-raw.mp4
```

Ссылка на видео живёт ≥ 7 дней — скачивай сразу. Failed/nsfw/canceled не списываются.
Документация: https://docs.higgsfield.ai/docs/models/minimax-h3/image-to-video.md.
Другие модели с `end_image_url` (если H3 не справится): Seedance 2.0/2.5, Wan 3.0/2.7,
PixVerse v6 — цены не проверялись, сначала `/estimate/<endpoint>`.

### 2.5 Кеинг и проверка

```bash
bash key_video.sh out/<pose>-raw.mp4 out/<pose>     # ~3 мин на позу, WebP — самая долгая часть
```

Проверь перед тем как отдавать:
- Раскадровка: `ffmpeg -i out/<pose>-raw.mp4 -vf "select='not(mod(n\,20))',scale=200:200,tile=6x1" -frames:v 1 out/<pose>-contact.png` —
  персонаж не меняется, нет новых предметов, стиль плоский.
- Прозрачность: наложи кадры `out/<pose>.webm` (декодировать `-c:v libvpx-vp9`, иначе альфа
  потеряется) на белый, `#FAF4EB` и `#18181C` — края без зелёной каймы, морда/уши непрозрачные.
- Шов: средняя разница первого и последнего кадра исходника ≈ 1/255.
- WebM ≤ 300 КБ. WebP сейчас 390–570 КБ — это известный компромисс для Safari.
- Покажи раскадровку пользователю; «брак» решает пользователь, не ты.

## 3. Встраивание в прототип (не сделано — это твоя задача)

### 3.1 Как сейчас устроен маскот

`prototype-fresh/js/mascot.js` → `Mascot.render(pose, context)` возвращает:

```html
<span class="mascot panda <box>" data-mascot="<pose>" data-motion="<motion|none>" aria-hidden="true">
  <span class="panda__glow"></span><span class="panda__shadow"></span>
  <span class="panda__body"><img class="panda__img" src="assets/mascot/<pose>.png" ...></span>[zzz для sleep]
</span>
```

- `context`: `onboarding` → `.onboarding-art`, `hero` → `.panda-hero`, `inline` → `.panda-inline`,
  остальное (`empty`) → `.client-empty__mascot`. `celebration` — только в режиме instrument
  (`js/fx.js:22`), слой живёт 2,2 с.
- «Спокойный интерфейс»: `Store.preferences.calm()`. В нём `render` возвращает панду только для
  `empty`/`onboarding` и ставит `data-motion="none"`.
- CSS-анимации позы: `css/fresh.css:598-606` по `data-motion` на `.panda__body`.
  `@media (prefers-reduced-motion: reduce)` в `css/fresh.css:808` глушит анимации.
- `.panda.is-poked .panda__img` — анимация «тычка» (`css/fresh.css:622`).
- Размеры коробок: `css/fresh.css:522` (`.onboarding-art` 220×240), `:527`
  (`.client-empty__mascot` 170²), `css/welcome.css:12,34-37`.
- Где вызывается: `js/screens/welcome.js:41,104` (onboarding wave/thumbs),
  `js/screens/client.js:56` (hero), `:142` (onboarding invite/no_session/accepted),
  `:278` (client-empty), `js/ui.js:90` (empty sit/sleep), `js/screens/trainer.js:724`
  (inbox sit), `js/fx.js:22` (celebration jump), `js/voice.js:465` (inline — **не трогать**,
  там свои анимации состояний `css/fresh.css:1241-1246`).

### 3.2 Что сделать

1. **Обрезать поля.** В ролике персонаж занимает ~75 % высоты квадрата (15 % сверху,
   10 % снизу), а PNG в `assets/mascot/` обрезаны по контуру. Без обрезки видео-панда будет
   заметно мельче картинки. Посчитай общий bbox альфы по всем кадрам каждой позы и добавь
   `crop=` в начало фильтра в `key_video.sh` (или отдельный шаг), пересобери файлы. Сверь
   пропорции с `POSES[pose].w/h` в `mascot.js`.
2. **Файлы:** `prototype-fresh/assets/mascot/video/<pose>.webm`, `<pose>.webp`,
   `<pose>-poster.png` (7 поз).
3. **`mascot.js`:** для `onboarding`, `celebration`, `empty` и `hero` рендерить ролик вместо
   `<img>`, внутри того же `.panda__body`:
   - Chrome/Firefox/Android: `<video class="panda__img" autoplay loop muted playsinline
     preload="auto" poster="…-poster.png" width height aria-hidden="true"><source
     src="….webm" type="video/webm"></video>`.
   - Safari (включая iOS): `<img class="panda__img" src="….webp">`. `canPlayType` в Safari
     может вернуть «да» для VP9, но альфа там ненадёжна — выбирать по движку (WebKit без
     Chromium), и **проверить в настоящем Safari**, не только по коду.
   - `calm` или `matchMedia('(prefers-reduced-motion: reduce)')` → только
     `<img class="panda__img" src="…-poster.png">`.
   - Поставить `data-motion="none"` на `.panda`, когда показывается видео, иначе CSS-анимация
     позы наложится на движение в ролике. Хвостики `zzz` у `sleep` оставить.
   - Позы через `LEGACY` (`welcome`→`wave`, `approved`→`thumbs`, `waiting`→`sit`,
     `reading`→`clipboard`) уже нормализуются — видео брать по итоговой позе. Для `front`,
     `side`, `three-quarter` видео нет — оставить PNG.
   - `aria-hidden="true"`, `alt=""`, размеры коробки и вёрстка — без изменений (без CLS).
   - Никаких комментариев в коде. Функциональный стиль, как в остальном `mascot.js`.
4. **Проверки:**
   ```bash
   cd prototype-fresh && node --test tests/*.test.cjs
   python3 -m http.server 4188 --bind 127.0.0.1    # из prototype-fresh, в фоне
   BASE_URL=http://127.0.0.1:4188 node review/instrument/verify.cjs
   ```
   В облачном контейнере Claude verify требовал копию с путём к playwright и
   `executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'`; у тебя окружение
   может отличаться.
   Сделай скриншоты: первый вход тренера (`welcome` шаг 0 и итог), приглашение клиента,
   пустой экран клиента, празднование в instrument — на светлой и тёмной теме, плюс с
   `?calm=1` и с эмуляцией `prefers-reduced-motion`. Убедись, что видео играет, фон прозрачный,
   нет сдвига вёрстки и нет ошибок в консоли.
5. Итог и скриншоты — пользователю по-русски. Коммиты и PR —
   [anuar02/panda-trainer#12](https://github.com/anuar02/panda-trainer/pull/12) или новая
   ветка от `main`, если он смёрджен.
