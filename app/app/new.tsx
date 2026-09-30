import {
  routeDate,
  routeTime,
  routeClientId,
} from '@/features/scheduling-demo/route-params';
import { trainerLibrary } from '@/features/trainer-library/ru';
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { schedulingCollisions, schedulingToday } from '@/domain/scheduling';
import { workoutClients } from '@/domain/workout';
import { demoClients } from '@/features/trainer-clients/demo';
import { weekDates } from '@/features/trainer-schedule/demo';
import { CreateSessionScreen } from '@/features/session-editor';
import { useSchedulingDemo } from '@/features/scheduling-demo/provider';

export default function NewSessionRoute() {
  const params = useLocalSearchParams<{
    date?: string | string[];
    start?: string | string[];
    clientId?: string | string[];
  }>();
  const demo = useSchedulingDemo();
  const { t } = useTranslation();
  return (
    <CreateSessionScreen
      clients={demoClients.map((client) => ({
        id: client.id,
        name: t(`trainerClients.people.${client.id}.name`),
        initials: t(`trainerClients.people.${client.id}.initials`),
        meta: workoutClients[client.id]?.program
          ? `${workoutClients[client.id]?.program}${client.remaining === null ? '' : ` · ${t('schedulingDemo.remaining', { count: client.remaining })}`}`
          : undefined,
      }))}
      templates={trainerLibrary.templateData.map((template) => ({
        program: template.name,
        name: template.name,
        meta: t(
          `schedulingDemo.templateMeta.${template.id as 't1' | 't2' | 't3' | 't4'}`,
        ),
      }))}
      dates={weekDates(schedulingToday)}
      today={schedulingToday}
      initialDate={routeDate(params.date)}
      initialStart={routeTime(params.start)}
      initialClientId={routeClientId(params.clientId)}
      disabled={!demo.hydrated || demo.readError}
      storageError={
        demo.storageStatus === 'error'
          ? t('schedulingDemo.errors.storage')
          : undefined
      }
      getCollisions={(draft) =>
        schedulingCollisions(demo.state, draft).map((session) => ({
          id: session.id,
          start: session.start,
          title: session.clientId
            ? (workoutClients[session.clientId]?.short ?? session.title)
            : session.title,
        }))
      }
      onCreate={(draft) => {
        const result = demo.dispatch({
          type: 'create',
          id: `session-${Date.now()}-${demo.state.sessions.length}`,
          draft,
        });
        if (!result.ok)
          return {
            ok: false,
            error: t(`schedulingDemo.errors.${result.error}`),
          };
        router.replace({
          pathname: '/(trainer)/schedule',
          params: { date: draft.date },
        });
        return { ok: true };
      }}
      onClose={() =>
        router.canGoBack()
          ? router.back()
          : router.replace('/(trainer)/schedule')
      }
    />
  );
}
