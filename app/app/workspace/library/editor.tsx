import { useLayoutEffect, useRef, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { TemplateEditorScreen } from '@/features/template-editor/screen';
import {
  workspaceTemplateLibraryHref,
  workspaceTemplateRouteHref,
} from '@/features/workspace-library/editor-routes';
import { useWorkspaceLibrary } from '@/features/workspace-library/provider';
import { Button } from '@/ui/button';
import { Text } from '@/ui/text';

export default function WorkspaceTemplateEditorRoute() {
  const { clientId } = useLocalSearchParams<{ clientId?: string }>();
  const store = useWorkspaceLibrary();
  return (
    <WorkspaceTemplateEditorForm
      key={`${store.editor.scope ?? 0}:${clientId ?? ''}`}
      clientId={clientId}
      store={store}
    />
  );
}
function WorkspaceTemplateEditorForm({
  clientId,
  store,
}: {
  clientId?: string;
  store: ReturnType<typeof useWorkspaceLibrary>;
}) {
  const { t } = useTranslation();
  const [failed, setFailed] = useState(false);
  const lifetime = useRef(0);
  const mounted = useRef(false);
  useLayoutEffect(() => {
    mounted.current = true;
    lifetime.current += 1;
    return () => {
      mounted.current = false;
      lifetime.current += 1;
    };
  }, []);
  const reload = () => {
    if (!mounted.current) return;
    const ticket = ++lifetime.current;
    const validScope = store.editor.capture?.() ?? (() => true);
    setFailed(false);
    void store.reloadServerDraft().catch(() => {
      if (mounted.current && lifetime.current === ticket && validScope())
        setFailed(true);
    });
  };
  const leave = () => {
    if (!mounted.current) return;
    mounted.current = false;
    lifetime.current += 1;
    router.replace(workspaceTemplateLibraryHref(clientId));
  };
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
                  onPress={reload}
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
        callerScope={clientId}
        store={store.editor}
        suppliedExercises={store.library.exercises}
        suppliedMedia={store.media}
        onLeave={leave}
        onSaved={(id) =>
          router.replace(workspaceTemplateRouteHref(id, clientId))
        }
      />
    </View>
  );
}
