import { useTabBarLayout } from '@/features/navigation/tab-bar-layout';
import { NativeTabScrollView } from '@/features/navigation/native-tab-scroll-view';
import type { PropsWithChildren } from 'react';
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text } from './text';
export function Screen({
  title,
  subtitle,
  children,
}: PropsWithChildren<{ title: string; subtitle?: string }>) {
  const { bottomInset } = useTabBarLayout();
  return (
    <SafeAreaView edges={['top', 'left', 'right']} className="flex-1 bg-canvas">
      <NativeTabScrollView
        contentContainerClassName="grow gap-section px-page pb-section pt-page"
        contentContainerStyle={
          bottomInset ? { paddingBottom: bottomInset } : undefined
        }
        keyboardShouldPersistTaps="handled"
      >
        <View className="gap-3">
          <Text accessibilityRole="header" className="font-heading text-title">
            {title}
          </Text>
          {subtitle && <Text className="text-secondary">{subtitle}</Text>}
        </View>
        {children}
      </NativeTabScrollView>
    </SafeAreaView>
  );
}
