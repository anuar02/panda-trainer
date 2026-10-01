# SOM-19 — вход и сессия

01.10.2026. Методы входа одобрены владельцем в ADR 0004; домен приглашений pending.
Layout email screen 390×844 показан в текущей Codex-сессии и одобрен ответом
«Approve this layout». У прототипа нет login/OTP экрана; это новый экран,
а не принятый паритет с несуществующим эталоном. Основание — UI-PARITY §5.

## Реализовано

- Email code, OTP error/resend, Apple/Google browser PKCE и проверка callback.
- Восстановление, истечение/отзыв сессии, выход/смена аккаунта; /auth/account
  защищён от входа без сессии. Backend проверяет доступ через RLS.
- SecureStore на native, sessionStorage на web. Демо доступно отдельно через
  /demo и не изображает реальные данные вошедшего аккаунта.

## Проверено

- `npm run check`: TypeScript, ESLint, Prettier и 357 тестов / 50 suites проходят.
- Реальный Supabase SDK с тестовым WebCrypto: challenge S256 совпадает с SHA-256
  сохранённого verifier. Отдельный тест запрещает открывать OAuth с plain challenge.
- `npm run export`: iOS, Android и static web после добавления native WebCrypto.
  Это проверка бандлов, не живого provider flow. Позже Android arm64 debug APK
  собран успешно, но runtime остановился до JS из-за packager HTTP 403;
  [подробности](../invitations/README.md#открыто).
- Изолированный стек trainerApp-som18, API 55321, DB 55322, Mailpit 55324.
- auth_email_smoke.py: письмо example.test захвачено локально, неверный код и
  повтор использованного кода отклонены, session refresh и local logout работают.
  Временные auth user и письмо удаляются; реальные сообщения не отправляются.
- Headless Chrome, localhost:8087, 390×844: письмо → неверный код → правильный
  код → /auth/account → reload → смена аккаунта → account route возвращает login.
  Ноль browser runtime errors. Скрипт этой проверки — /tmp/trainer-auth-flow.cjs.
- Снимки сессии — /tmp/trainer-auth-email.png и /tmp/trainer-auth-code-error.png;
  новые PNG не добавлены в Git в ожидании общей политики OPEN-QUESTIONS №11.

## Открыто

Apple/Google credentials и живой OAuth flow, native UI/Keychain, два телефона,
серверные бизнес-экраны/onboarding и invitations. Для production требуется
собственная конфигурация Supabase templates/redirect URLs и SMTP; бесплатная
локальная проверка не означает готовую доставку писем пилоту. Layout approval
не закрывает эти критерии.

Native использует Quick Crypto и требует development build; Expo Go не подходит.

Технический контракт: [ADR 0032](../../../docs/app/decisions/0032-auth-runtime-and-login.md).
