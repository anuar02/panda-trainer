import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { TrainerLibraryScreen } from '@/features/trainer-library/trainer-library-screen';
import type { LibraryExercise } from '@/features/trainer-library/fixtures';
import { useWorkspaceLibrary } from '@/features/workspace-library/provider';
import { workspaceTemplateRouteHref } from '@/features/workspace-library/editor-routes';
import { useWorkspaceTemplateLauncher } from '@/features/workspace-library/launcher';
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
  const launcher = useWorkspaceTemplateLauncher(clientId);
  const { t } = useTranslation();
  const [selected, setSelected] = useState<{
    exercise: LibraryExercise;
    scope: string;
  } | null>(null);
  const commands = store.exerciseCommands;
  const busy = commands.busy;
  const error = commands.error
    ? t(
        commands.error === 'duplicate'
          ? 'workspaceLibrary.duplicate'
          : 'workspaceLibrary.error',
      )
    : null;
  const lifecycle = useRef(commands.scopeId);
  const mounted = useRef(false);
  useLayoutEffect(() => {
    lifecycle.current = commands.scopeId;
  }, [commands.scopeId]);
  const cancel = useRef(commands.cancel);
  useLayoutEffect(() => {
    cancel.current = commands.cancel;
  }, [commands.cancel]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      cancel.current();
    };
  }, []);
  const currentGuard = () => {
    const scope = commands.scopeId;
    return () => mounted.current && lifecycle.current === scope;
  };
  const visibleSelected =
    selected?.scope === commands.scopeId ? selected.exercise : null;
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
        key={commands.scopeId}
        initialTab={clientId && tab === 'templates' ? 'templates' : 'exercises'}
        header={
          <>
            <Button
              variant="ghost"
              label={t('trainerLibrary.back')}
              onPress={() => router.replace('/auth/account')}
            />
            {error ? (
              <>
                <Text accessibilityRole="alert">{error}</Text>
                <Button
                  label={t('common.retry')}
                  onPress={() => {
                    const guard = currentGuard();
                    void commands.retry(guard).then((ok) => {
                      if (ok && guard()) setSelected(null);
                    });
                  }}
                  disabled={busy}
                />
              </>
            ) : null}
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
          router.push(workspaceTemplateRouteHref(id, clientId))
        }
        onArchiveExercise={
          busy || !commands.ready
            ? undefined
            : (exercise) => {
                setSelected({ exercise, scope: commands.scopeId });
              }
        }
        onCreateExercise={
          busy || !commands.ready
            ? undefined
            : (name) => {
                void commands.create(
                  {
                    name,
                    muscleGroup: t('workspaceLibrary.customGroup'),
                    equipment: t('workspaceLibrary.customEquipment'),
                    measure: 'reps',
                    bodyweight: false,
                  },
                  currentGuard(),
                );
              }
        }
      />
      {launcher.conflict}
      <Sheet
        open={visibleSelected !== null}
        title={t('workspaceLibrary.archive')}
        onClose={() => {
          if (!busy) setSelected(null);
        }}
      >
        <Text>{visibleSelected?.name}</Text>
        <Text>{t('workspaceLibrary.archiveHint')}</Text>
        {error ? <Text accessibilityRole="alert">{error}</Text> : null}
        <Button
          label={t('workspaceLibrary.archiveConfirm')}
          loading={busy}
          onPress={() => {
            if (!visibleSelected) return;
            const guard = currentGuard();
            void commands.archive(visibleSelected.id, guard).then((ok) => {
              if (ok && guard()) setSelected(null);
            });
          }}
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
