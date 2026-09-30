import { Pressable, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { type WorkoutAction, type WorkoutJournal } from '@/domain/workout';
import { Text } from '@/ui/text';
import { Icon } from '@/ui/icons';
import { workoutStyles as s } from './measurements';

export function WorkoutNotes({
  journal,
  editable,
  dispatch,
}: {
  journal: WorkoutJournal;
  editable: boolean;
  dispatch: (action: WorkoutAction) => void;
}) {
  const { t } = useTranslation();
  const notes = journal.notes?.[journal.active] ?? [];
  if (!notes.length) return null;
  return (
    <View accessibilityLabel={t('workout.notesLabel')} style={s.notes}>
      <View style={s.row}>
        <Icon name="note" size={17} color="#f7c96a" />
        <Text style={[s.bold, s.grow]}>{t('workout.notes')}</Text>
        <Text>{notes.length}</Text>
      </View>
      {notes.map((note, index) => (
        <View key={index} style={s.noteRow}>
          <Text style={[s.small, s.secondary]}>{note.at}</Text>
          <Text style={[s.small, s.grow]}>{note.text}</Text>
          <Pressable
            accessibilityRole="switch"
            accessibilityState={{ checked: note.shared, disabled: !editable }}
            disabled={!editable}
            style={s.noteShare}
            onPress={() =>
              dispatch({ type: 'shareNote', clientId: journal.active, index })
            }
          >
            <Text style={s.small}>
              {t(note.shared ? 'workout.noteShared' : 'workout.noteHidden')}
            </Text>
          </Pressable>
          {editable && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('workout.removeNote', { text: note.text })}
              style={s.icon}
              onPress={() =>
                dispatch({
                  type: 'removeNote',
                  clientId: journal.active,
                  index,
                })
              }
            >
              <Icon name="close" size={15} color="#a3a4ab" />
            </Pressable>
          )}
        </View>
      ))}
    </View>
  );
}
