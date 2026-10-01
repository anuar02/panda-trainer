import { useState } from 'react';
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
  const [pending, setPending] = useState<{
    id?: string;
    copy?: boolean;
  } | null>(null);
  const open = () => router.push(workspaceTemplateEditorHref(clientId));
  const start = (id?: string, copy?: boolean) => {
    if (!editor.ready || editor.busy) return;
    if (editor.draft) setPending({ id, copy });
    else if (editor.begin(id, copy)) open();
  };
  return {
    start,
    resume: open,
    conflict: (
      <Sheet
        open={pending !== null}
        title={t('templateEditor.conflict')}
        onClose={() => setPending(null)}
      >
        <Text>{t('templateEditor.conflictHint')}</Text>
        <Button
          label={t('templateEditor.resume')}
          onPress={() => {
            setPending(null);
            open();
          }}
        />
        <Button
          variant="soft"
          label={t('templateEditor.replace')}
          onPress={() => {
            if (pending && editor.begin(pending.id, pending.copy)) {
              setPending(null);
              open();
            }
          }}
        />
      </Sheet>
    ),
  };
}
