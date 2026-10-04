# План разработки приложения

Обновлено: 4 октября 2026.

Стек: React Native (Expo) + Supabase ([ADR 0001](decisions/0001-react-native-expo.md),
[ADR 0002](decisions/0002-supabase.md)). Цель первой версии — пилот с 3–5 настоящими
тренерами в Астане и их клиентами. Публикация в сторах и платные сервисы подключаются
только с отдельного согласия владельца.

## Где остановились

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
