import {
  ActivityIndicator,
  Pressable,
  type PressableProps,
} from 'react-native';
import { Text } from './text';
import { useTheme } from './theme';
type Props = Omit<PressableProps, 'children'> & {
  label: string;
  variant?: 'primary' | 'secondary';
  loading?: boolean;
};
export function Button({
  label,
  variant = 'primary',
  loading = false,
  disabled,
  ...props
}: Props) {
  const { colors } = useTheme();
  const blocked = disabled || loading;
  return (
    <Pressable
      {...props}
      accessibilityRole="button"
      accessibilityState={{ disabled: blocked, busy: loading }}
      disabled={blocked}
      className={`min-h-button flex-row items-center justify-center gap-3 rounded-button px-5 py-3 ${variant === 'primary' ? 'bg-ink' : 'border border-control bg-surface'} ${blocked ? 'opacity-50' : 'active:opacity-80'}`}
    >
      {loading && (
        <ActivityIndicator
          color={variant === 'primary' ? colors.canvas : colors.ink}
        />
      )}
      <Text
        className={`text-center font-strong ${variant === 'primary' ? 'text-canvas' : 'text-ink'}`}
      >
        {label}
      </Text>
    </Pressable>
  );
}
