import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { Button } from '@/ui/button';
import { Card } from '@/ui/card';
import { Icon, type IconName } from '@/ui/icons';
import { Mascot } from '@/ui/mascot';
import { StatusPill } from '@/ui/status-pill';
import { Text } from '@/ui/text';
import { useTheme } from '@/ui/theme';

export type TrainerInvitationState =
  'disconnected' | 'active' | 'unavailable' | 'connected';

export type TrainerInvitationScreenProps = {
  state: TrainerInvitationState;
  clientName: string;
  clientCreatedAt: string | null;
  link: string | null;
  expiresAt: string | null;
  loading: boolean;
  busy: boolean;
  error: string | null;
  onBack: () => void;
  onCreateLink: () => void;
  onCopyLink: () => void;
  onShareLink: () => void;
  onReissueLink: () => void;
  onRevokeLink: () => void;
  onOpenClient: () => void;
  onRetry: () => void;
};

export type ClientInvitationState = 'active' | 'accepted' | 'unavailable';

export type ClientInvitationScreenProps = {
  state: ClientInvitationState;
  authenticated: boolean;
  trainerName?: string | null;
  loading: boolean;
  busy: boolean;
  error: string | null;
  onSignIn: () => void;
  onAccept: () => void;
  onBack?: () => void;
  onContinue: () => void;
  onRetry: () => void;
};

const formatDate = (value: string, language: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? null
    : new Intl.DateTimeFormat(language, {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      }).format(date);
};

function LoadingState({ label }: { label: string }) {
  const { colors } = useTheme();
  return (
    <View style={s.state}>
      <ActivityIndicator
        accessible
        accessibilityRole="progressbar"
        accessibilityLabel={label}
        color={colors.accent}
      />
      <Text style={[s.bodyText, { color: colors.secondary }]}>{label}</Text>
    </View>
  );
}

export function TrainerInvitationScreen({
  state,
  clientName,
  clientCreatedAt,
  link,
  expiresAt,
  loading,
  busy,
  error,
  onBack,
  onCreateLink,
  onCopyLink,
  onShareLink,
  onReissueLink,
  onRevokeLink,
  onOpenClient,
  onRetry,
}: TrainerInvitationScreenProps) {
  const { t, i18n } = useTranslation();
  const { colors } = useTheme();
  const created = clientCreatedAt
    ? formatDate(clientCreatedAt, i18n.language)
    : null;
  const expiry = expiresAt ? formatDate(expiresAt, i18n.language) : null;
  const status = {
    disconnected: {
      label: t('invitations.trainer.disconnected'),
      tone: 'neutral' as const,
    },
    active: {
      label: t('invitations.trainer.active'),
      tone: 'warning' as const,
    },
    unavailable: {
      label: t('invitations.trainer.unavailable'),
      tone: 'neutral' as const,
    },
    connected: {
      label: t('invitations.trainer.connected'),
      tone: 'success' as const,
    },
  }[state];
  const sealIcon: IconName = state === 'connected' ? 'user' : 'link';

  return (
    <SafeAreaView
      edges={['top', 'left', 'right', 'bottom']}
      style={[s.root, { backgroundColor: colors.canvas }]}
    >
      <View style={s.topbar}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('invitations.trainer.back')}
          onPress={onBack}
          style={s.back}
        >
          <Icon name="chevL" size={22} color={colors.ink} />
        </Pressable>
        <Text
          accessibilityRole="header"
          style={[s.topTitle, { color: colors.ink }]}
        >
          {t('invitations.trainer.screenTitle')}
        </Text>
        <View style={s.back} />
      </View>
      <ScrollView contentContainerStyle={s.body}>
        <Text
          accessibilityRole="header"
          style={[s.title, { color: colors.ink }]}
        >
          {t('invitations.trainer.title')}
        </Text>
        <Text style={[s.bodyText, s.intro, { color: colors.secondary }]}>
          {t('invitations.trainer.description')}
        </Text>
        <Card flush style={[s.inviteCard, { borderColor: colors.border }]}>
          <View style={[s.seal, { backgroundColor: colors.sunken }]}>
            <Icon name={sealIcon} size={28} color={colors.ink} />
          </View>
          <Text
            accessibilityRole="header"
            style={[s.cardTitle, { color: colors.ink }]}
          >
            {clientName}
          </Text>
          <Text
            style={[
              s.bodyText,
              s.cardDescription,
              s.center,
              { color: colors.secondary },
            ]}
          >
            {created
              ? t('invitations.trainer.clientCreated', { date: created })
              : t('invitations.trainer.clientCard')}
          </Text>
          <StatusPill
            label={status.label}
            tone={status.tone}
            dot={state === 'active'}
            style={s.status}
          />
          {state === 'active' && Boolean(link) && (
            <View style={[s.linkField, { borderColor: colors.border }]}>
              <Icon name="link" size={18} color={colors.secondary} />
              <Text selectable style={[s.linkText, { color: colors.ink }]}>
                {link}
              </Text>
            </View>
          )}
          {state === 'active' && (
            <View style={s.expiry}>
              <Text style={[s.caption, { color: colors.secondary }]}>
                {t('invitations.trainer.validForSevenDays')}
              </Text>
              {expiry !== null && (
                <Text style={[s.caption, { color: colors.secondary }]}>
                  {t('invitations.trainer.expiresOn', { date: expiry })}
                </Text>
              )}
            </View>
          )}
        </Card>
        {loading ? (
          <LoadingState label={t('invitations.trainer.loading')} />
        ) : error ? (
          <View style={[s.error, { backgroundColor: colors.sunken }]}>
            <Text
              accessibilityRole="alert"
              style={[s.bodyText, { color: colors.ink }]}
            >
              {error}
            </Text>
            <Button
              label={t('invitations.trainer.retry')}
              variant="soft"
              disabled={busy}
              onPress={onRetry}
            />
          </View>
        ) : state === 'disconnected' ? (
          <Button
            label={t('invitations.trainer.create')}
            icon={<Icon name="link" size={20} color="#ffffff" />}
            loading={busy}
            disabled={busy}
            onPress={onCreateLink}
            style={s.primaryAction}
          />
        ) : state === 'unavailable' ? (
          <View style={s.actions}>
            <Button
              label={t('invitations.trainer.create')}
              disabled
              accessibilityHint={t('invitations.trainer.unavailable')}
              style={s.primaryAction}
            />
          </View>
        ) : state === 'active' ? (
          <View style={s.actions}>
            <Button
              label={t('invitations.trainer.copy')}
              icon={<Icon name="copy" size={18} color={colors.ink} />}
              variant="soft"
              disabled={busy || !link}
              onPress={onCopyLink}
            />
            <Button
              label={t('invitations.trainer.share')}
              icon={<Icon name="share" size={18} color={colors.ink} />}
              variant="soft"
              disabled={busy || !link}
              onPress={onShareLink}
            />
            {link ? (
              <Button
                label={t('invitations.trainer.reissue')}
                variant="ghost"
                compact
                disabled={busy}
                onPress={onReissueLink}
              />
            ) : (
              <Button
                label={t('invitations.trainer.regenerate')}
                variant="soft"
                disabled={busy}
                onPress={onReissueLink}
              />
            )}
            <Button
              label={t('invitations.trainer.revoke')}
              variant="ghost"
              compact
              disabled={busy}
              onPress={onRevokeLink}
            />
          </View>
        ) : state === 'connected' ? (
          <Button
            label={t('invitations.trainer.openClient')}
            variant="soft"
            onPress={onOpenClient}
            style={s.primaryAction}
          />
        ) : null}
        <View style={[s.privacy, { backgroundColor: colors.sunken }]}>
          <Icon name="lock" size={18} color={colors.secondary} />
          <Text style={[s.caption, s.privacyText, { color: colors.secondary }]}>
            {t('invitations.trainer.privacy')}
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

export function ClientInvitationScreen({
  state,
  authenticated,
  trainerName,
  loading,
  busy,
  error,
  onSignIn,
  onAccept,
  onBack,
  onContinue,
  onRetry,
}: ClientInvitationScreenProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const accepted = state === 'accepted';
  const unavailable = state === 'unavailable';
  const title = accepted
    ? trainerName
      ? t('invitations.client.acceptedTitle', { trainerName })
      : t('invitations.client.acceptedTitleFallback')
    : unavailable
      ? t('invitations.client.unavailableTitle')
      : t('invitations.client.activeTitle');
  const description = accepted
    ? t('invitations.client.acceptedDescription')
    : unavailable
      ? t('invitations.client.unavailableDescription')
      : t('invitations.client.activeDescription');
  const sealIcon: IconName = unavailable ? 'link' : 'user';

  return (
    <SafeAreaView
      edges={['top', 'left', 'right', 'bottom']}
      style={[s.root, { backgroundColor: colors.canvas }]}
    >
      {onBack && (
        <View style={s.clientTopbar}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('invitations.trainer.back')}
            onPress={onBack}
            style={s.back}
          >
            <Icon name="chevL" size={22} color={colors.ink} />
          </Pressable>
        </View>
      )}
      <ScrollView contentContainerStyle={s.clientBody}>
        {loading ? (
          <LoadingState label={t('invitations.client.loading')} />
        ) : (
          <View style={s.clientCard}>
            {unavailable ? (
              <View style={[s.seal, { backgroundColor: colors.sunken }]}>
                <Icon name={sealIcon} size={28} color={colors.ink} />
              </View>
            ) : (
              <Mascot
                pose={accepted ? 'thumbs' : 'wave'}
                size={216}
                style={s.clientMascot}
              />
            )}
            <Text
              accessibilityRole="header"
              style={[s.clientTitle, { color: colors.ink }]}
            >
              {title}
            </Text>
            <Text
              style={[
                s.bodyText,
                s.cardDescription,
                s.center,
                { color: colors.secondary },
              ]}
            >
              {description}
            </Text>
            {!unavailable && (
              <StatusPill
                label={
                  accepted
                    ? t('invitations.client.alreadyConnected')
                    : t('invitations.client.linkActive')
                }
                tone={accepted ? 'success' : 'neutral'}
                dot={false}
                style={s.status}
              />
            )}
          </View>
        )}
        {!loading && Boolean(error) ? (
          <View style={[s.error, { backgroundColor: colors.sunken }]}>
            <Text
              accessibilityRole="alert"
              style={[s.bodyText, { color: colors.ink }]}
            >
              {error}
            </Text>
            <Button
              label={t('invitations.client.retry')}
              variant="soft"
              disabled={busy}
              onPress={onRetry}
            />
          </View>
        ) : !loading && accepted ? (
          <Button
            label={t('invitations.client.continue')}
            onPress={onContinue}
            style={s.primaryAction}
          />
        ) : !loading && unavailable ? (
          onBack ? (
            <Button
              label={t('invitations.client.understood')}
              variant="soft"
              onPress={onBack}
              style={s.primaryAction}
            />
          ) : null
        ) : !loading && authenticated ? (
          <Button
            label={t('invitations.client.accept')}
            loading={busy}
            disabled={busy}
            onPress={onAccept}
            style={s.primaryAction}
          />
        ) : !loading ? (
          <Button
            label={t('invitations.client.signIn')}
            disabled={busy}
            onPress={onSignIn}
            style={s.primaryAction}
          />
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  topbar: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
  },
  clientTopbar: { minHeight: 52, paddingHorizontal: 8 },
  back: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 22,
  },
  topTitle: { fontSize: 16, fontWeight: '700' },
  body: { paddingHorizontal: 16, paddingBottom: 24, paddingTop: 4 },
  clientBody: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingBottom: 32,
    paddingTop: 12,
  },
  title: {
    fontSize: 24,
    lineHeight: 29,
    fontWeight: '800',
    letterSpacing: -0.4,
  },
  intro: { marginTop: 8 },
  inviteCard: {
    alignItems: 'center',
    marginTop: 18,
    padding: 22,
    borderWidth: 1.5,
    borderRadius: 24,
  },
  clientCard: {
    alignItems: 'center',
  },
  clientMascot: { marginBottom: 16 },
  seal: {
    width: 64,
    height: 64,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    borderRadius: 20,
  },
  cardTitle: {
    fontSize: 21,
    lineHeight: 25,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  cardDescription: { marginTop: 8 },
  clientTitle: {
    textAlign: 'center',
    fontSize: 24,
    lineHeight: 29,
    fontWeight: '800',
    letterSpacing: -0.4,
  },
  bodyText: { fontSize: 14, lineHeight: 21, fontWeight: '500' },
  center: { textAlign: 'center' },
  status: { marginTop: 16, alignSelf: 'center' },
  linkField: {
    alignSelf: 'stretch',
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 16,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderRadius: 12,
  },
  linkText: { flex: 1, fontSize: 14, fontWeight: '600' },
  expiry: { alignSelf: 'stretch', gap: 4, marginTop: 8 },
  caption: { fontSize: 13, lineHeight: 18 },
  actions: { gap: 10, marginTop: 18 },
  primaryAction: { marginTop: 18 },
  privacy: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginTop: 16,
    padding: 14,
    borderRadius: 16,
  },
  privacyText: { flex: 1 },
  error: { gap: 10, marginTop: 16, padding: 14, borderRadius: 16 },
  state: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    minHeight: 180,
  },
});
