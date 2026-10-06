import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { getSupabaseClient } from '@/features/auth/client';
import { Button } from '@/ui/button';
import { Text } from '@/ui/text';
import {
  createExportController,
  type ExportScope,
  type ExportStatus,
  type ExportDetails,
} from './controller';
import { saveExportFile } from './file';
import { createRuntimeAccountExportCollector } from './local-adapter-runtime';
import {
  createServerContextReader,
  type ServerContextTransport,
} from './server-context';
import {
  AccountExportError,
  boundedExportStep,
  exportSessionIdentity,
} from './service';

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
    details?: ExportDetails;
  } | null>(null);
  const identity = useMemo(() => {
    try {
      return exportSessionIdentity({
        user: { id: scope.userId },
        access_token: scope.token,
      });
    } catch {
      return null;
    }
  }, [scope]);
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
    let mounted = true;
    const isCurrent = () => mounted && current.current === scope;
    if (!identity)
      return () => {
        mounted = false;
      };
    const guard = async () => {
      if (!isCurrent()) throw new AccountExportError('sessionChanged');
      const session = await boundedExportStep(client.auth.getSession());
      if (session.error) throw new AccountExportError('network');
      const actual = exportSessionIdentity(session.data.session);
      if (
        !isCurrent() ||
        actual.userId !== scope.userId ||
        actual.token !== scope.token ||
        actual.sessionId !== identity.sessionId
      )
        throw new AccountExportError('sessionChanged');
    };
    const runtime = createRuntimeAccountExportCollector(
      {
        accountId: scope.userId,
        workspaceId: scope.workspaceId,
        sessionId: identity.sessionId,
      },
      guard,
      isCurrent,
      createServerContextReader(client as unknown as ServerContextTransport, {
        token: scope.token,
        guard,
      }),
    );
    const instance = createExportController(
      client,
      scope,
      saveExportFile,
      (status, details) => {
        if (isCurrent()) setState({ scope, status, details });
      },
      isCurrent,
      runtime.collect,
    );
    controller.current = instance;
    const { data } = client.auth.onAuthStateChange((event, session) => {
      if (
        event !== 'INITIAL_SESSION' ||
        session?.user.id !== scope.userId ||
        session?.access_token !== scope.token
      ) {
        instance.stop();
        if (isCurrent()) setState({ scope, status: 'sessionChanged' });
        mounted = false;
      }
    });
    return () => {
      mounted = false;
      instance.stop();
      void runtime.close();
      data.subscription.unsubscribe();
      if (controller.current === instance) controller.current = null;
    };
  }, [scope, identity]);
  const status =
    state?.scope === scope
      ? state.status
      : identity
        ? 'idle'
        : 'sessionChanged';
  const details = state?.scope === scope ? state.details : undefined;
  const ready = status === 'ready' || status === 'readyIncomplete';
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
      {details && (
        <View>
          <Text>
            {t('accountExport.coverageSummary', { bytes: details.utf8Bytes })}
          </Text>
          <Text>{t('accountExport.coverageIncomplete')}</Text>
          {details.gaps.map((gap) => (
            <Text key={gap} className="text-secondary">
              {t(`accountExport.gaps.${gap}`, {
                defaultValue: t('accountExport.coverageGap'),
              })}
            </Text>
          ))}
          {details.sources
            .filter(
              (source) =>
                ![
                  'sqlite-snapshot',
                  'sqlite-content-fingerprint',
                  'pending-content-fingerprint',
                ].includes(source.id),
            )
            .map((source) => (
              <View key={source.id}>
                <Text>
                  {t(
                    source.state === 'unknown'
                      ? 'accountExport.coverageSourceUnknown'
                      : 'accountExport.coverageSource',
                    {
                      source: t(`accountExport.sources.${source.id}`, {
                        defaultValue: t('accountExport.localSource'),
                      }),
                      state: t(`accountExport.coverageStates.${source.state}`),
                      count: source.count,
                    },
                  )}
                </Text>
                {source.gaps.map((gap) => (
                  <Text key={gap} className="text-secondary">
                    {t(`accountExport.gaps.${gap}`, {
                      defaultValue: t('accountExport.coverageGap'),
                    })}
                  </Text>
                ))}
              </View>
            ))}
        </View>
      )}
      <Button
        label={t(
          ready
            ? 'accountExport.save'
            : status === 'idle'
              ? 'accountExport.prepare'
              : 'accountExport.retry',
        )}
        disabled={disabled || busy || status === 'sessionChanged'}
        onPress={() => {
          if (ready) void controller.current?.save();
          else void controller.current?.prepare();
        }}
      />
      {(busy || ready) && (
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
