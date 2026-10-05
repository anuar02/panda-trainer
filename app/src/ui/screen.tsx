import { useTabContentBottomInset } from '@/features/navigation/tab-bar-layout';
import tokens from './tokens.json';
import { MotionScrollView } from './motion';
import type { PropsWithChildren } from 'react';
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text } from './text';
export function Screen({
  title,
  subtitle,
  children,
}: PropsWithChildren<{ title: string; subtitle?: string }>) {
  const paddingBottom = useTabContentBottomInset(tokens.spacing.section);
  return (
    <SafeAreaView edges={['top', 'left', 'right']} className="flex-1 bg-canvas">
      <MotionScrollView
        contentContainerClassName="grow gap-section px-page pb-section pt-page"
        contentContainerStyle={{ paddingBottom }}
        keyboardShouldPersistTaps="handled"
      >
        <View className="gap-3">
          <Text accessibilityRole="header" className="font-heading text-title">
            {title}
          </Text>
          {subtitle && <Text className="text-secondary">{subtitle}</Text>}
        </View>
        {children}
      </MotionScrollView>
    </SafeAreaView>
  );
}
