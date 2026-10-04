# 0087. Явное применение сохранённого исправления завершённого журнала

- **Статус:** техническое решение; SQL runtime и приёмка интерфейса открыты
- **Дата:** 04.10.2026
- **Задача:** SOM-32, отдельный пакет после production-finish

## Решение

Политика владельца остаётся ADR 0061: завершённый журнал не меняется от sync,
входа или восстановления. Тренер просматривает сохранённый correction draft,
текущую версию и предложенное изменение и явно подтверждает конкретный draft.
Исправляются только данные журнала. Личная immutable программа (ADR 0029),
attendance, booking status, списания и пакеты не меняются.

Публичная команда `apply_workout_correction` принимает:

| Аргумент | Тип | Значение |
| --- | --- | --- |
| `p_actor_id` | uuid | Ожидаемый auth.uid(), владелец workspace |
| `p_workspace_id` | uuid | Пространство тренера |
| `p_workout_id` | uuid | Завершённый журнал выбранного участника |
| `p_draft_id` | uuid | Уже сохранённый correction draft |
| `p_request_id` | uuid | Неизменяемый идентификатор одной команды |
| `p_expected_workout_revision` | integer | Версия просмотренного журнала |
| `p_expected_entity_revision` | integer | Версия изменяемой сущности, 0 для отсутствующей |
| `p_expected_exercise_revision` | integer / null | Версия родительского упражнения для подхода |

Ответ команды: `{account_id, workspace_id, workout_id, draft_id, request_id,
status: "applied", revision, entity_revision, finished_at}`. `revision` — версия
журнала после применения, `entity_revision` — изменённой сущности (при выборе
current — сохранённой сущности). `get_workout_correction` принимает actor,
workspace, workout, draft и возвращает original operation, текущие revisions,
`current_version: {entity, exercise, sets, replacements}`, original conflict,
finished_at, applied_at/applied_request_id и receipt. `list_workout_corrections`
принимает actor/workspace/workout и возвращает scoped summaries; более 100 drafts
отклоняются явно, без успешного обрезания.

Сервер сериализует команду с обычным sync через тот же workspace advisory lock.
Затем проверяет draft, original sync receipt/envelope, runtime operation contract,
связи workspace/workout/entity и версии. Для `resolve_conflict` дополнительно
проверяются original conflict, выбранная версия и актуальность structural snapshot.
JSON в сохранённом draft не считается доверенным входом.

Поддержаны journal-only `add_exercise`, `replace_exercise`, `upsert_set`,
`delete_set`, `set_note`, `resolve_conflict` соответствующего journal kind.
`create_workout` и `finish_workout` не являются исправлением данных и отклоняются.
Транзакция никогда не снимает finished status и сохраняет исходный finished_at.
Обычные sync RPC и их протокол не изменяются. Journal/exercise metadata
`last_correction_request_id` фиксирует конкретное исправление; существующий trigger
сам повышает revision, дополнительных increment/пустых updates нет.
Обычная replacement с уже записанными sets и правка skipped/tombstoned сущности
не обходят conflict policy: нужен сохранённый `resolve_conflict` с выбранной
версией; без него сервер отклоняет draft как stale conflict.

Один draft применяется не более одного раза. Неизменяемый receipt хранит canonical
input, original operation, before/after, actor и время. Одинаковый requestId/input
возвращает исходный receipt; другой input с прежним ID отклоняется. Повтор с новым
ID для применённого draft отклоняется. Любая ошибка откатывает все изменения.

## Клиент

Отдельный `features/workout-corrections` содержит transport, session guard,
durable command store, hook и controls. Pending command сохраняется до dispatch;
requestId и canonical input не меняются при retry/reopen/lost response. Очистка
условна по исходной команде. Ошибка storage не считается успешным применением.
Credentials не записываются в command, receipt, storage key или текст ошибки.

Transport закрепляет actor/JWT sub/session_id до dispatch, явно отправляет bearer,
проверяет identity до/после ответа и ошибки, допускает только verified refresh.
Hook закрывает старые данные и результаты при logout/relogin, смене workspace,
участника и unmount. Только validated receipt своего actor/workspace/workout/draft
подтверждает успех; после него перечитываются журнал и статус draft.

## Проверки и границы

Synthetic app tests проверяют клиентские seams, но не доказывают SQL/RLS,
атомарность receipts или реальный storage crash. pgTAP, concurrency harness,
SQL lint и generated type drift — обязательный CI/local DB gate. В контейнере нет
Docker/Supabase runtime, browser или native; пакет передаётся `needs-local-db`.
Команды и свежие результаты —
[отчёт](../../../app/review/som-32-explicit-correction-server/README.md).
SOM-32 и экран целиком не приняты. Selective personal-program update остаётся
заблокированным решением immutable-copy semantics/provenance.
