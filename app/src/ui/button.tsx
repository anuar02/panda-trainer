import { MotionPressable } from './motion';
import {
  ActivityIndicator,
  StyleSheet,
  View,
  type PressableProps,
  type StyleProp,
  type TextStyle,
} from 'react-native';
import { useState, type ReactNode } from 'react';
import { Text } from './text';
import { useTheme } from './theme';
import { parity } from './parity-tokens';
import { GradientBackground } from './gradient-background';
type Props = Omit<PressableProps, 'children'> & {
  label: string;
  labelStyle?: StyleProp<TextStyle>;
  variant?: 'primary' | 'secondary' | 'soft' | 'ghost' | 'danger' | 'mint';
  loading?: boolean;
  compact?: boolean;
  icon?: ReactNode;
};
export function Button({
  label,
  labelStyle,
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
  const blocked = disabled || loading;
  const primary = variant === 'primary';
  return (
    <MotionPressable
      motionKind="button"
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
        onHoverIn?.(event);
      }}
      onHoverOut={(event) => {
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
            ? style({ pressed: pressed && !blocked })
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
        style={[{ flexShrink: 1 }, labelStyle]}
        className={`text-center font-bold tracking-[0.1px] ${compact ? 'text-[15px] leading-[21.75px]' : 'text-[16.5px] leading-[23.925px]'} ${primary && blocked && scheme === 'dark' ? 'text-secondary' : primary || variant === 'mint' ? 'text-white' : variant === 'ghost' ? 'text-secondary' : variant === 'danger' ? 'text-danger' : 'text-ink'}`}
      >
        {label}
      </Text>
    </MotionPressable>
  );
}
