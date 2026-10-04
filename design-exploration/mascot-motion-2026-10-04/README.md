# Новые моменты панды для анимации (04.10.2026)

Кандидаты на одобрение владельца (SOM-38). В приложение не подключены.

| Момент | Источник | Файлы в `out/` |
| --- | --- | --- |
| front idle | Seedance 2.5 image-to-video, 1080p (выход 1440²), 4 с, без звука, старт = финал `keyframes/front-green.png` | `front-idle-raw.mp4`, `front-idle.webp`, `front-idle-poster.png`, `front-idle-contact.png`, `front-idle-check.png` |
| listen | то же, `prompt-listen.txt` | `listen-raw.mp4`, `listen.webp`, `listen-poster.png`, `listen-contact.png` |

Владелец решил 04.10.2026: этих двух роликов достаточно; think и shrug не генерировать,
празднование — одобренный `jump` из `../mascot-video-2026-09-28/`.

Кадры (PNG 320 px, 12 fps, 48 шт.) в git не входят; получить из mp4:

```bash
F=$(cd tools/higgsfield && node -p "require('ffmpeg-static')")
KEY="format=rgba,chromakey=0x00B140:0.13:0.06,despill=type=green:mix=0.6:expand=0.1,split[c][m];[m]alphaextract,erosion,erosion,erosion,gblur=sigma=0.8[a];[c][a]alphamerge"
$F -i out/listen-raw.mp4 -vf "$KEY,fps=12,scale=320:-2:flags=lanczos" out/listen-frames/%03d.png
```

Генерация: `tools/higgsfield/i2v.ts <keyframe> <prompt> <out.mp4> [duration] [resolution]`,
ключ `HF_CREDENTIALS` только в `tools/higgsfield/.env.local` (в git не попадает).
