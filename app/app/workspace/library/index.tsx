import { useRef, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { TrainerLibraryScreen } from '@/features/trainer-library/trainer-library-screen';
import type { LibraryExercise } from '@/features/trainer-library/fixtures';
import { useWorkspaceLibrary } from '@/features/workspace-library/provider';
import { useWorkspaceTemplateLauncher } from '@/features/workspace-library/launcher';
import {
  createWorkspaceExerciseOperation,
  archiveWorkspaceExerciseOperation,
  WorkspaceLibraryError,
} from '@/features/workspace-library/service';
import { Button } from '@/ui/button';
import { Screen } from '@/ui/screen';
import { Sheet } from '@/ui/sheet';
import { Text } from '@/ui/text';

export default function WorkspaceLibraryRoute() {
  const { clientId, tab } = useLocalSearchParams<{
    clientId?: string;
    tab?: string;
  }>();
  const store = useWorkspaceLibrary();
  const launcher = useWorkspaceTemplateLauncher();
  const { t } = useTranslation();
  const [selected, setSelected] = useState<LibraryExercise | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pending = useRef(false);
  const create = useRef<{
    name: string;
    operation: ReturnType<typeof createWorkspaceExerciseOperation>;
  } | null>(null);
  const archive = useRef<{
    id: string;
    operation: ReturnType<typeof archiveWorkspaceExerciseOperation>;
  } | null>(null);
  const mutate = async (action: () => Promise<void>) => {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (caught) {
      setError(
        t(
          caught instanceof WorkspaceLibraryError && caught.code === 'duplicate'
            ? 'workspaceLibrary.duplicate'
            : 'workspaceLibrary.error',
        ),
      );
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };
  if (store.editor.readError)
    return (
      <Screen title={t('common.error')}>
        <Button label={t('common.retry')} onPress={store.editor.retry} />
      </Screen>
    );
  if (!store.editor.ready) return <Screen title={t('common.loading')} />;
  const allExercises = [
    ...new Map(
      [
        ...store.library.exercises,
        ...store.library.templates.flatMap((template) =>
          template.exercises.map((line) => line.exercise),
        ),
      ].map((exercise) => [exercise.id, exercise]),
    ).values(),
  ];
  return (
    <View style={{ flex: 1 }}>
      <TrainerLibraryScreen
        initialTab={clientId && tab === 'templates' ? 'templates' : 'exercises'}
        header={
          <>
            <Button
              variant="ghost"
              label={t('trainerLibrary.back')}
              onPress={() => router.replace('/auth/account')}
            />
            {error ? <Text accessibilityRole="alert">{error}</Text> : null}
            {busy ? (
              <Text accessibilityLiveRegion="polite">
                {t('common.loading')}
              </Text>
            ) : null}
          </>
        }
        suppliedExercises={store.library.exercises}
        templateExercises={allExercises}
        suppliedMedia={store.media}
        templates={store.library.templates}
        draft={store.editor.draft}
        onCreate={() => launcher.start()}
        onResume={launcher.resume}
        onOpenTemplate={(id) =>
          router.push({
            pathname: '/workspace/library/template/[id]',
            params: clientId ? { id, clientId } : { id },
          })
        }
        onArchiveExercise={busy ? undefined : setSelected}
        onCreateExercise={
          busy
            ? undefined
            : (name) =>
                void mutate(async () => {
                  if (create.current?.name !== name)
                    create.current = {
                      name,
                      operation: createWorkspaceExerciseOperation(
                        store.workspaceId,
                        {
                          name,
                          muscleGroup: t('workspaceLibrary.customGroup'),
                          equipment: t('workspaceLibrary.customEquipment'),
                          measure: 'reps',
                          bodyweight: false,
                        },
                      ),
                    };
                  await create.current.operation.execute();
                  await store.refresh();
                  create.current = null;
                })
        }
      />
      {launcher.conflict}
      <Sheet
        open={selected !== null}
        title={t('workspaceLibrary.archive')}
        onClose={() => {
          if (!busy) setSelected(null);
        }}
      >
        <Text>{selected?.name}</Text>
        <Text>{t('workspaceLibrary.archiveHint')}</Text>
        {error ? <Text accessibilityRole="alert">{error}</Text> : null}
        <Button
          label={t('workspaceLibrary.archiveConfirm')}
          loading={busy}
          onPress={() =>
            void mutate(async () => {
              if (!selected) return;
              if (archive.current?.id !== selected.id)
                archive.current = {
                  id: selected.id,
                  operation: archiveWorkspaceExerciseOperation(
                    store.workspaceId,
                    selected.id,
                  ),
                };
              await archive.current.operation.execute();
              await store.refresh();
              archive.current = null;
              setSelected(null);
            })
          }
        />
        <Button
          variant="ghost"
          label={t('workspaceLibrary.cancel')}
          disabled={busy}
          onPress={() => setSelected(null)}
        />
      </Sheet>
    </View>
  );
}
