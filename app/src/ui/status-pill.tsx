import { View, type ViewProps } from 'react-native';
import { Text } from './text';
import { useTheme } from './theme';
import { parity } from './parity-tokens';

type Props = ViewProps & {
  label: string;
  tone?: 'neutral' | 'success' | 'warning' | 'danger' | 'accent';
  dot?: boolean;
};

export function StatusPill({
  label,
  tone = 'neutral',
  dot = false,
  style,
  className = '',
  ...props
}: Props) {
  const { scheme } = useTheme();
  const colors = parity[scheme][tone];
  return (
    <View
      {...props}
      className={`flex-row self-start items-center gap-[7px] rounded-full py-[6px] ${dot ? 'pl-[11px] pr-3' : 'px-[13px]'} ${className}`}
      style={[{ backgroundColor: colors.backgroundColor }, style]}
    >
      {dot && (
        <View
          className="h-2 w-2 rounded-full"
          style={{ backgroundColor: colors.color }}
        />
      )}
      <Text
        className="font-bold text-[14px] leading-[20.3px] tracking-[0.1px]"
        style={{ color: colors.color }}
      >
        {label}
      </Text>
    </View>
  );
}
