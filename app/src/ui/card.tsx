import { View, type ViewProps } from 'react-native';
import { useTheme } from './theme';
import { parity } from './parity-tokens';
type Props = ViewProps & { flush?: boolean };
export function Card({
  children,
  flush = false,
  className = '',
  style,
  ...props
}: Props) {
  const { scheme } = useTheme();
  return (
    <View
      {...props}
      className={`rounded-card bg-surface ${flush ? 'overflow-hidden' : 'gap-4 p-[18px]'} ${className}`}
      style={[{ boxShadow: parity[scheme].cardShadow }, style]}
    >
      {children}
    </View>
  );
}
