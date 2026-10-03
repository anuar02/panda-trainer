# 0070. Public pilot preflight и отдельные remote evidence gates

- **Статус:** Принято для локальной подготовки; cloud readiness не подтверждена
- **Дата:** 03.10.2026
- **Контекст:** SOM-40, ADR 0064/0067, база `08f0251`

## Решение

Отдельный Node 22 CLI без зависимостей в `tools/pilot-config/` проверяет public JSON
manifest с точными согласованными значениями, разными cloud dev/pilot refs и matching
HTTPS origins. Он не использует app env, process.env, secret stores, сеть, subprocesses
или существующие deployment workflows. Нет полей для credentials.
Unknown fields и ошибки JSON/OS дают фиксированную безопасную диагностику без
input values, неизвестных ключей, путей и stack traces. Неизвестные project identities
в template остаются пустыми и дают exit 1. Synthetic credentials в тестах проверяют
отсутствие утечки, не подключают реальные Secrets.

Exit 0 означает только local config validity. Region label в manifest отражает
намерение; размещение Frankfurt доказывается отдельным dashboard/read-only metadata
evidence. База, логи и бэкапы имеют отдельные gates; никакого вывода региона из URL.
Auth redirects — точный handoff существующих runtime callbacks, а не новая auth policy.
Единственное исключение из HTTPS — уже действующий native `panda-trainer` callback.

Handoff создания Free проекта, migrations без seed/import, Pages/DNS/SMTP/OAuth и
cloud readiness описан в [ENVIRONMENT](../pilot/ENVIRONMENT.md). Выполнение mutations
оператором требует отдельного разрешения. Remote deployment, deep links, restored
backups, telemetry, реальные данные и приёмка не входят в local PASS.

## Альтернативы и последствия

- Preflight через dotenv/Management API отклонён: он потребовал бы credentials,
  зависимость от облака и смешал бы локальную согласованность с remote evidence.
- Автоматический deploy/создание проекта отклонены границами пакета.
- Free intent и 7-day retention не доказывают соблюдение quota или ротацию.
- Integration points monitoring/backup описаны контрактом будущих пакетов;
  не добавляются ссылки на отсутствующие файлы и нет ожидания параллельной работы.
- CLI tests запускаются отдельной командой; существующий app CI не изменяется.
  До merge reviewer должен выполнить их наряду с app check.
- Real data требуют специалиста и разрешения владельца по ADR 0064.
  SOM-40 и этап 10 остаются открытыми.
