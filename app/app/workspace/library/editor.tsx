import { useState } from 'react';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { TemplateEditorScreen } from '@/features/template-editor/screen';
import { useWorkspaceLibrary } from '@/features/workspace-library/provider';
import { Button } from '@/ui/button';
import { Text } from '@/ui/text';

export default function WorkspaceTemplateEditorRoute() {
  const store = useWorkspaceLibrary();
  const { t } = useTranslation();
  const [failed, setFailed] = useState(false);
  return (
    <View style={{ flex: 1 }}>
      <TemplateEditorScreen
        header={
          <>
            {store.commandError === 'conflict' ? (
              <View>
                <Text accessibilityRole="alert">
                  {t('workspaceLibrary.conflict')}
                </Text>
                <Button
                  label={t('workspaceLibrary.reloadServer')}
                  onPress={() => {
                    setFailed(false);
                    void store.reloadServerDraft().catch(() => setFailed(true));
                  }}
                />
              </View>
            ) : null}
            {store.commandError === 'unavailable' || failed ? (
              <Text accessibilityRole="alert">
                {t('workspaceLibrary.unavailable')}
              </Text>
            ) : null}
          </>
        }
        store={store.editor}
        suppliedExercises={store.library.exercises}
        suppliedMedia={store.media}
        onLeave={() => router.replace('/workspace/library')}
        onSaved={(id) =>
          router.replace({
            pathname: '/workspace/library/template/[id]',
            params: { id },
          })
        }
      />
    </View>
  );
}
