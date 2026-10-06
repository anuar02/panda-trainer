import { TextInput, View, type TextInputProps } from 'react-native';
import { Text } from './text';
import { useTheme } from './theme';
type Props = TextInputProps & { label: string; error?: string };
export function Field({ label, error, ...props }: Props) {
  const { colors } = useTheme();
  return (
    <View className="gap-2">
      <Text className="font-medium">{label}</Text>
      <TextInput
        {...props}
        accessibilityLabel={label}
        accessibilityHint={error}
        placeholderTextColor={colors.secondary}
        selectionColor={colors.accent}
        className={`min-h-button rounded-field border bg-surface px-4 py-3 font-body text-base text-ink ${error ? 'border-danger' : 'border-control'}`}
      />
      {error ? (
        <Text accessibilityRole="alert" className="text-danger">
          {error}
        </Text>
      ) : null}
    </View>
  );
}
