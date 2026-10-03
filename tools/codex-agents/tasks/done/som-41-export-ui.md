# SOM-41 · Интерфейс серверного экспорта тренера

Linear: https://linear.app/something-great/issue/SOM-41/realizovat-eksport-udalenie-akkaunta-i-dokumenty-privatnosti

## Контекст

Read-only export влит 08f0251 (#29), integrated evidence 5b3de4a (#30),
решения SOM-51/59 закрыты владельцем (ADR0064). Все зависимости UI-пакета в базе.
loadAccountExport и app/review/som-41-trainer-export/README.md — действующий seam.
Серверный snapshot не покрывает pending на устройствах и не разрешает удаление.
Third делает journal, personal изолированный deletion preflight: не интегрировать его.

## Критерии

- [ ] Подключить серверный экспорт к trainer profile/settings существующим layout,
  без редизайна и без client export. Реальная authenticated workspace сессия;
  demo не выдаёт фиктивный production файл. Сохранять существующие действия профиля.
- [ ] Локализованные loading/retry/errors для ошибок typed service; account/workspace
  fencing и отмена не показывают/не сохраняют ответ прошлой сессии.
- [ ] Версионный UTF-8 JSON сохраняется/передаётся пользователю через подходящий
  Expo/native/web API. Успех только по результату реальной операции; cancel/unsupported/
  storage/share failure различаются. Не объявлять вызов share доказательством сохранения.
- [ ] Временные файлы scoped и очищаются по окончании/ошибке; не логировать содержимое,
  private notes/keys/tokens, не хранить export в AsyncStorage. Bigint/dates/nulls/порядок
  и полнота валидного snapshot сохраняются, ограничение pending видно пользователю.
- [ ] Tests session switch/inflight/cancel/retry, malformed payload, сохранение точного
  JSON и ошибок transport/file API; native file/share проверить позже, явно указать.

## Границы

features/account-export (новые UI/controller/file adapter/strings), их tests;
минимальный entry в features/profiles/profile-screens.tsx и navigation/profile-screen.tsx
или фактическом trainer profile route. Domain/account-export только необходимый
совместимый seam. Новую зависимость добавлять лишь при отсутствии нужного Expo API,
ADR и lock тогда обязательны; Expo версии PR #34 не дублировать.
Не менять SQL/database.types.ts, auth provider, root trainer layout,
workout/preload/sync, deletion/privacy docs, клиентские экраны, billing или backup.
Удаление аккаунта, local pending export/ack и публикация политики вне задачи.

## Общие требования и источники

Прочитай AGENTS.md, app/AGENTS.md, LINEAR-AGENT-GUIDE.md,
docs/app/{README,PROJECT-MEMORY,ROADMAP,CONVENTIONS,DELIVERY-PLAN,OPEN-QUESTIONS,UI-PARITY,ARCHITECTURE,DATA-MODEL}.md,
ADR 0007/0061/0062/0064/0066 и относящиеся к задаче отчёты.
Используй graft, если доступен; проверяй реальные пути в репозитории.
База fix/som-50-template-picker, текущий commit 9d1802a. PR #34 claude/ci-green
параллельно исправляет SQL apply_operations и Expo patch drift: не дублируй его,
не меняй старые migrations (24 уже применены в пилоте), версии Expo и package-lock
ради CI. Новые SQL изменения — только новой миграцией с уникальным timestamp.
Не применяй миграции в облако.

- [ ] cd app && npm run check зелёный; meaningful tests по изменённым контрактам.
- [ ] CHANGELOG («Не выпущено»), минимальный checkpoint ROADMAP и отчёт
  app/review/som-41-export-ui/README.md с точными командами, результатами и ограничениями.
  При новом подходе ADR с незанятым номером и descriptive filename.

Общие CHANGELOG/ROADMAP/i18n меняй минимально. App код без комментариев/any;
строки через i18n. Linear не менять, вопросов не задавать. Draft PR только
в fix/som-50-template-picker, ветка agent/som-41-export-ui, заголовок с SOM-номером.
main, prototype, scripts/rules очереди, платные сервисы, реальные данные исключены.

## Чего нельзя проверить в контейнере

Нет Docker, Supabase, браузера и устройств iOS/Android. SQL/pgTAP runtime,
generated drift, реальный SQLite/reopen/crash, native/visual/accessibility,
облачные процессы и приёмку владельца не объявлять проверенными. Подготовь
воспроизводимые команды и вымышленные fixtures. Новых PNG не коммитить.
Экраны, SOM-задачу целиком и пилот принятыми не объявлять.
