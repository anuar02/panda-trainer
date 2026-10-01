import { Image, Linking } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Sheet } from '@/ui/sheet';
import { Button } from '@/ui/button';
import { Text } from '@/ui/text';
import { useTheme } from '@/ui/theme';
import {
  media as fixtureMedia,
  type LibraryExercise,
  type LibraryMediaMap,
} from './fixtures';
import { styles as s } from './styles';

export function ExerciseDetailsSheet({
  selected,
  onClose,
  suppliedMedia,
  onArchiveExercise,
}: {
  selected: LibraryExercise | null;
  onClose: () => void;
  suppliedMedia?: LibraryMediaMap;
  onArchiveExercise?: (exercise: LibraryExercise) => void;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const secondary = { color: colors.secondary };
  const exerciseMedia = suppliedMedia ?? fixtureMedia;
  const guide = selected ? exerciseMedia[selected.id] : undefined;
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
          {guide ? (
            <>
              <Image source={guide.gif} style={s.guideImage} />
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
          {onArchiveExercise && selected.sourceKey !== undefined && (
            <Button
              label={t('workspaceLibrary.archive')}
              variant="ghost"
              onPress={() => {
                const exercise = selected;
                onClose();
                onArchiveExercise(exercise);
              }}
            />
          )}
        </>
      )}
    </Sheet>
  );
}
