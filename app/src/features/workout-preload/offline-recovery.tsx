import { useEffect, useMemo, useState, type PropsWithChildren } from 'react';
import { View } from 'react-native';
import { randomUUID } from 'expo-crypto';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/features/auth/provider';
import { Screen } from '@/ui/screen';
import { Text } from '@/ui/text';
import { Button } from '@/ui/button';
import { findWorkoutPreloadRecovery } from './bootstrap';
import { createWorkoutPreloadReader, WorkoutPreloadReadError } from './service';
import { WorkoutPreloadProvider } from './provider';
import { WorkoutPreloadDock } from './dock';

type Result = {
  key: string;
  workspaceId: string | null;
  error: 'storage' | 'unavailable' | null;
};
export function WorkoutPreloadOfflineRecovery({
  children,
  onRetry,
  pending = false,
}: PropsWithChildren<{ onRetry(): void; pending?: boolean }>) {
  const auth = useAuth();
  const { t } = useTranslation();
  const accountId = auth.session?.user.id;
  const accessToken = auth.session?.access_token;
  const key = useMemo(
    () => ({
      accountId,
      accessToken,
      loading: auth.loading,
      failed: auth.failed,
      id: randomUUID(),
    }),
    [accountId, accessToken, auth.loading, auth.failed],
  ).id;
  const [loaded, setLoaded] = useState<Result | null>(null);
  const result = loaded?.key === key ? loaded : null;
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const account = accountId;
    const token = accessToken;
    if (!account || !token || auth.loading || auth.failed) return;
    void (async () => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        const cached = await findWorkoutPreloadRecovery(account);
        if (!active) return;
        if (!cached) {
          setLoaded({ key, workspaceId: null, error: 'unavailable' });
          return;
        }
        try {
          await Promise.race([
            createWorkoutPreloadReader().load(
              { ...cached.scope, accessToken: token, sessionId: key },
              cached.recovery.bookingId,
              controller.signal,
            ),
            new Promise<never>((_, reject) => {
              timer = setTimeout(() => {
                controller.abort();
                reject(new WorkoutPreloadReadError('network'));
              }, 15000);
            }),
          ]);
        } catch (error) {
          if (
            !(error instanceof WorkoutPreloadReadError) ||
            error.code !== 'network'
          ) {
            if (active)
              setLoaded({ key, workspaceId: null, error: 'unavailable' });
            return;
          }
        }
        if (active)
          setLoaded({
            key,
            workspaceId: cached.scope.workspaceId,
            error: null,
          });
      } catch {
        if (active) setLoaded({ key, workspaceId: null, error: 'storage' });
      } finally {
        clearTimeout(timer);
      }
    })();
    return () => {
      active = false;
      controller.abort();
    };
  }, [accountId, accessToken, key, auth.loading, auth.failed]);
  if (!result?.workspaceId)
    return (
      <Screen title={t(result && !pending ? 'common.error' : 'common.loading')}>
        {result?.error && !pending ? (
          <Text accessibilityRole="alert">
            {t(`workoutPreload.${result.error}`)}
          </Text>
        ) : null}
        <Button label={t('common.retry')} onPress={onRetry} />
      </Screen>
    );
  return (
    <WorkoutPreloadProvider
      key={`${accountId}:${result.workspaceId}`}
      workspaceId={result.workspaceId}
    >
      <View className="flex-1">
        <View className="bg-canvas px-page">
          <Text accessibilityRole="alert">
            {t('workoutPreload.workspaceOffline')}
          </Text>
          <Button label={t('common.retry')} variant="ghost" onPress={onRetry} />
        </View>
        {children}
        <WorkoutPreloadDock />
      </View>
    </WorkoutPreloadProvider>
  );
}
