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

export const ru = {
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
  workout: workoutRu,
  workoutDemo,
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
