# 0070. Зашифрованный dump пилота и отдельная проверка восстановления

- **Статус:** Принято для tooling; включение окружения требует владельца
- **Дата:** 03.10.2026
- **Основание:** SOM-40, ADR 0064/0067

## Решение

Отдельные Python stdlib tools вызывают PostgreSQL CLI, age и AWS CLI. Полный
custom-format pg_dump сохраняет согласованный snapshot одной БД, ACL и владельцев;
никаких schema filters и изменений production migrations. Endpoint каждого
источника и disposable-test target задаётся явно и проверяется по allowlist.
DATABASE_URL и посторонние PG overrides запрещены. Restore требует локального
opt-in; Actions допускает только синтетический fixture_source.

До передачи dump шифруется age публичным ключом; private identity хранится отдельно
у владельца и используется только для локального восстановления. Manifest содержит
хэши и технические метаданные, без credentials, SQL и персональных данных. Проверка
ciphertext не выдаётся за проверку восстановления.

Storage adapter принимает только приватный S3-compatible bucket с подтверждённым
Frankfurt region, public-access block, без versioning и с lifecycle для отдельного
prefix. Не выбираем и не создаём провайдера: бесплатность, реальный EU Central,
реплики, срок физического удаления и доступность API требуют отдельного evidence.
Несовместимый API закрывает загрузку. GitHub artifacts для dump не используются.

Очистка объектов по UTC начинается через 6 дней; загрузка допустима в первый час
после dump. Это оставляет запас перед предельными 7 днями. Lifecycle — дополнительная
защита, его асинхронность не доказывает строгий срок. CLI разрешает только 1–6 дней и сокращает допустимый возраст объектов
ещё на час для свежей загрузки;
operational контракт требует интервал очистки не больше 24 часов. Остатки failed upload тоже входят в prefix cleanup.

Синтетический harness использует независимые scratch БД, проверяет фактическую
идентичность cluster/database, RLS, grants, functions, constraints и повтор restore.
Он не подтверждает перенос Supabase Auth, storage blobs, cluster roles, project
settings или восстановление реального pilot dump. Roles/extensions заранее
подготавливаются отдельно, секреты auth не выгружаются через pg_dumpall.

## Альтернативы и последствия

Обычный GitHub artifact отклонён: регион, приватность и срок не доказаны.
Supabase Pro/PITR отклонены по ADR 0067. Самописная криптография не используется.
Работающий cron не включается до проверки provider/environment/secrets и успешного
реального disposable restore владельцем. Документация: [runbook](../pilot/BACKUP-RESTORE.md).
