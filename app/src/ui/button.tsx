import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  View,
  type PressableProps,
} from 'react-native';
import { useState, type ReactNode } from 'react';
import { Text } from './text';
import { useTheme } from './theme';
import { parity } from './parity-tokens';
import { GradientBackground } from './gradient-background';
type Props = Omit<PressableProps, 'children'> & {
  label: string;
  variant?: 'primary' | 'secondary' | 'soft' | 'ghost' | 'danger' | 'mint';
  loading?: boolean;
  compact?: boolean;
  icon?: ReactNode;
};
export function Button({
  label,
  variant = 'primary',
  loading = false,
  disabled,
  compact = false,
  icon,
  className = '',
  style,
  onPressIn,
  onPressOut,
  onHoverIn,
  onHoverOut,
  ...props
}: Props) {
  const { colors, scheme } = useTheme();
  const [pressed, setPressed] = useState(false);
  const [hovered, setHovered] = useState(false);
  const blocked = disabled || loading;
  const primary = variant === 'primary';
  return (
    <Pressable
      {...props}
      accessibilityRole="button"
      accessibilityState={{ disabled: blocked, busy: loading }}
      disabled={blocked}
      onPressIn={(event) => {
        setPressed(true);
        onPressIn?.(event);
      }}
      onPressOut={(event) => {
        setPressed(false);
        onPressOut?.(event);
      }}
      onHoverIn={(event) => {
        setHovered(true);
        onHoverIn?.(event);
      }}
      onHoverOut={(event) => {
        setHovered(false);
        onHoverOut?.(event);
      }}
      className={`relative flex-row items-center justify-center gap-[9px] px-5 py-3 ${compact ? 'min-h-touch rounded-[15px]' : 'min-h-button rounded-button'} ${variant === 'secondary' || variant === 'soft' ? 'bg-sunken' : ''} ${blocked ? (primary || variant === 'mint' ? '' : 'opacity-50') : 'active:opacity-80'} ${className}`}
      style={{
        ...(primary && !blocked ? { boxShadow: parity.button.shadow } : {}),
        ...(primary && blocked
          ? { backgroundColor: scheme === 'dark' ? '#2f3036' : '#cbccd3' }
          : {}),
        ...(variant === 'mint'
          ? {
              backgroundColor: blocked
                ? '#c9c9cd'
                : scheme === 'dark'
                  ? '#3ddc97'
                  : '#16a34a',
            }
          : {}),
        ...StyleSheet.flatten(
          typeof style === 'function'
            ? style({ pressed: pressed && !blocked, hovered })
            : style,
        ),
      }}
    >
      {primary && !blocked && (
        <GradientBackground
          start={parity.button.gradientStart}
          end={parity.button.gradientEnd}
          radius={compact ? 15 : 18}
        />
      )}
      {loading && (
        <ActivityIndicator color={primary ? '#ffffff' : colors.ink} />
      )}
      {!loading && icon && <View className="relative z-[1]">{icon}</View>}
      <Text
        className={`text-center font-bold tracking-[0.1px] ${compact ? 'text-[15px] leading-[21.75px]' : 'text-[16.5px] leading-[23.925px]'} ${primary && blocked && scheme === 'dark' ? 'text-secondary' : primary || variant === 'mint' ? 'text-white' : variant === 'ghost' ? 'text-secondary' : variant === 'danger' ? 'text-danger' : 'text-ink'}`}
      >
        {label}
      </Text>
    </Pressable>
  );
}
