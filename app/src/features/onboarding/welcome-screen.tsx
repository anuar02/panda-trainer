import { MotionScrollView as ScrollView } from '@/ui/motion';
import { useEffect, useRef, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  TextInput,
  View,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { Button } from '../../ui/button';
import { Card } from '../../ui/card';
import { GradientBackground } from '../../ui/gradient-background';
import { Icon, type IconName } from '../../ui/icons';
import { Mascot } from '../../ui/mascot';
import { parity } from '../../ui/parity-tokens';
import { Text } from '../../ui/text';
import { useTheme } from '../../ui/theme';
import {
  createTrainerOnboardingDraft,
  getWelcomeDaysLabel,
  getWelcomeNameError,
  isValidTrainerOnboardingDraft,
  toTrainerOnboardingPayload,
  toggleWelcomeDay,
  toggleWelcomeFocus,
  type TrainerOnboardingDraft,
  type WelcomeNameError,
  welcomeDays,
  welcomeEndTimes,
  welcomeFocusOptions,
  welcomeSessionLengths,
  welcomeStartTimes,
} from './welcome-model';

type WelcomeStep = 0 | 1 | 2 | 3 | 4;
type StaticWelcomeKey =
  | 'intro.kicker'
  | 'intro.title'
  | 'intro.text'
  | 'intro.trainer'
  | 'intro.clientInvitation'
  | 'steps.label'
  | 'steps.back'
  | 'steps.skip'
  | 'profile.title'
  | 'profile.text'
  | 'profile.name'
  | 'profile.focus'
  | 'profile.focusHint'
  | 'profile.continue'
  | 'hours.title'
  | 'hours.text'
  | 'hours.days'
  | 'hours.from'
  | 'hours.to'
  | 'hours.length'
  | 'hours.continue'
  | 'client.title'
  | 'client.text'
  | 'client.name'
  | 'client.namePlaceholder'
  | 'client.phone'
  | 'client.phonePlaceholder'
  | 'client.notice'
  | 'client.add'
  | 'client.later'
  | 'done.text'
  | 'done.profile'
  | 'done.hours'
  | 'done.firstClient'
  | 'done.addLater'
  | 'done.schedule'
  | 'done.home'
  | 'errors.nameRequired'
  | 'errors.save'
  | 'errors.retryOriginal';

type Props = {
  initialName?: string;
  error?: string | null;
  canSchedule?: boolean;
  onComplete: (
    draft: TrainerOnboardingDraft,
  ) => Promise<TrainerOnboardingDraft | void>;
  onClientInvitation: () => void;
  onScheduleFirstSession: () => void;
  onOpenClients: () => void;
};

const focusTranslationKeys = [
  'strength',
  'functional',
  'weightLoss',
  'rehabilitation',
  'boxing',
  'yoga',
] as const;

export function WelcomeScreen({
  initialName = '',
  error,
  canSchedule = false,
  onComplete,
  onClientInvitation,
  onScheduleFirstSession,
  onOpenClients,
}: Props) {
  const { t } = useTranslation();
  const { colors, scheme } = useTheme();
  const nameInput = useRef<TextInput>(null);
  const submitting = useRef<object | null>(null);
  const mounted = useRef(true);
  const pendingPayload = useRef<TrainerOnboardingDraft | null>(null);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      submitting.current = null;
    };
  }, []);
  const [step, setStep] = useState<WelcomeStep>(0);
  const [draft, setDraft] = useState(() =>
    createTrainerOnboardingDraft(initialName),
  );
  const [busy, setBusy] = useState(false);
  const [nameError, setNameError] = useState<WelcomeNameError | null>(null);
  const [saveFailed, setSaveFailed] = useState(false);
  const [retryOriginal, setRetryOriginal] = useState(false);
  const text = (key: StaticWelcomeKey): string => t(`welcome.${key}`) as string;
  const textWithName = (
    key: 'done.title' | 'done.invitePending',
    name: string,
  ) =>
    key === 'done.title'
      ? (t('welcome.done.title', { name }) as string)
      : (t('welcome.done.invitePending', { name }) as string);
  const chosenError = error ?? (saveFailed ? text('errors.save') : null);
  const validationMessage = nameError ? text(`errors.${nameError}`) : null;
  const surface = {
    backgroundColor: colors.surface,
    borderColor: colors.border,
  };
  const focusOptions = welcomeFocusOptions.map((value, index) => {
    const key = focusTranslationKeys[index];
    return {
      value,
      label: key ? (t(`welcome.focusOptions.${key}`) as string) : value,
    };
  });

  const complete = async (includeClient: boolean) => {
    if (!mounted.current || submitting.current) return;
    const invalidName = getWelcomeNameError(draft.name);
    if (invalidName) {
      setStep(1);
      setNameError(invalidName);
      nameInput.current?.focus();
      return;
    }
    const generation = {};
    submitting.current = generation;
    setBusy(true);
    setSaveFailed(false);
    setRetryOriginal(false);
    setNameError(null);
    try {
      const payload =
        pendingPayload.current ??
        toTrainerOnboardingPayload({
          ...draft,
          clientName: includeClient ? draft.clientName : '',
          clientPhone: includeClient ? draft.clientPhone : '',
        });
      if (!isValidTrainerOnboardingDraft(payload)) {
        setSaveFailed(true);
        return;
      }
      pendingPayload.current = payload;
      const completedDraft = await onComplete(payload);
      if (!mounted.current || submitting.current !== generation) return;
      setDraft(completedDraft ?? payload);
      setStep(4);
    } catch {
      if (mounted.current && submitting.current === generation) {
        setSaveFailed(true);
        setRetryOriginal(pendingPayload.current !== null);
      }
    } finally {
      if (mounted.current && submitting.current === generation) {
        submitting.current = null;
        setBusy(false);
      }
    }
  };

  const updateDraft = <K extends keyof TrainerOnboardingDraft>(
    key: K,
    value: TrainerOnboardingDraft[K],
  ) => setDraft((current) => ({ ...current, [key]: value }));

  const continueFromProfile = () => {
    const invalidName = getWelcomeNameError(draft.name);
    if (invalidName) {
      setNameError(invalidName);
      nameInput.current?.focus();
      return;
    }
    setNameError(null);
    setStep(2);
  };

  const skip = () => void complete(false);
  const back = () => {
    setNameError(null);
    setSaveFailed(false);
    setStep((current) => Math.max(0, current - 1) as WelcomeStep);
  };

  const chip = (
    label: string,
    selected: boolean,
    onPress: () => void,
    style?: ViewStyle,
  ) => (
    <Pressable
      key={label}
      accessibilityRole="button"
      accessibilityState={{ selected, disabled: busy }}
      disabled={busy}
      onPress={onPress}
      style={[
        styles.chip,
        {
          backgroundColor: selected
            ? scheme === 'dark'
              ? 'rgba(111, 134, 255, 0.16)'
              : 'rgba(43, 72, 214, 0.1)'
            : colors.surface,
          borderColor: selected ? colors.accent : colors.border,
          opacity: busy ? 0.6 : 1,
        },
        style,
      ]}
    >
      <Text
        style={{
          color: selected ? colors.ink : colors.secondary,
          fontSize: 14,
          fontWeight: selected ? '700' : '600',
        }}
      >
        {label}
      </Text>
    </Pressable>
  );

  const progress = () => (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={text('steps.label')}
      accessibilityValue={{ min: 1, max: 3, now: step }}
      style={styles.progress}
    >
      {[1, 2, 3].map((value) => (
        <View
          key={value}
          style={[
            styles.progressSegment,
            { backgroundColor: colors.border },
            value < step && { backgroundColor: colors.ink },
            value === step && { backgroundColor: colors.accent },
          ]}
        />
      ))}
    </View>
  );

  const top = () => (
    <View style={styles.top}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={text('steps.back')}
        disabled={busy}
        onPress={back}
        style={styles.back}
      >
        <Icon name="chevL" size={22} color={colors.ink} strokeWidth={2.2} />
      </Pressable>
      {progress()}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={text('steps.skip')}
        disabled={busy || (step === 2 && !draft.days.length)}
        onPress={skip}
        style={styles.skip}
      >
        <Text style={[styles.skipText, { color: colors.secondary }]}>
          {text('steps.skip')}
        </Text>
      </Pressable>
    </View>
  );

  const title = (value: string, centered = false) => (
    <Text
      accessibilityRole="header"
      className="font-heading"
      style={[styles.title, { color: colors.ink }, centered && styles.centered]}
    >
      {value}
    </Text>
  );

  const description = (value: string, centered = false) => (
    <Text
      style={[
        styles.description,
        { color: colors.secondary },
        centered && styles.centered,
      ]}
    >
      {value}
    </Text>
  );

  const field = (
    label: string,
    value: string,
    onChangeText: (next: string) => void,
    options: {
      placeholder?: string;
      keyboardType?: 'default' | 'phone-pad';
      maxLength?: number;
      inputRef?: typeof nameInput;
      error?: string | null;
    } = {},
  ) => (
    <View style={styles.field}>
      <Text style={[styles.fieldLabel, { color: colors.secondary }]}>
        {label}
      </Text>
      <TextInput
        ref={options.inputRef}
        accessibilityLabel={label}
        accessibilityState={{ disabled: busy }}
        editable={!busy}
        value={value}
        onChangeText={onChangeText}
        placeholder={options.placeholder}
        placeholderTextColor={colors.control}
        keyboardType={options.keyboardType}
        maxLength={options.maxLength}
        autoCapitalize="words"
        className="font-strong"
        style={[
          styles.input,
          surface,
          { color: colors.ink, borderColor: colors.border },
          options.error && { borderColor: colors.danger },
        ]}
      />
      {options.error ? (
        <Text accessibilityRole="alert" style={styles.error}>
          {options.error}
        </Text>
      ) : null}
    </View>
  );

  const errorNotice = chosenError ? (
    <View>
      <Text accessibilityRole="alert" style={styles.error}>
        {chosenError}
      </Text>
      {retryOriginal ? (
        <Text style={styles.error}>{text('errors.retryOriginal')}</Text>
      ) : null}
    </View>
  ) : null;

  const fieldFocus = (
    <View style={styles.chips}>
      {focusOptions.map(({ value, label }) =>
        chip(label, draft.focus.includes(value), () => {
          updateDraft('focus', toggleWelcomeFocus(draft.focus, value));
        }),
      )}
    </View>
  );

  const timeChips = (
    values: readonly string[],
    current: string,
    key: 'from' | 'to',
  ) => (
    <View style={styles.times}>
      {values.map((value) =>
        chip(value, current === value, () => updateDraft(key, value), {
          minWidth: 0,
          paddingHorizontal: 0,
        }),
      )}
    </View>
  );

  const lead = (icon: IconName, ok: boolean) => (
    <View
      style={[
        styles.rowLead,
        {
          backgroundColor: ok
            ? parity[scheme].success.backgroundColor
            : colors.sunken,
        },
      ]}
    >
      <Icon
        name={ok ? 'check' : icon}
        size={18}
        color={ok ? parity[scheme].success.color : colors.ink}
      />
    </View>
  );

  const row = (
    icon: IconName,
    label: string,
    meta: string,
    ok: boolean,
    last: boolean,
  ) => (
    <View
      key={label}
      style={[
        styles.doneRow,
        !last && {
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: scheme === 'dark' ? '#212227' : '#efefeb',
        },
      ]}
    >
      {lead(icon, ok)}
      <View style={styles.rowText}>
        <Text style={styles.rowTitle}>{label}</Text>
        <Text style={[styles.rowMeta, { color: colors.secondary }]}>
          {meta}
        </Text>
      </View>
    </View>
  );

  const content = () => {
    if (step === 0) {
      return (
        <>
          <ScrollView
            contentContainerStyle={styles.introContent}
            keyboardShouldPersistTaps="handled"
          >
            <Mascot pose="wave" size={220} style={styles.introMascot} />
            <Text style={[styles.kicker, { color: colors.accent }]}>
              {text('intro.kicker')}
            </Text>
            {title(text('intro.title'), true)}
            {description(text('intro.text'), true)}
          </ScrollView>
          <View style={styles.footer}>
            <Button label={text('intro.trainer')} onPress={() => setStep(1)} />
            <Button
              label={text('intro.clientInvitation')}
              variant="ghost"
              onPress={onClientInvitation}
            />
          </View>
        </>
      );
    }

    if (step === 1) {
      return (
        <>
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.body}
            keyboardShouldPersistTaps="handled"
          >
            {title(text('profile.title'))}
            {description(text('profile.text'))}
            {field(
              text('profile.name'),
              draft.name,
              (value) => {
                updateDraft('name', value);
                setNameError(null);
              },
              {
                inputRef: nameInput,
                maxLength: 120,
                error: validationMessage,
              },
            )}
            <Text style={[styles.label, { color: colors.secondary }]}>
              {text('profile.focus')}
            </Text>
            {fieldFocus}
            <Text style={[styles.hint, { color: colors.control }]}>
              {text('profile.focusHint')}
            </Text>
            {errorNotice}
          </ScrollView>
          <View style={styles.footer}>
            <Button
              label={text('profile.continue')}
              onPress={continueFromProfile}
            />
          </View>
        </>
      );
    }

    if (step === 2) {
      return (
        <>
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.body}
            keyboardShouldPersistTaps="handled"
          >
            {title(text('hours.title'))}
            {description(text('hours.text'))}
            <Text style={[styles.label, { color: colors.secondary }]}>
              {text('hours.days')}
            </Text>
            <View style={styles.days}>
              {welcomeDays.map((day, index) =>
                chip(
                  day,
                  draft.days.includes(index),
                  () => {
                    updateDraft('days', toggleWelcomeDay(draft.days, index));
                  },
                  { flex: 1, minWidth: 0, paddingHorizontal: 0 },
                ),
              )}
            </View>
            <Text style={[styles.label, { color: colors.secondary }]}>
              {text('hours.from')}
            </Text>
            {timeChips(welcomeStartTimes, draft.from, 'from')}
            <Text style={[styles.label, { color: colors.secondary }]}>
              {text('hours.to')}
            </Text>
            {timeChips(welcomeEndTimes, draft.to, 'to')}
            <Text style={[styles.label, { color: colors.secondary }]}>
              {text('hours.length')}
            </Text>
            <View style={styles.chips}>
              {welcomeSessionLengths.map((length) =>
                chip(
                  t('welcome.minutesLabel', { value: length }) as string,
                  draft.length === length,
                  () => {
                    updateDraft('length', length);
                  },
                ),
              )}
            </View>
            <View style={[styles.summary, { backgroundColor: colors.sunken }]}>
              <Icon name="clock" size={18} color={colors.accent} />
              <Text style={styles.summaryText}>
                {
                  t('welcome.hoursSummary', {
                    days: getWelcomeDaysLabel(draft.days),
                    from: draft.from,
                    to: draft.to,
                    duration: t('welcome.minutesLabel', {
                      value: draft.length,
                    }) as string,
                  }) as string
                }
              </Text>
            </View>
            {errorNotice}
          </ScrollView>
          <View style={styles.footer}>
            <Button
              label={text('hours.continue')}
              disabled={!draft.days.length}
              onPress={() => setStep(3)}
            />
          </View>
        </>
      );
    }

    if (step === 3) {
      return (
        <>
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.body}
            keyboardShouldPersistTaps="handled"
          >
            {title(text('client.title'))}
            {description(text('client.text'))}
            {field(
              text('client.name'),
              draft.clientName,
              (value) => updateDraft('clientName', value),
              { placeholder: text('client.namePlaceholder'), maxLength: 120 },
            )}
            {field(
              text('client.phone'),
              draft.clientPhone,
              (value) => updateDraft('clientPhone', value),
              {
                placeholder: text('client.phonePlaceholder'),
                keyboardType: 'phone-pad',
                maxLength: 80,
              },
            )}
            <View
              style={[
                styles.notice,
                { backgroundColor: colors.surface, borderColor: colors.border },
              ]}
            >
              <Icon name="lock" size={18} color={colors.secondary} />
              <Text style={[styles.noticeText, { color: colors.secondary }]}>
                {text('client.notice')}
              </Text>
            </View>
            {errorNotice}
          </ScrollView>
          <View style={styles.footer}>
            <Button
              label={text('client.add')}
              loading={busy}
              disabled={!draft.clientName.trim()}
              onPress={() => void complete(true)}
            />
            <Button
              label={text('client.later')}
              variant="ghost"
              disabled={busy}
              onPress={() => void complete(false)}
            />
          </View>
        </>
      );
    }

    const focusSummary = draft.focus.length
      ? ` · ${draft.focus.join(', ').toLocaleLowerCase('ru')}`
      : '';
    const clientMeta = draft.clientName.trim()
      ? textWithName('done.invitePending', draft.clientName.trim())
      : text('done.addLater');
    return (
      <>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.doneContent}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.doneIntro}>
            <Mascot pose="thumbs" size={160} style={styles.doneMascot} />
            {title(textWithName('done.title', draft.name.trim()), true)}
            {description(text('done.text'), true)}
          </View>
          <View style={styles.doneRows}>
            <Card rows flush style={styles.rowsCard}>
              {row(
                'user',
                text('done.profile'),
                `${draft.name.trim()}${focusSummary}`,
                true,
                false,
              )}
              {row(
                'clock',
                text('done.hours'),
                `${getWelcomeDaysLabel(draft.days)} · ${draft.from}–${draft.to}`,
                true,
                false,
              )}
              {row(
                'users',
                text('done.firstClient'),
                clientMeta,
                Boolean(draft.clientName.trim()),
                true,
              )}
            </Card>
          </View>
        </ScrollView>
        <View style={styles.footer}>
          <Button
            label={text('done.schedule')}
            disabled={!canSchedule || busy}
            onPress={onScheduleFirstSession}
          />
          <Button
            label={text('done.home')}
            variant="ghost"
            disabled={busy}
            onPress={onOpenClients}
          />
          {errorNotice}
        </View>
      </>
    );
  };

  return (
    <SafeAreaView
      edges={['left', 'right', 'bottom']}
      style={[styles.root, { backgroundColor: colors.canvas }]}
      testID={`trainer-welcome-step-${step}`}
    >
      <GradientBackground
        start={colors.canvas}
        end={colors.canvas}
        radials={[
          {
            color: '#ffb23d',
            opacity: 0.28,
            cx: 0.5,
            cy: 0.18,
            rx: 420,
            ry: 320,
            stop: 0.7,
          },
        ]}
      />
      {step > 0 && step < 4 ? top() : null}
      {content()}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingTop: 44 },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingTop: 4,
    paddingRight: 8,
    paddingBottom: 4,
    paddingLeft: 4,
  },
  back: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
  },
  skip: {
    minHeight: 44,
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
  },
  skipText: { fontSize: 15, fontWeight: '600' },
  progress: { flex: 1, flexDirection: 'row', gap: 6 },
  progressSegment: { flex: 1, height: 4, borderRadius: 4 },
  introContent: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 0,
  },
  introMascot: { width: 220, height: 240, marginBottom: 4 },
  kicker: { fontSize: 15, fontWeight: '700' },
  title: {
    marginTop: 6,
    fontSize: 24,
    fontWeight: '800',
    lineHeight: 28.8,
    letterSpacing: -0.4,
    textAlign: 'left',
  },
  centered: { textAlign: 'center' },
  description: {
    marginTop: 10,
    fontSize: 15,
    lineHeight: 21.75,
    textAlign: 'left',
  },
  scroll: { flex: 1 },
  body: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 20 },
  label: {
    marginTop: 22,
    marginBottom: 10,
    marginHorizontal: 2,
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  field: { marginTop: 18 },
  fieldLabel: {
    marginBottom: 8,
    marginHorizontal: 2,
    fontSize: 14,
    fontWeight: '600',
  },
  input: {
    width: '100%',
    minHeight: 56,
    paddingHorizontal: 16,
    borderWidth: 1.5,
    borderRadius: 16,
    fontSize: 17,
    fontWeight: '600',
  },
  error: {
    marginTop: 8,
    marginHorizontal: 2,
    color: '#ff5a4e',
    fontSize: 14,
    fontWeight: '600',
  },
  hint: { marginTop: 10, marginHorizontal: 2, fontSize: 13, lineHeight: 18.2 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
    borderWidth: 1,
    borderRadius: 24,
  },
  days: { flexDirection: 'row', gap: 6 },
  times: { flexDirection: 'row', gap: 6 },
  summary: {
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 22,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 16,
  },
  summaryText: { flex: 1, fontSize: 15, fontWeight: '600' },
  notice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginTop: 16,
    padding: 14,
    borderWidth: 1,
    borderRadius: 16,
  },
  noticeText: { flex: 1, fontSize: 13, lineHeight: 18.2 },
  footer: { gap: 4, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 30 },
  doneIntro: {
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 12,
  },
  doneContent: { flexGrow: 1 },
  doneMascot: { width: 160, height: 176, marginBottom: 12 },
  doneRows: { flexGrow: 1, paddingHorizontal: 20, paddingTop: 20 },
  rowsCard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'transparent',
  },
  doneRow: {
    minHeight: 70,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 12,
    paddingVertical: 14,
  },
  rowLead: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 17,
    overflow: 'hidden',
  },
  rowText: { flex: 1, minWidth: 0 },
  rowTitle: { fontSize: 15.5, fontWeight: '700', letterSpacing: 0.1 },
  rowMeta: { marginTop: 2, fontSize: 14, fontWeight: '500' },
});
