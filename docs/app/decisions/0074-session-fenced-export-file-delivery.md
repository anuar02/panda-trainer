# 0074. Session-fenced server export and explicit file delivery

- Статус: реализовано технически; native/web/visual и owner acceptance открыты
- Дата: 03.10.2026
- Задача: SOM-41, UI пакет; ADR 0069 остаётся контрактом snapshot

## Решение

Фактические production account settings находятся в `/auth/account`.
TrainerProfileScreen пока показывает вымышленные данные: его entry ведёт в эти
настройки, не экспортирует demo fixtures. В существующий account layout добавлен
изолированный AccountExportControls только при authenticated owner workspace.
Существующие navigation, signout/switch и preferences действия сохраняются.
Root trainer layout, auth provider, client screens и deletion preflight не меняются.

Два шага: получить валидный snapshot и отдельным нажатием сохранить JSON.
Второе нажатие сохраняет user activation для web picker. JSON хранится только
в памяти controller; полный `JSON.stringify(validatedSnapshot)` сохраняет decimal
bigint strings, ISO/date/time, nulls и порядок массивов без проекции/конвертации.
Приватные заметки входят в файл; предупреждение и ограничение local pending видны.

Single flight, generation, account/workspace/token и auth subscription ограждают
ответы, файловые операции и сообщения. Scope меняется при новом token; logout
останавливает controller даже при последующем возврате в тот же аккаунт.
Сервис получает совместимый optional AbortSignal и передаёт его PostgREST.
Read ограничен 30 секундами; отмена очищает память и abort запрос. Cancel во время
файлового API ждёт завершения/cleanup, повтор не перекрывает текущую операцию.
Guard повторно проверяет сессию перед write/commit/share. Вызывающему нельзя
повторно использовать остановленный controller.

- Android: Expo StorageAccessFramework выбирает папку, создаёт уникальный JSON,
  записывает UTF-8. `saved` только после успешной записи; permission отказ — cancel.
  При ошибке/смене scope созданный частичный файл удаляется.
- iOS: уникальный account/workspace-scoped файл в cache, RN Share с file URL.
  `dismissedAction` — cancel; `sharedAction` — отдельный `shared`, без утверждения
  о сохранении получателем. Cache удаляется в finally, включая write/share failure.
- Web: showSaveFilePicker, UTF-8 Blob, write + close; только close подтверждает
  `saved`. AbortError — cancel; незавершённый writable abort в finally.
  Нет fire-and-forget download fallback: браузер без picker получает unsupported.
- Cleanup failure отдельный; экспорт не сохраняется в AsyncStorage и не логируется.

## API и зависимости

Используются [Expo FileSystem legacy](https://docs.expo.dev/versions/latest/sdk/filesystem-legacy/),
[RN Share](https://reactnative.dev/docs/share) и
[web picker](https://developer.mozilla.org/en-US/docs/Web/API/Window/showSaveFilePicker).
Сверены установленные декларации `expo-file-system/build/legacy/FileSystem.d.ts`.
expo-file-system 57.0.7 уже присутствовал в lock транзитивно. Прямое использование
требует прямой зависимости: `npx expo install expo-file-system` добавил только
root dependency package/lock, без новых downloaded package records. Другой
file API с Android SAF отсутствовал в прямых dependencies. expo-sharing не добавлен:
его void result не различает native cancel. Существующие версии Expo не менялись;
PR #34 и SQL исправления не дублируются.

## Ограничения

После передачи системе невозможно отозвать уже полученную внешним приложением
копию, а при process kill finally не гарантирован: cache может пережить crash.
Cleanup failure сообщается, но физическое удаление при отказе OS не гарантируется.
Web поддержка picker ограничена браузером/secure context; это явно unsupported.
Android SAF provider и iOS file URL share требуют проверки на реальных устройствах.
Экспорт не ack/purge pending и не разрешает deletion. Новые строки и entry требуют
визуального одобрения владельца; экран и SOM-41 не объявляются принятыми.
