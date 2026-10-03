# SOM-41 · Серверный экспорт данных тренера

Linear: https://linear.app/something-great/issue/SOM-41/realizovat-eksport-udalenie-akkaunta-i-dokumenty-privatnosti

## Контекст

База fix/som-50-template-picker, решения SOM-51/59 влиты commit 4758705,
ADR 0064. Регион Франкфурт, хранение до удаления аккаунта, бэкапы до 7 дней.
Все зависимости этой read-only части в базе. Third выполняет SOM-30,
personal готовит документы приватности. Удаление аккаунта и UI экспорта —
будущие отдельные пакеты; эта задача не завершает весь SOM-41.

## Критерии

- [ ] Новый authenticated read-only RPC возвращает versioned JSON snapshot
  данных workspace, принадлежащего auth.uid(). Caller trainer ID не доверять.
  В одной согласованной транзакции экспортировать клиентов, библиотеку/шаблоны,
  программы/ревизии, расписание, журналы/подходы/заметки/версии конфликтов,
  посещения, пакеты, оплаты/сторно. Проверить фактическую схему, составить
  coverage всех таблиц; частичное покрытие явно указывать.
- [ ] Приватные заметки доступны своему тренеру; client/anon/чужой trainer
  не получают экспорт. Общий клиентский аккаунт не раскрывает данные другого
  тренера. Исключить credentials, invite tokens и секреты. Fixed search_path,
  минимальные grants; SECURITY DEFINER только с явной проверкой владельца.
- [ ] Стабильный порядок коллекций, UUID/revisions/dates/timezone/nulls,
  grams/reps/seconds, деньги/bigint без потери точности. Локальные pending
  отсутствуют в серверном экспорте — документировать, не читать/очищать SQLite.
- [ ] Независимый typed domain/account-export и features/account-export service
  без UI/provider integration: validation version/schema/tenant и честные ошибки
  сети/прав/повреждённого ответа, без фиктивного успеха.
- [ ] Meaningful app tests и pgTAP fixtures: два workspace и общий клиент,
  anon/client/foreign denial, приватные заметки, архивы, история/сторно/conflicts,
  empty workspace, malformed payload, bigint precision. SQL runtime не подменять
  mock доказательствами; сохранить команды для локального Supabase.
- [ ] cd app && npm run check зелёный. CHANGELOG, минимальный checkpoint ROADMAP,
  ADR при новом подходе; app/review/som-41-trainer-export/README.md с командами,
  результатами, coverage, непроверенным и handoff для будущего UI/удаления.

## Источники

AGENTS.md, app/AGENTS.md, docs/app/{README,PROJECT-MEMORY,ROADMAP,CONVENTIONS,
ARCHITECTURE,DATA-MODEL,DELIVERY-PLAN,OPEN-QUESTIONS,UI-PARITY}.md;
ADR 0007/0061/0062/0064/0066, supabase/README.md, действующие migrations/tests.
Проверяй реальные пути, перед кодом изучи существующие RLS и схему.

## Границы

Новые app/src/domain/account-export/, app/src/features/account-export/ и их tests;
новая отдельная export migration/pgTAP test; database.types.ts только additive
export signature. Старые migrations не менять. Общие CHANGELOG/ROADMAP минимально,
новый ADR с незанятым номером и descriptive filename. Не менять auth/session,
preload/outbox/journal semantics, provider/routes/profiles/UI, client projections,
billing, invitations, notifications, prototype, privacy документы personal,
scripts/rules очереди. Account deletion вне задачи. App код без комментариев/any,
новых PNG нет. Ветка agent/som-41-trainer-export, draft PR в fix/som-50-template-picker,
заголовок с SOM-41. Linear не менять, вопросов не задавать.

## Чего нельзя проверить в контейнере

Нет Docker, Supabase, браузера, iOS/Android устройств. SQL/pgTAP runtime,
реальный сервер и native/visual не объявлять проверенными. Только вымышленные
fixtures, без платных сервисов/реальных данных. Не объявлять экраны принятыми.
