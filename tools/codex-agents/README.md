# Брифы для автономных Codex-агентов

Каждая папка в `tasks/` — очередь одного аккаунта Codex (`work`, `personal`, `third`).
Файл задачи — готовый промпт; к нему добавляется [RULES.md](RULES.md)
(подставьте имя ветки вместо `{{BRANCH}}`, например `agent/som-38-mascot`,
и базовую ветку вместо `{{BASE}}`).

Один агент = один git worktree = одна ветка = одна задача. Результат — PR в `main`
в статусе «требует проверки»; приёмку экранов подтверждает только владелец.

## Текущие очереди (03.10.2026)

| Аккаунт | Задача | Почему её можно брать |
| --- | --- | --- |
| work | SOM-38 маскот и Rive, затем SOM-33/34 довести пакеты и оплаты | Нет блокеров; WIP оплат уже в `fix/som-50-template-picker` |
| personal | SOM-39 спокойный интерфейс, крупный текст, движение | Нет блокеров; граница с SOM-38 — общий флаг |
| third | координатор (см. ниже) | Pro-аккаунт: проверяет и вливает PR, пополняет очереди |

## Почему остальное не в очереди

- SOM-18, 25, 28 отмечены In Review, SOM-19…24, 27, 50 — In Progress, но кода нет
  на GitHub (SOM-17 ссылается на коммиты `c49b3b0`, `dc0f62f`, которых нет в origin).
  Вероятно, работа лежит локально. Пока её не запушат, агенты продублируют её
  или получат конфликты.
- SOM-17 зависит от общих компонентов, которые меняет локальный SOM-50.
- Остальные задачи ждут решений владельца: SOM-60 → SOM-19/20/21/35,
  SOM-55 → SOM-24/28, SOM-53 → SOM-29…32, SOM-56/58 → SOM-36, SOM-51/59 → SOM-40/41.

После пуша локальной работы следующие очереди: SOM-26 → SOM-27 (расписание),
SOM-22 → SOM-23 (библиотека), SOM-33 → SOM-34 (пакеты и оплаты).

## Запуск в Docker

Каждая задача идёт в отдельном одноразовом контейнере: свежий клон репозитория,
`codex exec`, затем push ветки `agent/<задача>` и draft PR. Файлы ноутбука
контейнеру не видны; доступны только логин Codex своего аккаунта и GitHub-токен.

Подготовка один раз:

1. Docker Desktop (или Docker Engine).
2. Вход в каждый аккаунт на хосте: `cx work login`, `cx personal login`, `cx third login`.
   Если `config.toml` в `~/.codex-<аккаунт>` — симлинк, замените его копией:
   внутри контейнера цель симлинка не видна.
3. Fine-grained токен GitHub только для `anuar02/panda-trainer`:
   Contents — Read and write, Pull requests — Read and write.

Запуск всех очередей (`work`, `personal`, `third`) или выбранных:

```bash
export GH_TOKEN=github_pat_...
tools/codex-agents/docker/run-agents.sh
tools/codex-agents/docker/run-agents.sh work personal
```

Агенты ветвятся от `main` и открывают PR в `main`. Другую базовую ветку задаёт
`BASE_BRANCH`, например
`BASE_BRANCH=fix/som-50-template-picker tools/codex-agents/docker/run-agents.sh work personal`.

Ход работы: `tools/codex-agents/docker/logs/summary.txt` и `logs/<задача>.log`.
Задача, чья ветка уже есть в origin, пропускается. Один аккаунт выполняет свои
задачи по очереди, аккаунты — параллельно. Лимиты контейнера: 6 ГБ памяти, 2 CPU.

## Автономный режим

`supervisor.sh` работает на хосте без участия владельца:

- каждую минуту подтягивает очередь (текущую ветку этого репозитория) и запускает
  следующий бриф для каждого свободного рабочего аккаунта (`work`, `personal`);
- после каждой завершённой задачи запускает координатора на аккаунте `third`
  ([COORDINATOR.md](COORDINATOR.md)): он проверяет PR, вливает их в `BASE_BRANCH`
  (никогда не в `main`), ставит следующие брифы и пушит их в ветку очереди;
- останавливается, когда выполнено `MAX_TASKS` задач (по умолчанию 12; после этого
  координатор ещё раз вливает оставшиеся PR) или координатор создал `STOP` —
  подходящих задач больше нет.

```bash
export GH_TOKEN=github_pat_... BASE_BRANCH=fix/som-50-template-picker
nohup tools/codex-agents/docker/supervisor.sh >/dev/null 2>&1 &
```

Журналы: `logs/supervisor.txt`, `logs/summary.txt`, `logs/coordinator-*.log`,
`COORDINATOR-LOG.md`. Остановить: `pkill -f supervisor.sh`, затем
`docker stop $(docker ps -q --filter name=agent-)`.
Настройки: `MAX_TASKS`, `WORKERS`, `COORDINATOR`, `COORDINATOR_INTERVAL`, `POLL_SECONDS`.
