# План разработки приложения

Обновлено: 5 октября 2026.

Стек: React Native (Expo) + Supabase ([ADR 0001](decisions/0001-react-native-expo.md),
[ADR 0002](decisions/0002-supabase.md)). Цель первой версии — пилот с 3–5 настоящими
тренерами в Астане и их клиентами. Публикация в сторах и платные сервисы подключаются
только с отдельного согласия владельца.

## Где остановились

- 05.10.2026 — SOM-26, бриф 22 после спокойного Today (#88): [x] завершённые
  журналы в «Прошло», исключены из фокуса/ленты в эталоне, демо и серверном режиме;
  [x] «позади» только без фокуса/ленты, «до …» по последней неотменённой строке;
  [x] регрессии полного и частичного завершения.
  [ADR 0115](decisions/0115-finished-journals-are-past-on-today.md),
  [отчёт](../../app/review/22-som-26-today-finished-sessions/README.md).
  [ ] Native, live Supabase и одобрение владельца; SOM-26/SOM-45 и экран не приняты.

- 05.10.2026 — SOM-39, исправление #89 после #90: [x] явная регистрация основных
  ScrollView десяти вкладок через публичный marker на iOS NativeTabs, включая
  header-first; [x] удалён measured bottom-padding Сегодня, stack/Android/web
  сохраняют прежнее поведение. [Отчёт](../../app/review/01-som-39-native-liquid-glass-tabs-fix/README.md).
  [ ] Настоящие iOS 26/старый iOS/Android, доступность, dock/insets и приёмка
  владельца; SOM-39 и экраны целиком не приняты.

- 05.10.2026 — SOM-26, исправление #88: [x] удалены 12 ошибочно влитых PNG
  и служебные generated-артефакты по ADR 0066; [x] исправлен исторический отчёт.
  Реализация и бриф 21 сохранены. [ ] Native и одобрение владельца; экран и
  задача целиком не приняты. [Проверки](../../app/review/00-som-26-calm-today-fix/README.md).

- 05.10.2026 — SOM-39, бриф 21 после #88: [x] пять системных NativeTabs обеих
  ролей, SF Symbols/Material, tint/тема, onScrollDown, положительный бейдж Сегодня;
  [x] удалены самописная поверхность/индикатор, ручная высота панели и idle preload;
  [x] документировано ограничение action «+», существующая кнопка в шапке сохранена.
  [ADR 0113](decisions/0113-native-system-tabs.md) отменяет ADR 0111.
  [Отчёт](../../app/review/21-som-39-native-liquid-glass-tabs/README.md).
  [ ] iPhone iOS 26: стекло/drag/сворачивание/первый кадр/insets/доступность;
  [x] публичный ScrollViewMarker на Сегодня интегрирован последующим исправлением #89
  (см. новый отчёт выше); исходное ограничение брифа 21 сохранено в его отчёте.
  [ ] старый iOS/Android и одобрение
  dock fallback владельцем. Экраны не приняты.

- 05.10.2026 — SOM-26, решение владельца: [x] спокойный «Сегодня» в эталоне
  (B «Сейчас» + лента A, «Нужен ответ», без сводки с пандой), тесты прототипа 138/138.
  [x] перенос в демо и серверный режим приложения: «Сейчас»/«Следующее», лента без
  повторов, запросы и прошедшие; бейдж только при N > 0.
  [ ] native и одобрение владельца.
  [Отчёт SOM-26](../../app/review/20-som-26-calm-today/README.md).
  [ADR 0112](decisions/0112-calm-today-screen.md).

- 05.10.2026 — SOM-39, бриф 18 r2: [x] плавающая навигация Liquid Glass обеих ролей,
  fallback/reduce transparency и общий нижний отступ по измерению панели, safe area
  и dock; [x] dependency ADR 0110 снята #80; [x] `npm run check`: 3295 tests.
  [ADR 0111](decisions/0111-floating-liquid-glass-tabbar.md),
  [отчёт](../../app/review/18-som-39-liquid-glass-tabbar-r2/README.md).
  [ ] Настоящее стекло/касание, клавиатура/шторки/VoiceOver на iPhone, визуальное
  сравнение и одобрение владельца. SOM-39 целиком и экраны не приняты.

- 05.10.2026 — SOM-39, регрессия #77/#78: [x] `className` терялся на Animated-
  компонентах с анимированным стилем (iPhone: нет отступов/рядов/фонов);
  [x] `AnimatedView`/`AnimatedPressableView` + `animatedStyle`, тесты 3201/3201,
  симулятор: кнопки входа в норме. [ ] Release на iPhone, все экраны и
  одобрение владельца. [ADR 0110](decisions/0110-animated-styles-outside-nativewind.md).

- 05.10.2026 — SOM-31, бриф 19: [x] журнал, ввод подходов, отдых, dock, заметки,
  шторки и production-ввод следуют теме; [x] устранён forced-dark; [x] исходные
  тёмные стили зафиксированы тестом; [x] обе темы/контраст/черновик проверяются.
  [ADR 0109](decisions/0109-workout-follows-app-theme.md),
  [отчёт](../../app/review/19-som-31-workout-follow-theme/README.md).
  [ ] Native status bar, визуальное сравнение и одобрение владельца; экран не принят.

- 05.10.2026 — SOM-31, бриф 18: [x] событийное выравнивание активной карточки,
  ожидание drag/momentum и reduce motion; [x] компактная карточка и фиксированный
  dock, раздельная прокрутка сведений при крупном тексте; [x] расчётные проверки
  393×852 / 375×667 и synthetic tests. [ADR 0108](decisions/0108-workout-active-exercise-fit.md),
  [отчёт](../../app/review/18-som-31-workout-active-exercise-fit/README.md).
  [ ] Не проверено на iPhone: native размеры/клавиатура/шторки/максимальный текст,
  visual parity, VoiceOver и одобрение владельца. SOM-31 целиком и экран не приняты.
- 05.10.2026 — SOM-26, бриф 18: [x] Клиенты → Дата → Время → Программа,
  возврат по чипу и строке даты сохраняет выбор; [x] смена даты очищает только
  недоступное начало; [x] тесты шагов и восстановления pending, ru-ресурсы.
  [ADR 0107](decisions/0107-session-date-and-time-steps.md),
  [отчёт](../../app/review/18-som-26-schedule-time-step/README.md).
  [ ] Native, визуальная сверка всех состояний и одобрение владельца;
  SOM-26 целиком и экран не приняты.

- 04.10.2026 — SOM-38, бриф 17 (решение владельца 05.10 из брифа):
  [x] выбранные WebP/постеры, явные места, static gates и teardown плееров;
  [x] jump в прежнем праздновании 2200 мс; [x] stretch/listen без новых мест;
  [x] шесть клипов ≤300 000 байт, wave — разрешённое исключение 445 248 байт.
  [Отчёт](../../app/review/17-som-38-mascot-clips-integration/README.md),
  [ADR 0106](decisions/0106-approved-panda-webp-clips.md).
  [ ] Native ощущение/FPS/память декодера, visual parity и одобрение владельца;
  вопрос calm-контекстов не закрыт. SOM-38 целиком и экраны не приняты.

- 04.10.2026 — SOM-39, бриф 15 r2 после MERGED #77: [x] UI-движение тостов,
  шторок/scrim, записи подхода, нового упражнения/заметок, steps/rest и demo dock;
  [x] общий calm/reduce и synthetic проверки, presentation adapters voice/hold.
  [Отчёт](../../app/review/15-som-39-motion-workout-r2/README.md).
  [ ] voice runtime: существующего demo/hold в базе нет, disabled сохранён по SOM-54;
  [ ] native ощущение/FPS/жесты, максимальный шрифт, screen readers, visual parity
  и одобрение владельца. SOM-39 целиком и экраны не приняты.

- 04.10.2026 — SOM-39, бриф 14: [x] общий вход вкладок/stack через focus,
  CSS stagger/tabPop/нажатия/pulse/shimmer/growX, shared calm/reduce policy,
  idle-предзагрузка вместо монтирования всех вкладок перед первым кадром.
  [Отчёт](../../app/review/14-som-39-motion-navigation/README.md),
  [ADR 0105](decisions/0105-navigation-motion-policy.md).
  Native iPhone 14 Pro/Android, визуальный паритет и приёмка владельца открыты;
  журнал/тосты/шторки — бриф 15, маскот — SOM-38. SOM-39 целиком не закрыт.

- 04.10.2026 — SOM-38: [x] точные CSS-кейфреймы PNG-поз через Reanimated,
  shadow/glow/sleep z, вход/poke, fxPanda/fxFade/confetti/spark 2200 мс;
  [x] reduce motion/calm gates, статичные лица, отмена циклов при уходе/размонтировании;
  [x] тесты против CSS и жизненного цикла. [ ] Native FPS/Release и визуальная
  приёмка владельца; [ ] карта calm-контекстов существующих вызовов — OPEN-QUESTIONS.
  [Отчёт](../../app/review/13-som-38-mascot-motion/README.md),
  [ADR 0104](decisions/0104-prototype-panda-reanimated-motion.md).

- 04.10.2026 — SOM-38 clips: подготовлены кандидаты из 7 одобренных роликов и
  существующих front-idle/listen: анимированный WebP, спрайт-лист/JSON, контакт-листы
  и локальное сравнение. [Материалы и проверка](../../design-exploration/mascot-motion-2026-10-04/README.md).
  Код приложения не изменён; выбор формата/моментов и одобрение владельца открыты.

- 04.10.2026 — SOM-41 CI repair #73, попытка 2: устранены оставшиеся конфликты
  SQL-алиасов `c`/`a` с record-переменными в trigger installation/workspace cleanup.
  SQL execution и последующие database checks требуют повторного CI; base/pilot
  migrations не изменены. [Отчёт](../../app/review/01-som-41-account-deletion/README.md).

- 04.10.2026 — SOM-41 CI repair #73: устранён конфликт `pg_class t` с переменной
  `t record` при установке новой deletion migration. SQL/Auth/type проверки первой
  попытки CI были пропущены после ошибки установки; повторная проверка — в CI.
  [Отчёт](../../app/review/01-som-41-account-deletion/README.md).

- 04.10.2026 — SOM-41 deletion: [x] обе роли/dual по server identity и ADR 0101,
  own workspace cleanup и сохранение чужой истории; [x] durable prepare/DB/Auth/
  complete/status recovery и transactional writer interlock; [x] account-local
  inventory, exact file outcome/ack, pending/rejected/conflict/draft blockers,
  inflight/storage/session fences и scoped settled-cache cleanup; [x] independent
  controller/service/UI/storage tests, server synthetic transport, full FK pgTAP
  fixtures и extended CI Auth smoke. App check: 238 suites / 3079 tests; server
  synthetic: 12 tests. [Отчёт](../../app/review/01-som-41-account-deletion/README.md),
  [handoff](privacy/ACCOUNT-DELETION-HANDOFF.md),
  [ADR 0103](decisions/0103-durable-account-deletion-and-local-proof.md).
  [ ] needs-local-db: SQL lint/pgTAP/Auth/concurrency/type drift в CI;
  [ ] installed native/file/SQLite/logout/reopen, два телефона, cloud apply,
  backup/log rotation, юрист, visual/accessibility и owner acceptance.
  Политика draft, пилот не изменён; SOM-41 целиком и экран не приняты.
- 04.10.2026 — SOM-32 program update: [x] additive server command/receipt/provenance,
  immutable personal copy и saved-only selection; [x] реальный SOM-31 booking source,
  caller/JWT/pending/dismiss guards и readback; [x] independent synthetic regressions,
  pgTAP и assignment/correction/update races в existing CI harness.
  App check: 240 suites / 3048 tests; iOS/Android/web export PASS.
  [Отчёт](../../app/review/01-som-32-program-update/README.md),
  [ADR 0103](decisions/0102-program-update-receipts-and-sources.md).
  [ ] needs-local-db: SQL lint/pgTAP/concurrency/generated types CI;
  [ ] два телефона/offline/SQLite/crash/reopen, parity/accessibility и owner acceptance.
  Неоднозначность values/prev сохранена в OPEN-QUESTIONS; SOM-32/экран не приняты.

- 04.10.2026 — SOM-73 r3: [x] additive private device/delivery schema и JWT/capability/
  generation lifecycle; [x] native prompt/rotation/logout и own cold/warm open;
  [x] sender/leases/tickets/receipts/unknown recovery и due reminder/daily scheduler;
  [x] synthetic controller/native hook/service/transport/routing tests, pgTAP и
  отдельный concurrency harness. Fresh app check: 233 suites / 3005 tests;
  iOS/Android/web export, Deno typecheck и localhost fail-closed probe PASS. [Отчёт](../../app/review/12-som-73-push-v1-r3/README.md),
  [handoff](PUSH-V1.md), [ADR 0099](decisions/0099-push-device-leases-and-due-evaluation.md).
  [ ] SQL lint/pgTAP/type drift CI и manual push/notification concurrency;
  [ ] live EAS/APNs/FCM/Expo, installed iOS/Android, parity/accessibility и owner
  acceptance. Утреннее время — обязательный server parameter, без owner default.
  Этап 8/issue не приняты.

- 04.10.2026 — SOM-37 r2: [x] additive notification events/read/RLS schema;
  [x] реальные ленты, серверный unread, явный read, pagination и own target обеих
  ролей; [x] isolated Realtime/JWT/caller/reconnect/focus fences и independent
  synthetic regressions. App check: 225 suites / 2960 tests, type/lint/format green.
  [Отчёт](../../app/review/10-som-37-notification-feed-r2/README.md),
  [ADR 0098](decisions/0098-transactional-notification-feed.md).
  [ ] needs-local-db: SQL lint/pgTAP/type drift и новый manual concurrency harness;
  [ ] real Auth/Realtime на двух телефонах, native/accessibility/parity и owner
  acceptance. Push transport — отдельная SOM-73 по ADR 0065; экран/issue не принят.

- 04.10.2026 — SOM-36 r2 на свежей базе `9e0328c`: [x] authenticated client entry,
  Home с server schedule/plan/request/aggregate balance и finished progress;
  [x] History/detail, Progress/week/exercise history и JWT/caller/reset guards;
  [x] existing SOM-27 durable request/reply/reschedule/cancel с server readback;
  [x] независимые synthetic service/hook/screen flows и additive read RPC/types/pgTAP.
  [Отчёт](../../app/review/09-som-36-client-production-r2/README.md),
  [ADR 0097](decisions/0097-client-overview-and-read-lifetimes.md).
  [ ] SQL/RLS/Auth/concurrency/type drift в CI; [ ] real storage/crash/reopen,
  два телефона, native/accessibility/parity и одобрение владельца. Этап 7/SOM-48
  не приняты; selective program update и финансовые commands не менялись.

- 04.10.2026 — SOM-21 r2: [x] invitation mutations и own-card reads с expected
  caller JWT session/explicit bearer; [x] live-operation exact retry, route lifetime
  и conditional pending generation/token clear; [x] synthetic transport/pending/
  hook/route/screen regressions полного сценария; check: 217 suites / 2905 tests,
  type/lint/format зелёные. [Отчёт](../../app/review/05-som-21-invitations-production-finish-r2/README.md),
  [ADR 0096](decisions/0096-invitation-caller-session-and-intent.md).
  [ ] SQL/pgTAP/concurrency в CI, live Auth/storage/share/crash/reopen,
  cold/warm native links, visual/accessibility и одобрение владельца; экраны не приняты.

- 04.10.2026 — SOM-34 production flow: [x] реальные header totals и billing,
  частичная/полная оплата, debt и one-row reversal history; [x] session/caller/
  generation/dismiss fencing форм и own-client durable recovery; [x] synthetic
  read+command+controller workflow и новый SQL rollback/workflow test.
  [Отчёт](../../app/review/05-som-34-billing-production-finish/README.md),
  [ADR 0095](decisions/0095-financial-presentation-and-client-totals.md).
  [ ] needs-local-db для Claude/CI; [ ] live Auth/storage/crash/reopen/native,
  два устройства, parity и одобрение владельца. SOM-47 и приёмка не включены.

- 04.10.2026 — SOM-27: [x] обе роли status/propose/counter/accept/decline/withdraw,
  actor/workspace/client/session fencing, exact durable replay/resolution и
  UI/provider generations; [x] synthetic transport/store/hooks/controls regressions,
  additive pgTAP и cancellation-penalty concurrency scenarios.
  Полный check на свежей базе: 200 suites / 2580 tests, type/lint/format зелёные.
  [Отчёт](../../app/review/som-27-reschedule-production-finish/README.md),
  [ADR 0093](decisions/0093-booking-command-session-and-recovery.md).
  [ ] needs-local-db: SQL/RLS/Auth/concurrency/types; real storage/crash/reopen,
  два телефона, native/parity/accessibility и одобрение владельца. Не принята.

- 04.10.2026 — SOM-41 export: [x] пользовательский settings → prepare → coverage
  → file flow, версия 2 с серверным snapshot, scoped SQLite raw operations/receipts,
  валидированными local entries, server conflicts/correction context и доступными
  pending/drafts; [x] source manifest/gaps, unknown globalAtomicity, identity fences,
  наблюдаемые изменения при повторных чтениях и SHA-256 file outcome.
  Полный app check: 204 suites / 2537 tests; type/lint/format зелёные.
  [Отчёт](../../app/review/som-41-complete-export/README.md),
  [ADR 0092](decisions/0092-account-export-source-coverage.md).
  [ ] SQL/RLS/live Auth, real SQLite/file/share/crash/reopen, visual/native/
  accessibility и приёмка владельца. Экспорт намеренно incomplete; отсутствие
  промежуточных записей не доказано. Deletion/policy остаются отдельным пакетом,
  SOM-41 целиком не закрыта.

- 04.10.2026 — SOM-23 editor: [x] caller/draft scope и late save/discard/reload guards; [x] immutable pending retry и durable explicit reload; [x] synthetic create/edit/copy/read и lifecycle regressions; полный app check 2717 tests / 209 suites, type/lint/format зелёные. [Отчёт](../../app/review/04-som-23-editor-production-finish/README.md), [ADR 0094](decisions/0094-template-editor-caller-lifetime.md). [ ] needs-local-db: новый template-specific pgTAP и existing concurrency; live Auth/storage/crash/reopen/native/parity и одобрение владельца. Issue и экраны не приняты.

- 04.10.2026 — SOM-20 onboarding: [x] полный service → hook → route/welcome session fence,
  unknown scoped context, explicit bearer и safe atomic retry; [x] synthetic workflow
  first trainer → optional client → existing real client read → return, relogin на
  всех completion I/O и новые SQL returning-connections contracts.
  [Отчёт](../../app/review/som-20-onboarding-production-finish/README.md).
  [ ] needs-local-db/CI SQL runtime, live Auth/native/parity и одобрение владельца;
  issue и экраны не приняты.
- 04.10.2026 — SOM-22: [x] exercise create/archive session fence, durable exact input/UUID replay, shared owned provider lock и route unmount/scope guards; [x] independent synthetic service/provider/route regressions; полный app check 2347 tests / 186 suites, type/lint/format зелёные. [Отчёт](../../app/review/som-22-library-production-finish/README.md), [ADR 0091](decisions/0091-exercise-mutation-session-and-replay.md). [ ] needs-local-db: additive INSERT(id) grant, pgTAP/concurrency; live Auth/storage/crash/reopen/native/parity и одобрение владельца.
- 04.10.2026 — SOM-32 finish r2: восстановлен полный пакет закрытого PR #54 на свежей базе; [x] доказательство terminal current resolution через existing scoped receipts и продолжение ввода/новый explicit finish; [x] credentials исключены из React keys/state. [Отчёт r2](../../app/review/som-32-production-finish-r2/README.md), [ADR 0089](decisions/0089-terminal-finish-current-recovery.md). Полный check: 188 suites / 2332 tests, type/lint/format зелёные; [ ] correction/program contracts, live/storage/native/parity и приёмка владельца. SOM-32 целиком не завершена.

- 04.10.2026 — SOM-32 explicit correction: [x] отдельная новая migration,
  owner list/review/apply, immutable receipt/audit и serialized revision/provenance
  validation; [x] typed session-fenced transport, отдельный durable command store,
  явный просмотр/подтверждение и finished journal readback; [x] synthetic tests.
  Полный app check: 182 suites / 2178 tests, type/lint/format зелёные.
  [ ] needs-local-db: SQL lint/pgTAP/concurrency/type drift; [ ] real auth/storage,
  native/parity и одобрение владельца. Personal-program update остаётся
  заблокированным immutable-copy/provenance решением; SOM-32 целиком не закрыта.
  [Отчёт](../../app/review/som-32-explicit-correction-server/README.md),
  [ADR 0090](decisions/0090-explicit-finished-journal-correction.md).

- 04.10.2026 — SOM-26 presentation/lifecycle: [x] Today/week/create caller scope,
  same-user relogin reset, owned provider lock/result/finally и verified refresh;
  [x] overlap acknowledgement/save, exact durable group-plan retry и server-only
  read refresh с synthetic regressions; [x] default day/week rollover timezone.
  Полный check после свежей базы: 184 suites / 2286 tests, type/lint/format зелёные.
  [Отчёт](../../app/review/som-26-schedule-production-finish/README.md),
  [ADR 0087](decisions/0087-schedule-presentation-session-lifecycle.md).
  [ ] Live SQL/RLS/Auth, native storage/crash/reopen, два телефона,
  visual/accessibility/parity и приёмка владельца. Issue и экраны не приняты.

- 04.10.2026 — SOM-34 mutations: [x] actor/workspace/session fence до async,
  explicit bearer/result/error/storage guards; [x] session-aware command hook,
  conditional clear/recovery и exact-ID durable retry с synthetic regressions.
  Полный app check: 178 suites / 2107 tests, type/lint/format зелёные.
  [Отчёт](../../app/review/som-34-financial-command-session-fencing/README.md),
  [ADR 0086](decisions/0086-financial-command-session-fencing.md).
  [ ] SQL/RLS/live auth/real storage/reopen/crash/native/parity и owner acceptance;
  issue и экраны не приняты.
- 04.10.2026 — SOM-32 finish: [x] production durable finish, saved-only summary и partial/empty confirmation; [x] synthetic domain/service/hook/screen regressions (check: 179 suites / 2056 tests); correction draft и selective program update остаются отдельными контрактами. [Отчёт](../../app/review/som-32-production-finish/README.md), [ADR 0087](decisions/0087-production-workout-finish-outbox.md). Runtime/parity и одобрение владельца открыты; SOM-32 целиком не закрыта.
- 04.10.2026 — SOM-23: [x] template save/archive session fencing и provider pending recovery/owned lock; [x] synthetic relogin/refresh/cache/clear-await regressions, полный check 1931 tests / 172 suites; type/lint/format зелёные. [Отчёт](../../app/review/som-23-template-save-session-fencing/README.md), [ADR 0085](decisions/0085-template-mutation-session-fencing.md). [ ] Live auth/SQL/RLS/storage/crash/native/parity и одобрение владельца.

- 04.10.2026 — SOM-20 creation: [x] actor/workspace/JWT session/caller fencing, explicit bearer, route/sheet generations и in-memory retry с прежним requestId; [x] synthetic race regressions. [ ] Live auth/SQL/RLS/native/parity и одобрение владельца; disk/crash/reopen recovery не заявляется. [Отчёт](../../app/review/som-20-client-creation-session-fencing/README.md), [ADR 0086](decisions/0088-client-creation-session-fencing.md). Issue и экраны не приняты.

- 04.10.2026 — SOM-41 scoped SQLite snapshot: [x] additive read-only API всех
  scoped outbox rows и raw entries, одна queued transaction, runtime validation
  и session/close/cancellation fencing; [x] synthetic driver/seam regressions.
  Полный app check: 173 suites / 2007 tests, type/lint/format зелёные.
  [ ] Native SQLite/connections/crash/reopen, cross-source collector/barrier,
  file/export/ack proof, deletion и приёмка владельца. SOM-41 не закрыта.
  [Отчёт](../../app/review/som-41-scoped-outbox-snapshot/README.md),
  [ADR 0086](decisions/0084-scoped-sqlite-outbox-snapshot.md).

- 03.10.2026 — SOM-26 creation: [x] login/scope/lifecycle fence и durable retry с conditional clear; [x] synthetic regressions relogin/refresh/storage/cache/overlap/plan; [ ] live auth, SQL/RLS, native/parity, реальный storage crash и приёмка владельца. [Отчёт](../../app/review/som-26-booking-creation-session-fencing/README.md), [ADR 0083](decisions/0083-booking-creation-session-fencing-and-durable-retry.md). Issue и экраны не приняты.
- 03.10.2026 — SOM-24 r2: восстановлен полный пакет PR #46 без слияния;
  [x] verified JWT sub/session_id fence transport/hook и durable retry;
  свежая база с SOM-20/SOM-22 read fencing сохранена, ADR при интеграции перенумерован 0082.
  Полный check: 1846 tests / 163 suites, type/lint/format зелёные.
  Текущие проверки — в [отчёте r2](../../app/review/som-24-assignment-session-fencing-r2/README.md).
  [ ] live auth/SQL/RLS/concurrent receipts, real storage/reopen/crash,
  native/parity и одобрение владельца. SOM-24 целиком не закрыта.
  [ADR 0082](decisions/0082-program-assignment-session-fencing.md).
- 03.10.2026 — SOM-24 client program read: [x] actor/client/session fence, explicit bearer, bounded validated lines и hook auth/retry/focus reset; [ ] SQL/RLS/live auth/native/parity/storage crash и одобрение владельца. Assignment не менялся; интеграция после invitation read. [Отчёт](../../app/review/som-24-client-program-read-fencing/README.md), [ADR 0085](decisions/0081-client-program-read-session-fencing.md). Issue и экран не приняты.
- 03.10.2026 — SOM-41 local export r2: [x] исходный pure пакет из закрытого PR #39,
  SQL-shaped conflict/correction contracts, kind-specific aggregate validation и
  synthetic round-trip regressions; [ ] collector, real SQLite/SQL/file API,
  deletion integration и одобрение владельца. SOM-41 не закрыта.
  Полный app check на 9031157: 159 suites / 1731 tests; только synthetic проверки.
  [Свежий отчёт r2](../../app/review/som-41-local-export-contract-r2/README.md),
  [ADR 0080](decisions/0080-pure-local-export-envelope.md).

- 03.10.2026 — SOM-20 reads: [x] owner/auth fencing, bounded deterministic pagination,
  unknown-row validation и read lifecycle списка/карточки; [ ] SQL/RLS/live auth,
  native/parity и одобрение владельца. Issue и экраны не приняты.
  [Отчёт](../../app/review/som-20-trainer-client-read-fencing/README.md),
  [ADR 0079](decisions/0079-trainer-client-read-fencing.md).

- 03.10.2026 — SOM-22 read path: [x] runtime validation строк/связей, bounded pagination и session fence; [x] provider scope/request fencing с сохранением durable draft/pendingSave; полный check: 1698 tests / 156 suites, type/lint/format зелёные. [Отчёт](../../app/review/som-22-library-read-fencing/README.md), [ADR 0078](decisions/0078-validated-session-fenced-library-reads.md). [ ] SQL/RLS/live API/real auth, native/parity и приёмка владельца; SOM-22 целиком не закрыт.

- 03.10.2026 — SOM-35: [x] session fence клиентской истории, auth reset страниц/detail, workspace read seam и synthetic regressions (check: 1582 tests / 152 suites); [ ] live API/RLS, native, два телефона и приёмка владельца. [Отчёт](../../app/review/som-35-history-session-fencing/README.md), [ADR 0076](decisions/0076-client-history-session-fencing.md).

- 03.10.2026 — SOM-26 read gap: [x] runtime validation всех read rows/связей,
  [x] bounded pagination без успешного обрезания, [x] фиксированная авторизация
  страниц и session-aware hook/controller; предложения вне недели сохранены.
  [Отчёт](../../app/review/som-26-schedule-read-fencing/README.md),
  [ADR 0075](decisions/0075-session-fenced-schedule-read.md).
  [ ] SQL/RLS/live API, native/parity, два устройства и одобрение владельца.
  Полный `cd app && npm run check`: 1636 tests / 154 suites, type/lint/format зелёные.
  SOM-26/SOM-45 остаются открытыми; creation/mutation commands не изменены.

- 03.10.2026 — SOM-31 r2: [x] исправлен lifecycle replacement/sets после current
  receipt, сохранение свежего server snapshot для offline reopen и fencing участника;
  [x] domain/service/hook регрессии current/incoming/retry/rejected;
  app check: 1626 tests / 159 suites, type/lint/format зелёные.
  [ ] needs-local-db: SQL lint/pgTAP/concurrency, generated drift, реальные SQLite/
  crash/native/parity и одобрение владельца. SOM-31 целиком не принята.
  [Отчёт r2](../../app/review/som-31-workout-entry-r2/README.md).

- 03.10.2026 — SOM-31: [x] production focus/sheet, draft/null/zero, durable undo,
  три изолированных участника, journal-only add/replace и conflict selection;
  [x] новый snapshot preparation RPC и вымышленные fixtures;
  app check зелёный: 1505 tests / 153 suites, type/lint/format.
  [ ] SQL/pgTAP/concurrency runtime, generated drift, real SQLite/reopen/crash,
  native/visual/accessibility и одобрение владельца. SOM-31 и этап 5 не приняты.
  Finish/correction — SOM-32; SQL зависит от совместимого исправления PR #34.
  [Отчёт](../../app/review/som-31-workout-entry/README.md),
  [ADR 0075](decisions/0075-booking-snapshot-journal-entry.md).

- 03.10.2026 — SOM-34 read fencing: [x] lifecycle/session identity guards,
  hook epoch, bounded exact-count paging и scoped relation validation;
  [ ] live auth/SQL/RLS/native/visual и одобрение владельца. UI/mutations не менялись.
  [Отчёт](../../app/review/som-34-financial-read-session-fencing/README.md),
  [ADR 0077](decisions/0077-financial-read-session-fencing.md).

- 03.10.2026 — SOM-41 UI: [x] authenticated settings entry, локализованный controller,
  fenced snapshot и UTF-8 file adapters; [ ] real native/web/file API, parity и owner approval.
  Удаление/local pending ack не подключены; SOM-41 и пилот не закрыты.
  [Отчёт](../../app/review/som-41-export-ui/README.md), [ADR 0074](decisions/0074-session-fenced-export-file-delivery.md).

- 03.10.2026 — SOM-41 preflight: [x] pure typed evaluator и blocker tests,
  [x] [schema/technical handoff](privacy/DELETION-PREFLIGHT-CONTRACT.md);
  [ ] runtime integration/delete, local export/ack, DB/Auth recovery, backup rotation
  и одобрение владельца. SOM-41 остаётся открытой.
  [Отчёт](../../app/review/som-41-deletion-contract/README.md).

- 03.10.2026 — SOM-40 monitoring: [x] isolated allowlist/opt-in/EU gate,
  injectable bounded transport и минимальный root bootstrap;
  [ ] cloud/native verification, инфраструктурные логи, юридический review
  и одобрение владельца. SOM-40 остаётся открытой.
  [Отчёт](../../app/review/som-40-error-monitoring/README.md),
  [handoff](pilot/ERROR-MONITORING.md).

- 03.10.2026 — SOM-40 backup package: [x] encrypted dump/allowlists, UTC cleanup,
  disabled nightly и manual synthetic restore tooling; [ ] real restore, EU storage
  evidence, environment/secrets, schedule gate и одобрение владельца.
  [Отчёт](../../app/review/som-40-pilot-backup/README.md),
  [runbook](pilot/BACKUP-RESTORE.md). SOM-40 и этап 10 остаются открытыми.
- 03.10.2026 — SOM-40 config package: [x] локальный public preflight и CLI tests;
  [x] [environment handoff](pilot/ENVIRONMENT.md), ADR 0070.
  [ ] Cloud creation/deployment, отдельные DB/log/backup region evidence, restore,
  telemetry, native и owner approval. SOM-40 и пилот не завершены.
  [Отчёт](../../app/review/som-40-pilot-config/README.md).

- 03.10.2026 — SOM-41 read-only package: [x] owner-scoped export RPC,
  26 versioned collections и независимые typed domain/service; [x] app tests,
  check после вливания SOM-30: 1430 tests / 142 suites. [ ] SQL/pgTAP runtime, generated type drift,
  real API; CI блокируют исходный apply_operations lint и Expo versions.
  UI и account deletion — будущие пакеты, SOM-41 не закрыт.
  [Отчёт](../../app/review/som-41-trainer-export/README.md),
  [ADR 0069](decisions/0069-owner-scoped-server-workspace-export.md).

- 03.10.2026 — SOM-30 на базе SOM-29-r2 `19c62af` (PR #26): [x] server read
  назначенных booking snapshots/участников/прошлых подходов; [x] атомарный typed
  SQLite cache и scoped recovery; [x] workspace read-only journal, общий dock и
  entry Today/Schedule; [x] fencing logout/switch и stop/close SOM-29 runtime без purge.
  [Отчёт](../../app/review/som-30-workout-preload-recovery/README.md),
  [ADR 0068](decisions/0068-workout-preload-and-scoped-recovery.md).
  Полный `cd app && npm run check`: 1382 tests / 140 suites, type/lint/format зелёные;
  static export iOS/Android/web проходит (не runtime).
  [ ] Real SQLite/reopen/crash, SQL/RLS/runtime/generated drift, native/parity и
  owner approval. Ввод/conflict UI — SOM-31, finish/correction — SOM-32; общий
  group offline→online→second-device критерий этапа 5 остаётся открытым.
- 03.10.2026 — SOM-41: подготовлены review drafts политики приватности, карты
  данных и checklist будущего удаления по схеме/ADR 0061/0062/0064.
  [Документы](privacy/PRIVACY-POLICY-DRAFT.md),
  [отчёт](../../app/review/som-41-privacy-documents/README.md).
  Backend export выполняется отдельно; delete, юридический review и одобрение
  владельца открыты. SOM-41 и этап 10 не закрыты.

- 03.10.2026 — SOM-29 r2 после закрытого PR #24: исходный модуль перенесён
  на свежую базу с SOM-39/SOM-34; исправления конфликтов заметок и снимков
  структуры, усиленные SQLite/runner проверки. Существующие экраны не подключены.
  Свежий полный app check: 1307 tests / 131 suites, type/lint/format зелёные.
  [Отчёт r2](../../app/review/som-29-sqlite-outbox-r2/README.md).
  SQL/native/generated drift и одобрение владельца открыты. SOM-30/31 ждут
  вливания исправленной SOM-29; этап 5 не принят.

- Coordinator integration SOM-34: база SOM-39 влита, полный npm run check
  зелёный: 1247 tests / 128 suites, type/lint/format. Native/owner приёмка открыты.

- 03.10.2026 — SOM-34 follow-up по решению `8c03812`: [x] одна строка
  отменённой оплаты с зачёркнутой суммой/датой; [x] подтверждение с причиной;
  [x] scoped durable reversal и workspace lock, receipt validation, refresh
  истории/долга. Посещения/credits не меняются. Полный `npm run check` зелёный: 1232 tests / 126 suites, type/lint/format.
  [ ] Native/visual/owner acceptance; SQL и real network replay не проверены.
  Linear не изменялся. [ADR 0059](decisions/0059-package-creation-and-capped-payments.md),
  [отчёт](../../app/review/som-34-payment-reversals/README.md).

- 03.10.2026 — SOM-39: настройка calm отдельно для обеих ролей, API для SOM-38,
  AccessibilityInfo и ReduceMotion; функциональные Reanimated-анимации и
  адаптивная вёрстка Today/журнала при fontScale 134–200%. 1220 tests / 124 suites,
  type/lint/format, all-platform export, 24 capture pairs и 8 web simulations
  проходят. Проверки и ограничения
  — [отчёт](../../app/review/som-39/README.md), [ADR 0063](decisions/0063-calm-mode-and-accessible-motion.md).
  Координатор подключил shared mascot/celebration calm flags и reduced-motion PNG.
  Свежий npm ci + check: 1228 tests / 126 suites, type/lint/format зелёные.
  Нативная проверка и одобрение владельца остаются открытыми.
- 03.10.2026 — SOM-29: самостоятельный SQLite outbox и journal RPC поверх SOM-28;
  atomic local writes, scoped retries, receipts, обе версии конфликтов и приватные
  correction drafts. Существующие экраны не подключены (SOM-30/31/32).
  App check: 1254 tests / 127 suites, type/lint/format зелёные.
  SQL runtime, native airplane/reopen/crash, generated type drift и owner приёмка
  открыты; этап 5 не объявляется завершённым.
  [Отчёт](../../app/review/som-29-sqlite-outbox/README.md),
  [ADR 0062](decisions/0062-sqlite-journal-outbox.md).

- 03.10.2026 — SOM-33/SOM-34 продолжены с WIP `4704f31`: package creation,
  capped positive/partial payments и payment read подключены; история приведена
  к структуре прототипа, ошибка чтения предлагает retry. Исправлены undefined
  guards в тестах и сохранение UUID-подобных title/reason при exact replay.
  Coordinator integration: полный check зелёный, 1213 tests / 124 suites.
  Историческая проверка рабочего: 1210 tests / 123 suites, lint/format проходят; полный check блокирует
  существующий `src/ui/button.tsx:83` (`hovered`), файл
  исключён границами задачи. SQL/browser не проверены в контейнере; владелец ранее
  сообщил о 723 pgTAP checks и concurrency. Native/visual/owner acceptance и
  отображение сторно остаются открытыми; Linear только прочитан.
  [ADR 0059](decisions/0059-package-creation-and-capped-payments.md),
  [отчёт](../../app/review/som-34-billing-finish/README.md).

- 03.10.2026 — SOM-38: PNG через expo-image, все позы/лица, `hidden`;
  Rive за `EXPO_PUBLIC_MASCOT_RIVE=true`, по умолчанию PNG. Добавлено краткое
  PNG-празднование нового завершения. Check: 1208 tests / 123 suites,
  type/lint/format и экспорт iOS/Android/web проходят. Native/parity и одобрение рига открыты.
  [Отчёт](../../app/review/som-38-mascot/README.md), [ADR 0060](decisions/0060-mascot-png-and-gated-rive.md).

- 03.10.2026 — SOM-33/26/27: общий scoped coordinator над workspace Stack
  держит billing/status/proposal/creation pending и synchronous lock. Real Today
  открывает локальную participant sheet; Schedule использует тот же control.
  Recovery остаётся доступным вне sheet после смены дня/маршрута.
  1093 tests / 117 suites, type/lint/format, web/iOS/Android export и 12 default
  Today/Schedule capture pairs проходят. Browser Today lost response → Schedule
  exact replay; DB: один debit, balance1, peer без изменений.
  Native/owner acceptance, creation form/payment policy и production journal
  остаются открытыми. Live Linear не обновлялся.
  [ADR 0058](decisions/0058-shared-workspace-mutation-coordinator.md),
  [evidence](../../app/review/shared-mutations/README.md).

- 03.10.2026 — SOM-33: карточка real client показывает scoped покупки,
  стоимость без потери bigint precision, net used units и срок. Invalid ledger
  не превращается в нулевой остаток; expiry/depleted packages сохраняются.
  Payment badge/Получено/debt неизвестны, payment action disabled до SOM-34.
  1078 tests / 115 suites, type/lint/format, all-platform export и 6 default
  client capture pairs проходят. Synthetic browser проверяет real card и usage
  refresh после server charge. Создание покупки ждёт решения о форме,
  отсутствующей в прототипе; native/owner acceptance и live Linear открыты.
  [ADR 0057](decisions/0057-client-purchase-read-projection.md),
  [evidence](../../app/review/purchases/README.md).

- 03.10.2026 — SOM-33 real schedule attendance: controlled participant sheets,
  scoped ledger projections, scheduled-date eligibility и durable exact-command
  recovery после reload. Исправление возвращает кредит; неявка/отмена требуют
  отдельного списания с причиной. 1065 tests / 112 suites, type/lint/format,
  web/iOS/Android export и 6 default schedule capture pairs проходят.
  Local browser: lost response/reload/exact replay без дубля, correction/restore,
  отдельная no-show penalty и изоляция участника группы проверены.
  Purchase creation UI, payment/debt и native/owner acceptance открыты.
  Live Linear недоступен; удалённые статусы не изменены.
  [ADR 0056](decisions/0056-attendance-controls-and-recovery.md),
  [evidence](../../app/review/attendance/README.md).

- 03.10.2026 — SOM-33 typed attendance/purchase transport: explicit safe reads,
  scoped Bearer на каждой странице/RPC, lossless minor money и validated receipt
  results. 46 focused tests и app check1037 tests/108 suites проходят; real local
  PostgREST bigint text cast проверен. Production attendance UI/recovery и owner/native
  acceptance открыты. SOM-34 payment actions ждут ответа о переплате.
  [ADR0055](decisions/0055-attendance-billing-transport.md),
  [evidence](review/som-33-attendance-transport.md).

- 03.10.2026 — SOM-34 independent foundation: `payment_entries` с immutable
  payment/reversal history, точным полным сторно и закрытым actor ID.
  Clean reset, lint и 686 pgTAP assertions / 20 files проходят; generated type drift
  и strict app typecheck проходят. Payment RPC, debt и app actions остаются открытыми
  до ответа владельца о переплате. Экраны не добавлены и не приняты.
  [ADR 0054](decisions/0054-manual-payment-history.md),
  [evidence](review/som-34-manual-payment-foundation.md).

- 03.10.2026 — SOM-33: серверные покупки, посещения/неявки, ledger и шесть
  owner-only RPC реализованы. Исправление возвращает списанную единицу один раз;
  expiry использует scheduled date в timezone пространства, включая последний
  день. Неявка/отмена без автоматического списания. 660 pgTAP assertions / 19 files, шесть concurrency scenarios, db lint,
  generated type drift и app check (991 tests / 107 suites) проходят. SOM-34 оплаты/долг и app transport
  остаются открытыми; новые экраны и native/owner acceptance не заявляются.
  Live Linear недоступен; удалённые статусы не обновлялись.
  [ADR 0053](decisions/0053-attendance-credit-ledger.md),
  [evidence](review/som-33-attendance-credit-ledger.md).

- 02.10.2026 — продолжение SOM-36/27: server request resolution возвращает
  исходный receipt или фиксирует безопасное abandonment точного запроса;
  recovery transport и действия обеих ролей подключены. Изолированная БД:
  610 assertions / 18 files, lint и 9 concurrency scenarios проходят;
  generated types совпадают. 991 app tests / 107 suites, type/lint/format,
  web/iOS/Android export, trainer 23 и client 34 browser checks проходят.
  Invitation-history runtime проходит 43 checks с сохранением прежних journals
  через signup/link, изоляцией private/peer/draft и отказом другому claimant.
  Live Linear недоступен в этой сессии; scope восстановлен по карте и checkpoint.
  Native/owner acceptance, billing и production journal остаются открытыми.
  [ADR 0052](decisions/0052-booking-request-resolution.md).

- 02.10.2026 — SOM-36 privacy: broad table grants заменены явными safe columns;
  auth/device audit fields недоступны прямому клиентскому API. Trainer copies
  читаются без wildcard, pending proposals через owner RPC с author_role.
  574 assertions / 17 files, SQL lint, 961 tests / 106 suites и type/lint/format
  проходят. Runtime regression/export под новыми grants проверяются отдельно.
  [ADR 0050](decisions/0050-client-visible-api-audit-privacy.md).

- 02.10.2026 — SOM-36: guarded client progress route читает все собственные
  finished journals перед расчётом реальных рекордов и 28-дневных изменений.
  Unknown/zero результаты различаются; partial history не отображает метрики.
  951 тест / 105 suites, type/lint/format, all-platform export и 6 default capture
  pairs проходят. Docker resumed; DB types совпадают. Trainer/browser flows проходят 23/29 checks после isolated Auth restart и
  исправления synthetic client provisioning; owner/native acceptance открыты.
  [ADR 0049](decisions/0049-client-progress-from-finished-history.md).

- 02.10.2026 — SOM-36/24: selected-connection program route, first upcoming
  snapshot plan/on-site note и latest personal-copy fallback только без upcoming.
  Safe reader/hook, readonly snapshot detail и exact-card navigation. 915 тестов /
  100 suites, web/iOS/Android export и 6 default capture pairs проходят. Docker
  paused: program browser assertions подготовлены, не запускались. Native/owner
  acceptance и global API privacy hardening открыты.
  [ADR 0048](decisions/0048-client-program-snapshot-view.md).

- 02.10.2026 — SOM-36: connection history читает собственные finished journals,
  snapshot упражнения, actual sets и shared notes; readonly detail и safe paging
  сохраняют успешные страницы при retry. Default upcoming/history охватывают все
  даты: прежний 41-day лимит снят. 873 теста / 95 suites и web/iOS/Android export
  проходят. Docker paused: runtime browser и свежий schema/types check ожидают
  доступности. Billing/progress, audit-column grants и native/owner acceptance
  открыты. [ADR 0047](decisions/0047-client-finished-history-and-unbounded-dates.md).

- 02.10.2026 — SOM-26/27/36 app: controlled Today и trainer proposal UI,
  выбранная связь клиента с real bookings/snapshot previews и собственными
  confirm/cancel/proposal actions. 855 тестов / 94 suites, web/iOS/Android export и 24 reference/app captures
  без пропущенных states/browser errors проходят. Docker Desktop вручную
  приостановлен: новые browser scenarios и type drift rerun ожидают unpause;
  последний schema check — 494 pgTAP / 16 files. Client booking window — 41 UTC
  days, billing/history/progress/native/owner acceptance открыты.
  [ADR 0044](decisions/0044-controlled-today-and-proposal-ui.md),
  [ADR 0046](decisions/0046-client-booking-controls.md).

- 02.10.2026 — SOM-36 foundation: own-client context и pending proposal RPC,
  закреплённый transport, immutable booking plans, focus hook и UTC adapter.
  Clean reset и 494 pgTAP assertions / 16 files проходят; 39 focused app tests
  покрывают чтение, stale scope и календарную проекцию. Реальный client route
  подключается следующим пакетом; billing/history/progress/native/owner acceptance
  остаются открытыми. [ADR 0045](decisions/0045-client-schedule-read-boundary.md).

- 02.10.2026 — SOM-27: propose/counter/accept/decline/withdraw на сервере,
  ревизии, actor receipts, stale replacement и перенос одного участника группы
  без изменения остальных/снимка. Creation receipts сохраняют первоначальные IDs
  после detachment. Clean reset/lint, 469 pgTAP assertions / 15 files и 3 новых
  concurrency scenarios проходят; transport/recovery — 46 focused tests.
  UI подключается следующим пакетом; native/две роли/owner acceptance открыты.
  [ADR 0043](decisions/0043-booking-reschedule-commands.md).

- 02.10.2026 — SOM-26: создание реального занятия из недели и свободного окна,
  сохранённый выбор программы/участников, async lock и recovery после потери
  ответа; сервер атомарно сохраняет отдельный снимок на booking, legacy retry
  совместим. 660 тестов / 75 suites, 418 pgTAP assertions / 13 files,
  3 concurrency scenarios и 13 browser checks проходят. Today/переносы/native/
  owner acceptance открыты; следующие пакеты продолжаются.
  [ADR 0042](decisions/0042-booking-program-snapshots.md).

- 02.10.2026 — SOM-26/27: реальная неделя доступна из аккаунта; контролируемый
  календарь, free windows, safe read hook и отмена отдельного участника с durable
  recovery. Today/создание/переносы и приёмка открыты; создание требует серверных
  снимков выбранной программы. [ADR 0041](decisions/0041-server-week-calendar.md).
  595 тестов / 71 suites, TypeScript/lint/format, web export, 9 browser checks
  и 6 reference/app captures проходят; визуальное отличие check icon остаётся.
  [Отчёт](../../app/review/workspace-scheduling/README.md).

- 02.10.2026 — SOM-24: непрерывный create → assign проверен для двух шаблонов,
  19 browser checks и 31 focused tests / 3 suites проходят; fresh web export.
  Копии/снимки сохраняются, повтор после потери ответа безопасен. Native,
  редактирование личной копии и owner acceptance остаются открытыми.
  [Отчёт](../../app/review/workspace-programs/README.md).

- 02.10.2026 — параллельные пакеты SOM-26/27: agenda/free windows, явные
  результаты local-time conversion для DST, transport confirm/cancel отдельного
  booking. UI, durable status recovery, переносы и приёмка остаются открытыми.
  Проверки: 542 теста / 66 suites; TypeScript/lint/format проходят.
  [ADR 0039](decisions/0039-schedule-calendar-adapters.md),
  [ADR 0040](decisions/0040-booking-status-transport.md).

- 02.10.2026 — SOM-26 lifecycle: save-before-send, восстановление после потери
  ответа/рестарта, безопасная очистка после результата. Семь новых тестов,
  общий check — 484/63, TypeScript/lint/format проходят. Транспорт готов к
  подключению, Today/неделя/создание и их приёмка ещё открыты.
  [ADR 0038](decisions/0038-booking-creation-recovery.md).

- 02.10.2026 — SOM-26 transport: создание через существующий RPC, проверка
  результатов, безопасный повтор и pending-команда по аккаунту/workspace.
  35 новых тестов; общий check — 477 тестов / 62 suites, TypeScript/lint/format
  проходят. Следующий шаг — lifecycle команды и интеграция Today/недели/создания;
  native/паритет/приёмка открыты. [ADR 0038](decisions/0038-booking-creation-recovery.md).

- 01.10.2026 — SOM-24 follow-up: client context сохраняется через редактор
  шаблона и возвращается в библиотеку/сохранённый шаблон. Browser-сценарий
  назначения проверен отдельно; непрерывный create → assign ещё не повторён.
  Общий check: 442 теста / 60 suites, TypeScript/lint/format проходят.

- 01.10.2026 — SOM-26 foundation: чтение реальных занятий, всех ожидающих
  предложений и доступности workspace; календарные границы в его timezone.
  13 новых unit tests, общий check 435/59 проходит. Следующий шаг — подключить
  Сегодня/неделю и серверное создание занятия; этот пакет не завершает экраны.
  [ADR 0037](decisions/0037-workspace-schedule-reads.md).

- 01.10.2026 — SOM-24 app: назначение из карточки клиента через библиотеку,
  сохранённая команда и восстановление после потери ответа. 435 тестов / 59 suites
  общего check и 15 headless browser checks проходят; второй шаблон создаёт новую
  программу, план первой сохраняется. Native/приёмка и редактирование копии
  открыты. [Отчёт](../../app/review/workspace-programs/README.md).

- 01.10.2026 — SOM-24 transport: RPC и pending assignment по аккаунту/workspace/
  клиенту, безопасные повторы и защита неразрешённой команды. 12 focused tests,
  TypeScript/lint/format проходят. UI назначения в работе; правило SOM-55
  одобрено владельцем: новая копия, прежние без изменений.

- 01.10.2026 — Android arm64 debug APK собран успешно. Native runtime smoke
  остановился до JS (packager HTTP 403); эмулятор остановлен из-за нагрузки RAM.
  Вход/deep links на телефоне остаются открытыми; iOS build требует Xcode 26.4+.
  [Проверки](../../app/review/invitations/README.md#открыто).

- 01.10.2026 — SOM-22/23 app: авторизованные библиотека и редактор, создание/архив
  упражнений, UUID/media, сохранение/копия шаблона, изолированный черновик и
  повтор команды после рестарта. 398 тестов / 55 suites, три экспорта и 11
  headless browser checks проходят. Native/паритет/приёмка открыты. Далее —
  назначение личной программы SOM-24; новая копия с сохранением старых одобрена.
  [Отчёт](../../app/review/workspace-library/README.md).

- 01.10.2026 — SOM-21 app: реальные приглашения, pending intent через вход,
  явное принятие и несколько тренеров в аккаунте. 377 тестов / 53 suites,
  экспорт iOS/Android/web и 7 headless browser checks проходят. Домен pending;
  native и визуальная приёмка открыты. Далее — реальные библиотека и редактор
  SOM-22/23. [Отчёт](../../app/review/invitations/README.md).

- 01.10.2026 — SOM-21: серверные issue/revoke/accept, 7 дней, хэш токена,
  безопасные повторы и отдельный read RPC собственных связей клиента. Clean
  reset, 384 pgTAP / 12 файлов, db lint и три реальные гонки проходят.
  App transport/экраны проходят интеграционную проверку; production-домен,
  native deep links и приёмка открыты. [ADR 0034](decisions/0034-client-invitations.md).

- 01.10.2026 — SOM-20: атомарная настройка, пятишаговый welcome и реальные
  список/поиск/создание/карточка клиента. 333 pgTAP, db lint, гонка setup,
  363 app-теста / 51 suite и экспорт трёх платформ проходят. Два браузерных
  аккаунта проверяют сохранение и изоляцию. Визуальная/native-приёмка открыта;
  следующий пакет — приглашения SOM-21 по подтверждённой политике владельца.
  [ADR 0033](decisions/0033-atomic-trainer-onboarding.md),
  [отчёт](../../app/review/onboarding/README.md).

- 01.10.2026 — SOM-19: email OTP, provider PKCE, хранение/восстановление сессии,
  выход и смена аккаунта. Локальный Auth/Mailpit и браузерный сценарий проходят;
  владелец одобрил layout входа. Apple/Google credentials, native-приёмка и два
  телефона остаются открытыми. Далее — onboarding SOM-20.
  [ADR 0032](decisions/0032-auth-runtime-and-login.md).

- 01.10.2026 — владелец подтвердил e-mail OTP + Apple + Google (SOM-60).
  Следующий пакет — вход и сессия SOM-19. Домен приглашений остаётся pending;
  production invite links не конфигурируются. [ADR 0004](decisions/0004-auth.md).

- 01.10.2026 — SOM-27: confirm/cancel отдельного booking, actor-scoped receipts,
  revision и защита завершённого журнала. 258 pgTAP и реальные concurrent
  confirm/cancel/retry проходят. Переносы/вся группа/штрафы и transport открыты.
  [ADR 0031](decisions/0031-booking-status-commands.md).

- 01.10.2026 — SOM-28: шесть таблиц журнала, tenant/client-safe связи, отдельные
  private_notes и owner-only receipts; клиент видит только свой finished журнал.
  Clean reset, db lint и 225 pgTAP (40 журнала) проходят. Добавленные упражнения
  могут не иметь плана; замены сохраняют прежние строки. Offline/app transport
  и приёмка остаются открытыми. Далее — команды подтверждения/отмены SOM-27.
  [ADR 0030](decisions/0030-journal-read-isolation.md).

- 01.10.2026 — SOM-24: серверные копии программ и снимки упражнений, назначение
  с проверкой версии и приватным receipt. 185 pgTAP, db lint и конкурентный
  повтор проходят. Прежние копии сохраняются после правки/архива источника.
  UI/transport и решение SOM-55 открыты. Далее — таблицы журнала и приватность
  заметок SOM-28. [ADR 0029](decisions/0029-client-program-snapshots.md).

- 01.10.2026 — SOM-23: атомарный save/archive шаблонов, expected_revision,
  приватные receipts и запрет прямых записей (включая column grants). 148 pgTAP,
  db lint, совпадение RPC с миграцией, type drift и app check проходят;
  конкурентные save/retry проверены двумя SQL-соединениями. UI/transport и вход
  ещё открыты. Следующий пакет — сохраняемые копии программ SOM-24 по временному
  правилу «новая копия, старая сохраняется»; решение владельца №5 не подменяется.
  [ADR 0028](decisions/0028-atomic-template-commands.md), [проверки](../../supabase/README.md).

- 01.10.2026 — SOM-25: серверные группы/bookings/предложения, изоляция участников,
  атомарное создание с предупреждением о пересечении и повтором по request_id.
  Clean reset, db lint, 117 pgTAP, два сценария с конкурентными SQL-сессиями,
  type drift и app check (342 теста / 46 suites) проходят. Прямые записи закрыты;
  переносы/отмены SOM-27, transport SOM-26 и два телефона остаются открытыми.
  Далее — атомарное сохранение шаблонов SOM-23; вход ждёт решения SOM-60.
  [ADR 0027](decisions/0027-server-schedule-foundation.md), [проверки](../../supabase/README.md).

- 01.10.2026 — SOM-22: серверные упражнения/шаблоны/строки состава, RLS,
  tenant-safe ссылки, поиск без регистра/ё, архивирование и копирование 81
  упражнения в workspace. 72 pgTAP, db lint, типы и app check (342 теста /
  46 suites) проходят. SQL-сценарий собственного упражнения и архивного
  шаблона проверен; app/server transport, программы/журнал и owner acceptance
  открыты. Далее — серверное расписание SOM-25; вход ждёт SOM-60.
  [ADR 0026](decisions/0026-workspace-library.md), [проверки](../../supabase/README.md).

- 01.10.2026 — SOM-18: реализована базовая схема четырёх таблиц, RLS и column
  grants, revision/audit, вымышленный повторяемый seed и генерация типов/CI drift
  check. Изолированный reset/seed, db lint и 32 pgTAP проходят; app check — 342
  теста / 46 suites. Production-вход, invitation RPC, remote CI и проверка двух
  телефонов открыты. Следующий независимый backend-пакет — библиотека SOM-22.
  [ADR 0025](decisions/0025-identity-rls-foundation.md), [проверки](../../supabase/README.md).

- 01.10.2026 — SOM-50: исправлено вытеснение поиска/результатов/Done при
  максимальном Dynamic Type. В ограниченной высоте header переходит в scroll,
  Done остаётся фиксированной. Native поиск и закрытие проверены; swipe через
  автоматизацию недоступен (`noWindowsAvailable`), полная приёмка открыта.
  [ADR 0024](decisions/0024-picker-overflow.md). 342 теста / 46 suites, typecheck,
  lint/format и экспорт трёх платформ проходят.

- 01.10.2026 — продолжение SOM-50: проверена программная клавиатура iOS для
  названия, заметки, числовых полей и поиска; Save/Done остаются над клавиатурой.
  Живое увеличение Dynamic Type выявило обрезание текста; исправлено обновлением
  native-узла общего Text при смене fontScale, без изменения обычной типографики.
  [ADR 0023](decisions/0023-live-font-scale.md). 340 тестов / 46 suites, typecheck,
  lint/format и экспорт трёх платформ проходят. Полная native-приёмка ещё открыта.

- 01.10.2026 — SOM-50: picker конструктора получил фиксированные поиск/Done
  и отдельную прокрутку списка; сохранение выбора при закрытии/Android Back,
  исправление web blur, размеры и метаданные эталона. 339 тестов / 45 suites,
  экспорт трёх платформ; editor и открытый picker — по 6 сравнений без runtime
  errors. Android smoke; на iOS исправлена accessibility-группировка Sheet,
  проверены поиск, выбор, Done и повторное открытие. Полная native/доступность и одобрение
  владельца открыты. [Отчёт](../../app/review/template-picker/README.md),
  [ADR 0022](decisions/0022-fixed-picker-sheet.md). SOM-50 In Progress;
  далее завершить его native-проверки, затем SOM-17. Production-этапы не закрыты.

- 30.09.2026 — по запросу владельца открыт полный backlog trainerApp в Linear:
  13 milestones, 48 задач, 59 связей блокировки. Все 69 открытых checkbox-пунктов
  этапов 1–10, 12 решений, приёмка, исследование и после-пилотный объём имеют
  [карту задач](DELIVERY-PLAN.md). Добавлен [обзор продукта](PROJECT-BRIEF.md).
  Это настройка планирования; приложение и визуальная приёмка не закрывались.
  Следом — native picker SOM-50, паритет SOM-17 и схема/RLS SOM-18;
  production-вход SOM-19 ждёт решения SOM-60. [ADR 0021](decisions/0021-linear-roadmap-import.md).

- 30.09.2026 — создан [проект trainerApp в Linear](https://linear.app/something-great/project/trainerapp-827feca01ff7)
  в команде Something Great / SOM. Закреплены [правила агентов](LINEAR-WORKFLOW.md)
  и [ADR 0020](decisions/0020-linear-coordination.md). Настройка координации выполнена;
  этапы приложения и визуальная приёмка не закрывались. Следующие задачи выбирать
  по текущему checkpoint ниже, проверяя актуальные записи и дубликаты в Linear.

- 30.09.2026 — `/template-editor`: создание/редактирование/копия, сохраняемый
  черновик, конфликт и подтверждение удаления. Общий каталог Library/detail/new;
  новые занятия хранят снимок пользовательского плана, который читает журнал.
  338 тестов / 45 suites, экспорт Android/iOS/web. [ADR 0019](decisions/0019-demo-template-builder.md),
  [отчёт](../../app/review/template-builder/README.md). Следом: нативный паритет
  шторки выбора, доступность и визуальное одобрение. Production этап 3 не закрыт.

- 30.09.2026 — маршруты `/template/[id]` для четырёх исходных планов; Library →
  template → создание занятия с выбранной программой → журнал. Техника упражнений
  переиспользует общую шторку; footer закреплён, deep links проверяются.
  321 тест / 42 suites; TypeScript/ESLint/Prettier; экспорт трёх платформ,
  49 маршрутов; iOS визуальный smoke. Android не подключён.
  Конструктор/копирование, native picker, шторки и визуальное одобрение остаются
  открытыми. Следом конструктор шаблонов с сохранением черновика и безопасной
  связью с расписанием; четыре других глубоких маршрута ещё не перенесены.

- 30.09.2026 — `/inbox` связан с текущими запросами расписания: принять,
  отклонить, предложить другое время, отозвать; история сохраняется после reload.
  Today открывает входящие даже без ожидающих ответа запросов. 310 тестов /
  41 suite, TypeScript/ESLint/Prettier; экспорт трёх платформ, 44 маршрута;
  web-сценарий и iOS визуальный smoke.
  Android не подключён; owner visual approval, шторки и production остаются
  открытыми. Следом оставшиеся пять глубоких маршрутов, начиная с шаблона.

- 30.09.2026 — создание/переносы и карточка клиента: общий локальный домен
  расписания с ревизиями, согласиями участников, отменой и сохранением;
  `/new`, `/client/[id]` (c1–c7), связанные Today/Schedule/Home и журналы новых
  занятий. Завершённые журналы сохраняют исторические снимки. 306 тестов /
  40 suites, TypeScript/ESLint/Prettier; экспорт Android/iOS/web, 43 маршрута.
  Web: создание → календарь → журнал → сохранение 80 кг × 8 → reload.
  iOS: визуальные проверки формы и карточки, исправлен safe area; Android
  в этой волне не проверен (эмулятор не запущен). ADR 0018.
  Далее: входящие, приглашения/шаблоны/оплаты и оставшийся паритет; production
  auth/sync и приёмка владельцем открыты.

- 30.09.2026 — вторая командная волна журнала: undo, add/replace/skip/restore,
  управление существующими заметками, общий rest/focus между журналом и dock;
  завершённые результаты связаны с клиентскими History/Progress. 227 тестов /
  32 suites, TypeScript/ESLint/Prettier, экспорт Android/iOS/web. Web проверен
  сквозной finish → Progress; Android запись/rest/dock и plural labels, iOS
  визуальный smoke. ADR 0016/0017. Голос/создание заметок, техника/верхнее меню,
  production-sync и визуальная приёмка открыты. Следом создание/переносы занятия
  и карточка клиента; новые исполнители получают свежий ограниченный контекст.
- 30.09.2026 — перенесён демо-маршрут журнала `/session/[id]`: общий
  демо-provider, версионированное локальное сохранение, черновики, участники,
  подтверждение частичного завершения и возвращение из Today/Schedule.
  196 тестов / 28 suites, TypeScript/ESLint/Prettier и экспорт трёх платформ.
  Полный capture: 114 эталонов, 66 кадров приложения, 48 отсутствующих
  комбинаций восьми глубоких маршрутов, 0 runtime errors. Web: запись/reload,
  частичное завершение и dock; iOS: визуальный smoke. Следом rest/undo/операции
  упражнений, связь результатов с клиентом и новые глубокие маршруты.
  Это не production offline-sync; D9 и визуальная приёмка остаются открытыми.
- 30.09.2026 — командный checkpoint: демо-содержимое всех десяти главных вкладок,
  161 тест / 24 suites, TypeScript/ESLint/Prettier, экспорт Android/iOS/web.
  Чистый полный capture: 114 эталонов, 60 кадров приложения, 54 отсутствующие
  комбинации девяти глубоких маршрутов, 0 runtime errors. Паритет не принят.
  Следующее: общее демо-состояние связанных экранов, журнал тренировки,
  создание/переносы и карточка клиента; затем повторные native/доступность/motion.
  Сохранён `d58bf7a`; follow-up устраняет dev-warning SVG accessibility и
  расширяет capture на console.error (полный повтор: 0 ошибок).
- 29.09.2026 — интегрированы Schedule/Program/History и Clients/Library/Progress,
  профили переносятся последними; локальные действия и оригинальные assets.
  Полный эталон переснят после фикса времени анимаций: 114 кадров, 0 ошибок.
  Идут визуальное сравнение восьми экранов и нативная проверка ухода со шторки.
  D9, серверные сценарии, motion и приёмка владельцем остаются открытыми.
- 29.09.2026 — первая командная волна: Today/Home с четырьмя демо-состояниями,
  общие компоненты и переносимость Text/SVG. Web: 12 пар без runtime errors,
  проверены native Today Android/iOS и Home iOS; паритет не принят.
  Следующая ограниченная волна: Schedule, Program, History. Назначения и ограничения
  контекста — TEAM-HANDOFF; серверные сценарии и auth ещё не подключены.
- 29.09.2026 — навигация сохранена коммитом `bccf90c`. Продолжен D: базовые цвета,
  радиусы и текст 15/21.75 сверены с каноническими спецификациями, добавлен
  регрессионный контракт. Далее заголовки/начертания, компоненты и содержимое
  экранов; нативный паритет и D9 остаются открытыми.
- 29.09.2026 — D продолжен: пять вкладок каждой роли, плавающая панель,
  оригинальные SVG (ADR 0012), Inter 600/700 и размеры подписей по роли.
  Добавлены маршруты расписания, библиотеки, программы и истории; пока только
  заголовки, не готовые экраны. Старые `templates`/`workouts` заменены.
  Следующее: общие токены/типографика, содержимое экранов, blur/анимация панели,
  крупный текст и нативное сравнение. D9 и этап 1 не закрыты.
- 29.09.2026 — начат D в `feat/foundation-parity`: тема по роли с сохранением
  ручного выбора (ADR 0011), инструмент web-сравнения и проверка размера эталона.
  Проверены 56 тестов, экспорт трёх платформ, сохранение темы в web и Android;
  [отчёт](../../app/review/foundation-parity/README.md).
  Следующий шаг — токены/шрифты, SVG-иконки и пять плавающих вкладок. Экраны и
  компоненты ещё не совпадают; D9 и этап 1 открыты.
- 29.09.2026 — разрешён rebase на PR #19; требования владельца и handoff Claude
  `1c6338b` сохранены в [PROJECT-MEMORY](PROJECT-MEMORY.md). Документация B обновлена,
  ADR 0008/0009 выделены. Следующий шаг — D, паритет каркаса с прототипом.
  Этап 1 остаётся открытым до сравнения и одобрения снимков.
- 29.09.2026 — реализованы A1–A9 handoff в ветке `fix/foundation-review`:
  исправления шторки, темы, заставки, i18n, тестов и CI. `npm run check`:
  10 поведенческих тестов + 42 проверки контраста; экспорт трёх платформ,
  db lint и pgTAP 1/1 проходят. Далее B (документация), D (паритет с прототипом),
  C (схема); вход ждёт ответа на вопрос №10. Этап 1 не закрыт до приёмки паритета.
- 29.09.2026 — ревью PR #16 и #17: доработки каркаса и старт этапа 2 описаны в
  [CODEX-STAGE-1-FIXES-HANDOFF.md](CODEX-STAGE-1-FIXES-HANDOFF.md). Следующий шаг —
  PR A (исправления), PR B (документация), PR D (каркас как в прототипе), PR C (схема
  этапа 2); экраны входа ждут подтверждения ADR 0004. Владелец выбрал эталон интерфейса
  и тему по роли ([ADR 0007](decisions/0007-ui-reference.md), [UI-PARITY](UI-PARITY.md)).
- 29.09.2026 — этап 1: каркас, темы, локализация, компоненты и восемь вкладок.
  Локальная база и CI проверены; 6 поведенческих тестов + 42 проверки контраста.
  [PR #17](https://github.com/anuar02/panda-trainer/pull/17) слит.
  Сохранены нативные снимки Android/iOS, исправлен жизненный цикл шторки.
  **Этап ещё не принят:** завершить проверки взаимодействий iOS и доступности;
  warning начальной ссылки Expo Router отслеживается отдельно.
  [Отчёт и ограничения](../../app/review/foundation/README.md).
- 29.09.2026 — этап 0: план, документация и правила учёта изменений завершены.

Формат записи: дата — этап — что сделано одной фразой — следующий шаг. Старые записи
переносятся в «Журнал» внизу, здесь остаются последние 3–5.

## Принципы

1. **Сначала тренер.** Первые рабочие экраны — тренерские: без записей тренера клиенту
   нечего смотреть. Клиентская часть идёт после журнала тренировки.
2. **Журнал тренировки — главный экран.** Он должен работать в зале без сети и не терять
   ни одного подхода. Остальные экраны на старте работают онлайн с кэшем.
3. **Правила денег и списаний — на сервере.** Остаток занятий, оплаты и посещения
   меняются только через функции Postgres с проверкой прав и идемпотентностью.
4. **Права проверяет база.** Каждая таблица закрыта RLS; каждое правило доступа покрыто
   тестом в `supabase/tests`.
5. **Переносим смысл, а не браузерный код.** Из прототипа берём сценарии, состояния,
   тексты, токены и иллюстрации. Навигацию, шторки, жесты и клавиатуру делаем
   нативными средствами.
6. **Выглядит как прототип.** Эталон — `prototype-fresh/index.html` без параметров
   ([ADR 0007](decisions/0007-ui-reference.md)). Экран готов только после сверки по
   [UI-PARITY.md](UI-PARITY.md) и одобрения владельцем.
7. **Вымышленные данные до решения о хранении.** Пока не закрыт вопрос о стране
   хранения ([OPEN-QUESTIONS](OPEN-QUESTIONS.md) №1), реальные данные клиентов не
   загружаются.

## Обзор этапов

| № | Этап | Результат | Зависит от | Размер |
| --- | --- | --- | --- | --- |
| 0 | План и учёт изменений | Этот документ, ADR, CHANGELOG, PR-шаблон | — | S |
| 1 | Каркас | Expo-приложение, локальный Supabase, CI, токены, шрифты, навигация двух ролей | 0 | M |
| 2 | Вход и схема данных v1 | Вход, профили, пространство тренера, карточки клиентов, RLS и тесты прав | 1 | L |
| 3 | Библиотека и шаблоны | Упражнения, шаблоны программ, назначение шаблона | 2 | M |
| 4 | Расписание | «Сегодня», неделя, занятия, группы, пересечения, переносы с версиями | 2 | L |
| 5 | Журнал тренировки | Быстрая запись подходов, черновики, группа, сворачивание, офлайн-очередь | 3, 4 | XL |
| 6 | Посещения, пакеты, оплаты | Атомарное списание, ручные оплаты, остаток, исправления | 4 | L |
| 7 | Приложение клиента | Приглашение, главная, история, прогресс, переносы и отмены | 2, 4, 5, 6 | L |
| 8 | Уведомления в приложении | Лента изменений для обеих ролей, push-уведомления | 4, 7 | M |
| 9 | Маскот и движение | PNG-позы, Rive-риг, «Спокойный интерфейс», крупный текст | 1 | M |
| 10 | Готовность к пилоту | Хранение данных, бэкапы, удаление аккаунта, сборки, мониторинг, внутреннее тестирование | 2–9 | M |
| 11 | После пилота | Голос, казахский язык, широкий экран, оплата | 10 | — |

Параллельно с этапами 1–5 идёт **исследование** (раздел ниже): его выводы могут поменять
порядок этапов 6–7.

Размеры: S — до 3 дней, M — до недели, L — 1–2 недели, XL — 2–3 недели одного
разработчика. Это ориентир для порядка работ, не обещание сроков.

---

## Этап 0. План и учёт изменений

- [x] Большой план: этот файл.
- [x] Архитектура, модель данных, правила разработки: `ARCHITECTURE.md`, `DATA-MODEL.md`,
  `CONVENTIONS.md`.
- [x] Журнал решений `decisions/` с первыми ADR.
- [x] Отложенные вопросы с крайним сроком: `OPEN-QUESTIONS.md`.
- [x] `CHANGELOG.md` в корне, PR-шаблон, ссылки из `README.md`, `AGENTS.md`, `WORKPLAN.md`.

**Готово, когда:** новый исполнитель по `docs/app/README.md` понимает, что делать дальше
и какие файлы обновить в своём PR.

## Этап 1. Каркас

**Цель:** пустое, но настоящее приложение, которое собирается, проверяется в CI и
выглядит как продукт: токены, шрифты, навигация обеих ролей.

- [x] `app/`: Expo (последний стабильный SDK), TypeScript strict, Expo Router.
  Корневой `package.json` (Higgsfield CLI) не трогаем, у приложения свой.
- [x] Линтер и форматирование: ESLint (без `any`, без комментариев в коде), Prettier.
- [x] NativeWind: тема из токенов «Чернила» (`prototype-fresh/css/`, `docs/design-system.md`),
  светлая и тёмная схемы, минимальный контраст WCAG AA.
- [x] Шрифты Inter и Montserrat через `expo-font`, табличные цифры в числах.
- [x] Каркас навигации; актуальные вкладки по ADR 0007: тренер — «Сегодня»,
  «Расписание», «Клиенты», «Библиотека», «Профиль»; клиент — «Главная», «Программа»,
  «История», «Прогресс», «Профиль». Наличие маршрутов не закрывает приёмку экранов.
- [x] Базовые компоненты: кнопка, поле, чип, карточка-лист, шторка (`@gorhom/bottom-sheet`),
  тост, пустое состояние, состояния загрузки, ошибки и «нет сети».
- [x] Строки интерфейса в `i18n/ru.ts` (i18next); ни одной строки в JSX напрямую.
- [x] `supabase/`: `supabase init`, пустая первая миграция, `supabase/README.md` с командами.
- [x] Запуск локального стека Docker, миграция, `db lint` без ошибок и pgTAP 1/1.
  Локальная проверка использует изолированный workdir из-за постороннего `.env.local`.
- [x] Переменные окружения: `app/.env.example`, только публичный anon key и URL;
  service role key никогда не попадает в приложение и репозиторий.
- [x] CI (GitHub Actions): typecheck, lint, unit-тесты приложения, `supabase db lint`,
  `supabase test db`. Оба job прошли в PR #17.
- [x] Первый запуск в Expo Go на iOS и Android, нативные снимки в `app/review/`.
- [x] Приёмка крупного текста и движения перенесена в этап 9, полный проход iOS —
  в этап 10. Это не закрывает приёмку паритета каркаса.
- [ ] Паритет каркаса с прототипом ([UI-PARITY](UI-PARITY.md) §8): вкладки, плавающая
  панель вкладок, токены из `spec-*.json`, начертания, иконки прототипа, тема по роли.
- [x] Исправления ревью A1–A9 из `CODEX-STAGE-1-FIXES-HANDOFF.md`.

**Готово, когда:** `npm run check` в `app/` зелёный локально и в CI; приложение
открывается на телефоне и показывает обе навигации с правильными шрифтами и цветами;
пары снимков вкладок и профиля совпадают с эталоном по чек-листу UI-PARITY §6.

**Для всех этапов с экранами (2–9):** этап готов, только когда его экраны отмечены
«совпадает» в UI-PARITY §7.

## Этап 2. Вход и схема данных v1

**Цель:** настоящие учётные записи и изоляция данных тренеров до появления любых
рабочих экранов.

- [ ] Способ входа — по [ADR 0004](decisions/0004-auth.md): OTP-код на e-mail
  (Supabase Auth), Sign in with Apple и Google. Вход по телефону — после пилота.
  Реализация SOM-19 и локальный email flow готовы; живые provider/native проверки открыты.
- [x] Таблицы `profiles`, `trainer_workspaces`, `client_records`, `invitations`
  ([DATA-MODEL](DATA-MODEL.md)).
- [x] RLS на всех таблицах, вспомогательные функции `is_workspace_owner`, `my_client_record_ids`.
- [x] pgTAP-тесты: тренер A не видит клиентов тренера B; клиент видит только свою карточку;
  подбор ID не открывает чужие данные.
- [x] Генерация типов: `supabase gen types typescript` → `app/src/lib/database.types.ts`,
  проверка актуальности в CI.
- [x] Сид вымышленных данных: `supabase/seed.sql` по демо-данным прототипа
  (`prototype-fresh/js/data.js`), без реальных людей.
- [ ] Экраны: вход, выбор роли при первом входе, создание пространства тренера,
  список клиентов, карточка клиента, создание клиента до его регистрации.
- [ ] Приглашение: непредсказуемый токен (хранится хэш), срок действия, одноразовое
  принятие через RPC `accept_invitation`; ссылка открывает приложение (deep link).
- [ ] Выход, смена аккаунта, обработка истёкшей сессии.
  Реализованы и проверены локально; приёмка на телефонах открыта.

**Готово, когда:** два тестовых тренера и их клиенты на разных телефонах видят только
свои данные; все тесты прав зелёные.

## Этап 3. Библиотека упражнений и шаблоны

- [x] Локальный конструктор и сохраняемые шаблоны/черновик (ADR 0019).
  Производственный критерий этапа и визуальная приёмка остаются открытыми.

- [x] Таблицы `exercises`, `workout_templates`, `template_exercises`.
- [x] Стартовая библиотека: копия общего каталога в пространство тренера при создании
  (`prototype-fresh/docs/library.md`); свои упражнения тренера.
- [ ] Архивирование вместо удаления: прошлые программы и результаты не ломаются.
  На SQL-уровне ссылки шаблона и неизменность программ после архива проверены
  в SOM-22/SOM-24. Журнал и подключение экранов к серверу остаются открытыми.
- [x] Поиск по нормализованному названию (без регистра и «ё/е»).
- [ ] Редактор шаблона: порядок, плановые подходы, повторения или время, вес, заметка.
  Серверные атомарные save/archive готовы; экран ещё использует локальное хранилище.
- [ ] Личные программы клиента (`client_programs`): копия шаблона со связью и версией.
  Серверная часть проверена в SOM-24; app transport ещё не подключён.
  Поведение при смене шаблона — [OPEN-QUESTIONS](OPEN-QUESTIONS.md) №5, до решения
  создаём новую копию и сохраняем старую.

**Готово, когда:** тренер собирает шаблон «Низ А» из библиотеки, добавляет своё упражнение,
архивирует его — и существующий шаблон продолжает его показывать.

## Этап 4. Расписание

- [x] Локальный демо-срез создания, переноса/встречного предложения, принятия,
  отклонения, отзыва, подтверждения и отмены; общие экраны и журнал (ADR 0018).
  Это не выполнение production-критериев и не визуальная приёмка ниже.

- [x] Таблицы `group_sessions`, `bookings`, `schedule_proposals`.
- [ ] «Сегодня»: хронология, текущие и ближайшие занятия, запросы на согласование.
- [ ] Неделя: свободные окна, создание занятия из окна и из «+».
- [ ] Индивидуальное занятие, мини-группа с общим стартом, пересекающиеся персональные.
- [ ] Предупреждение о пересечении с явным подтверждением (правило из
  `trainer-crm-agent-plan.md` §4; отменённые и участники одной группы не пересекаются).
  Серверное создание и проверка под блокировкой реализованы в SOM-25; подключение
  экранов и переносы ещё открыты.
- [ ] Предложение и перенос: статус «предложено» отдельно от подтверждённого занятия;
  RPC проверяет ревизию занятия, устаревшее предложение отклоняется с объяснением.
- [ ] Отмена клиентом, отмена тренером, отдельное списание за позднюю отмену с причиной.
- [ ] Часовой пояс `Asia/Almaty` для отображения, моменты времени — `timestamptz`.
- [ ] Unit-тесты правил пересечения и переходов статусов; pgTAP для RPC переноса.

**Готово, когда:** сценарии «Перенос (обе роли)» из `docs/prototype-guide.md` проходят
на двух телефонах, включая одновременный перенос одного занятия.

## Этап 5. Журнал тренировки

**Цель:** главный экран продукта. Быстро записать подход и вернуть внимание клиенту.
Работает без сети.

- [x] Локальный демо-срез журнала (30.09): фокусный ввод, раздельные черновики
  участников, частичное завершение, read-only результаты и возврат через dock.
  AsyncStorage по ADR 0015; это не выполнение production-критерия ниже.
- [x] Таблицы `workout_instances`, `workout_exercises`, `set_results`, `session_notes`,
  `private_notes`, `sync_operations` ([DATA-MODEL](DATA-MODEL.md)).
- [ ] Локальная база `expo-sqlite` и очередь операций по [ADR 0003](decisions/0003-offline-sync.md):
  каждая запись подхода — операция с `operation_id`; RPC `apply_operations` применяет её
  ровно один раз.
- [ ] Перед занятием: предзагрузка программы, прошлых подходов и участников на телефон.
  SOM-30: [x] реализация server/cache и mock regressions; [ ] real SQL/SQLite/native
  проверка и приёмка владельца (см. текущий checkpoint).
- [ ] Экран журнала: один подход в фокусе, «Как в прошлый раз» одним нажатием, шторка
  ввода с крупными цифрами, отмена последней записи.
- [ ] Черновик и подтверждённый подход — разные состояния; пустое значение ≠ 0.
- [ ] Мини-группа: переключение участника без потери черновика, у каждого своя программа.
- [ ] Замена и добавление упражнения только в этом занятии; снимок программы не меняет
  шаблон и личную программу.
- [x] Заметки: личные (только тренер) и открытые клиенту — разные таблицы.
  Серверная изоляция проверена; приложение ещё не подключено к этим таблицам.
- [ ] «Свернуть»: полоса возврата к журналу во всех разделах тренера, восстановление после
  перезапуска приложения.
  SOM-30: [x] workspace provider/dock и mock reload/fencing; [ ] native/crash/visual
  проверка и приёмка владельца. Демо не смешивается с real workspace.
- [ ] Индикатор «Сохранено на телефоне» / «Синхронизировано», ошибка отправки не теряет
  данные.
- [ ] Завершение: сводка, частичное завершение, исправление завершённого журнала.
  SOM-32: пакет production finish через outbox; применение correction drafts,
  runtime и приёмка владельца остаются открытыми.
- [ ] Обновление личной программы клиента по итогам (задача 4 из `prototype-fresh/CODEX-PLAN.md`).
- [ ] Тесты: очередь (повтор, дубликат, порядок), конфликт одного подхода на двух
  устройствах (по таблице в `SYNC-DESIGN.md`), режим полёта в середине тренировки.

**Готово, когда:** в режиме полёта проводится групповая тренировка из трёх участников;
после включения сети все подходы на сервере ровно один раз, второе устройство их видит.

## Этап 6. Посещения, пакеты и оплаты

- [x] Таблицы: `client_purchases`, `attendance_records`, `attendance_revisions`,
  `credit_entries` и immutable `payment_entries`; payment commands/debt/app
  реализованы в SOM-33/SOM-34 (ADR 0059). Container SQL rerun не выполнен.
- [x] RPC `mark_attended`: атомарное списание из подходящего пакета (ближайший срок
  истечения, тренер может выбрать другой), повторный вызов не списывает второй раз.
- [x] Посещение без пакета — «Не привязано к оплате», без отрицательного остатка;
  привязка позже.
- [x] Исправление посещения возвращает единицу ровно один раз и пишет историю.
- [x] Real schedule attendance UI и durable replay точной команды после потери ответа;
  отдельные mark/bind/correct/penalty controls, safe projections и account scope.
- [x] Scoped данные пакетов в карточке клиента: cost, net used units, expiry,
  received/debt из payment ledger; при ошибке данные неизвестны, без ложных нулей.
- [x] Production создание покупки: «Добавить пакет» во вкладке «Оплаты»,
  одобренное функциональное отличие (ADR 0059); внешний вид требует приёмки.
- [x] Ручная оплата: сумма в тиынах (`bigint`), валюта KZT, дата, автор, источник `manual`;
  частичная положительная оплата не больше долга своего пакета; attendance/credits
  не изменяются. Container check/SQL/browser и owner acceptance имеют ограничения
  из отчёта SOM-34 billing finish.
- [ ] Экран клиента у тренера: остаток занятий, долг и история реализованы;
  visual/native/owner acceptance и отображение сторно остаются открытыми.
- [x] pgTAP и concurrency: параллельные списания одного остатка, повтор запроса,
  исправление (660 assertions / 19 files и 6 concurrency scenarios проходят).

**Готово, когда:** сценарий «Посещение и списание (идемпотентность)» из
`docs/prototype-guide.md` проходит на сервере, включая двойное нажатие и повтор без сети.

## Этап 7. Приложение клиента

- [ ] Принятие приглашения: вход → привязка к существующей карточке с историей.
- [ ] Главная: ближайшее занятие и статус, остаток, фрагмент прогресса, что требует ответа.
- [ ] Тренировки: прошедшие занятия, фактические подходы, открытые заметки тренера.
- [ ] Прогресс: посещения за период, история упражнения, график максимального рабочего
  веса с повторами (без «общей силы»).
- [ ] Предложение времени, перенос, отмена своей записи.
- [ ] Результаты и заметки для клиента (задача 5 из `prototype-fresh/CODEX-PLAN.md`).
- [ ] Проверка: личные заметки тренера не приходят в ответ API клиенту (тест на уровне RLS).

**Готово, когда:** клиент принимает приглашение и видит историю, созданную тренером
до регистрации; ни одного чужого или закрытого поля в ответах API.

## Этап 8. Уведомления в приложении

- [ ] Таблица `notifications`, триггеры на перенос, отмену, подтверждение, новые результаты.
- [ ] Лента и счётчик непрочитанного у обеих ролей; Supabase Realtime для обновления.
- [ ] Push-уведомления в v1 ([ADR 0065](decisions/0065-push-notifications-v1.md)): напоминание
  о занятии и изменения расписания клиенту; запросы клиентов и план на день тренеру.
  Лента в приложении остаётся; без разрешения на push — только она.
  [x] SOM-73 r3: код native lifecycle/server sender/scheduler и synthetic tests;
  [ ] runtime CI/manual concurrency, live phones и приёмка.
  [Handoff](PUSH-V1.md).

## Этап 9. Маскот и движение

Можно делать параллельно с этапами 3–8, если есть отдельный исполнитель.

- [x] PNG-позы и лица из `prototype-fresh/assets/mascot/` через `expo-image`.
- [x] Rive-риг подключён за выключенным флагом (приёмка открыта): `rive-react-native`, файл из `design-exploration/red-panda-rive-2026-09-29/exports/`.
  До приёмки рига — PNG. Прозрачные WebM-ролики в нативном приложении не используем:
  на iOS альфа-канал VP9 не поддерживается ([ADR 0005](decisions/0005-mascot-motion.md)).
- [ ] Места появления — как в `prototype-fresh`: приглашение, пустые состояния,
  празднование после тренировки. Не в повторяющейся работе журнала.
- [x] SOM-39: локальная настройка calm обеих ролей и hook для SOM-38,
  AccessibilityInfo/ReduceMotion, функциональное движение и render-тесты
  Today/журнала до 200%; [отчёт](../../app/review/som-39/README.md).
- [ ] «Спокойный интерфейс» (маскот и празднования выключены) и системное «Уменьшение
  движения» (`AccessibilityInfo`, Reanimated `ReduceMotion`); полная приёмка
  компонентов перенесена из этапа 1.
- [ ] Крупный текст: системный масштаб шрифта не ломает экраны журнала и «Сегодня»
  (задача 7 из `prototype-fresh/CODEX-PLAN.md`); приёмка перенесена из этапа 1.
- [x] SOM-39, бриф 14: реализация CSS-входа экранов, tabbar/нажатий/pulse/shimmer
  через общие Reanimated-компоненты; [отчёт](../../app/review/14-som-39-motion-navigation/README.md).
- [x] SOM-39, бриф 15 r2: реализация существующего workout/toast/sheet движения,
  общий calm/reduce и synthetic регрессии; [отчёт](../../app/review/15-som-39-motion-workout-r2/README.md).
- [ ] Короткие функциональные анимации Reanimated: сохранение подхода, шторки, переходы.
  Реализация существующих сценариев — брифы 14/15; native/owner acceptance и
  runtime voice/hold после SOM-54 остаются открытыми.

## Этап 10. Готовность к пилоту

- [ ] Решены вопросы №1–№3 из [OPEN-QUESTIONS](OPEN-QUESTIONS.md): страна хранения,
  бюджет, политика конфликтов. Все три решены 03.10.2026 (ADR 0064, ADR 0067, ADR 0061).
- [ ] Проект Supabase для пилота в выбранном регионе, отдельный от разработки; бэкапы
  проверены восстановлением. На бесплатном тарифе — свой ночной `pg_dump` (ADR 0067).
- [ ] Экспорт данных тренера, удаление аккаунта (требование App Store и Google Play),
  политика конфиденциальности.
- [ ] Мониторинг ошибок (Sentry или аналог — по согласованию оплаты).
- [ ] Сборки EAS: internal distribution / TestFlight / Google Play Internal testing.
- [ ] Импорт из прототипа не делаем: пилот начинается с чистых данных.
- [ ] Чек-лист ручной проверки на настоящих телефонах, iPhone и Android, в зале.
- [ ] Полный проход iOS: вкладки, темы, шторка и клавиатура (перенесено из этапа 1).
  Внешний вид заставки — в release-сборке.

**Готово, когда:** 3–5 тренеров установили сборку, завели клиентов и провели тренировки;
ошибки и отзывы собираются.

## Этап 11. После пилота (не планируется детально)

Push входит в v1 этапа 8 по ADR 0065; после пилота — только будущая настройка
времени напоминаний и расширения после отдельного решения. Live rollout текущего
пакета остаётся в SOM-73/SOM-42, не переносится автоматически после пилота.

- Голосовой ввод подходов: после решения о пороге ([OPEN-QUESTIONS](OPEN-QUESTIONS.md) №4)
  и полевых замеров (`prototype-fresh` задача 6).
- Казахский язык интерфейса.
- Широкий экран/веб для недельного расписания.
- Вход по номеру телефона.
- Приём оплаты и подписка тренера — отдельный проект.

## Исследование (параллельно с этапами 1–5)

- [ ] 5–7 интервью с тренерами по `prototype-fresh/research/interview-trainers.md`.
- [ ] 3–5 интервью с клиентами по `prototype-fresh/research/interview-clients.md`.
- [ ] Тренировка в зале с прототипом на телефоне по `prototype-fresh/research/gym-test.md`.
- [ ] Выводы — в `prototype-fresh/research/findings-*.md`, изменения плана — сюда и в CHANGELOG.

Вопросы, которые должны ответить интервью до этапа 7: кто вводит результаты (сейчас —
тренер), нужен ли клиенту черновой журнал, чем приложение заменит WhatsApp и заметки.

## Журнал

| Дата | Что | PR |
| --- | --- | --- |
| 29.09.2026 | Выбран стек, написан план и правила учёта изменений | — |
| 29.09.2026 | План приложения и журнал решений | [#16](https://github.com/anuar02/panda-trainer/pull/16) |
| 29.09.2026 | Технический каркас Expo, локальная база, CI; паритет не принят | [#17](https://github.com/anuar02/panda-trainer/pull/17) |
| 29.09.2026 | Зафиксирован обязательный паритет с prototype-fresh | [#19](https://github.com/anuar02/panda-trainer/pull/19) |

- 04.10.2026 — SOM-32: [x] GitHub CI 37209153635: app, SQL lint, pgTAP, concurrency и types; [x] confirmed-save/readback recovery отделён от unknown dispatch. Native/parity/owner acceptance открыты.
