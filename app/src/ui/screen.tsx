import type { PropsWithChildren } from 'react';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text } from './text';
export function Screen({
  title,
  subtitle,
  children,
}: PropsWithChildren<{ title: string; subtitle?: string }>) {
  return (
    <SafeAreaView edges={['top', 'left', 'right']} className="flex-1 bg-canvas">
      <ScrollView
        contentContainerClassName="grow gap-section px-page pb-section pt-page"
        keyboardShouldPersistTaps="handled"
      >
        <View className="gap-3">
          <Text accessibilityRole="header" className="font-heading text-title">
            {title}
          </Text>
          {subtitle && <Text className="text-secondary">{subtitle}</Text>}
        </View>
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}
