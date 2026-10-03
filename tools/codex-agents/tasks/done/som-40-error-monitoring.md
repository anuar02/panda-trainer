# SOM-40 · Безопасный мониторинг ошибок пилота

Linear: https://linear.app/something-great/issue/SOM-40/podgotovit-soglasovannoe-okruzhenie-pilota-i-vosstanovlenie

## Контекст

Все решения-зависимости SOM-40 влиты, ADR 0064/0067: Supabase EU Central и только
бесплатные тарифы, Sentry Developer как разрешённый вариант. Серверный export SOM-41 и preload SOM-30 уже влиты PR #29/#28; personal
готовит конфигурацию окружения, third — backup tooling. Не создавать Sentry проект и не отправлять события.
Реальные данные и допустимость инфраструктурных логов ждут специалиста.

## Критерии

- [ ] Изолированный features/error-monitoring и typed contract: monitoring
  disabled без явной конфигурации/opt-in; injectable transport для тестов.
  Подготовить совместимый с Expo Sentry adapter и минимальную bootstrap интеграцию
  только в корневом app layout, без provider/routes тренера и без изменения auth.
- [ ] Privacy by allowlist: не отправлять raw exception message/context/request,
  notes, имена/телефоны/email, tokens/URLs/headers, journal payloads или user ID.
  Разрешить только проверенные стабильные error codes, release/environment/platform
  и безопасный stack metadata; неизвестный input отбрасывается/редактируется.
  Default PII, breadcrumbs/console capture, tracing/replay/screenshots выключены.
- [ ] Ошибка telemetry не ломает приложение, нет retry flood/рекурсии; ограничить
  события и описать лимиты free tier без выдуманных квот. Отдельный EU DSN/region
  gate и handoff облачных настроек, credentials только вне git. Source maps и
  auth token не в app bundle. Без DSN приложение запускается как раньше.
- [ ] Meaningful tests: синтетические чувствительные данные в разных полях,
  nested/unknown payload, invalid config, disabled mode, transport failure и
  bounded reporting. Не выдавать mocks за live Sentry verification.
- [ ] cd app && npm run check; docs/app/pilot/ERROR-MONITORING.md и
  app/review/som-40-error-monitoring/README.md с командами и ограничениями;
  оставшиеся облачные действия и юридический review явно открыты.

## Границы

Новые app/src/features/error-monitoring/, соответствующие tests; минимальный
bootstrap только app/app/_layout.tsx (проверь реальный путь), app package.json/lock
лишь для совместимого SDK при необходимости. Новые docs/app/pilot/ERROR-MONITORING.md,
app/review/som-40-error-monitoring/README.md, минимальные CHANGELOG/ROADMAP, новый ADR.
Не менять existing config/env modules (их изучить и использовать), auth/session,
trainer layout/routes, preload/outbox/journal/export, SQL, UI/prototype/privacy,
backup workflows/scripts и pilot config personal. Ветка agent/som-40-error-monitoring.

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
