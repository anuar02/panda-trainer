import type { ReactNode } from 'react';
import { View, useWindowDimensions } from 'react-native';
import { Text } from './text';

type Props = {
  greeting?: string;
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
};

export function ScreenHeader({ greeting, title, subtitle, actions }: Props) {
  const { fontScale, width } = useWindowDimensions();
  const large = fontScale > 1.3 || width < 360;
  return (
    <View
      className="flex-row items-start gap-3 px-[22px] pb-[14px] pt-[10px]"
      style={large ? { flexDirection: 'column' } : undefined}
    >
      <View
        className="min-w-0 flex-1"
        style={large ? { flex: undefined, alignSelf: 'stretch' } : undefined}
      >
        {greeting && (
          <Text className="mb-[2px] font-bold text-[14px] leading-[20.3px] tracking-[0.1px] text-accent">
            {greeting}
          </Text>
        )}
        <Text accessibilityRole="header" className="font-heading text-title">
          {title}
        </Text>
        {subtitle && (
          <Text className="mt-[6px] font-strong text-[14px] leading-[20.3px] text-secondary">
            {subtitle}
          </Text>
        )}
      </View>
      {actions && <View className="flex-row gap-2">{actions}</View>}
    </View>
  );
}
