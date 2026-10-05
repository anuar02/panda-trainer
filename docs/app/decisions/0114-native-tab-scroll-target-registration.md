# 0114. Явная регистрация основных списков NativeTabs

- **Статус:** Техническая интеграция разрешена брифом SOM-39; native/приёмка открыты
- **Дата:** 05.10.2026
- **Задача:** SOM-39, исправление #89 после #90
- **Дополняет:** [ADR 0113](0113-native-system-tabs.md)

Header-first presentation не соответствует эвристике RNSScrollViewFinder:
она проходит только первую дочернюю цепочку. Перестановка шапки в список
изменила бы фиксированную шапку и поведение экранов.

Выбран отдельный navigation adapter NativeTabScrollView: только на iOS внутри
NativeTabs он оборачивает существующий MotionScrollView публичным
ScrollViewMarker из react-native-screens/experimental и явно включает automatic
content inset. MotionScrollView остаётся прежним, его Context.Provider не создаёт
native View между marker и RN ScrollView. Горизонтальные списки и шторки не
регистрируются. На других платформах и stack-маршрутах adapter прозрачен.

Убрана временная защита measured bottom-padding Today: сочетание ручного
отступа с automatic inset дублировало бы системное пространство. Внутренние
отступы списков, классы NativeWind, animatedStyle и motion timings сохранены.

Выбор проверен по установленным expo-router 57.0.24 / react-native-screens 4.26.2.
Native путь, Gamma/Fabric и lifecycle-ограничения перечислены в ADR 0113 и
[отчёте](../../../app/review/01-som-39-native-liquid-glass-tabs-fix/README.md).
Jest проверяет реальные presentation-деревья с подменой marker host; export
проверяет бандлы. Они не доказывают UIKit сворачивание или native insets.
