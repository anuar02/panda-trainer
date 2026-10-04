import {
  MotionScrollView as ScrollView,
  MotionPressable as Pressable,
} from '@/ui/motion';
import { AccountDeletionRecoveryEntry } from '@/features/account-deletion/recovery-entry';
import { KeyboardAvoidingView, Platform, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { Button } from '@/ui/button';
import { Field } from '@/ui/field';
import { Text } from '@/ui/text';
import { useTheme } from '@/ui/theme';

type SignInScreenProps = {
  ready: boolean;
  busy: boolean;
  stage: 'email' | 'code';
  email: string;
  code: string;
  error: string | null;
  resendAfter: number;
  onEmailChange: (value: string) => void;
  onCodeChange: (value: string) => void;
  onSendCode: () => void;
  onVerifyCode: () => void;
  onProvider: (provider: 'apple' | 'google') => void;
  onChangeEmail: () => void;
  onDemo: () => void;
};

export function SignInScreen({
  ready,
  busy,
  stage,
  email,
  code,
  error,
  resendAfter,
  onEmailChange,
  onCodeChange,
  onSendCode,
  onVerifyCode,
  onProvider,
  onChangeEmail,
  onDemo,
}: SignInScreenProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const waitingToResend = resendAfter > 0;
  const primaryAction = stage === 'email' ? onSendCode : onVerifyCode;
  const primaryLabel =
    stage === 'email' ? t('auth.sendCode') : t('auth.verifyCode');

  return (
    <SafeAreaView
      edges={['top', 'left', 'right', 'bottom']}
      className="flex-1 bg-canvas"
    >
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          className="flex-1"
          contentContainerClassName="grow justify-center gap-8 px-page py-section"
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={
            Platform.OS === 'ios' ? 'interactive' : 'on-drag'
          }
        >
          <View className="items-center gap-3">
            <Text className="font-heading text-title font-extrabold text-ink">
              {t('common.appName')}
            </Text>
          </View>

          <View className="gap-6 rounded-card border border-control bg-surface p-5">
            <View className="gap-2">
              <Text
                accessibilityRole="header"
                className="font-heading text-title text-ink"
              >
                {stage === 'email' ? t('auth.title') : t('auth.codeTitle')}
              </Text>
              <Text className="text-secondary">
                {stage === 'email'
                  ? t('auth.subtitle')
                  : t('auth.codeSubtitle', { email })}
              </Text>
            </View>

            {stage === 'email' ? (
              <Field
                label={t('auth.emailLabel')}
                placeholder={t('auth.emailPlaceholder')}
                value={email}
                onChangeText={onEmailChange}
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
                textContentType="emailAddress"
                autoCorrect={false}
                editable={ready && !busy}
                returnKeyType="send"
                onSubmitEditing={primaryAction}
                accessibilityHint={t('auth.emailHint')}
              />
            ) : (
              <View className="gap-3">
                <Field
                  label={t('auth.codeLabel')}
                  placeholder={t('auth.codePlaceholder')}
                  value={code}
                  onChangeText={onCodeChange}
                  keyboardType="number-pad"
                  autoComplete="one-time-code"
                  textContentType="oneTimeCode"
                  autoCapitalize="none"
                  autoCorrect={false}
                  maxLength={6}
                  editable={ready && !busy}
                  returnKeyType="done"
                  onSubmitEditing={primaryAction}
                  accessibilityHint={t('auth.codeHint')}
                />
                <View className="flex-row flex-wrap items-center justify-between gap-2">
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t('auth.changeEmail')}
                    disabled={busy}
                    onPress={onChangeEmail}
                    className="min-h-touch justify-center"
                  >
                    <Text className="font-semibold text-accent">
                      {t('auth.changeEmail')}
                    </Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{
                      disabled: !ready || busy || waitingToResend,
                    }}
                    disabled={!ready || busy || waitingToResend}
                    onPress={onSendCode}
                    className="min-h-touch justify-center"
                  >
                    <Text
                      style={{
                        color:
                          !ready || busy || waitingToResend
                            ? colors.secondary
                            : colors.accent,
                      }}
                      className="font-semibold"
                    >
                      {waitingToResend
                        ? t('auth.resendCountdown', { seconds: resendAfter })
                        : t('auth.resendCode')}
                    </Text>
                  </Pressable>
                </View>
              </View>
            )}

            {error ? (
              <Text accessibilityRole="alert" className="text-danger">
                {error}
              </Text>
            ) : null}

            {!ready ? (
              <Text
                accessibilityRole="alert"
                className="rounded-field bg-sunken p-3 text-secondary"
              >
                {t('auth.unavailable')}
              </Text>
            ) : null}

            <Button
              label={primaryLabel}
              loading={busy}
              disabled={
                !ready ||
                (stage === 'email' ? !email.trim() : code.length !== 6)
              }
              onPress={primaryAction}
            />

            {stage === 'email' ? (
              <>
                <View
                  className="flex-row items-center gap-3"
                  accessible={false}
                >
                  <View className="h-px flex-1 bg-control" />
                  <Text className="text-secondary">{t('auth.or')}</Text>
                  <View className="h-px flex-1 bg-control" />
                </View>
                <View className="gap-3">
                  <Button
                    variant="secondary"
                    label={t('auth.apple')}
                    disabled={!ready || busy}
                    onPress={() => onProvider('apple')}
                  />
                  <Button
                    variant="secondary"
                    label={t('auth.google')}
                    disabled={!ready || busy}
                    onPress={() => onProvider('google')}
                  />
                </View>
              </>
            ) : null}
          </View>

          <AccountDeletionRecoveryEntry />
          <Text className="px-4 text-center text-sm leading-5 text-secondary">
            {t('auth.privacyNote')}
          </Text>
          <Button
            label={t('auth.demo')}
            variant="ghost"
            disabled={busy}
            onPress={onDemo}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
