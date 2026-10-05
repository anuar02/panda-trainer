# 0110. Анимированные стили идут мимо NativeWind

- Статус: принято; проверка на устройстве и одобрение владельца открыты
- Дата: 05.10.2026
- Задача: SOM-39 (регрессия после #77/#78)

## Проблема

После #77/#78 на iPhone пропали отступы, `flex-row`, фоны кнопок и карточек
почти на всех экранах. `cssInterop` был зарегистрирован прямо на `Animated.View`
и `Animated.createAnimatedComponent(Pressable)`, а результат `useAnimatedStyle`
передавался в тот же `style`, что и `className`. В такой комбинации NativeWind
4.2 / css-interop 0.2 отбрасывает все стили из `className`. В Jest Reanimated
замокан (`Animated.View === View`), поэтому тесты регрессию не видели.

## Решение

`src/ui/motion.tsx` экспортирует `AnimatedView` и `AnimatedPressableView`.
`cssInterop` регистрируется только на них: NativeWind превращает `className` в
`style`, а анимированный стиль передаётся отдельным пропом `animatedStyle` и
соединяется со статическим только внутри, при передаче в Reanimated.
Регистрация `cssInterop` на сырых Animated-компонентах удалена.

Правило: компонент Reanimated, которому может прийти `className`, рендерится
через `AnimatedView`/`AnimatedPressableView`, а анимированный стиль — через
`animatedStyle`. `Animated.View` без `className` остаётся как есть.

## Альтернативы и последствия

Классы NativeWind `active:`/`transition-*` вместо Reanimated не повторяют
кривые и прерывания прототипа. Разделение на внешний Animated.View и
внутренний Pressable потребовало бы переноса layout-классов между слоями, как
в MotionBlock, во всех местах. Обёртка сохраняет вызовы и токены motion.tsx.
Проверено в iOS-симуляторе (Debug): кнопки входа снова со стилями; Release на
iPhone — после сборки.
