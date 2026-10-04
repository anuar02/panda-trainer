# 0081. Session-fenced чтение личной immutable программы

- Статус: Принято для реализации; owner acceptance открыта
- Дата: 03.10.2026
- Область: SOM-24, только client-program read

## Контекст

Проверка userId не различает logout/relogin того же пользователя. Ключ hook
user/client/attempt сохраняет результат предыдущей сессии. Назначение программы
принадлежит отдельному пакету; общий auth provider и SQL не меняются.

## Решение

Module-local fence следует уже влитому read-auth контракту: JWT sub/session_id
проверяются на согласованность с текущей Supabase session; это идентификатор
жизненного цикла, не локальная проверка подписи или замена серверной авторизации.
Подписка устанавливается до getSession. Logical read закрепляет actor, входной
clientRecordId и session identity. Один исходный bearer явно передаётся в context
RPC, latest query и каждую страницу lines. TOKEN_REFRESHED разрешается только
с прежними actor/session_id и подтверждённым событием новым токеном. Другие
lifecycle events, silent token replacement, смена actor/session или caller scope
закрывают чтение. Guard работает после каждого ответа, перед result/error;
подписка освобождается в finally. Credentials остаются внутри операции.

Hook использует отдельный локальный epoch подписки auth, scope и request ticket.
Epoch входит в ключ вместо credentials. Scope обновляется в layout effect;
retry инвалидирует ticket синхронно. Blur/unmount закрывают операции, refocus
читает заново. Public required inputs и output остаются совместимыми.

Latest intentionally ограничен limit(1), order created_at DESC, id DESC.
Lines читаются по 25, максимум 50, с третьей probe page для ровно 50 строк.
Unknown/overflow/foreign/duplicate ответы отклоняются. Валидация соответствует
проекции client_programs/client_program_exercises: integer bounds, unit regex
(без добавления правил сортировки/положительности диапазона), уникальные id,
exercise_id и position, UTC и реальные календарные даты, SQL длины в символах.
Поле exercise_id используется только для проверки уникальности, наружу не выходит.
Null/zero и исходный текст units сохраняются. Старые copies не изменяются.

## Последствия

Новых библиотек и общих helpers нет. Layout, тексты, no-program/not-found
semantics и assignment не меняются. Synthetic tests не подтверждают SQL/RLS,
live auth/API, устройства, parity, storage crash или приёмку владельца.
Порядок интеграции из брифа: после invitation read; невлитые ветки не dependencies.
