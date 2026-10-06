import { librarySessionId } from '@/features/workspace-library/read-session';
import { signOutForAccountDeletion } from '@/features/auth/service';
import { fenceDeletionPendingWrites } from './storage-fence';
import { AccountExportControls } from '@/features/account-export/controls';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import * as Crypto from 'expo-crypto';
import { Screen } from '@/ui/screen';
import { Card } from '@/ui/card';
import { Button } from '@/ui/button';
import { Text } from '@/ui/text';
import { useAuth } from '@/features/auth/provider';
import { getSupabaseClient } from '@/features/auth/client';
import { saveExportFile } from '@/features/account-export/file';
import { boundedExportStep } from '@/features/account-export/service';
import { createDeletionController, type DeletionView } from './controller';
import {
  canResumeDeletionCleanup,
  cleanupDeletedAccountCache,
  fenceDeletionLocal,
  readDeletionLocal,
} from './local';
import {
  clearConfirmedDeletion,
  readConfirmedDeletion,
  saveConfirmedDeletion,
  type ConfirmedDeletion,
} from './pending';
import {
  inspectDeletion,
  requireDeletionSession,
  sendDeletion,
  type DeletionInspection,
} from './service';

export function AccountDeletionScreen() {
  const auth = useAuth();
  const { t } = useTranslation();
  const [restored, setRestored] = useState<
    ConfirmedDeletion | null | undefined
  >();
  const [failed, setFailed] = useState(false);
  const [state, setState] = useState<{
    view: DeletionView;
    inspection?: DeletionInspection;
    outstanding?: number;
  }>({ view: 'idle' });
  const controller = useRef<ReturnType<typeof createDeletionController> | null>(
    null,
  );
  const currentSession = useRef(auth.session);
  useLayoutEffect(() => {
    currentSession.current = auth.session;
  }, [auth.session]);
  useEffect(() => {
    let mounted = true;
    void readConfirmedDeletion().then(
      (value) => {
        if (mounted) setRestored(value);
      },
      () => {
        if (mounted) setFailed(true);
      },
    );
    return () => {
      mounted = false;
    };
  }, []);
  const [pinned, setPinned] = useState<{
    accountId: string;
    token: string;
  } | null>(null);
  useEffect(() => {
    if (pinned || restored === undefined) return;
    let mounted = true;
    void Promise.resolve().then(() => {
      if (!mounted) return;
      const accountId = restored?.accountId ?? auth.session?.user.id;
      if (accountId)
        setPinned({
          accountId,
          token:
            auth.session?.user.id === accountId
              ? auth.session.access_token
              : '',
        });
    });
    return () => {
      mounted = false;
    };
  }, [pinned, restored, auth.session]);
  const accountId = pinned?.accountId;
  const token = pinned?.token ?? '';
  useEffect(() => {
    if (restored === undefined || !accountId) return;
    let mounted = true;
    const sessionId = librarySessionId({
      user: { id: accountId },
      access_token: token,
    });
    const identity = { accountId, token, ...(sessionId ? { sessionId } : {}) };
    const guard = () => requireDeletionSession(identity);
    const recoveryGuard = async () => {
      if (!mounted) throw new Error('dismissed');
      const result = await boundedExportStep(
        getSupabaseClient()!.auth.getSession(),
      );
      if (
        result.error ||
        (result.data.session &&
          (result.data.session.user.id !== accountId ||
            result.data.session.access_token !== token))
      )
        throw new Error('session_changed');
    };
    const instance = createDeletionController(
      identity,
      {
        guard,
        inspect: () => inspectDeletion(identity),
        read: () =>
          readDeletionLocal(
            accountId,
            restored
              ? recoveryGuard
              : async () => {
                  const current = currentSession.current;
                  if (
                    current &&
                    (current.user.id !== accountId ||
                      current.access_token !== token)
                  )
                    throw new Error('session_changed');
                  if (!mounted) throw new Error('dismissed');
                },
          ),
        hash: (json) =>
          Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, json),
        uuid: Crypto.randomUUID,
        secret: () =>
          Array.from(Crypto.getRandomBytes(32), (byte) =>
            byte.toString(16).padStart(2, '0'),
          ).join(''),
        file: saveExportFile,
        persist: async (intent) => {
          await saveConfirmedDeletion(intent);
        },
        shutdown: async () => {
          const session = await boundedExportStep(
            getSupabaseClient()!.auth.getSession(),
          );
          if (session.error) throw new Error('session_unknown');
          if (session.data.session) await guard();
          await fenceDeletionPendingWrites(accountId);
          if (!session.data.session) return;
          await signOutForAccountDeletion(identity);
        },
        fence: (snapshot) => fenceDeletionLocal(snapshot, recoveryGuard),
        send: (action, request, bearer) =>
          sendDeletion(
            action,
            {
              requestId: request.requestId,
              recoveryToken: request.recoveryToken,
            },
            bearer,
          ),
        cleanup: (snapshot) =>
          cleanupDeletedAccountCache(snapshot, recoveryGuard),
        canResumeCleanup: (fingerprint) =>
          canResumeDeletionCleanup(accountId, fingerprint, recoveryGuard),
        clear: clearConfirmedDeletion,
        publish: (view, inspection, outstanding) => {
          const session = currentSession.current;
          if (
            mounted &&
            (!session ||
              (session.user.id === accountId && session.access_token === token))
          )
            setState({ view, inspection, outstanding });
        },
      },
      restored,
    );
    controller.current = instance;
    return () => {
      mounted = false;
      instance.stop();
      if (controller.current === instance) controller.current = null;
    };
  }, [accountId, token, restored]);
  const busy = state.view === 'loading' || state.view === 'deleting';
  const recovering = restored !== null && restored !== undefined;
  const mismatch = !!auth.session && auth.session.user.id !== accountId;
  const validSession =
    auth.session?.user.id === accountId && auth.session?.access_token === token;
  return (
    <Screen title={t('accountDeletion.title')}>
      <Card>
        <Text>{t('accountDeletion.consequences')}</Text>
        <Text className="text-secondary">
          {t('accountDeletion.limitation')}
        </Text>
        <Text accessibilityRole="alert" accessibilityLiveRegion="polite">
          {t(`accountDeletion.${failed ? 'blocked' : state.view}`)}
        </Text>
        {state.inspection && validSession && (
          <Text>
            {t('accountDeletion.scope', {
              workspaces: state.inspection.workspace_ids.length,
              cards: state.inspection.foreign_client_card_count,
            })}
          </Text>
        )}
        {state.inspection &&
          validSession &&
          state.inspection.workspace_ids.map((workspaceId) => (
            <AccountExportControls
              key={workspaceId}
              scope={{ userId: accountId!, workspaceId, token }}
              disabled={busy || state.view === 'unknown'}
            />
          ))}
        {!!state.outstanding && (
          <Text>
            {t('accountDeletion.outstanding', { count: state.outstanding })}
          </Text>
        )}
        {state.view !== 'complete' &&
        (recovering ||
          state.view === 'unknown' ||
          state.view === 'cleanupRequired') ? (
          <>
            <Text>{t('accountDeletion.pending')}</Text>
            {mismatch && <Text>{t('accountDeletion.accountChanged')}</Text>}
            <Button
              label={t('accountDeletion.recover')}
              disabled={busy || mismatch || failed}
              onPress={() => void controller.current?.recover()}
            />
            <Button
              label={t('accountDeletion.export')}
              disabled={busy || mismatch || failed}
              onPress={() => void controller.current?.exportRecovery()}
            />
            {!auth.session && (
              <Button
                label={t('accountDeletion.login')}
                variant="secondary"
                onPress={() => router.push('/auth/sign-in')}
              />
            )}
          </>
        ) : (
          state.view !== 'complete' && (
            <>
              {state.view === 'idle' && (
                <Button
                  label={t('accountDeletion.explain')}
                  disabled={!validSession || restored === undefined || failed}
                  onPress={() => void controller.current?.explain()}
                />
              )}
              {['consequences', 'blocked', 'ready', 'exported'].includes(
                state.view,
              ) && (
                <Button
                  label={t('accountDeletion.prepare')}
                  disabled={busy || !validSession}
                  onPress={() => void controller.current?.prepare()}
                />
              )}
              {['ready', 'blocked', 'exported'].includes(state.view) && (
                <Button
                  label={t('accountDeletion.export')}
                  disabled={busy || !validSession}
                  onPress={() => void controller.current?.export()}
                />
              )}
              {state.view === 'exported' && (
                <Button
                  label={t('accountDeletion.acknowledgement')}
                  disabled={!validSession}
                  onPress={() => void controller.current?.acknowledge()}
                />
              )}
              {state.view === 'confirmed' && (
                <Button
                  label={t('accountDeletion.confirm')}
                  disabled={!validSession}
                  onPress={() => void controller.current?.delete()}
                />
              )}
              <Button
                label={t('accountDeletion.cancel')}
                variant="ghost"
                disabled={busy}
                onPress={() => {
                  controller.current?.cancel();
                  router.back();
                }}
              />
            </>
          )
        )}
      </Card>
    </Screen>
  );
}
