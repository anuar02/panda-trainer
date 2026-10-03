# SOM-40 · Проверяемая конфигурация отдельного пилотного окружения

Linear: https://linear.app/something-great/issue/SOM-40/podgotovit-soglasovannoe-okruzhenie-pilota-i-vosstanovlenie

## Контекст

ADR 0064/0067 и все решения SOM-40 уже в базе 2ccc2d0. Free Supabase EU Central,
чистый отдельный пилот, домен приглашений trainer.narutouzumaki.kz. Export и preload влиты PR #29/#28. Work выполняет monitoring, third — backup tooling. Не ждать их
результата: создать самостоятельный preflight/config package без app/SQL изменений.
Это подготовка проверяемого окружения, не создание облачных аккаунтов или приёмка.

## Критерии

- [ ] tools/pilot-config/ содержит template без секретов и проверяющий CLI:
  явные разные dev/pilot project refs/URLs, HTTPS, canonical invite domain,
  allowed redirects, free-tier choices. Не считывать/печать secrets и не совершать
  network mutations. Missing/invalid config даёт ненулевой exit с безопасным
  объяснением, не фиктивный PASS; region доказать удалённой проверкой, не URL.
- [ ] docs/app/pilot/ENVIRONMENT.md: воспроизводимые шаги отдельного Frankfurt
  проекта без платных опций; schema deployment существующими migrations без
  seed/импорта прототипа. Синтетические smoke accounts отдельно от реальных,
  public env и server Secrets различать. Регионы базы/логов/бэкапов проверяются
  отдельно; специалист и разрешение владельца для реальных данных остаются gates.
- [ ] Описать invite Cloudflare Pages и DNS/SMTP/OAuth/Auth redirect setup по
  действующим конфигам/решениям; не менять домен прототипа и auth policy,
  неизвестные значения placeholders. Provider dashboards и DNS — handoff,
  не запускать deploy/рассылку/создание сервисов. Не обещать готовый deep link.
- [ ] Checklist cloud readiness различает local validation и remote evidence:
  wakeup Free и ошибки соединения, лимиты/без расходов, backup/monitoring
  integration points как будущие пакеты без ссылки на ещё несуществующие файлы.
  Не объявлять SOM-40/пилот завершёнными.
- [ ] Meaningful CLI tests: dev==pilot, malformed URL/ref, missing values,
  canonical redirects/domain и безопасный вывод при секретном input.
  cd app && npm run check; app/review/som-40-pilot-config/README.md с командами,
  результатами и remote gates.

## Границы

Только новые tools/pilot-config/, docs/app/pilot/ENVIRONMENT.md,
app/review/som-40-pilot-config/README.md, минимальные CHANGELOG/ROADMAP и новый ADR.
Не менять app code/config/dependencies, existing env/config файлы, SQL/supabase
конфиг, auth, existing deployment scripts/workflows, monitoring/backup пакеты,
privacy документы и tools/codex-agents/ правила/скрипты.
Ветка agent/som-40-pilot-config.

## Источники

AGENTS.md, app/AGENTS.md, docs/app/{README,CONVENTIONS,DELIVERY-PLAN,ROADMAP,
OPEN-QUESTIONS,PROJECT-MEMORY,ARCHITECTURE,UI-PARITY}.md; ADR 0007/0064/0067,
supabase/README.md, действующие конфигурации и .github/workflows/app.yml.
Проверяй актуальные пути и существующие решения перед реализацией.

## Общие требования

База fix/som-50-template-picker, текущий commit 08f0251. Draft PR только в эту базу, заголовок с SOM-40.
Не менять Linear, не задавать вопросов, не отправлять сообщения людям.
CHANGELOG и ROADMAP — минимальные записи без объявления SOM-40 завершённой.
Новый архитектурный выбор — отдельный ADR с незанятым номером и descriptive filename.
app код без комментариев/any, строки интерфейса через i18n; новые PNG запрещены.

## Чего нельзя проверить в контейнере

Нет Docker, локального Supabase, браузера, iOS/Android устройств. Облачные
учётные записи, DNS, SMTP, реальные бэкапы/восстановление и remote telemetry
не считать проверенными. Не создавать сервисы, не деплоить, не подключать платные
тарифы, не использовать реальные данные клиентов и не запускать production workflow.
Только синтетические fixtures и локальные проверки. Не объявлять экраны принятыми.
