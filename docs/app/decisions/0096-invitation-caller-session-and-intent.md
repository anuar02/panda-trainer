# 0096. Invitation caller session and pending intent lifetime

- **Статус:** Принято в реализации; runtime и приёмка владельца открыты
- **Дата:** 04.10.2026
- **Задача:** SOM-21

## Контекст

На cbd99c9 issue ожидал async random до захвата изменяемого Supabase client;
issue/revoke cache и accept не закрепляли caller login. Маршруты различали входы
только по user ID. Token-only clear не различал новую команду с той же ссылкой.
Свежая база b4101a4 сохраняет onboarding, template editor и billing fixes; они не заменяют
invitation-specific session/lifetime проверки.

## Решение

Caller передаёт actor, access token и lifetime до первого await; trainer передаёт
workspace и card. Invitation fence сверяет JWT sub/session_id, getSession и
Auth getUser, подписывается до random и сохраняется на живую issue/revoke
операцию, включая cached result. Logout, SIGNED_IN, смена identity, unverified
credential change и caller abort закрывают операцию. Только TOKEN_REFRESHED с
тем же sub/session_id разрешает новый bearer. RPC и reads используют explicit
Authorization и abortSignal. Результаты, ошибки и cached replay проверяются
после await. Проверка workspace проходит через owner и card; invitations имеет
только client_record_id, отдельного workspace_id в этой таблице нет.

Unknown outcome issue/revoke повторяется с исходными token/requestId;
accept повторяет тот же token через существующий server replay. Исходная ссылка
остаётся в памяти; нового долговременного хранилища issued bearer нет.

Pending intent остаётся в существующем authStorage. In-memory generation
увеличивается при запросе set, до очереди storage. Accept/cancel фиксируют её до
ожидания; clear проверяет generation, expected token и caller session до remove
и после него. Новый set выполняется после уже начатого remove и сохраняет новое
намерение. Это защита живого процесса, не новый persistent replay contract.

Route lifecycle различает actor/session/resource и auth epoch. Layout cleanup
отменяет старые операции, callback lock остаётся у конкретного экземпляра экрана.
Late completions не показывают успех/ошибку, не навигируют и не запускают native
copy/share после ожидания устаревшей сессии. Уже открытый системный Share или уже
начатый clipboard write невозможно отозвать; последующий completion подавляется.

Default invitation origin — trainer.narutouzumaki.kz по ADR 0064. Explicit env
origin сохраняет прежнюю validation policy для согласованных окружений.
DNS, SMTP, hosting и Universal/App Links не настраиваются этим PR.

## Проверки и границы

Отдельные transport/read, secure pending, hook и route/screen regressions.
Существующие onboarding/connection/history APIs и invitation SQL/RLS сохранены.
Нативные storage/share/reopen, live Auth, SQL/concurrency, visual/accessibility
и owner acceptance не доказываются mocks. [Отчёт](../../../app/review/05-som-21-invitations-production-finish-r2/README.md).
