import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Button } from '@/ui/button';
import { Sheet } from '@/ui/sheet';
import { Text } from '@/ui/text';
import { workspaceTemplateEditorHref } from './editor-routes';
import { useWorkspaceLibrary } from './provider';

export function useWorkspaceTemplateLauncher(clientId?: string) {
  const { editor } = useWorkspaceLibrary();
  const { t } = useTranslation();
  const [storedPending, setPending] = useState<{
    id?: string;
    copy?: boolean;
    token: object;
  } | null>(null);
  const token = useMemo(
    () => ({ clientId, scope: editor.scope }),
    [clientId, editor.scope],
  );
  const pending = storedPending?.token === token ? storedPending : null;
  const lifetime = useRef<object>(token);
  const mounted = useRef(false);
  const version = token;
  const validScope = editor.capture?.() ?? (() => true);
  useLayoutEffect(() => {
    mounted.current = true;
    lifetime.current = token;
    return () => {
      mounted.current = false;
      lifetime.current = {};
    };
  }, [token]);
  const isCurrent = () =>
    mounted.current && lifetime.current === version && validScope();
  const open = () => {
    if (isCurrent()) router.push(workspaceTemplateEditorHref(clientId));
  };
  const start = (id?: string, copy?: boolean) => {
    if (!isCurrent() || !editor.ready || editor.busy) return;
    if (editor.draft) setPending({ id, copy, token });
    else if (editor.begin(id, copy))
      router.push(workspaceTemplateEditorHref(clientId));
  };
  return {
    start,
    resume: open,
    conflict: (
      <Sheet
        open={pending !== null}
        title={t('templateEditor.conflict')}
        onClose={() => {
          if (isCurrent()) setPending(null);
        }}
      >
        <Text>{t('templateEditor.conflictHint')}</Text>
        <Button
          label={t('templateEditor.resume')}
          onPress={() => {
            if (!isCurrent()) return;
            setPending(null);
            open();
          }}
        />
        <Button
          variant="soft"
          label={t('templateEditor.replace')}
          onPress={() => {
            if (
              isCurrent() &&
              pending &&
              editor.begin(pending.id, pending.copy)
            ) {
              setPending(null);
              router.push(workspaceTemplateEditorHref(clientId));
            }
          }}
        />
      </Sheet>
    ),
  };
}
