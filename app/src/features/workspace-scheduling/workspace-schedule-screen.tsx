import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { TrainerScheduleScreen } from '../trainer-schedule/trainer-schedule-screen';
import { calendarWeekDateKeys, workspaceDateKey } from './clock';
import {
  workspaceScheduleRows,
  workspaceScheduleWindows,
} from './screen-adapter';
import { useWorkspaceSchedule } from './use-schedule';
import {
  WorkspaceMutationBoundary,
  useWorkspaceMutations,
} from './mutation-provider';
import { WorkspaceSessionControls } from './workspace-session-controls';
import { Button } from '@/ui/button';
import { Screen } from '@/ui/screen';

type WorkspaceScheduleScreenProps = {
  userId: string;
  workspaceId: string;
  timezone: string;
  initialDate?: string;
  initialSelectedId?: string;
};

export function WorkspaceScheduleScreen(props: WorkspaceScheduleScreenProps) {
  return (
    <WorkspaceMutationBoundary
      userId={props.userId}
      workspaceId={props.workspaceId}
    >
      <WorkspaceScheduleContent
        key={`${props.userId}:${props.workspaceId}:${props.timezone}:${props.initialDate ?? ''}`}
        {...props}
      />
    </WorkspaceMutationBoundary>
  );
}

function WorkspaceScheduleContent({
  userId,
  workspaceId,
  timezone,
  initialDate,
  initialSelectedId,
}: WorkspaceScheduleScreenProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const mutations = useWorkspaceMutations();
  const today = workspaceDateKey(new Date(), timezone);
  const [date, setDate] = useState(() => {
    if (!initialDate) return today;
    try {
      calendarWeekDateKeys(initialDate);
      return initialDate;
    } catch {
      return today;
    }
  });
  const [selectedId, setSelectedId] = useState<string | null>(
    initialSelectedId ?? null,
  );
  const read = useWorkspaceSchedule(userId, workspaceId, date);
  const retryRead = read.retry;
  const lastGeneration = useRef(mutations.generation);
  useEffect(() => {
    if (lastGeneration.current !== mutations.generation) {
      lastGeneration.current = mutations.generation;
      retryRead();
    }
  }, [mutations.generation, retryRead]);
  const schedule = read.schedule;
  const rows = schedule
    ? workspaceScheduleRows(schedule, t('trainerToday.miniGroup'))
    : [];
  return (
    <View className="flex-1 bg-canvas">
      {read.failed ? (
        <Screen title={t('common.error')}>
          <Button label={t('common.retry')} onPress={read.retry} />
        </Screen>
      ) : (
        <TrainerScheduleScreen
          scenario={read.loading ? 'loading' : 'normal'}
          data={{
            sessions: rows,
            date,
            today,
            timezone,
            timezoneLabel: timezone,
            freeWindows: schedule
              ? workspaceScheduleWindows(schedule, date)
              : [],
            createDisabled: mutations.blocked || read.loading || !schedule,
            onDateChange: (next) => {
              setDate(next);
              setSelectedId(null);
            },
            onCreate: (selectedDate, start) => {
              if (mutations.blocked) return;
              router.push({
                pathname: '/workspace/new',
                params: { date: selectedDate, ...(start ? { start } : {}) },
              });
            },
            onSelect: (session) => setSelectedId(session.id),
          }}
        />
      )}
      <WorkspaceSessionControls
        userId={userId}
        workspaceId={workspaceId}
        timezone={timezone}
        schedule={schedule}
        selectedId={selectedId}
        onClose={() => setSelectedId(null)}
        onRetry={read.retry}
        loading={read.loading}
      />
    </View>
  );
}
