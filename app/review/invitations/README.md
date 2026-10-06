# SOM-21 — приглашения и реальные связи клиента

Дата: 01.10.2026. [ADR 0034](../../../docs/app/decisions/0034-client-invitations.md).

## Реализация

- `/workspace/invite/[id]`: реальная карточка и безопасные метаданные приглашения;
  выпуск, перевыпуск, отзыв, копирование и системный Share по явному нажатию.
- `/invite/[token]`: сохранение намерения до входа, возврат после OTP/OAuth,
  отдельное подтверждение принятия, общий отказ для недоступной ссылки.
- `/auth/account`: реальные связи с тренерами. Аккаунт с клиентской карточкой
  не перенаправляется автоматически в создание тренерского пространства.
- Токен выпуска остаётся в памяти экрана; после reload доступны срок/отзыв и
  выпуск новой ссылки. Сервер хранит только хэш. На сетевой ошибке принятия
  pending token сохраняется; terminal/успех очищает только совпадающий токен.

## Конфигурация

`EXPO_PUBLIC_INVITATION_BASE_URL` по умолчанию пуст. Без разрешённого origin
создание недоступно. Для headless локального теста явно задаётся
`http://localhost:8088`; HTTP loopback разрешён только development. Production
домен не подставляется и universal/app links ещё не настроены.

## Проверки

- `npm run check`: 377 тестов / 53 suites, TypeScript, ESLint, Prettier.
- `npm run export`: iOS, Android, web.
- Clean reset, 384 pgTAP / 12 файлов, db lint без ошибок, generated types совпадают.
- `invitation_concurrency.py`: два претендента → одна привязка; замена первой
  запрещает старый токен; принятие первым запрещает последующий перевыпуск.
  Все три проверки и scoped cleanup проходят.
- `invitations.test.ts` / `invitations-pending.test.ts`: 256-bit token/encoding,
  origin validation, повтор с тем же запросом, разбор ответов, нейтральные
  ошибки без секрета, P0002 против retryable failure, условная очистка intent.
- `verify.cjs`: 7 headless browser checks проходят: выпуск/замена ссылки,
  отказ старому токену, OTP без тренерского onboarding, явное принятие,
  связь после reload, отказ другому аккаунту и отзыв. Cleanup удаляет только
  три созданных synthetic-аккаунта, их workspace-данные и сообщения Mailpit.
  Page errors и неожиданные console errors запрещены; исключены точный favicon
  404 и ожидаемый accept RPC HTTP 500/P0002 для недоступных ссылок.

Запуск с работающим Expo web и изолированным Supabase/Auth/Mailpit:

```sh
node app/review/invitations/verify.cjs \
  --workdir /path/to/isolated/supabase-workdir \
  --container supabase_db_trainerApp-som18 \
  --origin http://localhost:8088
```

## Открыто

Локальная iOS development build 01.10 заблокирована Xcode 26.2 (17C52):
[Expo SDK 57 требует 26.4+](https://docs.expo.dev/versions/latest/). CoreSimulator
доступен при нужных разрешениях; ошибка sandbox не считается поломкой сервиса.
iOS сборка не запускалась. Android arm64 debug APK собран: `assembleDebug
--max-workers=2 -PreactNativeArchitectures=arm64-v8a`, 562 Gradle tasks,
`BUILD SUCCESSFUL`; подпись APK проверена, Quick Crypto присутствует в binary.
Лог локально: `/tmp/trainerapp-android-assembleDebug-arm64.log`.

Headless runtime попытка остановилась до загрузки JS: packager status через
ADB reverse вернул HTTP 403 (`Unable to load script`). Auth/deep links на native
не проверены. Read-only эмулятор остановлен после сообщения владельца о RAM;
тестовых аккаунтов/писем эта попытка не создала.

Production-домен, provider credentials и native cold/warm deep links, реальный
Share/clipboard на телефонах, две физические сессии и owner acceptance остаются
открытыми. Клиентский аккаунт показывает связи; история/программа клиента ещё
не подключены к серверным экранам (SOM-35/36). Демо не является доказательством.

Преднамеренные временные ограничения: до явного принятия нет server preview
личности/статуса ссылки; клиент видит нейтральное приглашение и не получает
обещания о доступности ещё не подключённых экранов. Снимки/паритет требуют
отдельного одобрения владельца; одобрение login layout сюда не переносится.
