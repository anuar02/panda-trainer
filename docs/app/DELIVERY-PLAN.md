# Карта поставки trainerApp и Linear

Снимок импорта: 30.09.2026. [Проект Linear](https://linear.app/something-great/project/trainerapp-827feca01ff7).
48 задач, 13 milestones. Источники: ROADMAP, OPEN-QUESTIONS, UI-PARITY,
ARCHITECTURE, DATA-MODEL и последний отчёт конструктора. Все задачи импортированы
в Backlog; даты, приоритеты и исполнители не назначались. Исторически выполненный
этап 0 и закрытые demo-пункты отражены в [PROJECT-BRIEF](PROJECT-BRIEF.md),
а не созданы как заново выполненные задачи.

## Что читать

| Вопрос | Источник |
| --- | --- |
| Для кого продукт, что входит в пилот | [PROJECT-BRIEF](PROJECT-BRIEF.md) |
| Этапы и критерии результата | [ROADMAP](ROADMAP.md) |
| Конкретная задача и зависимости | Live Linear; таблица ниже служит указателем |
| Архитектура, схема, права и RPC | [ARCHITECTURE](ARCHITECTURE.md), [DATA-MODEL](DATA-MODEL.md) |
| Как принять экран | [UI-PARITY](UI-PARITY.md), ADR 0007 |
| Решения владельца | [OPEN-QUESTIONS](OPEN-QUESTIONS.md) |
| Работа агента и обновление записей | [LINEAR-WORKFLOW](LINEAR-WORKFLOW.md) |

## Ближайшая работа

1. [SOM-50](https://linear.app/something-great/issue/SOM-50/ispravit-native-picker-konstruktora-i-provesti-polnuyu-priyomku-polej): native picker и полная проверка полей конструктора.
2. [SOM-17](https://linear.app/something-great/issue/SOM-17/prinyat-paritet-karkasa-i-obshej-navigacii): паритет общих компонентов и пяти вкладок каждой роли.
3. [SOM-18](https://linear.app/something-great/issue/SOM-18/sozdat-bazovuyu-shemu-rls-tipy-i-vymyshlennyj-seed): базовая схема/RLS независимо от ожидания решения о входе.
4. [SOM-60](https://linear.app/something-great/issue/SOM-60/reshenie-10-podtverdit-adr-0004-e-mail-otp-apple-google-kakoj-domen): решение владельца о входе и домене перед [SOM-19](https://linear.app/something-great/issue/SOM-19/podklyuchit-soglasovannyj-vhod-i-zhiznennyj-cikl-sessii).

Это порядок из текущего checkpoint и явных ограничений. Он не назначает людей,
сроки или приоритеты и не означает, что работа уже началась.

## Карта задач

### 01 · Каркас

| Задача | Объём | Требует завершения |
| --- | --- | --- |
| [SOM-17](https://linear.app/something-great/issue/SOM-17/prinyat-paritet-karkasa-i-obshej-navigacii) | Принять паритет каркаса и общей навигации | — |

### 02 · Вход и схема данных v1

| Задача | Объём | Требует завершения |
| --- | --- | --- |
| [SOM-18](https://linear.app/something-great/issue/SOM-18/sozdat-bazovuyu-shemu-rls-tipy-i-vymyshlennyj-seed) | Создать базовую схему, RLS, типы и вымышленный seed | — |
| [SOM-19](https://linear.app/something-great/issue/SOM-19/podklyuchit-soglasovannyj-vhod-i-zhiznennyj-cikl-sessii) | Подключить согласованный вход и жизненный цикл сессии | [SOM-18](https://linear.app/something-great/issue/SOM-18/sozdat-bazovuyu-shemu-rls-tipy-i-vymyshlennyj-seed), [SOM-60](https://linear.app/something-great/issue/SOM-60/reshenie-10-podtverdit-adr-0004-e-mail-otp-apple-google-kakoj-domen) |
| [SOM-20](https://linear.app/something-great/issue/SOM-20/podklyuchit-onboarding-trenera-i-upravlenie-klientami) | Подключить onboarding тренера и управление клиентами | [SOM-19](https://linear.app/something-great/issue/SOM-19/podklyuchit-soglasovannyj-vhod-i-zhiznennyj-cikl-sessii) |
| [SOM-21](https://linear.app/something-great/issue/SOM-21/realizovat-odnorazovye-priglasheniya-i-deep-links) | Реализовать одноразовые приглашения и deep links | [SOM-19](https://linear.app/something-great/issue/SOM-19/podklyuchit-soglasovannyj-vhod-i-zhiznennyj-cikl-sessii) |
| [SOM-43](https://linear.app/something-great/issue/SOM-43/prinyat-ekrany-etapa-2-t-clients-t-client-t-invite-t-welcome) | Принять экраны этапа 2: t-clients, t-client, t-invite, t-welcome | [SOM-20](https://linear.app/something-great/issue/SOM-20/podklyuchit-onboarding-trenera-i-upravlenie-klientami), [SOM-21](https://linear.app/something-great/issue/SOM-21/realizovat-odnorazovye-priglasheniya-i-deep-links) |

### 03 · Библиотека упражнений и шаблоны

| Задача | Объём | Требует завершения |
| --- | --- | --- |
| [SOM-22](https://linear.app/something-great/issue/SOM-22/podklyuchit-servernuyu-biblioteku-poisk-i-arhivirovanie) | Подключить серверную библиотеку, поиск и архивирование | [SOM-18](https://linear.app/something-great/issue/SOM-18/sozdat-bazovuyu-shemu-rls-tipy-i-vymyshlennyj-seed) |
| [SOM-23](https://linear.app/something-great/issue/SOM-23/podklyuchit-redaktor-shablonov-k-serveru) | Подключить редактор шаблонов к серверу | [SOM-22](https://linear.app/something-great/issue/SOM-22/podklyuchit-servernuyu-biblioteku-poisk-i-arhivirovanie) |
| [SOM-24](https://linear.app/something-great/issue/SOM-24/realizovat-versionirovannye-lichnye-programmy-klientov) | Реализовать версионированные личные программы клиентов | [SOM-23](https://linear.app/something-great/issue/SOM-23/podklyuchit-redaktor-shablonov-k-serveru), [SOM-55](https://linear.app/something-great/issue/SOM-55/reshenie-5-chto-delat-s-lichnoj-kopiej-programmy-pri-naznachenii) |
| [SOM-44](https://linear.app/something-great/issue/SOM-44/prinyat-ekrany-etapa-3-t-library-t-template-t-template-editor) | Принять экраны этапа 3: t-library, t-template, t-template-editor | [SOM-24](https://linear.app/something-great/issue/SOM-24/realizovat-versionirovannye-lichnye-programmy-klientov), [SOM-50](https://linear.app/something-great/issue/SOM-50/ispravit-native-picker-konstruktora-i-provesti-polnuyu-priyomku-polej) |
| [SOM-50](https://linear.app/something-great/issue/SOM-50/ispravit-native-picker-konstruktora-i-provesti-polnuyu-priyomku-polej) | Исправить native picker конструктора и провести полную приёмку полей | — |

### 04 · Расписание

| Задача | Объём | Требует завершения |
| --- | --- | --- |
| [SOM-25](https://linear.app/something-great/issue/SOM-25/sozdat-servernoe-raspisanie-i-pravila-peresechenij) | Создать серверное расписание и правила пересечений | [SOM-18](https://linear.app/something-great/issue/SOM-18/sozdat-bazovuyu-shemu-rls-tipy-i-vymyshlennyj-seed) |
| [SOM-26](https://linear.app/something-great/issue/SOM-26/podklyuchit-today-nedelyu-i-sozdanie-zanyatiya-k-serveru) | Подключить Today, неделю и создание занятия к серверу | [SOM-25](https://linear.app/something-great/issue/SOM-25/sozdat-servernoe-raspisanie-i-pravila-peresechenij) |
| [SOM-27](https://linear.app/something-great/issue/SOM-27/realizovat-perenosy-otmeny-i-proverku-revizij) | Реализовать переносы, отмены и проверку ревизий | [SOM-25](https://linear.app/something-great/issue/SOM-25/sozdat-servernoe-raspisanie-i-pravila-peresechenij) |
| [SOM-45](https://linear.app/something-great/issue/SOM-45/prinyat-ekrany-etapa-4-t-today-t-schedule-t-new-t-inbox) | Принять экраны этапа 4: t-today, t-schedule, t-new, t-inbox | [SOM-26](https://linear.app/something-great/issue/SOM-26/podklyuchit-today-nedelyu-i-sozdanie-zanyatiya-k-serveru), [SOM-27](https://linear.app/something-great/issue/SOM-27/realizovat-perenosy-otmeny-i-proverku-revizij) |

### 05 · Журнал тренировки

| Задача | Объём | Требует завершения |
| --- | --- | --- |
| [SOM-28](https://linear.app/something-great/issue/SOM-28/sozdat-tablicy-zhurnala-i-izolyaciyu-zametok) | Создать таблицы журнала и изоляцию заметок | [SOM-18](https://linear.app/something-great/issue/SOM-18/sozdat-bazovuyu-shemu-rls-tipy-i-vymyshlennyj-seed), [SOM-24](https://linear.app/something-great/issue/SOM-24/realizovat-versionirovannye-lichnye-programmy-klientov), [SOM-25](https://linear.app/something-great/issue/SOM-25/sozdat-servernoe-raspisanie-i-pravila-peresechenij) |
| [SOM-29](https://linear.app/something-great/issue/SOM-29/realizovat-sqlite-outbox-i-idempotentnuyu-sinhronizaciyu) | Реализовать SQLite outbox и идемпотентную синхронизацию | [SOM-28](https://linear.app/something-great/issue/SOM-28/sozdat-tablicy-zhurnala-i-izolyaciyu-zametok), [SOM-53](https://linear.app/something-great/issue/SOM-53/reshenie-3-politika-konfliktov-zhurnala-na-dvuh-ustrojstvah) |
| [SOM-30](https://linear.app/something-great/issue/SOM-30/predzagruzhat-trenirovku-i-vosstanavlivat-zhurnal) | Предзагружать тренировку и восстанавливать журнал | [SOM-29](https://linear.app/something-great/issue/SOM-29/realizovat-sqlite-outbox-i-idempotentnuyu-sinhronizaciyu) |
| [SOM-31](https://linear.app/something-great/issue/SOM-31/dovesti-vvod-podhodov-i-mini-gruppy-do-production) | Довести ввод подходов и мини-группы до production | [SOM-30](https://linear.app/something-great/issue/SOM-30/predzagruzhat-trenirovku-i-vosstanavlivat-zhurnal) |
| [SOM-32](https://linear.app/something-great/issue/SOM-32/zavershat-i-ispravlyat-zhurnal-s-obnovleniem-programmy) | Завершать и исправлять журнал с обновлением программы | [SOM-31](https://linear.app/something-great/issue/SOM-31/dovesti-vvod-podhodov-i-mini-gruppy-do-production) |
| [SOM-46](https://linear.app/something-great/issue/SOM-46/prinyat-ekrany-etapa-5-t-session-i-dock-zhurnala) | Принять экраны этапа 5: t-session и dock журнала | [SOM-32](https://linear.app/something-great/issue/SOM-32/zavershat-i-ispravlyat-zhurnal-s-obnovleniem-programmy) |

### 06 · Посещения, пакеты и оплаты

| Задача | Объём | Требует завершения |
| --- | --- | --- |
| [SOM-33](https://linear.app/something-great/issue/SOM-33/sozdat-uchyot-paketov-i-atomarnoe-spisanie-poseshenij) | Создать учёт пакетов и атомарное списание посещений | [SOM-25](https://linear.app/something-great/issue/SOM-25/sozdat-servernoe-raspisanie-i-pravila-peresechenij) |
| [SOM-34](https://linear.app/something-great/issue/SOM-34/podklyuchit-ruchnye-oplaty-dolg-i-ekran-billing) | Подключить ручные оплаты, долг и экран billing | [SOM-33](https://linear.app/something-great/issue/SOM-33/sozdat-uchyot-paketov-i-atomarnoe-spisanie-poseshenij) |
| [SOM-47](https://linear.app/something-great/issue/SOM-47/prinyat-ekrany-etapa-6-t-billing-i-dannye-paketovoplat-kartochki) | Принять экраны этапа 6: t-billing и данные пакетов/оплат карточки клиента | [SOM-34](https://linear.app/something-great/issue/SOM-34/podklyuchit-ruchnye-oplaty-dolg-i-ekran-billing) |

### 07 · Приложение клиента

| Задача | Объём | Требует завершения |
| --- | --- | --- |
| [SOM-35](https://linear.app/something-great/issue/SOM-35/svyazat-prinyatie-priglasheniya-s-sushestvuyushej-istoriej) | Связать принятие приглашения с существующей историей | [SOM-21](https://linear.app/something-great/issue/SOM-21/realizovat-odnorazovye-priglasheniya-i-deep-links) |
| [SOM-36](https://linear.app/something-great/issue/SOM-36/podklyuchit-klientskie-ekrany-i-dejstviya-k-servernym-dannym) | Подключить клиентские экраны и действия к серверным данным | [SOM-35](https://linear.app/something-great/issue/SOM-35/svyazat-prinyatie-priglasheniya-s-sushestvuyushej-istoriej), [SOM-32](https://linear.app/something-great/issue/SOM-32/zavershat-i-ispravlyat-zhurnal-s-obnovleniem-programmy), [SOM-34](https://linear.app/something-great/issue/SOM-34/podklyuchit-ruchnye-oplaty-dolg-i-ekran-billing), [SOM-27](https://linear.app/something-great/issue/SOM-27/realizovat-perenosy-otmeny-i-proverku-revizij), [SOM-56](https://linear.app/something-great/issue/SOM-56/reshenie-6-nuzhen-li-klientu-dostup-k-chernovomu-zhurnalu), [SOM-58](https://linear.app/something-great/issue/SOM-58/reshenie-8-kto-vvodit-rezultaty-tolko-trener-ili-i-klient) |
| [SOM-48](https://linear.app/something-great/issue/SOM-48/prinyat-ekrany-etapa-7-c-home-c-program-c-history-c-progress-c-profile) | Принять экраны этапа 7: c-home, c-program, c-history, c-progress, c-profile, c-first | [SOM-36](https://linear.app/something-great/issue/SOM-36/podklyuchit-klientskie-ekrany-i-dejstviya-k-servernym-dannym) |

### 08 · Уведомления в приложении

| Задача | Объём | Требует завершения |
| --- | --- | --- |
| [SOM-37](https://linear.app/something-great/issue/SOM-37/realizovat-uvedomleniya-neprochitannoe-i-realtime) | Реализовать уведомления, непрочитанное и Realtime | [SOM-27](https://linear.app/something-great/issue/SOM-27/realizovat-perenosy-otmeny-i-proverku-revizij), [SOM-36](https://linear.app/something-great/issue/SOM-36/podklyuchit-klientskie-ekrany-i-dejstviya-k-servernym-dannym) |
| [SOM-49](https://linear.app/something-great/issue/SOM-49/prinyat-ekrany-etapa-8-lenta-i-schyotchiki-uvedomlenij-obeih-rolej) | Принять экраны этапа 8: Лента и счётчики уведомлений обеих ролей | [SOM-37](https://linear.app/something-great/issue/SOM-37/realizovat-uvedomleniya-neprochitannoe-i-realtime) |

### 09 · Маскот и движение

| Задача | Объём | Требует завершения |
| --- | --- | --- |
| [SOM-38](https://linear.app/something-great/issue/SOM-38/integrirovat-utverzhdyonnuyu-pandu-i-prinyat-rive) | Интегрировать утверждённую панду и принять Rive | — |
| [SOM-39](https://linear.app/something-great/issue/SOM-39/prinyat-krupnyj-tekst-spokojnyj-interfejs-i-dvizhenie) | Принять крупный текст, спокойный интерфейс и движение | — |

### 10 · Готовность к пилоту

| Задача | Объём | Требует завершения |
| --- | --- | --- |
| [SOM-40](https://linear.app/something-great/issue/SOM-40/podgotovit-soglasovannoe-okruzhenie-pilota-i-vosstanovlenie) | Подготовить согласованное окружение пилота и восстановление | [SOM-51](https://linear.app/something-great/issue/SOM-51/reshenie-1-v-kakoj-strane-mozhno-hranit-dannye-klientov-bekapy-i-logi), [SOM-52](https://linear.app/something-great/issue/SOM-52/reshenie-2-byudzhet-na-servisy-supabase-eas-monitoring-i), [SOM-53](https://linear.app/something-great/issue/SOM-53/reshenie-3-politika-konfliktov-zhurnala-na-dvuh-ustrojstvah), [SOM-59](https://linear.app/something-great/issue/SOM-59/reshenie-9-sroki-hraneniya-dannyh-i-dopustimaya-poterya) |
| [SOM-41](https://linear.app/something-great/issue/SOM-41/realizovat-eksport-udalenie-akkaunta-i-dokumenty-privatnosti) | Реализовать экспорт, удаление аккаунта и документы приватности | [SOM-51](https://linear.app/something-great/issue/SOM-51/reshenie-1-v-kakoj-strane-mozhno-hranit-dannye-klientov-bekapy-i-logi), [SOM-59](https://linear.app/something-great/issue/SOM-59/reshenie-9-sroki-hraneniya-dannyh-i-dopustimaya-poterya) |
| [SOM-42](https://linear.app/something-great/issue/SOM-42/podgotovit-sborki-i-provesti-polevoj-pilot-na-iosandroid) | Подготовить сборки и провести полевой пилот на iOS/Android | [SOM-40](https://linear.app/something-great/issue/SOM-40/podgotovit-soglasovannoe-okruzhenie-pilota-i-vosstanovlenie), [SOM-41](https://linear.app/something-great/issue/SOM-41/realizovat-eksport-udalenie-akkaunta-i-dokumenty-privatnosti), [SOM-17](https://linear.app/something-great/issue/SOM-17/prinyat-paritet-karkasa-i-obshej-navigacii), [SOM-38](https://linear.app/something-great/issue/SOM-38/integrirovat-utverzhdyonnuyu-pandu-i-prinyat-rive), [SOM-39](https://linear.app/something-great/issue/SOM-39/prinyat-krupnyj-tekst-spokojnyj-interfejs-i-dvizhenie), [SOM-43](https://linear.app/something-great/issue/SOM-43/prinyat-ekrany-etapa-2-t-clients-t-client-t-invite-t-welcome), [SOM-44](https://linear.app/something-great/issue/SOM-44/prinyat-ekrany-etapa-3-t-library-t-template-t-template-editor), [SOM-45](https://linear.app/something-great/issue/SOM-45/prinyat-ekrany-etapa-4-t-today-t-schedule-t-new-t-inbox), [SOM-46](https://linear.app/something-great/issue/SOM-46/prinyat-ekrany-etapa-5-t-session-i-dock-zhurnala), [SOM-47](https://linear.app/something-great/issue/SOM-47/prinyat-ekrany-etapa-6-t-billing-i-dannye-paketovoplat-kartochki), [SOM-48](https://linear.app/something-great/issue/SOM-48/prinyat-ekrany-etapa-7-c-home-c-program-c-history-c-progress-c-profile), [SOM-49](https://linear.app/something-great/issue/SOM-49/prinyat-ekrany-etapa-8-lenta-i-schyotchiki-uvedomlenij-obeih-rolej) |

### 11 · После пилота (не планируется детально)

| Задача | Объём | Требует завершения |
| --- | --- | --- |
| [SOM-64](https://linear.app/something-great/issue/SOM-64/posle-pilota-ocenit-golos-push-lokalizaciyu-i-rasshirenie-platform) | После пилота: оценить голос, push, локализацию и расширение платформ | [SOM-42](https://linear.app/something-great/issue/SOM-42/podgotovit-sborki-i-provesti-polevoj-pilot-na-iosandroid) |

### Решения владельца

| Задача | Объём | Требует завершения |
| --- | --- | --- |
| [SOM-51](https://linear.app/something-great/issue/SOM-51/reshenie-1-v-kakoj-strane-mozhno-hranit-dannye-klientov-bekapy-i-logi) | Решение №1: В какой стране можно хранить данные клиентов, бэкапы и логи? Кто подтверждает требования? | — |
| [SOM-52](https://linear.app/something-great/issue/SOM-52/reshenie-2-byudzhet-na-servisy-supabase-eas-monitoring-i) | Решение №2: Бюджет на сервисы (Supabase, EAS, мониторинг) и сопровождение | — |
| [SOM-53](https://linear.app/something-great/issue/SOM-53/reshenie-3-politika-konfliktov-zhurnala-na-dvuh-ustrojstvah) | Решение №3: Политика конфликтов журнала на двух устройствах | — |
| [SOM-54](https://linear.app/something-great/issue/SOM-54/reshenie-4-porog-vyigrysha-vremeni-i-dopustimyh-oshibok-dlya) | Решение №4: Порог выигрыша времени и допустимых ошибок для голосового ввода | — |
| [SOM-55](https://linear.app/something-great/issue/SOM-55/reshenie-5-chto-delat-s-lichnoj-kopiej-programmy-pri-naznachenii) | Решение №5: Что делать с личной копией программы при назначении другого шаблона | — |
| [SOM-56](https://linear.app/something-great/issue/SOM-56/reshenie-6-nuzhen-li-klientu-dostup-k-chernovomu-zhurnalu) | Решение №6: Нужен ли клиенту доступ к черновому журналу | — |
| [SOM-57](https://linear.app/something-great/issue/SOM-57/reshenie-7-push-uvedomleniya-i-napominaniya) | Решение №7: Push-уведомления и напоминания | — |
| [SOM-58](https://linear.app/something-great/issue/SOM-58/reshenie-8-kto-vvodit-rezultaty-tolko-trener-ili-i-klient) | Решение №8: Кто вводит результаты — только тренер или и клиент | — |
| [SOM-59](https://linear.app/something-great/issue/SOM-59/reshenie-9-sroki-hraneniya-dannyh-i-dopustimaya-poterya) | Решение №9: Сроки хранения данных и допустимая потеря несинхронизированных записей | — |
| [SOM-60](https://linear.app/something-great/issue/SOM-60/reshenie-10-podtverdit-adr-0004-e-mail-otp-apple-google-kakoj-domen) | Решение №10: Подтвердить ADR 0004: e-mail OTP + Apple + Google; какой домен использовать для приглашений? | — |
| [SOM-61](https://linear.app/something-great/issue/SOM-61/reshenie-11-hranit-novye-snimki-ekranov-cherez-git-lfs-ili) | Решение №11: Хранить новые снимки экранов через Git LFS или вложениями в PR? | — |
| [SOM-62](https://linear.app/something-great/issue/SOM-62/reshenie-12-nuzhna-li-proektu-licenziya-i-kakaya) | Решение №12: Нужна ли проекту лицензия и какая? | — |

### Исследование продукта

| Задача | Объём | Требует завершения |
| --- | --- | --- |
| [SOM-63](https://linear.app/something-great/issue/SOM-63/provesti-intervyu-trenerovklientov-i-trenirovku-s-prototipom) | Провести интервью тренеров/клиентов и тренировку с прототипом | — |

## Покрытие и смысл зависимостей

Все 69 открытых checkbox-пунктов этапов 1–10
сгруппированы в 26 implementation/acceptance задач с сохранением исходного
текста критериев. Дополнительно: 7 задач приёмки экранов этапов 2–8, native picker,
12 решений владельца, исследование и отложенная оценка направлений после пилота.
Этап 9 включает собственные критерии UI/доступности; этап 1 — общую приёмку.

Таблица зависимостей задаёт production/acceptance prerequisites. Прототипирование,
изолированные schema-тесты и сбор доказательств demo-паритета могут идти заранее,
если действующие инструкции это разрешают. Закрывать зависимую задачу до выполнения
её критериев и применимых решений нельзя. Для owner decisions действуют временные
правила из OPEN-QUESTIONS, а не предположение о согласии.

Исследование [SOM-63](https://linear.app/something-great/issue/SOM-63/provesti-intervyu-trenerovklientov-i-trenirovku-s-prototipom) даёт данные для [SOM-56](https://linear.app/something-great/issue/SOM-56/reshenie-6-nuzhen-li-klientu-dostup-k-chernovomu-zhurnalu)/[SOM-58](https://linear.app/something-great/issue/SOM-58/reshenie-8-kto-vvodit-rezultaty-tolko-trener-ili-i-klient).
[SOM-61](https://linear.app/something-great/issue/SOM-61/reshenie-11-hranit-novye-snimki-ekranov-cherez-git-lfs-ili) связан с форматом следующих доказательств; временное правило позволяет
хранить нужные материалы по текущим инструкциям. [SOM-54](https://linear.app/something-great/issue/SOM-54/reshenie-4-porog-vyigrysha-vremeni-i-dopustimyh-oshibok-dlya)/[SOM-57](https://linear.app/something-great/issue/SOM-57/reshenie-7-push-uvedomleniya-i-napominaniya)/[SOM-62](https://linear.app/something-great/issue/SOM-62/reshenie-12-nuzhna-li-proektu-licenziya-i-kakaya)
учитываются при планировании отложенной работы и распространении исходников.

## Обновление и проверка

Перед работой обновить проект, milestone, issue и relations в Linear. Эта карта
фиксирует IDs и исходный объём; текущий статус читается из Linear. При разделении
задачи сохранять исходные критерии, добавить sub-issues и обновить карту. Не создавать
дубликаты по названию: сверять ID и текущий scope.

При завершении обновить issue, ROADMAP, CHANGELOG и применимые ADR/UI-PARITY.
Записать точные проверки и ограничения. Для экранов требуется одобрение владельца;
чужие старые тесты нельзя объявлять проверками своей сессии. Любое отставание
локальной/remote документации перечислить в handoff. Комментарии и project updates
не получают общего разрешения от задачи импорта.

Машиночитаемый снимок — `linear-import-2026-09-30.json`: ключи, IDs, milestones,
источники критериев и рёбра. Это журнал импорта, не автоматическая команда повторного
создания. Перед повторной записью читать существующие сущности.

Изменения документации при импорте остаются локальными до отдельного commit/push.
Проверки приложения этим импортом не выполнялись.

## Проверка импорта 30.09.2026

- Read-back Linear: 48 задач в Backlog, 13 milestones; проверены все 59 blockedBy-связей.
- Покрытие: каждый из 69 открытых пунктов этапов 1–10 включён ровно в одну основную задачу.
- Локальный граф зависимостей не содержит циклов; IDs задач уникальны.
- Проверены относительные ссылки новых документов и JSON-журнал импорта.
- `git diff --check` прошёл. Проверки приложения не запускались: изменения относятся к документации и планированию.
- В Linear опубликованы Project brief, Delivery plan and issue map и обновлённые Agent rules.

