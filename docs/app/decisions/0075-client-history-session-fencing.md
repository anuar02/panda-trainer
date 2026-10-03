# 0075. Session fence для чтения клиентской истории

- Статус: Принято в пределах SOM-35; runtime и приёмка владельца открыты
- Дата: 03.10.2026

История проверяла только user.id перед возвратом. Повторный вход того же аккаунта
мог получить старый ответ, а pagination hook мог объединить страницы разных входов.

Чтение использует непрозрачный fence с закрытым состоянием в WeakMap. Hook держит
один fence на initial load/loadMore/retryMore; retry, смена scope и refocus создают
новый. Standalone чтение самостоятельно создаёт и освобождает fence. Токены
не входят в результаты, ключи React, ошибки или публичный интерфейс fence.

Auth subscription создаётся до первого getSession. SIGNED_OUT, foreign actor и
изменение токена вне TOKEN_REFRESHED необратимо закрывают текущий fence. Повторный
SIGNED_IN с тем же токеном допускается, поскольку auth может публиковать его при
восстановлении фокуса. Только TOKEN_REFRESHED того же пользователя разрешает
ротацию токена внутри открытого fence; после logout refresh не оживляет его.
Это реализация существующего event-контракта auth без изменения provider и без
декодирования JWT. Пропущенное событие с новым токеном отклоняется консервативно.

getSession сверяет fence после context/parent/child ответов, перед каждым child
request и перед возвратом. Следующие запросы используют актуальный разрешённый
Bearer; уже отправленный запрос остаётся с токеном на момент отправки. Hook
очищает показанные страницы при auth event и отвергает late responses. Отдельная
числовая generation сбрасывает открытый detail при новом чтении, даже если ID
журнала совпадает. Workspace из connected seam проверяется до table reads;
существующие проверки карточки, workspace и parent IDs сохраняются.

Сравнение только user.id недостаточно. Безусловное сравнение access token
отвергало бы штатный refresh. Изменение глобального auth provider не требуется.
RPC, RLS, схема, правила finished-only/public notes и all-time paging не меняются.
Synthetic тесты и ограничения: app/review/som-35-history-session-fencing/README.md.
