import {
  GlassView,
  isGlassEffectAPIAvailable,
  isLiquidGlassAvailable,
} from 'expo-glass-effect';
import { useEffect, useState, type PropsWithChildren } from 'react';
import { AccessibilityInfo, Platform, View } from 'react-native';
import { useTheme } from '@/ui/theme';
import { TAB_BAR_PADDING, TAB_BAR_RADIUS } from './tab-bar-layout';

export function TabBarSurface({ children }: PropsWithChildren) {
  const { scheme, colors } = useTheme();
  const [reduceTransparency, setReduceTransparency] = useState(true);
  useEffect(() => {
    let active = true;
    let changed = false;
    const subscription = AccessibilityInfo.addEventListener(
      'reduceTransparencyChanged',
      (enabled) => {
        changed = true;
        if (active) setReduceTransparency(enabled);
      },
    );
    void AccessibilityInfo.isReduceTransparencyEnabled()
      .then((enabled) => {
        if (active && !changed) setReduceTransparency(enabled);
      })
      .catch(() => {});
    return () => {
      active = false;
      subscription.remove();
    };
  }, []);
  const nativeGlass =
    Platform.OS === 'ios' &&
    !reduceTransparency &&
    isLiquidGlassAvailable() &&
    isGlassEffectAPIAvailable();
  const style = {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    padding: TAB_BAR_PADDING,
    borderRadius: TAB_BAR_RADIUS,
  };
  if (nativeGlass)
    return (
      <GlassView
        testID="floating-tab-bar-surface"
        glassEffectStyle="regular"
        isInteractive
        colorScheme={scheme}
        style={style}
      >
        {children}
      </GlassView>
    );
  return (
    <View
      testID="floating-tab-bar-surface"
      style={[
        style,
        {
          backgroundColor: reduceTransparency
            ? colors.surface
            : `${colors.surface}${scheme === 'dark' ? 'f2' : 'e6'}`,
          borderWidth: 1,
          borderColor: colors.border,
        },
      ]}
    >
      {children}
    </View>
  );
}
