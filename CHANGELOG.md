# Журнал изменений

Все заметные изменения приложения и его документации. Формат —
[Keep a Changelog](https://keepachangelog.com/ru/1.1.0/), версии — SemVer.
Правила ведения: [docs/app/CONVENTIONS.md](docs/app/CONVENTIONS.md#документация-и-учёт-изменений).

Каждый PR добавляет строку в «Не выпущено» в одну из групп:
Добавлено / Изменено / Исправлено / Удалено / Документация.

## Не выпущено

- SOM-22: полное validated чтение библиотеки и шаблонов, ограниченные страницы/пакеты, закреплённые actor/workspace/session и защита provider от поздних результатов; архивные ссылки и pending draft сохранены. [Отчёт](app/review/som-22-library-read-fencing/README.md), [ADR 0078](docs/app/decisions/0078-validated-session-fenced-library-reads.md).

- [SOM-35 / draft PR #40](https://github.com/anuar02/panda-trainer/pull/40): клиентская история и pagination закрываются при смене сессии, включая новый вход того же аккаунта; штатный refresh сохраняется. [Проверки](app/review/som-35-history-session-fencing/README.md), [ADR 0076](docs/app/decisions/0076-client-history-session-fencing.md).

### Добавлено

- SOM-20: безопасное owner-scoped чтение списка/карточки клиентов, bounded pagination,
  runtime validation и session/retry fencing. Создание занятия сохраняет совместимый wrapper.
  [Проверки и ограничения](app/review/som-20-trainer-client-read-fencing/README.md);
  live/native/parity и приёмка владельца открыты.

- [SOM-26 / draft PR #41](https://github.com/anuar02/panda-trainer/pull/41): runtime validation и ограниченная пагинация чтения расписания,
  фиксированная авторизация всех страниц и защита Today/week от старого snapshot
  после смены сессии, retry и unmount. Команды создания/мутаций сохранены.
  [Отчёт](app/review/som-26-schedule-read-fencing/README.md),
  [ADR 0075](docs/app/decisions/0075-session-fenced-schedule-read.md).
  SQL/live API/native/parity и одобрение владельца открыты.

- [SOM-41 / draft PR #36](https://github.com/anuar02/panda-trainer/pull/36): серверный экспорт в authenticated account settings, entry из профиля тренера,
  session fencing и отдельная доставка точного UTF-8 JSON на web/Android/iOS.
  Native/visual и одобрение владельца открыты; deletion не подключён.
  [Отчёт](app/review/som-41-export-ui/README.md),
  [ADR 0074](docs/app/decisions/0074-session-fenced-export-file-delivery.md).

- [SOM-41 / draft PR #35](https://github.com/anuar02/panda-trainer/pull/35): изолированный typed deletion preflight с fail-closed evidence, local snapshot proofs
  и внешними review gates; удаления и integration нет.
  [Контракт](docs/app/privacy/DELETION-PREFLIGHT-CONTRACT.md),
  [отчёт](app/review/som-41-deletion-contract/README.md).

- [SOM-40 / draft PR #33](https://github.com/anuar02/panda-trainer/pull/33): изолированный opt-in мониторинг ошибок с allowlist, EU DSN gate,
  bounded transport и root bootstrap; облачная активация и юридический review открыты.
  [ADR 0072](docs/app/decisions/0072-allowlisted-opt-in-error-monitoring.md),
  [отчёт](app/review/som-40-error-monitoring/README.md).

- [SOM-40 / draft PR #32](https://github.com/anuar02/panda-trainer/pull/32): tooling зашифрованного pilot dump, приватного storage/ротации и
  disposable restore harness; nightly выключен до environment/storage gate.
  [Отчёт](app/review/som-40-pilot-backup/README.md),
  [ADR 0071](docs/app/decisions/0071-encrypted-pilot-backup-and-disposable-restore.md).
  Реальный EU storage/restore и готовность пилота не подтверждены.
- [SOM-40 / draft PR #31](https://github.com/anuar02/panda-trainer/pull/31): public pilot preflight CLI с безопасной диагностикой и тестами,
  [Free Frankfurt environment handoff](docs/app/pilot/ENVIRONMENT.md) и ADR 0070.
- SOM-40: [remote evidence](docs/app/pilot/EVIDENCE.md) пилотного проекта — Frankfurt, Free, чистый старт.
  Cloud deployment/region evidence, restore, telemetry и приёмка остаются открытыми.

- [SOM-41 / draft PR #29](https://github.com/anuar02/panda-trainer/pull/29): owner-scoped read-only серверный экспорт 26 коллекций, versioned JSON,
  архивы/приватные заметки/history/conflicts и точные bigint strings; отдельные
  typed domain/service без UI. App check зелёный; SQL runtime не проверен.
  CI evidence: migration applied, pgTAP пропущен из-за исходного outbox lint;
  Expo compatibility check блокируют версии зависимостей базы.
  [Отчёт](app/review/som-41-trainer-export/README.md),
  [ADR 0069](docs/app/decisions/0069-owner-scoped-server-workspace-export.md).
  UI, удаление аккаунта и весь SOM-41 остаются открытыми.
- [SOM-30 / draft PR #28](https://github.com/anuar02/panda-trainer/pull/28): typed server preload назначенных снимков и прошлых подходов, atomic scoped
  SQLite cache/recovery, read-only workspace journal и общий dock Today/Schedule/Stack;
  account/session fencing и lifecycle существующего SOM-29 runner без purge pending.
  Ввод/конфликты ждут SOM-31, завершение — SOM-32; SQL/native/parity и приёмка открыты.
  [ADR 0068](docs/app/decisions/0068-workout-preload-and-scoped-recovery.md),
  [отчёт](app/review/som-30-workout-preload-recovery/README.md).

- [SOM-29 r2 / draft PR #26](https://github.com/anuar02/panda-trainer/pull/26): перенесён исходный outbox на свежую базу, исправлены приватность
  нерешённых заметок, восстановление выбранной видимости и stale выбор структуры;
  усилены проверки SQLite receipts и сессий runner. SQL/native проверки открыты.
  [Отчёт r2](app/review/som-29-sqlite-outbox-r2/README.md).

- SOM-34: отмена оплаты с подтверждением и обязательной причиной через существующий
  RPC/recovery; одна строка истории с зачёркнутой суммой, «Отменена» и датой.
  Долг исключает отменённую оплату, client/account/workspace изолированы;
  bigint и exact retry сохраняются. Визуальная/native приёмка открыта.
  [Отчёт](app/review/som-34-payment-reversals/README.md),
  [draft PR #25](https://github.com/anuar02/panda-trainer/pull/25).

- [SOM-39 / PR #23](https://github.com/anuar02/panda-trainer/pull/23): сохраняемый «Спокойный интерфейс» обеих ролей и hooks для SOM-38;
  системное уменьшение движения, Reanimated-шторки/обратная связь подхода и
  адаптация «Сегодня»/журнала к крупному шрифту до 200%. Нативная и визуальная
  приёмка открыты ([отчёт](app/review/som-39/README.md), ADR 0063).
- SOM-29: самостоятельный SQLite journal/outbox, scoped runner/transport и
  apply_operations с receipts, конфликтами и черновиками поздних правок.
  SQL/native проверки и приёмка этапа 5 открыты; типы SQL дополнены вручную.
  [ADR 0062](docs/app/decisions/0062-sqlite-journal-outbox.md),
  [отчёт](app/review/som-29-sqlite-outbox/README.md).

- SOM-33/SOM-34: завершены создание пакета и ручная частичная оплата до остатка
  долга; история показывает сумму, дату, способ и «Записано», ошибки чтения дают
  повтор. Строгие тесты проверяют существование кнопок/вызовов; exact replay
  сохраняет UUID-подобные названия и причины без изменения регистра.
  Coordinator integration: полный check зелёный, 1213 tests / 124 suites.
  Историческая проверка рабочего: 1210 tests / 123 suites, lint и format проходят; полный check блокирует
  существующая ошибка `ui/button.tsx:83`; SQL/browser
  не проверены в контейнере, внешний вид требует одобрения владельца.
  [ADR 0059](docs/app/decisions/0059-package-creation-and-capped-payments.md),
  [отчёт](app/review/som-34-billing-finish/README.md),
  [PR #22](https://github.com/anuar02/panda-trainer/pull/22).

- [SOM-38 / PR #21](https://github.com/anuar02/panda-trainer/pull/21): утверждённые PNG-позы и лица через expo-image, `hidden`,
  Rive за выключенным флагом и PNG-празднование нового завершения тренировки.
  Native/визуальная приёмка и одобрение рига открыты.
  [ADR 0060](docs/app/decisions/0060-mascot-png-and-gated-rive.md).

- Real Today attendance и общий workspace coordinator для billing, cancellation,
  proposals и creation: retained routes используют один lock/pending store;
  отдельные recovery-команды сохраняются после смены дня/маршрута. Старая
  pending команда не разрешает новую запись в другом домене.
  1093 tests / 117 suites, all-platform export и 12 Today/Schedule capture pairs
  проходят; synthetic cross-route replay не дублирует списание.
  [ADR 0058](docs/app/decisions/0058-shared-workspace-mutation-coordinator.md).

- SOM-33: реальные покупки во вкладке «Оплаты» клиента: точная стоимость,
  использованные занятия из scoped ledger и срок, включая expired/depleted packages.
  Ошибочная история показывает retry вместо ложного нуля; payment/debt остаются
  неизвестными. 1078 tests / 115 suites, all-platform export и 6 default client
  capture pairs проходят; synthetic browser подтверждает usage refresh.
  Создание покупки и native/owner acceptance открыты.
  [ADR 0057](docs/app/decisions/0057-client-purchase-read-projection.md).

- SOM-33: реальные посещения в расписании, выбор подходящего пакета,
  отметка без списания, поздняя привязка, исправление с возвратом и отдельная
  penalty с причиной. Durable recovery повторяет сохранённую команду после
  потери ответа/reload; остальные записи блокируются до разрешения результата.
  1065 tests / 112 suites, all-platform export и 6 schedule capture pairs проходят;
  реальные synthetic browser/DB проверки подтверждают отсутствие дубля списания.
  Создание покупки, оплаты/долг и native/owner acceptance остаются открытыми.
  [ADR 0056](docs/app/decisions/0056-attendance-controls-and-recovery.md).

- SOM-33 app transport: typed safe billing reads и шесть attendance/purchase RPC;
  закреплённый account token, validated results и lossless bigint minor money.
  46 новых focused tests; app check1037 tests/108 suites проходит. Production
  attendance sheets и native/owner acceptance остаются открытыми.
  [ADR0055](docs/app/decisions/0055-attendance-billing-transport.md).

- SOM-34 foundation: неизменяемая `payment_entries` с положительными оплатами
  и полным однократным сторно, bigint тиыны/KZT и safe-column RLS.
  Clean reset, db lint и 686 pgTAP assertions / 20 files проходят;
  generated type drift и strict app typecheck проходят. RPC оплат, долг и app actions ждут
  решения владельца о переплате; SOM-34 не завершён.
  [ADR 0054](docs/app/decisions/0054-manual-payment-history.md),
  [evidence](docs/app/review/som-34-manual-payment-foundation.md).

- SOM-33: серверные покупки, посещения/неявки и неизменяемый ledger занятий;
  атомарное списание, поздняя привязка и исправление с однократным возвратом.
  Срок пакета проверяется по запланированной дате занятия включительно;
  отмена/неявка списываются только отдельной командой с причиной.
  660 pgTAP assertions / 19 files, шесть concurrency scenarios, db lint,
  generated type drift и app check (991 tests / 107 suites) проходят.
  Оплаты, app transport и приёмка экранов остаются открытыми.
  [ADR 0053](docs/app/decisions/0053-attendance-credit-ledger.md),
  [проверки](docs/app/review/som-33-attendance-credit-ledger.md).

- SOM-36: selected-connection progress из полной собственной finished history;
  реальные рекорды и 28-дневные изменения, без метрик из неполной истории.
  951 тест / 105 suites, web/iOS/Android export и 6 default capture pairs проходят.
  Trainer/client browser: 23/29 checks; owner/native acceptance открыты. [ADR 0049](docs/app/decisions/0049-client-progress-from-finished-history.md).

- SOM-36/24: реальный readonly client program из immutable booking plan и
  latest-copy fallback при отсутствии будущих bookings. Сохранены плановые ranges,
  null/zero weights и snapshot инструкции; demo guides/results/media не подставляются.
  915 тестов / 100 suites, web/iOS/Android export и 6 default capture pairs проходят.
  Runtime/owner acceptance открыты. [ADR 0048](docs/app/decisions/0048-client-program-snapshot-view.md).

- SOM-36: собственная finished history с snapshot упражнениями, реальными
  подходами/общими заметками и safe pagination/retry. Default upcoming/history
  больше не обрезаются датой; старые годы доступны. Проверено 873 теста / 95 suites
  и web/iOS/Android export. Browser flows ждут Docker; глобальные API grants,
  billing/progress/native/owner acceptance открыты.
  [ADR 0047](docs/app/decisions/0047-client-finished-history-and-unbounded-dates.md).

- SOM-26/27/36 app: реальные Сегодня, запросы/переносы тренера и отдельный
  client connection route с собственными bookings, snapshot preview,
  confirmation/cancellation и proposal replies. Общая блокировка команд и
  recovery работают вне bottom-sheet portal. Default demo сохранён; реальные
  billing/history/progress ещё не подключены. 855 тестов / 94 suites, web/iOS/Android export и 24 пары capture
  проходят; runtime browser verification ожидает Docker.
  [ADR 0044](docs/app/decisions/0044-controlled-today-and-proposal-ui.md),
  [ADR 0046](docs/app/decisions/0046-client-booking-controls.md).

- SOM-36 foundation: собственные bookings и неизменяемые планы клиента,
  безопасные RPC контекста/ролей предложений и обновление на focus. Auth token
  закреплён на каждом запросе; смена аккаунта/карточки скрывает старые данные.
  494 pgTAP assertions / 16 files, 20 reader tests, 12 hook tests и 7 adapter
  tests проходят. Этот пакет не завершает клиентские billing/history/progress.
  [ADR 0045](docs/app/decisions/0045-client-schedule-read-boundary.md).

- SOM-27: пять RPC переноса отдельного booking с revision checks, private actor
  receipts и сохранением программы; исходное время меняется только при принятии.
  Durable transport сохраняет точную команду; group detachment не ломает старые
  creation retries благодаря неизменяемым receipt IDs. 469 pgTAP assertions,
  3 новые concurrency scenarios и 46 focused app tests проходят.
  [ADR 0043](docs/app/decisions/0043-booking-reschedule-commands.md).

- SOM-26: реальное создание `/workspace/new` из дня/свободного окна, async wizard
  и восстановление точной команды. Выбранный шаблон атомарно копируется для каждого
  участника; личная программа не меняется. Имена программ календаря читаются из
  неизменяемых снимков. Проверено 660 тестов / 75 suites, 418 pgTAP assertions,
  3 concurrency scenarios и 13 browser checks.
  [ADR 0042](docs/app/decisions/0042-booking-program-snapshots.md).

- SOM-26: авторизованная неделя `/workspace/schedule` читает реальные bookings,
  имена участников, запросы клиента и рабочие свободные окна; refresh на focus,
  защита от старых ответов и смены аккаунта. Создание ещё отключено до снимков
  программы на сервере. [ADR 0041](docs/app/decisions/0041-server-week-calendar.md).
- SOM-27: отмена отдельного участника из реального календаря и сохранённый
  status command с восстановлением после рестарта/потери ответа.
  Проверки: 595 тестов / 71 suites, 9 headless browser checks, web export и
  6 пар календаря без browser errors. [Отчёт](app/review/workspace-scheduling/README.md).

- SOM-24 verification: непрерывный create → assign для двух шаблонов проходит
  19 headless browser checks, включая повтор после потери ответа и сохранение
  обеих копий программы. [Отчёт](app/review/workspace-programs/README.md).

- SOM-26: серверная модель agenda, статусы участников и свободные окна по
  рабочим часам; local-time conversion явно возвращает DST gap/fold.
  [ADR 0039](docs/app/decisions/0039-schedule-calendar-adapters.md).
- SOM-27: transport подтверждения/отмены отдельного booking с закреплённым
  аккаунтом, проверкой revision и безопасным повтором; 35 focused tests.
  Совместный check SOM-26/27: 542 теста / 66 suites, TypeScript/lint/format.
  [ADR 0040](docs/app/decisions/0040-booking-status-transport.md).

- SOM-26 recovery: `submitWorkspaceBooking` сохраняет команду до отправки,
  `resumeWorkspaceBooking` восстанавливает её после рестарта. Потеря ответа или
  ошибка очистки допускает повтор того же request ID; предупреждение не
  подтверждает пересечение автоматически. Общий check — 484 теста / 63 suites.

- SOM-26 transport: создание индивидуального/группового занятия, проверка
  предупреждения о пересечении, закреплённый аккаунт и повтор после потери ответа.
  Ожидающая команда сохраняется по аккаунту/workspace и защищена от перезаписи.
  35 новых тестов; общий check — 477/62. UI ещё не подключён.
  [ADR 0038](docs/app/decisions/0038-booking-creation-recovery.md).

- SOM-24: редактор сохраняет контекст клиента при создании, правке, копировании,
  сохранении и возврате; после сохранения доступно назначение тому же клиенту.

- SOM-26 foundation: постраничное чтение серверных занятий и ожидающих переносов,
  рабочие часы пространства и календарные helpers с его IANA timezone.
  13 focused tests; общий check — 435 тестов / 59 suites. UI ещё не подключён.
  [ADR 0037](docs/app/decisions/0037-workspace-schedule-reads.md).

- SOM-24 app: выбор шаблона из карточки клиента, назначение личной программы
  и возврат в обновлённую вкладку Программа. Проверены безопасный повтор после
  потери ответа и новая копия без изменения прежней; 15 browser checks проходят.
  Native и визуальная приёмка открыты. [Отчёт](app/review/workspace-programs/README.md).

- SOM-24 transport: назначение программы с закреплённой сессией, сохраняемый
  request ID и безопасный повтор. Неопределённая команда не перезаписывается;
  повреждённое хранилище блокирует новую отправку. 12 transport/storage тестов
  проходят; UI назначения подключается отдельным пакетом.

- SOM-22/23 app: реальные библиотека и конструктор шаблонов, создание/архив
  упражнений, сохранение/редактирование/копия с проверкой версии; черновик и
  pending command восстанавливаются отдельно для каждого аккаунта/workspace.
  398 тестов, три экспорта и 11 browser checks проходят; native и визуальная
  приёмка открыты. [Отчёт](app/review/workspace-library/README.md).

- SOM-21 app: реальные выпуск/замена/отзыв приглашения, локальное копирование
  и системный Share, сохранение ссылки до входа и явное принятие. Аккаунт
  показывает отдельные связи с тренерами. 377 app-тестов, три экспорта и семь
  headless browser checks проходят; production/native/owner acceptance открыты.
  [Отчёт](app/review/invitations/README.md).

- SOM-21: приглашения на 7 дней с хэшем токена, заменой/отзывом, одноразовым
  принятием и сохранением истории карточки. Поддержаны отдельные карточки у
  нескольких тренеров, безопасные повторы и приватный read RPC собственных связей.
  Production-домен и native/визуальная приёмка остаются открытыми.
  [ADR 0034](docs/app/decisions/0034-client-invitations.md).

- SOM-20: атомарная настройка профиля тренера, рабочего времени, каталога и
  первого клиента. Повтор и конкурентный вызов сохраняют одну настройку без
  дубликата клиента; ошибка откатывает весь набор. Подключены пятишаговый welcome,
  реальные список/поиск/карточка клиента и создание карточки с безопасным повтором.
  Неподключённые разделы явно недоступны; визуальная/native-приёмка открыта. [ADR 0033](docs/app/decisions/0033-atomic-trainer-onboarding.md).

- SOM-19: email-код, Apple/Google browser OAuth с PKCE, восстановление и выход
  из сессии; native SecureStore и web sessionStorage. Демо отделено от аккаунта.
  Layout входа одобрен владельцем; живые provider flows и native-приёмка открыты.
  [ADR 0032](docs/app/decisions/0032-auth-runtime-and-login.md).

- SOM-27: серверное подтверждение записи клиентом и отмена клиентом/тренером;
  revision и приватные receipts защищают от повторов и устаревшей записи.
  Отмена участника сохраняет остальных; завершённый журнал защищён от смены статуса.
  [ADR 0031](docs/app/decisions/0031-booking-status-commands.md).

- SOM-28: таблицы журнала, подходов и раздельных открытых/личных заметок.
  Клиент читает только собственный завершённый журнал; группа не раскрывает
  чужие результаты. Прямая запись закрыта до команд синхронизации.
  [ADR 0030](docs/app/decisions/0030-journal-read-isolation.md).

- SOM-24: личные копии программ с версией источника, планами и снимками техники
  упражнений; атомарное назначение сохраняет прежние копии. Проверены RLS,
  устаревшие версии и конкурентный повтор без дубликатов.
  [ADR 0029](docs/app/decisions/0029-client-program-snapshots.md).

- SOM-23: атомарные команды сохранения/архивирования шаблона, проверка revision
  и приватные receipts для повторов. Закрыты прямые записи заголовка/состава,
  включая прежние column grants; проверены конкурентная правка и повтор запроса.
  [ADR 0028](docs/app/decisions/0028-atomic-template-commands.md).

- SOM-25: серверные занятия, мини-группы и таблица предложений; RPC создания
  проверяет пересечения под блокировкой workspace и требует подтверждения
  тренера. Повторы возвращают те же IDs; RLS скрывает чужих участников группы.
  Добавлены проверки двух конкурентных SQL-сессий.
  [ADR 0027](docs/app/decisions/0027-server-schedule-foundation.md).

- SOM-22: серверная библиотека и шаблоны с RLS, нормализованным поиском и
  архивированием без потери ссылок. 81 упражнение эталона копируется в каждое
  новое пространство. Подключение экранов к серверу остаётся отдельным шагом.
  [ADR 0026](docs/app/decisions/0026-workspace-library.md).

- SOM-18: базовые profiles/workspaces/client_records/invitations, RLS и запрет
  прямой смены связей/владельца и чтения token_hash; revision/audit, вымышленный
  seed, 32 pgTAP-проверки и генерируемые типы с проверкой актуальности в CI.
  [ADR 0025](docs/app/decisions/0025-identity-rls-foundation.md).

### Исправлено

- [SOM-34 / draft PR #43](https://github.com/anuar02/panda-trainer/pull/43): финансовые чтения изолированы по auth session_id; hooks сбрасывают данные
  при повторном входе, bounded exact-count paging и scoped relations отклоняют
  неполные snapshots. UI и mutations сохранены; live auth/native и приёмка открыты.
  [Отчёт](app/review/som-34-financial-read-session-fencing/README.md),
  [ADR 0077](docs/app/decisions/0077-financial-read-session-fencing.md).

- SOM-29: синхронизация журнала больше не создаёт ложные конфликты. Миграция
  `20261003140000_workout_sync_revision_fixes`: серверная перестановка подходов не
  поднимает их `revision` (отдельный триггер `set_results`), пересчёт трогает только
  изменившиеся позиции, конфликт приватной заметки не повышает её ревизию, а
  `apply_operations` типизирует `results` (`'[]'::jsonb`, db lint 42804). pgTAP
  `workout_sync` впервые прогнан: 105/105. Expo 57.0.26 (constants 57.0.20,
  router 57.0.24) для `expo install --check`.
- SOM-27/36: сохранённые status/reschedule requests можно завершить через сервер:
  исходный успешный результат восстанавливается, невыполненный запрос навсегда
  блокируется перед очисткой локальной recovery-записи. Recovery доступен обеим
  ролям; вложенные connected sheets сохраняют родительский booking context.
  [ADR 0052](docs/app/decisions/0052-booking-request-resolution.md),
  [ADR 0051](docs/app/decisions/0051-connected-action-sheet-stacking.md).
  Проверки: 991 app tests / 107 suites, 610 database assertions / 18 files,
  9 concurrency scenarios, trainer/client browser 23/34 checks; экспорт трёх
  платформ. [Отчёт](docs/app/review/som-27-request-resolution.md).
  SOM-35 invitation → signup/link → existing history проходит 43 browser checks
  с safe API projections и отказом другому аккаунту.

- SOM-36 API privacy: прямое чтение auth/device audit fields закрыто column grants
  на личных программах и журнале; trainer proposals читаются через owner RPC с
  author_role. 574 pgTAP assertions / 17 files и 962 app tests / 106 suites проходят.
  [ADR 0050](docs/app/decisions/0050-client-visible-api-audit-privacy.md).

- SOM-26: сохранённая операция создания может повториться после синхронной
  ошибки конфигурации/client lookup; rejected Promise больше не остаётся в кеше.
  Два regression tests проходят.

- SOM-50: при крупном тексте или коротком окне header picker прокручивается
  со списком, сохраняя Done видимой. Обычный layout эталона не меняется.
  [ADR 0024](docs/app/decisions/0024-picker-overflow.md).

- SOM-50: общий Text пересоздаёт native-узел при смене системного fontScale,
  устраняя обрезание текста при живом переключении Dynamic Type на iOS.
  [ADR 0023](docs/app/decisions/0023-live-font-scale.md).

- SOM-50: в picker конструктора закреплены заголовок, поиск и Done; список
  прокручивается отдельно. Исправлены размеры поиска/миниатюр/индикатора выбора,
  web blur поля поиска. Выбор сохраняется при закрытии и Android Back.
  Убрана группировка содержимого Sheet в один accessibility-элемент:
  поиск, упражнения и Done доступны отдельно на iOS.
  [ADR 0022](docs/app/decisions/0022-fixed-picker-sheet.md),
  [проверки и открытая приёмка](app/review/template-picker/README.md).

### Документация

- [SOM-41 / draft PR #27](https://github.com/anuar02/panda-trainer/pull/27): review drafts [политики](docs/app/privacy/PRIVACY-POLICY-DRAFT.md),
  [карты данных](docs/app/privacy/DATA-LIFECYCLE.md) и
  [handoff удаления](docs/app/privacy/ACCOUNT-DELETION-HANDOFF.md) по схеме
  и ADR 0061/0062/0064. Не опубликованы; export/delete и юридическая приёмка открыты.
  [Отчёт](app/review/som-41-privacy-documents/README.md).

- Решение владельца SOM-52: бюджет пилота — только бесплатные тарифы ([ADR 0067](docs/app/decisions/0067-free-tier-pilot-budget.md)); приглашения на `trainer.narutouzumaki.kz`.
- Решения владельца: регион, хранение и домен пилота (ADR 0064), push в v1 (ADR 0065),
  снимки вне git и закрытая лицензия `LICENSE` (ADR 0066), общий остаток в шапке клиента (ADR 0059).
- Решение владельца SOM-34: отменённая оплата показывается строкой «Отменена», тренер может отменить оплату с подтверждением ([ADR 0059](docs/app/decisions/0059-package-creation-and-capped-payments.md)).
- Решения владельца SOM-53, SOM-56, SOM-58: политика конфликтов журнала и видимость для клиента ([ADR 0061](docs/app/decisions/0061-journal-conflicts-and-client-visibility.md)).
- По решению владельца отменены обязательные записи в Linear после каждой
  задачи; проверки в репозитории и отдельные коммиты сохраняются.
  [ADR 0036](docs/app/decisions/0036-reduced-linear-updates.md).

- Зафиксирована успешная Android arm64 debug сборка и отдельный незавершённый
  native runtime smoke: packager HTTP 403 до JS. Эмулятор остановлен для снижения
  нагрузки; native auth/deep links не объявлены проверенными.

- SOM-60: владелец подтвердил e-mail OTP + Apple + Google 01.10.2026.
  ADR 0004 и память обновлены; домен приглашений остаётся «pending».

- По указанию владельца сохранять завершённые и проверенные пакеты работы
  коммитом после каждой задачи; правило записано в PROJECT-MEMORY.

- Полный backlog trainerApp в Linear: 13 milestones, 48 задач и 59 зависимостей;
  [обзор продукта](docs/app/PROJECT-BRIEF.md), [карта поставки](docs/app/DELIVERY-PLAN.md)
  и [ADR 0021](docs/app/decisions/0021-linear-roadmap-import.md). Покрыты 69 открытых
  пунктов этапов, 12 решений владельца и приёмка; продуктовые этапы не закрывались.

- Создан проект trainerApp в Linear; добавлены [правила агентов](docs/app/LINEAR-WORKFLOW.md),
  ссылки из AGENTS/README и [ADR 0020](docs/app/decisions/0020-linear-coordination.md).

- Добавлен [handoff для следующего агента](docs/app/CODEX-CONTINUATION-HANDOFF.md):
  checkpoint `9f4cacb`, проверенные результаты, ограничения и следующая командная волна.

### Добавлено

- Конструктор `/template-editor`: создание, редактирование и копирование планов,
  порядок упражнений, повторы/секунды, вес, отдых и заметка; сохраняемый черновик
  с разрешением конфликта и подтверждением удаления. Общий каталог библиотеки
  и мастера занятия; пользовательский план сохраняется снимком в расписании и
  журнале. [ADR 0019](docs/app/decisions/0019-demo-template-builder.md).
  338 тестов / 45 suites; паритет не принят.

- Отдельные `/template/t1`–`t4`: состав шаблона, общие шторки техники, фиксированная
  кнопка создания занятия. Библиотека открывает маршрут; выбранный план передаётся
  в мастер и сохраняется в расписании/журнале. Неверные ссылки не выбирают чужой
  шаблон. Конструктор добавлен следующим пакетом; паритет не принят.

- Входящие тренера `/inbox`: активные переносы, принятие/отказ, встречное
  предложение и отзыв через общее расписание; история и пустое состояние
  после согласования сохраняются. Переход из Today доступен и без новых запросов.
  Ошибки чтения/записи показывают повтор. 310 тестов / 41 suite; паритет не принят.

- Общее локальное расписание демо: создание личного/группового занятия,
  подтверждение участником, перенос/встречное предложение, принятие/отказ/отзыв,
  отмена с изоляцией участников и проверкой ревизий. Новые `/new` и `/client/[id]`,
  пять разделов карточки клиента; Today/Schedule/Home и журнал новых занятий
  читают общее состояние. Сохранение с проверкой формата, повтором ошибки и
  защитой от перезаписи повреждённых данных. [ADR 0018](docs/app/decisions/0018-demo-scheduling.md).
  306 тестов / 40 suites и экспорт Android/iOS/web; production и паритет не приняты.

- Демо-журнал: отмена записи, добавление/замена/пропуск упражнений, управление
  видимостью существующих заметок; общий таймер отдыха и выбранное упражнение
  сохраняются при навигации. Клиентские History/Progress читают завершённые
  результаты только своего клиента, без личных заметок и без изменения списаний.
  [ADR 0016](docs/app/decisions/0016-workout-runtime-and-client-results.md).
  Проверено: 227 тестов / 32 suites, TypeScript/ESLint/Prettier и экспорт трёх
  платформ; web finish → Progress, Android запись/rest/dock, iOS visual smoke.
- Локальный демо-журнал тренировки: Today/Schedule открывают занятие по ID,
  участники группы ведутся раздельно, подходы и черновики восстанавливаются
  после перезапуска. Ошибки чтения/записи видимы, доступен повтор; частичное
  завершение подтверждается отдельно. Это не серверная синхронизация,
  посещение и списания не меняются ([ADR 0015](docs/app/decisions/0015-demo-workout-storage.md)).
  Проверено: 196 тестов, сборки Android/iOS/web; 66 кадров приложения, 0 runtime
  errors. Визуальная приёмка и оставшиеся сценарии журнала ещё открыты.
- Оба профиля по прототипу: данные, пакет, статистика и действующий выбор темы.
  Контракт регистрации всех используемых шрифтов (включая Montserrat 900).
  Финальный checkpoint: 161 тест, сборки трёх платформ, 60 кадров приложения;
  глубокие маршруты, серверные действия и визуальная приёмка ещё открыты.
- Демо-экраны Schedule, Program, History, Clients, Library и Progress:
  календарная навигация, поиск/фильтры, детали упражнений и шаблонов;
  исходные 12 JPG и 12 GIF с проверкой неизменности. Сценарии повторяют
  канонический прототип; библиотека не меняется от переключения сценария.
- Первые содержательные демо-экраны Today/Home: четыре состояния, исходные PNG,
  раскрытие прошедших занятий и деталей группы, локальная отмена/отзыв переноса.
  Общие шрифты, карточки, кнопки, status pill и измеряемые градиенты;
  исправлен приоритет явного Text style в web (ADR 0013/0014).
  Неподключённые сценарии явно отключены; это не серверная запись и не приёмка.
- Проверки общих токенов против канонических спецификаций прототипа: цвета,
  радиусы и базовая типографика. Исправлены светлая палитра, тёмный акцент,
  радиусы кнопки/карточки/шторки и текст 15/21.75 вместо 16/24.
- Пять вкладок для каждой роли и плавающая панель по прототипу; оригинальные
  SVG через `react-native-svg` (ADR 0012), проверки геометрии и событий навигации.
  Новые маршруты пока содержат только заголовки; паритет экранов не заявлен.
- `npm run parity`: воспроизводимые пары прототип/приложение 390 × 844 @2x,
  HTML-отчёт и явный список отсутствующих маршрутов/состояний; PNG остаются локально.
- Каркас Expo SDK 57 в отдельном `app/`: восемь вкладок двух ролей, NativeWind,
  светлая/тёмная тема «Чернила», Inter/Montserrat, русская локализация и базовые компоненты.
- TypeScript strict, ESLint без `any`/комментариев/прямого JSX-текста, Prettier,
  6 поведенческих тестов и 42 проверки контраста в исходном каркасе;
  CI для приложения, бандлов и локального Supabase.
- Конфигурация Supabase, пустая начальная миграция и pgTAP guard таблиц без RLS.
  [Инструкции запуска](app/README.md), [проверка этапа](app/review/foundation/README.md).
  [PR #17](https://github.com/anuar02/panda-trainer/pull/17).

### Исправлено

- Android больше не выводит `workout.sets` вместо русского числа подходов:
  подключены общие Intl.PluralRules и русские locale-data, добавлены регрессии
  множественных форм ([ADR 0017](docs/app/decisions/0017-native-russian-plurals.md)).
- SVG-иконки используют `aria-hidden` в web без невалидного DOM-атрибута
  `accessible=false`; native сохраняет прежнюю семантику. Capture теперь
  учитывает console.error, а не только необработанные pageerror.
- Шторка закрывается при уходе с экрана-владельца, не остаётся поверх нового
  маршрута; уведомление о закрытии не дублируется.
- Эталонный capture завершает конечные анимации и ставит бесконечные на начало:
  статические сравнения больше не зависят от промежуточного fade/translate.
  Это изменение инструмента, а не продуктового прототипа или приёмка motion.
  Каждый кадр стартует с чистой страницы/хранилища, чтобы открытый журнал не
  добавлял активный workout dock на последующие экраны.
- Начало паритета D: автотема по роли (тренер тёмная, клиент светлая), сохранение
  ручного выбора и контракт всегда тёмного журнала. [ADR 0011](docs/app/decisions/0011-appearance-storage.md).
- Скрипт эталона проверяет настоящие размеры кадра: ранее получалось 390 × 768
  вместо заявленных 390 × 844. Исправлена только рамка при захвате.
- Ревью каркаса (PR A): шторка уведомляет о пользовательском закрытии один раз,
  а при `open=false` не вызывает `onClose`; повторное открытие сохранено.
- Убраны повторные accessibility-подписи шторки, `pointerEvents` тоста перенесён
  в style. Проверены тост, ошибка поля и отсутствие перемонтирования при смене темы:
  10 поведенческих тестов и 42 проверки контраста.
- Шторка открывается с первого раза и повторно после закрытия жестом: `dismiss()`
  больше не вызывается до первого `present()` или после завершённого закрытия.
  [PR #17](https://github.com/anuar02/panda-trainer/pull/17).

### Изменено

- Контекст темы и переменные NativeWind мемоизированы; контекст явно типизирован.
- Нативная заставка `expo-splash-screen` остаётся до результата загрузки шрифтов;
  ошибка показана внутри безопасной области ([ADR 0010](docs/app/decisions/0010-font-loading-splash.md)).
- ESLint запрещает прямые строки в пользовательских JSX-атрибутах и выражениях;
  тестовые фикстуры исключены. CI ограничен по времени и ставит Supabase CLI отдельно.

### Удалено

- `app/LICENSE`: лицензия шаблона Expo, ошибочно описывавшая права на продукт.
  Лицензия продукта остаётся открытым вопросом; файл доступен в истории Git.

### Документация

- Разрешён конфликт с PR #19 с сохранением обязательного паритета. Требование
  владельца и проверенный handoff Claude сохранены в `docs/app/PROJECT-MEMORY.md`
  и инструкциях AGENTS. Обновлены статусы, выделены ADR 0008/0009; этап 1 остаётся
  открытым до приёмки паритета, нативные проверки распределены по этапам 9/10.
- Паритет с прототипом: эталон `prototype-fresh` по умолчанию и тема по роли
  ([ADR 0007](docs/app/decisions/0007-ui-reference.md)), правила и чек-лист
  ([docs/app/UI-PARITY.md](docs/app/UI-PARITY.md)), скрипт эталонных снимков и замеров
  `prototype-fresh/review/parity/capture.cjs`, раздел в PR-шаблоне и CONVENTIONS.
- Handoff по итогам ревью каркаса: исправления, закрытие этапа 1 и старт этапа 2
  ([docs/app/CODEX-STAGE-1-FIXES-HANDOFF.md](docs/app/CODEX-STAGE-1-FIXES-HANDOFF.md)).
- [ADR 0006](docs/app/decisions/0006-app-foundation.md): версии каркаса, тема и проверки.
- План разработки приложения на React Native (Expo) и Supabase: этапы 0–11,
  архитектура, модель данных, правила разработки, отложенные решения
  ([docs/app/](docs/app/README.md)).
- Журнал решений: ADR 0001–0005 (стек, бэкенд, офлайн журнала, вход, маскот).
- Правила учёта изменений: этот файл, PR-шаблон, раздел в `AGENTS.md`.

## История до начала разработки

Прототипы и исследования идентичности велись до 29.09.2026 без этого журнала.
Их история — в [WORKPLAN.md](WORKPLAN.md), [prototype-fresh/README.md](prototype-fresh/README.md)
и `git log`.
