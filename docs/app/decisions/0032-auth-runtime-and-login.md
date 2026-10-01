# 0032. Реализация входа и хранения сессии

- **Статус:** Принято; layout входа одобрен владельцем 01.10.2026
- **Дата:** 01.10.2026
- **Задача:** SOM-19; методы подтверждены в ADR 0004

## Решение

Типизированный Supabase client создаётся только при заданных публичных URL/key.
Вход использует email OTP и browser OAuth Apple/Google с PKCE. Приложение
обменивает code через exchangeCodeForSession; произвольные callback URL,
неизвестные параметры, дубликаты code и implicit токены не принимаются.
Native callback — panda-trainer://auth/callback; web — /auth/callback на том же
origin. Production домен приглашений не задаётся и не выводится из этих адресов.

Одновременно запускается один OAuth flow, чтобы не перезаписать verifier.
Повторный callback в том же процессе использует общий результат. Web popup
закрывается через maybeCompleteAuthSession; серверная статическая сборка не
читает browser storage. Ошибки отображаются без токенов и ответов провайдера.

На native сессия хранится только в SecureStore. Значение делится по Unicode
code points на части не более 1800 UTF-8 bytes; имена ключей содержат допустимые
символы. Записываются новая UUID-generation и manifest, затем удаляется старая.
Неудачная запись сохраняет прежнюю generation. Чтение, запись и удаление
сериализованы по ключу. Ошибка Keychain не превращается в успешное сохранение.
На web используется sessionStorage: reload сохраняет вход, закрытие вкладки
требует нового входа. Ключи разделены по Supabase host/port.

AuthProvider восстанавливает сессию и слушает auth events. Поздний результат
старого getSession не отменяет свежий SIGNED_OUT. Native refresh работает только
в active AppState. SDK 2.117.2 координирует refresh самостоятельно; deprecated
custom lock не передаётся. Выход и смена аккаунта используют scope: local.

## Экран и демо

Native PKCE использует `react-native-quick-crypto` 1.1.7 с Nitro и quick-base64:
перед созданием client устанавливается native WebCrypto. У Expo Crypto нет
полного subtle API; без него auth-js использует plain challenge и может брать
verifier из Math.random. Частичный digest shim также ломает asymmetric getClaims,
которому нужны importKey/verify. Web сохраняет браузерный WebCrypto.
Native требует development build/prebuild, а не Expo Go. Это изменение runtime,
но не доказательство прохождения OAuth на устройстве.
Перед открытием браузера приложение проверяет `code_challenge_method=s256`;
runtime без SHA-256 не запускает OAuth с plain challenge.

Прототип не содержит login/OTP screen. Показанный владельцу layout 390×844
одобрен явным ответом «Approve this layout» 01.10.2026. Это новый экран из
существующих Button/Field/Text и темы, а не утверждение о сравнении с эталоном.
Другие состояния и native-приёмка остаются открытыми.

Корень открывает /auth/sign-in; /auth/account требует сессию. Бизнес-экраны пока
используют вымышленные данные и доступны отдельно через /demo. Авторизованный
аккаунт не выдаёт демо за своё рабочее пространство. Onboarding и подключение
данных относятся к следующим задачам; backend RLS остаётся обязательной границей.

## Конфигурация и проверки

Локальные email templates содержат шестизначный Token. SMTP-письма перехватывает
локальный Mailpit; реальным людям сообщения не отправлялись. Apple/Google требуют
конфигурации провайдеров в Supabase; client code и тесты её не заменяют.

Проверены storage rollback/Unicode, отмена OAuth, дедупликация callback, local
logout и гонка восстановления. Local Auth smoke проверяет неверный/повторный
код, refresh и logout; browser flow — ввод кода, ошибку, reload и смену аккаунта.
Результаты — app/review/auth/README.md. Native OAuth, Keychain на устройстве,
провайдеры и два авторизованных телефона не заявляются проверенными.

## Источники

- [Supabase PKCE](https://supabase.com/docs/guides/auth/sessions/pkce-flow)
- [Email OTP](https://supabase.com/docs/guides/auth/auth-email-passwordless)
- [Expo WebBrowser](https://docs.expo.dev/versions/v57.0.0/sdk/webbrowser/)
- [Expo SecureStore](https://docs.expo.dev/versions/latest/sdk/securestore/)
- API и типы установленных Supabase 2.117.2 / Expo SDK 57; lockfile фиксирует версии.
- [Quick Crypto setup](https://margelo.github.io/react-native-quick-crypto/docs/introduction/complete-setup)
