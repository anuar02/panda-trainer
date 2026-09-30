import { Image, Linking } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Sheet } from '@/ui/sheet';
import { Text } from '@/ui/text';
import { useTheme } from '@/ui/theme';
import { media, type LibraryExercise } from './fixtures';
import { styles as s } from './styles';

export function ExerciseDetailsSheet({
  selected,
  onClose,
}: {
  selected: LibraryExercise | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const secondary = { color: colors.secondary };
  return (
    <Sheet
      open={Boolean(selected)}
      title={selected?.name ?? ''}
      onClose={onClose}
    >
      {selected && (
        <>
          <Text style={secondary}>
            {t('trainerLibrary.groupEquipment', selected)}
          </Text>
          {media[selected.id] ? (
            <>
              <Image source={media[selected.id]?.gif} style={s.guideImage} />
              <Text
                style={[s.small, secondary]}
                accessibilityRole="link"
                onPress={() => Linking.openURL('https://gymvisual.com/')}
              >
                {t('trainerLibrary.attribution')}
              </Text>
              <Text style={s.sectionTitle}>
                {t('trainerLibrary.instructions')}
              </Text>
              {selected.instructions.map((step, i) => (
                <Text key={step}>
                  {t('trainerLibrary.step', { number: i + 1, text: step })}
                </Text>
              ))}
            </>
          ) : (
            <Text style={secondary}>{t('trainerLibrary.noGuide')}</Text>
          )}
        </>
      )}
    </Sheet>
  );
}
