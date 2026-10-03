## Что сделано

SOM-39: переключатель «Спокойный интерфейс» обеих ролей теперь сохраняется и предоставляет флаги для SOM-38. При крупном системном шрифте Today и журнал перестраивают тесные строки; поля ввода растут, нижние действия журнала доступны через прокрутку. Reanimated учитывает системное уменьшение движения.

| Критерий SOM-39                                                       | Статус                                                                                                                                                                                                                                                            |
| --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Calm mode в профиле, выключение маскота/празднований, hook для SOM-38 | **Сделано**: настройка по роли, AsyncStorage/reload, useCalmMode и useCelebrationsEnabled; существующие изображения Today/голоса скрываются. Сам маскот и ассеты не изменены; будущие потребители — SOM-38                                                        |
| AccessibilityInfo.isReduceMotionEnabled и Reanimated ReduceMotion     | **Сделано**: initial read + live events, защита от позднего чтения, System/Always в Sheet и System в withTiming. **Не проверено** на native устройствах                                                                                                           |
| Крупный текст до 200% в Today/журнале, render-тесты fontScale         | **Сделано**: render-тесты 134%/200%, адаптивная вёрстка, растущие поля, переносы dock. **Не проверено** отсутствие нативного clipping с клавиатурой/VoiceOver/TalkBack; **требует одобрения владельца**                                                           |
| Короткие Reanimated-анимации записи, шторок, переходов                | **Сделано**: 200/420/600 ms и prototype curves. **Не проверено** нативное движение. **Требует одобрения владельца** feedback записи: default JS использует класс, определённый только в instrument CSS; перенесён эффект с default curve, вопрос в OPEN-QUESTIONS |

Новые праздничные эффекты, компонент/ассеты SOM-38, picker/конструктор SOM-50, scheduling/data logic и схема Supabase не изменялись. Минимальные исходные ошибки type/lint в кнопке и billing checkpoint исправлены для обязательного зелёного check; бизнес-логика billing не изменена.

## Как проверить

- `cd app && npm run check`: **1220 tests / 124 suites**, typecheck/lint/format проходят.
- `cd app && npm run export`: **Android / iOS / web** проходят.
- `git diff --check`: проходит.
- Parity runner: **24 reference + 24 app captures**, 0 missing route/state comparisons, 0 runtime errors.
- Headless simulation: **8 случаев 134%/200% × normal/calm**, запись/редактирование/шторка, 0 runtime errors/горизонтальных выходов текста; обе роли сохраняют calm после reload.

[Отчёт, точные команды и ограничения](https://github.com/anuar02/panda-trainer/blob/28d1f6e187697ab744b52ebe24d024b666e4c390/app/review/som-39/README.md), [пары снимков](https://github.com/anuar02/panda-trainer/blob/28d1f6e187697ab744b52ebe24d024b666e4c390/app/review/som-39/parity/index.html), [large-text evidence](https://github.com/anuar02/panda-trainer/blob/28d1f6e187697ab744b52ebe24d024b666e4c390/app/review/som-39/large-text/report.json), [ADR 0063](https://github.com/anuar02/panda-trainer/blob/28d1f6e187697ab744b52ebe24d024b666e4c390/docs/app/decisions/0063-calm-mode-and-accessible-motion.md).

Web simulation подменяет Dimensions и масштабирует DOM-текст только для review; production bundle на диске не изменяется. Это не нативный системный fontScale. iOS/Android устройства, клавиатура, жесты и screen readers не проверены. Graft отсутствует; Linear прочитан, не изменялся.

## Паритет с прототипом

- [x] Web пары «эталон | приложение» четырёх экранов, темы/состояния: `app/review/som-39/parity/`
- [x] Sheet duration проверяется против spec-dark/light.json; остальные источники motion перечислены в ADR
- [x] Крупный текст: render + headless web simulation, есть calm/reload проверки
- [ ] Полный чек-лист UI-PARITY §6 по каждой паре, включая числа/цвета/иконки/состояния
- [ ] Native screenshots и проверка layout/движения на iOS/Android
- [ ] **Одобрение владельца**. Экраны не объявлены принятыми; статусы UI-PARITY не повышались

## Учёт изменений

- [x] CHANGELOG, ROADMAP checkpoint и реализация SOM-39 отмечены
- [x] ADR 0063 и OPEN-QUESTIONS для feedback записи
- [x] Воспроизводимый отчёт и ограничения сохранены в репозитории
