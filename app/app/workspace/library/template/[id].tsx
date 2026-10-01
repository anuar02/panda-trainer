import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { TemplateScreen } from '@/features/trainer-library/template-screen';
import { useWorkspaceLibrary } from '@/features/workspace-library/provider';
import { useWorkspaceTemplateLauncher } from '@/features/workspace-library/launcher';
import { Screen } from '@/ui/screen';
import { Button } from '@/ui/button';

export default function WorkspaceTemplateRoute() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const store = useWorkspaceLibrary();
  const launcher = useWorkspaceTemplateLauncher();
  const { t } = useTranslation();
  if (store.editor.readError)
    return (
      <Screen title={t('common.error')}>
        <Button label={t('common.retry')} onPress={store.editor.retry} />
      </Screen>
    );
  if (!store.editor.ready) return <Screen title={t('common.loading')} />;
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
