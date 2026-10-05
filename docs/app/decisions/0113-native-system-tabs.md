# 0113. Системная панель вкладок вместо самописного Liquid Glass

- **Статус:** Решение владельца 05.10.2026; реализация выполнена, native-проверка и приёмка открыты
- **Дата:** 05.10.2026
- **Задача:** SOM-39, бриф 21 после SOM-26 / #88
- **Заменяет:** [ADR 0111](0111-floating-liquid-glass-tabbar.md); политику предзагрузки вкладок [ADR 0105](0105-navigation-motion-policy.md)

## Решение

Используем уже установленный `expo-router/unstable-native-tabs` версии 57.0.24.
На iOS 26 настоящий UITabBar отвечает за Liquid Glass, линзу, протягивание,
пружинное завершение и `minimizeBehavior="onScrollDown"`. На iOS ниже 26 —
системная панель без нового стекла, Android — native Material, web — штатный
адаптер NativeTabs (Radix). Самописные GlassView, индикатор и tabPop удалены
из навигации; общий motion.tsx и вход содержимого экранов не меняются.

Пять маршрутов и их русские подписи сохраняются для каждой роли. Иконки панели:
SF Symbols на iOS (house, calendar, person.2, square.stack, person.crop.circle;
у клиента dumbbell, list.bullet, chart.line.uptrend.xyaxis), Material equivalents
через `md` на Android. Это исключение из SVG-паритета: системные символы имеют
правильный tint и масштабирование, не требуют растрирования SVG. Web-адаптер
пакета показывает подписи и бейджи, собственные иконки в него не добавляем.
Акцент берётся из темы; `unstable_nativeProps.colorScheme` установлен в схему
приложения, включая ручную смену темы. Это публичный нестабильный адаптер
react-native-screens, не приватный UIKit API. `disableTransparentOnScrollEdge`
сохраняет видимость панели на краю списка. Геометрию/blur не имитируем.

Бейдж «Сегодня» — число ожидающих ответа тренера pending/counter запросов из
существующего SchedulingDemoProvider, того же источника, что /inbox и Сегодня.
Показывается только после успешной гидратации при N > 0. Нулевой, неизвестный,
отрицательный и нецелый счётчик не создаёт Badge/badgeValue. Production workspace
экраны остаются отдельными stack-маршрутами: их данные не подменяются демо-счётчиком.

## Ограничение отдельной «+»

`role="search"` допускает иконку plus, но остаётся настоящей вкладкой с системным
заголовком. `NativeTabNavigationEventMap.tabPress.canPreventDefault` равен false.
В установленной версии disabled сообщает isPrevented и блокирует native-selection,
но требует маршрут, а программная навигация всё ещё может открыть его.
Независимого action item, не представляющего экран, в NativeTabs нет.

Не создаём фиктивный шестой экран, disabled-поиск с неверной семантикой
доступности или redirect после первого кадра. Применяем прямо разрешённый
владельцем fallback: пять вкладок, «+» остаётся в шапке Сегодня с существующим
вызовом создания. У клиента дополнительной кнопки нет. Решение о дальнейшем
отдельном действии остаётся владельцу; критерий брифа покрыт документированным
ограничением, наличие отдельной «+» не заявляется.

## Insets, dock и предзагрузка

Автоматические content insets NativeTabs не отключаются: iOS корректирует первый
ScrollView, Android оборачивает сцену в safe-area снизу, web размещает свои сцены.
Старый TabBarLayoutProvider, оценка высоты, keyboard/layout listeners удалены.
`useTabBarLayout` оставлен как совместимый hook и возвращает ноль: ручное
резервирование системного bottom inset больше не применяется.

### Исправление #89: явный основной scroll target (05.10.2026)

Первоначальный бриф 21 не разрешал менять header-first presentation; его
[исторический отчёт](../../../app/review/21-som-39-native-liquid-glass-tabs/README.md)
сохраняет обнаруженное ограничение и временную защиту measured inset.
Следующий бриф SOM-39 явно разрешил техническую регистрацию основных списков.
Подход: [ADR 0114](0114-native-tab-scroll-target-registration.md).
Navigation adapter `NativeTabScrollView` оборачивает только основной вертикальный
MotionScrollView в публичный `ScrollViewMarker` из `react-native-screens/experimental`
на iOS внутри NativeTabsInsetsProvider и задаёт `contentInsetAdjustmentBehavior="automatic"`.
На Android/web и за пределами NativeTabs возвращается прежний MotionScrollView
без дополнительных view/insets. Горизонтальный список Library не отмечается;
шторки, fixed header, «+», dock и motion-политика не меняются. Marker занимает
оставшееся место (`flex: 1`), непосредственный native-потомок — RN ScrollView:
EntranceContext.Provider в MotionScrollView не создаёт UIView.

Маркер не ищет список через шапку: `RNSScrollViewMarkerComponentView` разрешает
непосредственный UIScrollView/RCTScrollViewComponentView и на willMoveToWindow
поднимается к первому `registerDescendantScrollView:fromMarker:` ancestor.
`RNSTabsScreenComponentView` вызывает setContentScrollView:forEdge:All и сохраняет
weak cache. `RNSTabsScreenViewController.findContentScrollView` через
RNSContainerItemSupport выбирает cache раньше nested container и header-first
heuristic. Automatic inset задан явно, потому что старый RNSScrollViewHelper
всё ещё обходит только первую цепочку. Удалён временный measured Today padding;
существующие внутренние отступы содержимого остаются.

Native-реализация marker и регистрация tabs требуют RNS_GAMMA_ENABLED. Уже
подключённый expo-router plugin устанавливает ENV['RNS_GAMMA_ENABLED'] ||= '1'
при iOS prebuild; новые dependencies/config не нужны. Stale native-клиент,
собранный без Gamma, требует пересборки. JS export не доказывает эту конфигурацию
установленного бинарника. Marker регистрируется при входе в window, сбрасывает
флаг при выходе, не отслеживает замену direct child в том же window. Adapter
держит один ScrollView постоянного типа; loading Today размонтирует marker целиком,
а переход demo/server меняет presentation вместе со списком. Cache weak; явного
unregister API нет. Реальные порядок Fabric mount/unmount, UIKit cache и
эффекты автоматических insets при fixed header проверяются на устройстве.

[Новый отчёт](../../../app/review/01-som-39-native-liquid-glass-tabs-fix/README.md)
содержит таблицу всех десяти вкладок и отдельные результаты проверок; наличие
props и synthetic tests не заявляется доказанным сворачиванием на iPhone.

Неизменённый WorkoutDock тренера на iOS 26 помещён в BottomAccessory и следует
системной панели. На Android/web/iOS <26 этот API отсутствует; dock находится
отдельным нижним sibling в обычном layout с bottom safe area, после NativeTabs.
Это сохраняет доступ к активному журналу без overlay и скрытия последней строки,
но размещение dock под панелью на этих платформах требует визуального одобрения.
Native BottomAccessory создаётся только после гидратации при наличии незавершённого
журнала с существующим session, по той же выборке, что внутри WorkoutDock; пустой
accessory не создаётся. Portable dock добавляет bottom safe area только при
ненулевом измеренном содержимом; клиент dock не получает.

NativeTabs монтирует все видимые native-сцены: старые idle-slot navigation.preload
и warmed set удалены. Существующая подготовка данных не добавляется, сетевых
ожиданий перед выбором вкладки нет. Цена eager mount, первый кадр, память и FPS
на устройстве не измерены; автоматический тест не доказывает отсутствие задержки.
Web использует штатное поведение адаптера. Остальные положения ADR 0105 сохранены.

Reduce Motion контролируется ОС для UITabBar; calm сохраняет свою политику для
содержимого экранов. Calm не переопределяет системные настройки анимации UIKit:
публичного индивидуального выключателя Liquid Glass в NativeTabs нет.

## Проверка API и последствия

Сверены `node_modules/expo-router/build/native-tabs/types.d.ts`,
`common/elements.d.ts`, `NativeBottomTabsNavigator.js`, `NativeTabsView.ios.js`,
`NativeTabsView.android.js`, `NativeTabsView.web.js`, `NativeTabsView.shared.js` и
`react-native-screens/src/components/tabs/host/TabsHost.types.ts`.
[Официальный API SDK 57](https://docs.expo.dev/versions/v57.0.0/sdk/router/native-tabs/),
[руководство](https://docs.expo.dev/router/advanced/native-tabs/).
Новая зависимость не добавлена; expo-glass-effect не используется навигацией,
удаление зависимости вне границ этого брифа.

Нужны iOS 26: drag/линза/сворачивание, последний элемент списков, обе темы,
масштаб текста, VoiceOver, keyboard, шторки, активный dock и Reduce Motion/calm;
Android и старый iOS также требуют устройства. Native-сборки и владельческая
приёмка не выполнены в контейнере. [Отчёт](../../../app/review/21-som-39-native-liquid-glass-tabs/README.md).
