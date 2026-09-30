import { router } from 'expo-router';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Button } from '@/ui/button';
import { Sheet } from '@/ui/sheet';
import { Text } from '@/ui/text';
import { useTheme } from '@/ui/theme';
import { todayStyles as s } from '@/features/trainer-today';
import type { ScheduleSession } from './demo';
import { useJournalLabels } from '@/features/workout-demo';

export function SessionDetailsSheet({
  session,
  onClose,
}: {
  session: ScheduleSession | null;
  onClose: () => void;
}) {
  const { t, i18n } = useTranslation();
  const { colors } = useTheme();
  const journal = useJournalLabels();
  const secondary = { color: colors.secondary };
  const people = session
    ? session.person === 'group'
      ? (['aliya', 'madi', 'dana'] as const)
      : [session.person]
    : [];
  const title =
    session?.person === 'group'
      ? t('trainerToday.miniGroup')
      : t(
          `trainerToday.sessionTitles.${session?.id === 's1' ? 'morning' : session?.id === 's7' ? 'stretch' : 'personal'}`,
        );
  const date = session
    ? new Intl.DateTimeFormat(i18n.language, {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        timeZone: 'Asia/Almaty',
      }).format(new Date(`${session.date}T12:00:00Z`))
    : '';

  return (
    <Sheet open={session !== null} onClose={onClose} title={title}>
      <Text style={secondary}>
        {t('trainerToday.sessionTime', {
          date: date.charAt(0).toUpperCase() + date.slice(1),
          time: session ? `${session.start}–${session.end}` : '',
        })}
      </Text>
      <Text style={s.strong}>{t('trainerToday.attendance')}</Text>
      {people.map((person) => (
        <View key={person} className="gap-2">
          <Text style={s.strong}>{t(`trainerToday.people.${person}Full`)}</Text>
          <Text style={[s.small, secondary]}>{t('trainerToday.unmarked')}</Text>
          <View style={s.actions}>
            <Button
              label={t('trainerToday.present')}
              variant="soft"
              compact
              disabled
            />
            <Button
              label={t('trainerToday.absent')}
              variant="ghost"
              compact
              disabled
            />
          </View>
        </View>
      ))}
      <Button
        label={journal.label(session?.id ?? '')}
        onPress={() => {
          if (!session) return;
          onClose();
          router.push({
            pathname: '/session/[id]',
            params: { id: session.id },
          });
        }}
      />
      <Button label={t('trainerToday.move')} variant="soft" disabled />
      <Button label={t('trainerToday.cancel')} variant="ghost" disabled />
      <Text style={[s.small, secondary]}>
        {t('trainerToday.attendanceHelp')}
      </Text>
    </Sheet>
  );
}
