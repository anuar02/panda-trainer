# 0068. Предзагрузка снимка занятия и scoped восстановление

- Статус: реализовано технически; SQL/native/parity и одобрение владельца открыты
- Дата: 03.10.2026
- Задача: SOM-30

## Решение

`domain/workout-preload` задаёт версионированный тип context и проверяет весь
сериализованный JSON, включая UUID, единицы и связи. `features/workout-preload`
читает существующий PostgREST API явными колонками и с фиксированным Bearer.
Проверяются владелец workspace, booking, группа, активная карточка клиента и
booking program. Группа определяется group ID и текущим окном времени: перенос
одного участника не смешивает его занятие с прежней группой. Отменённая выбранная
запись недоступна; отменённые соседи исключаются. Отсутствующий снимок не заменяется
личной программой, шаблоном или демо. Архивирование исходного шаблона/упражнения
не отменяет уже назначенный неизменяемый снимок; архивная карточка недоступна.

Источник назначения — `booking_programs` / `booking_program_exercises`, не live
шаблон. `assignedExercises` сохраняет определение программы отдельно от текущих
`workout_exercises` / `set_results`; `previousSets` содержит только законченные
предыдущие журналы этого клиента, до времени занятия, с той же единицей.
Приватные заметки и таблицы заметок не читаются. Context тренера не является
клиентской проекцией и не экспортируется клиентским маршрутам. Поля вне контракта,
включая добавленные note/private поля, отвергаются при записи и гидратации.

SQLite использует отдельный `workout-preload.db`, WAL/FULL и существующий
SQLiteDriver из SOM-29. Context занятия и выбранный recovery открытия заменяются одной exclusive transaction.
При refresh сохраняются назначенные определения и UUID, история обновляется
отдельно. Серверные ID/revisions текущего журнала авторитетны; поздний not_created
ответ не заменяет уже сохранённый текущий журнал. Recovery хранится отдельно,
проверяется по сохранённому context и включает занятие, booking, клиента и collapse.
Прерывание записи context/recovery откатывает оба. Обновление без нового recovery,
которое удаляло бы выбранного участника, отвергается атомарно; отдельные
select/collapse обновляют проверенный recovery без изменения снимка.
Purge отсутствует. Ни outbox entries, ни pending operations preload не изменяет.

При загрузке/ошибке online onboarding layout выполняет account-only SQLite
bootstrap собственного recovery. Отдельная scoped server probe проверяет роль и
связи; только сетевой отказ/timeout допускает cache (или успешная проверка владельца).
Отказ в правах/невалидная сущность блокирует fallback. Пустой cache не придумывает
workspace. Bootstrap закрывает временный connection, не удаляет данные и выбирает
последний пригодный собственный workspace по loadedAt. Это доступ к журналу при
перезапуске без сети, а не offline режим остальных разделов.

Workspace layout держит provider и dock над Stack; отдельный `/workspace/journal`
показывает снимок только для чтения. Today/Schedule открывают журнал через одну
participant sheet. На других workspace-маршрутах dock возвращает выбранного
участника, в том числе после reopen; navigation away также оставляет возврат.
Safe area и крупный шрифт учитываются, новые анимации не добавляются; SOM-39 и demo
остаются отдельными. Этот read-only маршрут не объявляется завершённым экраном
production-ввода и не меняет эталон прототипа.

Каждый lifecycle получает отдельный session UUID, включая повторный вход, retry и
смену токена. Layout effect обновляет ссылку сессии до async callbacks; результат
публикуется только при совпадении account/workspace/session/token. Отображаемое
состояние также связано с generation UUID, чтобы смена credentials сразу скрывала
предыдущий context. Logout/switch отменяет preload, останавливает SOM-29 runner и
закрывает оба scoped connection после уже начатых операций, без удаления pending.
Runner использует существующий apply_operations и запускается на mount/foreground,
останавливается на background; одна пачка за trigger по ADR 0062. Пустая очередь
не выдаёт preload за синхронизированную запись. Сохранение recovery не создаёт
journal operations. Retry/conflict editing UX относится к SOM-31.

Сетевой отказ/timeout допускает fallback к проверенному cache. Ответ об отсутствии
сущности, отказе в правах, нарушении контракта или конфигурации не считается
сетевым успехом. Ошибка гидратации/SQLite блокирует новые действия до retry и не
перезаписывает состояние пустым. Возраст cache виден; restore сам по себе не
утверждает, что сервер доступен или права проверены заново без сети.

## Seam для SOM-31/32

- Серверные UUID не переводятся в demo c1/d1/t1. До создания журнала persist
  закрепляет expo-crypto randomUUID (v4, поддержан существующим контрактом) для
  workout/exercise; на чтении существующего журнала сохраняются его ID и revisions.
  Позиции с нуля. `programId` — UUID booking snapshot, `programRevision` — версия
  исходного шаблона, а не revision для journal mutation.
- Результаты содержат integer grams/reps/seconds и явный null; 0 не заменяет null.
  Только отображение делит граммы на 1000. Плановые reps/seconds — строки диапазона;
  их нельзя превращать в actual set или произвольную границу диапазона.
- Будущий ввод создаёт TypedJournalOperation и вызывает `saveJournalEntry` с
  проекцией и envelope одной транзакцией SOM-29, затем runner/apply_operations.
  Preload cache не является outbox projection и не подтверждает запись подхода.
  Перед интеграцией SOM-31 требуется reconciliation pending локальной проекции,
  tombstones, receipts/conflicts и свежих server revisions; cache refresh не должен
  становиться способом перезаписи локального pending.
- У текущего `create_workout` разрешён только booking_id; он создаёт пустой journal.
  Текущий `add_exercise` читает live catalog и принимает только workout_instance_id,
  exercise_id, position, planned_sets. Он не принимает полный booking snapshot.
  Нельзя обойти apply_operations прямыми INSERT или отправить дополнительные поля.
  SOM-31 должен расширить совместимый journal API отдельной миграцией и fixtures,
  чтобы создание строк воспроизводило назначенные снимки, включая план/метаданные;
  это явный prerequisite production-ввода, не локальный фиктивный save SOM-30.
- SOM-31: ввод/undo/замены/локальные drafts, pending reconciliation, явный conflict UI.
  SOM-32: finish, частичное завершение, correction drafts. Finished mutations не
  применяются автоматически (ADR 0061). В SOM-30 нет доступного save/finish.

## Проверки и альтернативы

AsyncStorage и общий demo journal отвергнуты для real workspace (ADR 0015/0062).
Отдельная cache database сохраняет независимость outbox receipts/conflicts, вместо
изменения семантики SOM-29. Новая SQL API и зависимости не добавлены. Подключение ранее самостоятельного
SQLite в workspace routes потребовало минимальной регистрации `wasm` asset в
`app/metro.config.js`: иначе web bundle не разрешал установленный wa-sqlite.wasm.
Это настройка сборки новых маршрутов, не изменение очереди. API сверена с
установленными SDK57 декларациями и [Expo SQLite](https://docs.expo.dev/versions/latest/sdk/sqlite/).
Web SQLite требует COOP/COEP headers; exclusive transactions на web не поддержаны.
Новые hosting/headers или альтернативное web-хранилище не подключаются, web runtime
и real SQLite остаются непроверенными; сборка не является доказательством web save.
[Отчёт](../../../app/review/som-30-workout-preload-recovery/README.md) отделяет mock
проверки от настоящей SQLite/SQL/device проверки. Контейнер не подтверждает
групповой offline→online→second-device критерий SOM-29/30/31/32 или приёмку экранов.
