# 0104. CSS-движение PNG-панды через Reanimated

- Дата: 04.10.2026
- Статус: реализовано; native и визуальная приёмка владельца открыты
- Задача: SOM-38
- Продолжает [0005](0005-mascot-motion.md) и [0060](0060-mascot-png-and-gated-rive.md)

Release на iPhone показывал статичный PNG: экспериментальный Rive выключен,
а в prototype-fresh PNG уже оживает через CSS. Дополнительная библиотека не нужна.

`keyframes.ts` хранит точные проценты и отдельные property tracks из fresh.css.
Один линейный shared value на слой задаёт время; `useAnimatedStyle` на UI-потоке
применяет заданный CSS bezier отдельно к каждому интервалу каждой property.
Это сохраняет независимые opacity stops у pandaIn/zFloat/fxPanda и overshoot
cubic-bezier(.34,1.56,.64,1). `withSpring` не используется. `withRepeat` задаёт
бесконечные циклы, `cancelAnimation` останавливает их при уходе с экрана,
смене предпочтений и размонтировании. Вход повторяется при возвращении focus.
Никакого setState на кадр: состояние используется только для focus, размеров
празднования, генерации частиц и его таймера 2200 мс.

Body и poke имеют origin 50% 100%; остальные слои — центр. Poke остаётся
отдельным слоем изображения под циклическим body, чтобы движения складывались.
Glow/shadow реализованы SVG radial gradients из уже установленного react-native-svg.
Sleep z — декоративный SVG-текст, скрытый от accessibility вместе с пандой.
Web использует тот же Reanimated PNG-путь. Rive-модуль, флаг и front/wave selection
сохраняются; PNG-движение применяется при выборе обычного PNG-пути.

Reduce motion оставляет статичный PNG; calm никогда не запускает движение.
Явные context=empty/onboarding сохраняют PNG в calm, другие скрываются.
Неуказанный контекст сохраняет старое скрытие: карта вызовов не угадывается,
вопрос записан в OPEN-QUESTIONS. Экранные вызовы не меняются.

Празднование сохраняет ADR 0060: новый finished edge, 2200 мс, PNG jump,
170×200 и bottom=170. Добавлены fxPanda/fxFade, 34 confetti и 12 spark с CSS
таймингами и геометрией. Spark добавлен к burst в соответствии с брифом SOM-38;
в самом прототипе `Fx.sparkle(el)` — отдельная реакция действия. Привязка spark
к другим действиям вне mascot здесь не меняется.

Альтернативы: только Rive не покрывает позы; CSS только на web не исправляет
Release; JS-frame timers создают лишнюю нагрузку. Выбран UI-поток Reanimated.
Тесты проверяют source parity и lifecycle, но не доказывают FPS на устройстве.
[Точные значения и проверки](../../../app/review/13-som-38-mascot-motion/README.md).
