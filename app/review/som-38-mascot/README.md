# SOM-38 · Маскот

03.10.2026. Реализация, не визуальная приёмка экранов или рига.

## Изменения

- Все 19 PNG-поз/лиц из prototype-fresh/assets/mascot скопированы без изменений.
- Общий Mascot использует expo-image, сохраняет геометрию вызова и принимает hidden.
- Существующие приглашения/пустые состояния сохраняют места. Принятое клиентское
  приглашение использует thumbs, как alias approved в прототипе.
- Rive 9.8.5: точный red-panda-v5.riv, выключенный по умолчанию флаг
  EXPO_PUBLIC_MASCOT_RIVE=true; native front/wave, PNG для остальных поз и web.
  Development build обязателен. Ошибка runtime возвращает PNG.
- Новое завершение журнала показывает jump на 2200 мс, не при открытии старого
  результата. hidden/системное уменьшение движения подавляют празднование.
- WebM отсутствует. Настройки, шторки, picker, schema не менялись.

## Команды проверки

Из корня: `graft map`, `graft ask "SOM-38 mascot panda invitation empty celebration Rive" --source`:
command not found; графа graft/ тоже нет. Контекст прочитан из документации и брифа.
Live Linear tools недоступны; удалённые записи не менялись.

Из app: `npx expo install expo-image expo-asset`, `npm install rive-react-native`.
Byte comparison скриптом Python: 19 PNG и Rive совпадают с источниками побайтно.

`npm run check` — PASS: typecheck, lint без warnings, format:check;
123 suites / 1208 tests passed.
`npm run export` — PASS: iOS, Android, web; Exported: dist.
Rive dependency выводит предупреждение о внутреннем expo-asset/resolveAssetSource
subpath; Metro использовал fallback file resolution, экспорт завершён.
Нативное воспроизведение этим не подтверждено.

Обязательная проверка обнаружила дефекты базовой ветки: Pressable callback
передавал неподдерживаемый hovered, тесты обращались к потенциально отсутствующим
элементам без сужения, billing JSX содержал literal whitespace. Минимальные
исправления включены только для прохождения общего check, без изменения сценариев.

## Что не проверено

- iOS/Android development build, совместимость нового RN 0.86 с Rive native runtime,
  прозрачность и воспроизведение рига, Expo Go не поддерживает Rive.
- Пары снимков 390×844, все темы и состояния, checklist UI-PARITY §6.
- Confetti и анимация празднования прототипа: данный пакет добавляет только PNG.
- Визуальная приёмка владельца и одобрение рисунка Rive.
- Общий спокойный интерфейс SOM-39: компонентный hidden готов, настройки вне scope.

Существующий маскот лица в кнопке голоса журнала не изменялся: этот пакет
не добавляет маскота в повторяющуюся работу журнала.

## Coordinator review — 2026-10-03

Approved-state onboarding now uses the prototype thumbs pose. Small shared Button
type correction and explicit existence guards in two billing tests unblock the
base branch check; these are coordinator-approved integration fixes outside the
mascot brief. The guards match the concurrent billing PR to preserve both changes.
Native devices and owner acceptance remain unverified.
