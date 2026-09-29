import { Pressable } from 'react-native';
import { Text } from './text';
export function Chip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      className={`min-h-touch justify-center rounded-full border px-4 py-2 ${selected ? 'border-ink bg-ink' : 'border-control bg-surface'}`}
    >
      <Text className={selected ? 'font-medium text-canvas' : 'text-secondary'}>
        {label}
      </Text>
    </Pressable>
  );
}
