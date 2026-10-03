import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { getSupabaseClient } from '@/features/auth/client';
import { Button } from '@/ui/button';
import { Text } from '@/ui/text';
import {
  createExportController,
  type ExportScope,
  type ExportStatus,
} from './controller';
import { saveExportFile } from './file';

export function AccountExportControls({
  scope,
  disabled = false,
}: {
  scope: ExportScope;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const [state, setState] = useState<{
    scope: ExportScope;
    status: ExportStatus;
  } | null>(null);
  const current = useRef(scope);
  useLayoutEffect(() => {
    current.current = scope;
  }, [scope]);
  const controller = useRef<ReturnType<typeof createExportController> | null>(
    null,
  );
  useEffect(() => {
    const client = getSupabaseClient();
    if (!client) return;
    const instance = createExportController(
      client,
      scope,
      saveExportFile,
      (status) => setState({ scope, status }),
      () => current.current === scope,
    );
    controller.current = instance;
    const { data } = client.auth.onAuthStateChange((event, session) => {
      if (
        event === 'SIGNED_OUT' ||
        session?.user.id !== scope.userId ||
        session?.access_token !== scope.token
      ) {
        instance.stop();
        setState({ scope, status: 'sessionChanged' });
      }
    });
    return () => {
      instance.stop();
      data.subscription.unsubscribe();
      if (controller.current === instance) controller.current = null;
    };
  }, [scope]);
  const status = state?.scope === scope ? state.status : 'idle';
  const busy =
    status === 'loading' || status === 'saving' || status === 'cancelling';
  return (
    <View>
      <Text className="font-strong">{t('accountExport.title')}</Text>
      <Text>{t('accountExport.limitation')}</Text>
      <Text className="text-secondary">{t('accountExport.sensitive')}</Text>
      <Text
        accessibilityRole={busy ? 'progressbar' : 'alert'}
        accessibilityLiveRegion="polite"
      >
        {t(`accountExport.${status}`)}
      </Text>
      <Button
        label={t(
          status === 'ready'
            ? 'accountExport.save'
            : status === 'idle'
              ? 'accountExport.prepare'
              : 'accountExport.retry',
        )}
        disabled={disabled || busy || status === 'sessionChanged'}
        onPress={() => {
          if (status === 'ready') void controller.current?.save();
          else void controller.current?.prepare();
        }}
      />
      {(busy || status === 'ready') && (
        <Button
          label={t('accountExport.cancel')}
          variant="ghost"
          disabled={status === 'cancelling'}
          onPress={() => controller.current?.cancel()}
        />
      )}
    </View>
  );
}
