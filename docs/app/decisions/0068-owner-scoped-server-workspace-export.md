# 0068. Owner-scoped server workspace export v1

- **Статус:** Реализовано; SQL runtime и deployment не проверены
- **Дата:** 03.10.2026
- **Кто решил:** исполнитель в границах SOM-41

## Контекст

SOM-41 требует независимый серверный read-only экспорт после ADR 0064.
SQLite pending принадлежат отдельному процессу сохранения/подтверждения (ADR 0062).
Клиент может иметь карточки у нескольких тренеров; его глобальный профиль не
должен превращаться в источник чужих данных. UI, удаление и документы приватности
не входят в этот пакет.

## Решение

`export_trainer_workspace(p_workspace_id uuid)` возвращает один JSONB envelope:
`format=panda-trainer-workspace`, `version=1`, checked workspace/owner UUID,
`exported_at`, `limitations` и 26 коллекций. Проверка владельца использует только
`auth.uid()` и реальную строку workspace. Чужой, неизвестный и null workspace
дают одинаковый SQLSTATE `42501`. Caller trainer ID отсутствует.

Функция STABLE, SECURITY DEFINER с `search_path=pg_catalog`, UTC и ISO dates.
Все чтения используют MVCC snapshot вызывающего statement, включая проверку
владельца; блокировки и записи отсутствуют. Definer нужен для приватных заметок
и product/audit columns, закрытых обычными column grants. EXECUTE выдан только
`authenticated`, снят с PUBLIC/anon/service_role. Все таблицы квалифицированы,
каждая проекция явная: новые столбцы автоматически в export v1 не попадают.
Прямые RLS/grants существующих таблиц не меняются.

Коллекции отсортированы по UUID (profile — user_id), не по текущей позиции
упражнения. Position, requested_position, revisions, source devices и timestamps
сохранены как данные. Архивы, удалённые подходы, обе версии конфликтов, resolved
conflict history и серверные correction drafts включены. SQL bigint заранее
кастуется в decimal text: `price_minor` и signed `amount_minor` проходят JSON
без преобразования в JS number. Вес в граммах, reps/seconds и nulls не пересчитываются.

Экспорт покрывает persisted product tables и безопасные метаданные приглашений.
Auth secrets и invitation hashes/tokens отсутствуют. Sync/command receipts и общий
starter catalog исключены; реальные workspace-копии каталога включены. Невозможно
экспортировать прежние значения изменяемой строки, которых схема не хранит.
Эти ограничения присутствуют в самом payload; полная таблица покрытия — в отчёте.

Domain/account-export строго проверяет envelope, все коллекции/поля/типы,
известные состояния, точность bigint, UTC/dates, tenant, порядок и ссылки.
JSON конфликтов остаётся opaque product history с рекурсивной проверкой безопасных
чисел, workspace и credential keys. Features/account-export получает typed
Supabase-compatible transport от будущего интегратора; провайдеров и UI нет.
Сервис сохраняет primitives сессии до запроса, проверяет user/token после него
и отклоняет ответ при смене сессии, включая refresh. Это консервативный отказ:
интегратор может повторить read-only запрос с новой актуальной сессией.

## Рассмотренные варианты

- Несколько Data API запросов — разные snapshots и ограничения column grants.
- `to_jsonb(table_row)` — неявная утечка будущих столбцов и потеря bigint precision.
- Автоматическое объединение SQLite pending — другой consistency/ack контракт;
  сервер не знает всех телефонов, локальный outbox нельзя очищать этим экспортом.

## Последствия

Новые таблицы требуют явного coverage/version решения; pgTAP проверяет состав
public tables. Старые версии mutable rows не восстанавливаются из текущего revision.
Это экспорт данных, не import/restore формат и не доказательство безопасного удаления.
Один большой snapshot требует проверки размера/таймаутов на синтетическом объёме
пилота перед deployment; pagination нарушила бы этот consistency contract.

[Команды, проверки и handoff](../../../app/review/som-41-trainer-export/README.md).
SQL/pgTAP/runtime, concurrent MVCC behavior и generated type drift остаются
непроверенными без локального Supabase/PostgreSQL. SOM-41 в целом открыт.
