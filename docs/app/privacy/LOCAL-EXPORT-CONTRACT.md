# SOM-41 · Pure local export v1

03.10.2026, r2 на базе `9031157`; исходный PR #39 закрыт без слияния.
ADR [0077](../decisions/0078-pure-local-export-envelope.md). Изолированный
[serializer](../../../app/src/domain/account-local-export/index.ts),
[типы](../../../app/src/domain/account-local-export/types.ts),
[synthetic tests](../../../app/tests/account-local-export/serializer.test.ts).
Не подключён к collector, storage, UI, Auth, file adapters или deletion.

## Граница и формат

`serializeLocalExport(input: unknown, expected: Scope)` строго проверяет plain data,
создаёт независимую копию и возвращает envelope, canonical JSON и число UTF-8 bytes.
Scope содержит UUID account/workspace и непрозрачный session ID (1–128 ASCII
букв/цифр/underscore/hyphen), без токена. Сравнение с expected точное;
UUID не переписываются. Ownership UUID references операции не выводится из
самого UUID: future collector обязан читать только scoped rows и сверять references
с авторизованным journal graph; pure serializer не обращается к БД/серверу. Snapshot содержит UUID id, UTC capturedAt с сохранением
до шести знаков дробных секунд и atomic confirmed/unknown. Это утверждения
будущего collector, не доказательство личности или атомарности.

Sources: operations, projections, conflicts, corrections, otherLocalData.
Четыре journal sources имеют unknown без records либо complete/incomplete с
обязательным массивом. Unknown не подменяется нулём; пустой complete требует
реального полного чтения. Пропущенное поле — malformed, явный unknown сохраняется.
`journalStatus` отдельно показывает structural completeness journal sources;
отсутствующая версия/linked record либо atomic unknown делает его incomplete.
Это утверждение collector, не доказательство фактической полноты.
OtherLocalData допускает только unknown/incomplete: контракт остальных локальных
модулей не реализован. Поэтому общий status этого пакета всегда incomplete и
**не является успешным полным backup**, даже при полном journal snapshot.

Операции соответствуют уже влитому `OperationPayloads` workout-sync: восемь
видов, точные поля payload, original IDs/device/base_revision/created_at.
Sequence — положительный safe integer; revision и единицы — неотрицательные
safe integers, null и zero различаются. Rejected — исходная операция с error
receipt; confirmed conflict/correction тоже сохраняет исходную операцию и receipt.
Applied receipt может сохраняться для согласования снимка, не создаёт local proof.
Receipt обязан ссылаться на ту же операцию/entity; дополнительные поля запрещены.
Error code — bounded машинный идентификатор, без raw server messages.

Проекции разрешены только для workout_instances, workout_exercises, set_results,
session_notes, private_notes по точным уже влитым `exportRowSchemas`. LocalEntry
с произвольным JsonValue не принимается. Collector должен распознать известную
форму без потери полей; неизвестную форму нельзя молча отбросить или превратить
в complete source. Notes требуют workspace и author текущего account; текст
пользовательских заметок сохраняется дословно, включая Unicode, NUL и переносы.
Serializer не распознаёт секрет, который сам пользователь написал в заметке;
credentials как поля/структуры envelope или payload не разрешены.

Conflict хранит id/entity/workout/expectedRevision и обе версии: incoming exact
operation, current typed projection плюс exercise/exercise_revision/sets/replacements/
shared. Это структурированный lossless adapter для SQL current_version из migrations
20261003120000 и 20261003140000, а не разрешение экспортировать arbitrary JSON.
Collector обязан сохранить все aggregate поля, note shared и дочерние строки;
null current/incoming явно означает отсутствующую версию. Correction сохраняет
id/workout/createdAt и exact operation либо null как отсутствующую версию.
SQL current_version раскладывается по форме incoming kind без изменения entityId:

- replace_exercise: projection — старое workout_exercises с ID payload.replaced_from_id,
  sets — все его подходы; entityId остаётся ID нового упражнения. Остальные aggregate
  поля null/пусты, shared null. Projection revision равна expectedRevision.
- upsert_set/delete_set: projection — существующий set с ID entityId либо, только для
  upsert_set с base_revision 0, skipped exercise с ID payload.workout_exercise_id.
  Exercise/exercise_revision, sets и replacements относятся к этому родителю.
  Fallback не теряет новые entityId, tombstones или другие подходы и не становится
  current:null. Delete без существующего set такой формы не имеет.
- set_note: projection — исходный session_notes/private_notes snapshot, shared —
  исходная видимость. Shared note SQL затем перемещает в private storage; collector
  должен использовать форму snapshot до перемещения, не переписывать shared.
  expectedRevision — текущий resolution token, может отличаться от snapshot revision
  после перемещения или разрешения другого note conflict. Равенство здесь не требуется.
- finish_workout: projection workout_instances, entityId/workoutId/row.id совпадают,
  revision совпадает с expectedRevision; finished_at сохраняется дословно.

У всех sets проверяются workout и workout_exercise_id; replacements обязаны иметь
replaced_from_id родителя и собственные sets с их ID. Exercise row revision совпадает
с exercise_revision, exercise row относится к projection/incoming parent; fallback
projection и exercise row обязаны совпадать целиком. Если set projection также есть
в sets, строки обязаны совпадать целиком. Отсутствующий exercise/revision или set
projection в sets оставляет incomplete; противоречивые доступные строки — malformed.
Повторные child IDs внутри/между ветвями aggregate отклоняются. Workspace/schema
checks сохраняются для каждой строки. Unknown incoming сохраняется incomplete.

Resolve_conflict correction сохраняет исходный resolve envelope без добавления
workout_instance_id в payload и без изменения entity_id. Typed seam collector:
`sources.conflicts: Source<Conflict>` должен включать snapshot конфликтов, на которые
ссылаются correction operations (включая уже resolved, если draft ссылается на них),
с оригинальными current/incoming и resolution expectedRevision на момент draft.
Весь источник привязан к envelope Scope и snapshot barrier; это не UUID ownership proof.
Serializer находит context по payload.conflict_id, сверяет entityId, workoutId draft
и payload.expected_revision с context.expectedRevision. Отсутствующий context или
его версии сохраняются lossless и явно делают journal incomplete. Чужой workout,
entity или revision отклоняется; UUID membership/ownership ещё должен доказать
авторизованный collector. Context не заменяется выдуманным workout UUID или proof.
Связанный receipt и доступная incoming/correction operation должны совпадать целиком.
Отсутствие linked record сохраняет incomplete; не означает resolved/zero.

## Fail closed и воспроизводимость

Точные keys/discriminants на всех уровнях; чужой scope, дубликаты IDs/sequence,
неизвестный payload/table, лишние credentials, unsafe числа, отрицательные значения,
negative zero, malformed UUID/time, unpaired UTF-16 surrogate, accessors, symbols,
нестандартные прототипы, sparse arrays и исключения чтения отклоняются. Ошибка
содержит только malformed/scopeMismatch/limit, без входных данных. Mutable Proxy
не является доверенной границей: caller передаёт plain immutable snapshot.

Пределы v1 — 4 MiB UTF-8 JSON, 10 000 top-level records суммарно, 10 000 элементов
на массив, 64 KiB UTF-8 на строку, 200 000 visited nodes, глубина 16. Нет truncation:
превышение отклоняет весь envelope. Это транспортные лимиты, не retention policy.
Object keys сортируются по JS code-unit order; operations — по sequence;
прочие top-level records — по canonical content. Вложенные массивы сохраняют
исходный порядок SQL snapshot/instructions, поскольку он часть данных.

`parseLocalExport` читает только canonical JSON, созданный serializer: после
валидации сравнивает точные bytes представления. Это также отклоняет JSON с
повторными keys, whitespace, альтернативной записью числа/escape и потерей данных
при JSON.parse. Не является импортом/restore и не принимает произвольные JSON exports.
Обе функции чистые, без часов, IO, hashing, изменения исходного input или ack.

## Handoff collector и файловой интеграции

Текущий `pending(100)` ограничен и не читает confirmed rows. `confirmedIssues()`
возвращает receipts без исходных операций и обеих версий; `read(entityId)` не
перечисляет все projections. Этого недостаточно для export collector.
Нужен отдельный reviewable API полного scoped snapshot: все outbox rows с
sequence/envelope/result/confirmed, все local projections, все нерешённые conflicts
с обеими aggregate версиями и correction drafts. Sources из AsyncStorage,
in-memory форм и остальных модулей остаются отдельным coverage обязательством.
Нельзя назвать отсутствие API отсутствием данных.

Чтение SQLite projection/outbox/receipts должно происходить в одной согласованной
read transaction относительно save и acknowledge, через coordinator всех writers,
включая другие connections. Раздельные pending/read/confirmedIssues вызовы не
атомарны. Нужны session fencing до/после чтения, полный список без LIMIT omission,
обнаружение save/ack/смены scope во время snapshot и новый snapshot ID при любом
изменении. Между SQLite, server conflicts и in-memory stores общей транзакции нет:
нужен documented barrier/version comparison, иначе atomic unknown и incomplete.
Ничего из этого runtime поведения здесь не реализовано и не проверено.

Будущий file integration должен сохранить точные UTF-8 bytes в приватный временный
файл, проверить фактический file result, отмену/ошибку, scope/session fencing и
безопасно убрать временную копию при отмене/смене сессии. Не логировать содержимое
или пути с пользовательскими данными. Native/web file adapters текущего UI этим
пакетом не меняются. Политика пользовательской копии/очистки требует отдельной
работы; serializer не удаляет outbox, drafts, WAL/sidecars или downloaded exports.

Только после реального результата сохранения полного согласованного snapshot
будущий collector может сформировать отдельное export evidence для preflight;
отдельное подтверждение пользователя также требует реализации. JSON/status/
utf8Bytes здесь не являются export/ack proof. Новые save/ack обесценивают старое
evidence. Server export остаётся независимым; два частичных результата не
складываются в успешный backup. Ни identity verification, ни authorize delete,
ни purge API не предоставляются. UX, удаление и retention не выбираются.

Проверки и ограничения: [отчёт](../../../app/review/som-41-local-export-contract-r2/README.md).
SOM-41 целиком, native/cloud/legal и owner acceptance остаются открытыми.
