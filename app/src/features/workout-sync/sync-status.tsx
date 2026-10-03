import { createInstance } from 'i18next';
import { Text } from 'react-native';
import type { SyncState } from '@/domain/workout-sync/types';
import { workoutSyncRu } from './strings';

const strings = createInstance();
void strings.init({
  lng: 'ru',
  fallbackLng: 'ru',
  resources: { ru: { translation: workoutSyncRu } },
  initAsync: false,
});

export function WorkoutSyncStatus({ state }: { state: SyncState }) {
  const key =
    state.status === 'error' && state.message === 'local_save_failed'
      ? 'local_error'
      : state.status;
  const label = String(
    strings.t(key as string, { defaultValue: workoutSyncRu[key] }),
  );
  return (
    <Text
      accessibilityRole="text"
      accessibilityLiveRegion="polite"
      accessibilityLabel={label}
      className="text-body text-secondary"
    >
      {label}
    </Text>
  );
}
