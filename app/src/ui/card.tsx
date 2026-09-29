import type { PropsWithChildren } from 'react';
import { View } from 'react-native';
export function Card({ children }: PropsWithChildren) {
  return (
    <View className="gap-4 rounded-card border border-border bg-surface p-page">
      {children}
    </View>
  );
}
