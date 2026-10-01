# Приложение

Expo SDK 57, TypeScript strict, Expo Router, NativeWind 4 и Supabase Auth.
Начальный маршрут открывает вход; `/auth/account` требует действующей сессии.
`/auth/onboarding` создаёт профиль и пространство; `/workspace/clients` и
`/workspace/client/[id]` читают реальные карточки, программы и записи через RLS.
Остальные бизнес-сценарии пока используют вымышленные данные через отдельный `/demo`.
Выбор роли в демо меняет только навигацию и не даёт никаких прав в базе.

## Запуск

Node.js 22.13+ (проверено на 22.18), npm 10+, команды из `app/`:

```sh
npm ci
npm run check
npm start
npm run ios
npm run android
```

`npm run web` — вспомогательное браузерное превью, не замена проверки на телефоне.
`npm run export` проверяет бандлы iOS/Android и статический web-export.
Для локальной iOS-сборки SDK 57 нужен Xcode 26.4+; Android требует установленного SDK.
Не использовать EAS и платные сервисы без согласования.

Native Auth использует Quick Crypto: нужен локальный development build
(`npx expo run:ios` / `npx expo run:android`), Expo Go не поддерживается.

## Устройство

- `app/` — маршруты, две группы вкладок, выбор роли, обработка неизвестного адреса.
- `src/features/navigation/` — временные экраны каркаса.
- `src/ui/` — компоненты и единые токены. Классы NativeWind используют CSS-переменные
  `ThemeProvider`; системная тема переключается вместе с устройством.
- `src/lib/i18n/ru.ts` — все строки интерфейса, типизированные ключи i18next.
- `tests/` — контраст темы, поведение недоступной кнопки и смена оформления.
- `/review` — только в development: поле, чип, шторка, тост и состояния сети/ошибки.
  В production перенаправляет к выбору роли.

Шрифты Inter (400/500/600) и Montserrat (600) упакованы с зависимостями Google Fonts,
не загружаются из интернета при запуске. Для чисел использовать `tabular-nums`.
Лицензии OFL входят в пакеты `@expo-google-fonts/*`.
Оформление сохраняется в памяти процесса; постоянные настройки — будущий этап.

## Окружение

Без `.env` доступно демо, а вход сообщает об отсутствии конфигурации.
Для локального входа скопировать `.env.example` в `.env.local`:
только URL и публичный anon key локального Supabase. Никаких service role / secret keys.
Для iOS-симулятора подходит `127.0.0.1`, Android-эмулятора — `10.0.2.2`, телефона —
LAN-адрес компьютера. Не коммитить `.env.local`.

Код письма доступен в локальном Mailpit. Apple/Google требуют настройки provider
credentials и redirect allowlist в Supabase; native callback —
`panda-trainer://auth/callback`, web — `/auth/callback` на origin приложения.
Production-домен приглашений пока не выбран. `EXPO_PUBLIC_INVITATION_BASE_URL`
остаётся пустым; создание ссылки в UI недоступно без явно настроенного origin.
Для локальной проверки можно задать HTTP localhost только в development.
Маршруты `/workspace/invite/[id]` и `/invite/[token]` используют настоящие RPC;
аккаунт клиента показывает свои связи с тренерами.
[Отчёт приглашений](review/invitations/README.md).
Контракт входа и проверенные сценарии:
[ADR 0032](../docs/app/decisions/0032-auth-runtime-and-login.md),
[auth review](review/auth/README.md).

Команды локальной базы: [../supabase/README.md](../supabase/README.md).
Решения и ограничения: [ADR 0006](../docs/app/decisions/0006-app-foundation.md).
