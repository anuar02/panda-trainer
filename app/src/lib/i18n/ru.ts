import { accountExportRu } from '@/features/account-export/strings';
import { trainerBillingRu } from '@/features/trainer-billing/ru';
import { trainerPurchasesRu } from '@/features/trainer-billing/purchases-ru';
import { trainerBillingPurchaseRu } from '@/features/trainer-billing/purchase-create-ru';
import { trainerPaymentsRu } from '@/features/trainer-payments/ru';
import { templateEditor } from '@/features/template-editor/ru';
import { trainerInbox } from '@/features/trainer-inbox/ru';
import { sessionEditorRu } from '@/features/session-editor/ru';
import { clientDetails } from '@/features/client-details/ru';
import { schedulingDemo } from '@/features/scheduling-demo/ru';
import { clientHome } from '@/features/client-home/ru';
import { trainerToday } from '@/features/trainer-today/ru';
import { trainerSchedule } from '@/features/trainer-schedule/ru';
import { clientProgram } from '@/features/client-program/ru';
import { clientHistory } from '@/features/client-history/ru';
import { clientProgress } from '@/features/client-progress/ru';
import { trainerClients } from '@/features/trainer-clients/ru';
import { trainerLibrary } from '@/features/trainer-library/ru';
import { profiles } from '@/features/profiles/ru';
import { workoutRu } from '@/features/workout/workout-copy';
import { workoutDemo } from '@/features/workout-demo/ru';
import { onboardingRu } from '@/features/onboarding/strings';
import { workspaceClientsRu } from '@/features/workspace-clients/strings';
import { workspaceClientDetailsRu } from '@/features/workspace-clients/details-strings';
import { invitationsRu } from '@/features/invitations/strings';
import { workspaceLibraryRu } from '@/features/workspace-library/strings';
import { workspaceSchedulingRu } from '@/features/workspace-scheduling/strings';

import { workoutPreloadRu } from '@/features/workout-preload/strings';

export const ru = {
  accountExport: accountExportRu,
  workoutPreload: workoutPreloadRu,
  trainerBilling: trainerBillingRu,
  trainerPurchases: trainerPurchasesRu,
  trainerBillingPurchase: trainerBillingPurchaseRu,
  trainerPayments: trainerPaymentsRu,
  ...onboardingRu,
  invitations: invitationsRu,
  workspaceLibrary: workspaceLibraryRu,
  workspaceScheduling: workspaceSchedulingRu,
  workspaceClients: workspaceClientsRu,
  workspaceClientDetails: workspaceClientDetailsRu,
  trainerInbox,
  sessionEditor: sessionEditorRu,
  clientDetails,
  schedulingDemo,
  clientHome,
  trainerToday,
  trainerSchedule,
  clientProgram,
  clientHistory,
  clientProgress,
  trainerClients,
  trainerLibrary,
  templateEditor,
  profiles,
  workoutEntry: {
    minus: '−',
    plus: '+',
    count: '{{done}}/{{total}}',
    weight: 'Вес, кг',
    reps: 'Повторы',
    seconds: 'Секунды',
    less: '{{label}}: меньше',
    more: '{{label}}: больше',
    now: 'Сейчас · {{index}} из {{total}}',
    set: 'Подход {{index}}',
    recorded: 'Записан {{index}}',
    recordedValue: 'Записан {{index}} · {{value}}',
    draft: 'Черновик',
    hint: 'Сегодняшний результат',
    edit: 'Править',
    repeat: 'Как в прошлый раз',
    save: 'Записать подход {{index}}',
    undo: 'Отменить последнюю запись',
    exercises: 'Упражнения',
    add: 'Добавить упражнение',
    replace: 'Заменить упражнение',
    onlyHere: 'Только в этом занятии. Программа не изменится.',
    draftHint:
      'Поля сохраняются как черновик. Подтвердите сегодняшний результат.',
    greyHint: 'Серые цифры — прошлый раз, это подсказка, не запись.',
    invalid:
      'Введите неотрицательные числа. Вес — до трёх знаков после запятой.',
    saveError: 'Не удалось сохранить на телефоне. Повторите попытку.',
    unprepared:
      'Ввод доступен после загрузки журнала с сервера. Завершение и исправление — отдельно.',
    conflict: 'Сохранены обе версии. Выберите результат.',
    rejected: 'Запись отклонена сервером и сохранена на телефоне.',
    correction: 'Правка сохранена как черновик исправления.',
    unknownVersion: 'Версия недоступна',
    device: 'Устройство: {{id}}',
    current: 'Выбрать текущую версию',
    incoming: 'Выбрать мою версию',
  },
  workout: workoutRu,
  workoutDemo,
  auth: {
    title: 'Войдите в свой блокнот',
    subtitle:
      'Продолжите с помощью электронной почты или аккаунта Apple или Google.',
    codeTitle: 'Введите код',
    codeSubtitle: 'Мы отправили шестизначный код на {{email}}.',
    emailLabel: 'Электронная почта',
    emailPlaceholder: 'name@example.com',
    emailHint: 'Укажите адрес, к которому у вас есть доступ.',
    codeLabel: 'Код из письма',
    codePlaceholder: '000000',
    codeHint: 'Введите шестизначный одноразовый код из письма.',
    sendCode: 'Получить код',
    verifyCode: 'Продолжить',
    changeEmail: 'Изменить адрес',
    resendCode: 'Отправить код ещё раз',
    resendCountdown: 'Повторить через {{seconds}} с',
    apple: 'Продолжить с Apple',
    google: 'Продолжить с Google',
    or: 'или',
    privacyNote: 'Пароль не нужен. Используйте одноразовый код из письма.',
    unavailable:
      'Вход пока не настроен. Попробуйте позже или обратитесь к владельцу приложения.',
    restoring: 'Восстанавливаем вход…',
    retry: 'Повторить',
    accountTitle: 'Вы вошли',
    accountSubtitle: 'Аккаунт подтверждён',
    signOut: 'Выйти',
    switchAccount: 'Сменить аккаунт',
    sessionError: 'Не удалось восстановить вход. Повторите попытку.',
    actionError:
      'Не удалось выполнить действие. Проверьте соединение и попробуйте ещё раз.',
    codeError: 'Код неверный или срок его действия истёк.',
    providerError:
      'Не удалось войти через выбранный сервис. Попробуйте ещё раз.',
    callbackError: 'Не удалось завершить вход. Начните ещё раз.',
    demo: 'Посмотреть демо',
    demoTitle: 'Демонстрация',
    demoHint: 'Вымышленные данные. Выберите роль для просмотра.',
    accountPending:
      'Подключение рабочего пространства готовится. Демо использует только вымышленные данные.',
    workspaceReady: 'Рабочее пространство: {{name}}',
    connectedTrainer: 'Ваш тренер: {{name}}',
    openClients: 'Открыть клиентов',
    inviteNeeded: 'Откройте приглашение тренера',
    inviteNeededHint:
      'Для подключения к своей карточке нужна ссылка от вашего тренера.',
    backToSetup: 'Вернуться к настройке',
  },
  common: {
    appName: 'Тренировочный блокнот',
    trainer: 'Тренер',
    client: 'Клиент',
    chooseRole: 'С чего начнём?',
    roleHint: 'Выберите, чей блокнот открыть.',
    trainerHint: 'Занятия, клиенты и программы — рядом.',
    clientHint: 'Ваши тренировки и результаты.',
    backToRoles: 'Сменить роль',
    close: 'Закрыть',
    sheetHandle: 'Ручка шторки',
    sheetHandleHint: 'Потяните вниз, чтобы закрыть.',
    retry: 'Попробовать снова',
    loading: 'Загружаем…',
    error: 'Не получилось загрузить',
    errorHint: 'Попробуйте ещё раз.',
    offline: 'Нет связи',
    offlineHint: 'Проверьте подключение к интернету.',
    fontError: 'Не удалось загрузить шрифты. Перезапустите приложение.',
    notFound: 'Такой страницы нет',
    home: 'К началу',
  },
  tabs: {
    navigation: 'Основная навигация',
    schedule: 'Распи\u00adсание',
    library: 'Библиотека',
    program: 'Программа',
    history: 'История',
    today: 'Сегодня',
    clients: 'Клиенты',
    templates: 'Шаблоны',
    profile: 'Профиль',
    home: 'Главная',
    workouts: 'Тренировки',
    progress: 'Прогресс',
  },
  empty: {
    today: {
      title: 'День начинается с плана',
      description: 'Здесь появятся ваши занятия и запросы клиентов.',
    },
    clients: {
      title: 'Место для вашей команды',
      description:
        'Здесь будут карточки клиентов, их программы и история занятий.',
    },
    templates: {
      title: 'Программы под рукой',
      description:
        'Здесь можно будет собирать шаблоны тренировок из упражнений.',
    },
    home: {
      title: 'Ваша следующая тренировка',
      description: 'Когда тренер добавит занятие, оно появится здесь.',
    },
    workouts: {
      title: 'Каждая тренировка — шаг вперёд',
      description:
        'Здесь будет история занятий и результаты, записанные тренером.',
    },
    progress: {
      title: 'Первые результаты — впереди',
      description:
        'После тренировок здесь можно будет следить за своим прогрессом.',
    },
  },
  profile: {
    appearance: 'Оформление',
    auto: 'Авто (по роли)',
    light: 'Светлая',
    dark: 'Тёмная',
    role: 'Ваш блокнот',
    description: 'Настройте удобный для себя вид.',
  },
  review: {
    title: 'Проверка компонентов',
    open: 'Открыть проверку компонентов',
    button: 'Показать сообщение',
    toast: 'Сообщение показано',
    field: 'Название',
    placeholder: 'Введите название',
    chip: 'Выбранный фильтр',
    sheet: 'Открыть шторку',
    sheetTitle: 'Всё под рукой',
    sheetBody:
      'Шторка поддерживает жест закрытия и системное уменьшение движения.',
  },
} as const;
