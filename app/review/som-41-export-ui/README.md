# SOM-41 · UI серверного экспорта тренера

03.10.2026. База `fix/som-50-template-picker`, исходный commit `9d1802a`.
Ветка `agent/som-41-export-ui`. Только UI пакет SOM-41; удаление, local pending
export/ack, политика приватности и пилот не завершены и не подключены.
[ADR 0073](../../../docs/app/decisions/0073-session-fenced-export-file-delivery.md).

## Реализовано

Демо trainer profile сохраняет прежние действия и ведёт из export entry в
`/auth/account`. Это существующие authenticated workspace settings: новый control
внутри прежнего layout показан только владельцу своего workspace; demo/client
fixtures не используются для файла. Account signout/switch/navigation сохранены.

Controller получает текущие userId/workspaceId/token. Сначала read-only
`loadAccountExport`, затем отдельное нажатие «Сохранить JSON». JSON только в памяти,
без AsyncStorage/logging. Все typed service/file ошибки локализованы. Single flight,
generation, auth subscription, optional PostgREST AbortSignal, read timeout 30s
и проверки scope/session вокруг await не дают старому ответу стать новым файлом или
сообщением успеха. Cancel очищает snapshot; во время file API ждёт cleanup, retry
не перекрывает предыдущий file operation. После logout instance остановлен.

Валидатор полного snapshot применяется перед `JSON.stringify`, без selected-field
проекций. Bigint остаётся decimal string; ISO microseconds/date/time/nulls и UUID
array order сохраняются. UTF-8: native explicit EncodingType.UTF8, web Blob.

Android SAF сохраняет в выбранную папку; `saved` после успешной записи.
iOS RN Share использует уникальный account/workspace-scoped cache file; dismissed
отдельно от shared. Shared означает результат передачи OS, не подтверждённое
сохранение получателем. Web picker write + close подтверждает запись; AbortError
и unsupported различаются. Незавершённый web writer abort и native temp/partial
file cleanup выполняются в finally, cleanup failure виден отдельно.

Интерфейс явно сообщает об отсутствии pending с устройств и о том, что серверный
snapshot не разрешает удаление аккаунта. Есть предупреждение о private notes.

## Команды и результаты

- `command -v graft`, `ls graft`: недоступны (exit 1/2); граф отсутствует.
  Использованы реальные пути и текущие source/review contracts.
- Callable Linear tools отсутствуют: live project/issue/dependencies не прочитаны.
  Бриф и DELIVERY-PLAN использованы как локальные источники; Linear не менялся.
- `cd app && npx expo install expo-file-system`: exit 0. Добавлена прямая ссылка
  на уже locked 57.0.7, только одна root строка в package/lock. Другие версии Expo
  и package records не менялись; SQL/Expo patch drift PR #34 не дублировался.
- Targeted controller/file/profile tests: 35 tests / 3 suites PASS в промежуточном
  запуске. Первый дополнительный native wiring mock падал из-за eager spread RN
  exports; mock заменён spy на Share. Это ошибка тестового harness, не native проверка.
- `cd app && npm run check`: exit 0; TypeScript, ESLint, Prettier PASS;
  1511 tests / 150 suites PASS.
- `cd app && npm run typecheck`: exit 0 после последней правки bounded auth read.
- `cd app && npm test -- --runTestsByPath tests/account-export/domain.test.ts tests/account-export/service.test.ts tests/account-export/controller.test.ts tests/account-export/controls.test.tsx tests/account-export/file.test.ts tests/account-export/native-wiring.test.ts tests/account-export/profile-entry.test.tsx`:
  exit 0; 90 tests / 7 suites PASS.
- `git diff --check`: exit 0. Проверка новых modules на any/AsyncStorage/console — совпадений нет.
- `cd app && npm run export`: exit 0; static iOS/Android/web bundles и 70 web routes,
  output `dist` (не коммитится). Metro сообщил два предупреждения
  `expo-asset/build/resolveAssetSource` exports fallback; зависимости Expo не исправлялись.
  Это static build, не browser/native runtime.

Fixtures: `app/tests/account-export/snapshot.json` (все данные вымышленные),
существующие domain/service tests и новые controller/controls/file/native-wiring/
profile-entry tests. Проверяются точные JSON bytes/UTF-8 аргументы, все коллекции,
session/token/workspace/logout fencing, late response, cancel/retry/single flight,
30s timeout, malformed/version payload, transport и native/web file API failures,
cleanup и отдельные saved/shared/cancelled/unsupported исходы. Mocks не доказывают
работу OS, браузера, SQLite или Supabase RPC.

## Чек-лист критериев

| Критерий | Статус |
| --- | --- |
| Authenticated trainer settings + entry, прежние действия, без demo/client export | Сделано в коде и mocks; real session/API не проверено |
| Локализованные loading/retry/typed errors и scope/cancel fencing | Сделано, контрактные тесты |
| Версионный UTF-8 JSON и реальный file result, cancel/unsupported/storage/share отдельно | Сделано, adapter mocks; native/browser не проверено |
| Scoped cleanup, без logs/AsyncStorage, точный full snapshot, pending limitation | Сделано, контрактные тесты; физическое удаление OS не проверено |
| Session/inflight/cancel/retry/malformed/transport/file tests | Сделано; runtime команды ниже |
| Native/file/share, visual/parity/accessibility и готовность экрана | Не проверено, требует одобрения владельца |
| SOM-41 целиком, удаление и пилот | Открыто, вне пакета |

## Воспроизводимая проверка после контейнера

```sh
cd app
npm ci
npm run check
npm test -- --runTestsByPath tests/account-export/domain.test.ts tests/account-export/service.test.ts tests/account-export/controller.test.ts tests/account-export/controls.test.tsx tests/account-export/file.test.ts tests/account-export/native-wiring.test.ts tests/account-export/profile-entry.test.tsx
npm run export
npm run ios
npm run android
npm run web
```

Только локальный/выделенный тестовый Supabase с вымышленными fixtures:
процедура SQL/RLS/pgTAP/type drift из
[read-only seam report](../som-41-trainer-export/README.md). В контейнере SQL не
запускался; cloud migrations не применялись. Существующие migrations/types не менялись.

На каждой платформе: войти тренером A, открыть /auth/account, получить export и
проверить файл парсером UTF-8 JSON; сопоставить все 26 collections и bigint/date/null
values с тестовым workspace snapshot. Повторить empty/populated, offline/5xx/403,
unsupported version/malformed response, retry. Во время RPC/picker/write переключить
A→B, logout→A и token refresh: старого результата/успеха быть не должно.
Android: разрешение/отмена SAF, cloud/local document provider, disk/permission error,
отсутствие partial file после failure. iOS: cancel/share/Save to Files, открыть
полученный JSON, затем проверить отсутствие scoped cache файла. Повторить share
rejection и cleanup failure, убедиться, что нет ложного «Сохранено».
Web: secure context Chromium picker; cancel, abort/write/close errors; браузер без
showSaveFilePicker должен показать unsupported. В network/storage logs проверить
отсутствие JSON/private notes/tokens и экспортов в AsyncStorage.

Паритет: trainer profile `t-profile`, 390×844, auto/dark/light, normal/loading/
empty/offline; размеры из `prototype-fresh/review/parity/spec-*.json`, прежний layout
не переделан. Новая account control использует существующие Text/Button и layout.
Сравнить large text, screen reader, 44px targets, calm mode и keyboard navigation.
Снимки вне git по ADR 0066; новых PNG в пакет нет. Visual approval — только владелец.

## Ограничения

Нет Docker, Supabase stack, браузера или iOS/Android устройств: SQL/pgTAP runtime,
generated drift, real SQLite/reopen/crash, native file/share, visual/accessibility,
cloud и приёмка владельца не проверены. Native Share уже переданную OS копию
не отзывает; logout блокирует следующие действия и сообщения, но не удаляет чужой
файл. Process kill может оставить cache; finally не является crash durability.
Cleanup failure не гарантирует удаление при отказе OS. Android permission denial
и user cancel имеют общий cancelled outcome, поскольку SAF возвращает granted=false.
Web без picker честно unsupported; fire-and-forget download не выдаётся за запись.
Ни экран, ни SOM-41, ни пилот не объявлены принятыми.
