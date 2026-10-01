import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useState } from 'react';
import { View } from 'react-native';
import { useAuth } from '@/features/auth/provider';
import { TemplateScreen } from '@/features/trainer-library/template-screen';
import { useWorkspaceLibrary } from '@/features/workspace-library/provider';
import { useWorkspaceTemplateLauncher } from '@/features/workspace-library/launcher';
import { useClientProgramAssignment } from '@/features/workspace-programs/use-assignment';
import { useOnboardingContext } from '@/features/onboarding/use-onboarding-context';
import { Screen } from '@/ui/screen';
import { Button } from '@/ui/button';
import { Text } from '@/ui/text';

function ClientAssignmentTemplate({
  id,
  clientId,
  userId,
  workspaceId,
  templates,
  exercises,
  media,
  launcher,
  refresh,
}: {
  id?: string;
  clientId: string;
  userId: string;
  workspaceId: string;
  templates: ReturnType<typeof useWorkspaceLibrary>['library']['templates'];
  exercises: ReturnType<typeof useWorkspaceLibrary>['library']['exercises'];
  media: ReturnType<typeof useWorkspaceLibrary>['media'];
  launcher: ReturnType<typeof useWorkspaceTemplateLauncher>;
  refresh: () => Promise<void>;
}) {
  const { t } = useTranslation();
  const [refreshError, setRefreshError] = useState(false);
  const assignment = useClientProgramAssignment({
    userId,
    workspaceId,
    clientRecordId: clientId,
    onAssigned: (result) =>
      router.replace({
        pathname: '/workspace/client/[id]',
        params: {
          id: clientId,
          tab: 'program',
          refresh: result.id,
        },
      }),
  });
  const allExercises = [
    ...new Map(
      [
        ...exercises,
        ...templates.flatMap((template) =>
          template.exercises.map((line) => line.exercise),
        ),
      ].map((exercise) => [exercise.id, exercise]),
    ).values(),
  ];
  if (assignment.loading) return <Screen title={t('common.loading')} />;
  if (
    assignment.error === 'storage' ||
    assignment.error === 'invalidPending' ||
    assignment.error === 'unavailable'
  )
    return (
      <Screen title={t('common.error')}>
        <Text accessibilityRole="alert">
          {t('workspaceLibrary.pendingReadError')}
        </Text>
        <Button
          label={t('workspaceLibrary.retryPendingRead')}
          onPress={assignment.reload}
        />
      </Screen>
    );
  if (assignment.pending && assignment.pending.templateId !== id)
    return (
      <Screen title={t('workspaceLibrary.pendingAssignment')}>
        <Button
          label={t('workspaceClientDetails.assignmentContinue')}
          onPress={() =>
            router.replace({
              pathname: '/workspace/library/template/[id]',
              params: { id: assignment.pending?.templateId ?? '', clientId },
            })
          }
        />
      </Screen>
    );
  const template = templates.find((item) => item.id === id);
  if (assignment.pending && assignment.pending.templateId === id && !template)
    return (
      <Screen title={t('workspaceLibrary.pendingAssignment')}>
        <Text>{t('workspaceLibrary.pendingAssignment')}</Text>
        {assignment.error ? (
          <Text accessibilityRole="alert">
            {t(
              assignment.error === 'conflict'
                ? 'workspaceLibrary.assignmentConflict'
                : assignment.error === 'notFound'
                  ? 'workspaceLibrary.assignmentNotFound'
                  : 'workspaceLibrary.assignmentError',
            )}
          </Text>
        ) : null}
        <Button
          label={
            assignment.busy
              ? t('workspaceLibrary.assignmentBusy')
              : t('workspaceLibrary.retryAssignment')
          }
          disabled={assignment.busy}
          onPress={() => void assignment.assign()}
        />
      </Screen>
    );
  const terminalError =
    assignment.error === 'conflict' || assignment.error === 'notFound';
  const displayedError = refreshError
    ? t('workspaceLibrary.refreshTemplateError')
    : assignment.error
      ? t(
          assignment.error === 'conflict'
            ? 'workspaceLibrary.assignmentConflict'
            : assignment.error === 'notFound'
              ? 'workspaceLibrary.assignmentNotFound'
              : assignment.error === 'pendingExists'
                ? 'workspaceLibrary.pendingAssignment'
                : 'workspaceLibrary.assignmentError',
        )
      : null;
  return (
    <View style={{ flex: 1 }}>
      <TemplateScreen
        id={id}
        templates={templates}
        suppliedExercises={allExercises}
        suppliedMedia={media}
        onBack={() =>
          router.replace(`/workspace/client/${clientId}?tab=program`)
        }
        onEdit={() => launcher.start(id)}
        onCopy={() => launcher.start(id, true)}
        feedback={
          displayedError ? (
            <View>
              <Text accessibilityRole="alert">{displayedError}</Text>
              {terminalError || refreshError ? (
                <Button
                  label={t('workspaceLibrary.refreshTemplate')}
                  onPress={() => {
                    setRefreshError(false);
                    void refresh().then(assignment.reload, () =>
                      setRefreshError(true),
                    );
                  }}
                />
              ) : null}
            </View>
          ) : null
        }
        onAssignProgram={() => void assignment.assign(id, template?.revision)}
        assignLabel={
          assignment.busy
            ? t('workspaceLibrary.assignmentBusy')
            : assignment.pending
              ? t('workspaceLibrary.retryAssignment')
              : t('workspaceLibrary.assignProgram')
        }
        assignDisabled={
          assignment.loading ||
          assignment.busy ||
          !template ||
          terminalError ||
          refreshError
        }
      />
      {launcher.conflict}
    </View>
  );
}

export default function WorkspaceTemplateRoute() {
  const { id, clientId } = useLocalSearchParams<{
    id?: string;
    clientId?: string;
  }>();
  const store = useWorkspaceLibrary();
  const launcher = useWorkspaceTemplateLauncher();
  const auth = useAuth();
  const context = useOnboardingContext();
  const { t } = useTranslation();
  if (store.editor.readError)
    return (
      <Screen title={t('common.error')}>
        <Button label={t('common.retry')} onPress={store.editor.retry} />
      </Screen>
    );
  if (!store.editor.ready || (clientId && context.loading))
    return <Screen title={t('common.loading')} />;
  if (
    clientId &&
    (!auth.session || context.failed || !context.context?.workspace)
  )
    return <Screen title={t('common.error')} />;
  const exercises = [
    ...new Map(
      [
        ...store.library.exercises,
        ...store.library.templates.flatMap((template) =>
          template.exercises.map((line) => line.exercise),
        ),
      ].map((exercise) => [exercise.id, exercise]),
    ).values(),
  ];
  if (clientId && auth.session && context.context?.workspace)
    return (
      <ClientAssignmentTemplate
        id={id}
        clientId={clientId}
        userId={auth.session.user.id}
        workspaceId={context.context.workspace.id}
        templates={store.library.templates}
        exercises={store.library.exercises}
        media={store.media}
        launcher={launcher}
        refresh={store.refresh}
      />
    );
  return (
    <View style={{ flex: 1 }}>
      <TemplateScreen
        id={id}
        templates={store.library.templates}
        suppliedExercises={exercises}
        suppliedMedia={store.media}
        onBack={() => router.replace('/workspace/library')}
        onEdit={() => launcher.start(id)}
        onCopy={() => launcher.start(id, true)}
      />
      {launcher.conflict}
    </View>
  );
}
