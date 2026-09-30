import { useState } from 'react';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Button } from '@/ui/button';
import { Sheet } from '@/ui/sheet';
import { Text } from '@/ui/text';
import { useOptionalTemplates } from './provider';
export function useTemplateLauncher() {
  const store = useOptionalTemplates();
  const { t } = useTranslation();
  const [pending, setPending] = useState<{
    id?: string;
    copy?: boolean;
  } | null>(null);
  const open = () => router.push('/template-editor');
  const start = (id?: string, copy?: boolean) => {
    if (!store?.ready || store.busy) return;
    if (store.draft) setPending({ id, copy });
    else if (store.begin(id, copy)) open();
  };
  const conflict = (
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
          if (pending && store?.begin(pending.id, pending.copy)) {
            setPending(null);
            open();
          }
        }}
      />
    </Sheet>
  );
  return {
    start,
    resume: open,
    conflict,
    enabled: !!store?.ready && !store.busy,
  };
}
