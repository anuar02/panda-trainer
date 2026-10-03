# SOM-38 · Интегрировать утверждённую панду и Rive

Linear: https://linear.app/something-great/issue/SOM-38

## Цель

Добавить в приложение утверждённого маскота — красную панду с тёмно-коричневой
повязкой (`design-exploration/MASCOT-DECISION.md`).

## Критерии

- [ ] PNG-позы и лица из `prototype-fresh/assets/mascot/` через `expo-image`.
- [ ] Rive-риг через `rive-react-native`, файл
  `design-exploration/red-panda-rive-2026-09-29/exports/red-panda-v5.riv`.
  Пока риг не принят владельцем — по умолчанию показывать PNG; Rive за флагом.
  WebM-ролики в нативном приложении не использовать (ADR 0005).
- [ ] Места появления — как в `prototype-fresh`: приглашение, пустые состояния,
  празднование после тренировки. Не в повторяющейся работе журнала.
- [ ] Компонент маскота принимает проп `hidden` (или читает общий флаг
  «Спокойный интерфейс», если он уже есть в базовой ветке), чтобы SOM-39 мог его выключать.

## Источники

`design-exploration/MASCOT-DECISION.md`, `design-exploration/CLAUDE-RED-PANDA-HANDOFF.md`,
`docs/app/decisions/0005-mascot-motion.md`, `prototype-fresh/index.html`.

## Границы

Новый компонент в `app/src/ui/` (например `app/src/ui/mascot/`), ассеты в `app/assets/`,
точечные вставки в экраны приглашения, пустых состояний и празднования.
Не трогать: настройки доступности, анимации шторок и журнала (это SOM-39),
конструктор шаблонов и picker (SOM-50), схему Supabase.
