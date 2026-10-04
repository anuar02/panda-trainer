import { MotionGroup } from './motion';
import { View, type ViewProps } from 'react-native';
import { useTheme } from './theme';
import { parity } from './parity-tokens';
type Props = ViewProps & {
  flush?: boolean;
  rows?: boolean;
  entrance?: 'invite';
};
export function Card({
  children,
  flush = false,
  rows = false,
  entrance,
  className = '',
  style,
  ...props
}: Props) {
  const { scheme } = useTheme();
  const Container = rows || entrance ? MotionGroup : View;
  return (
    <Container
      {...props}
      {...(entrance ? { kind: entrance } : {})}
      className={`rounded-card bg-surface ${flush ? 'overflow-hidden' : 'gap-4 p-[18px]'} ${className}`}
      style={[{ boxShadow: parity[scheme].cardShadow }, style]}
    >
      {children}
    </Container>
  );
}
