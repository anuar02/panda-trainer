import {
  GlassView,
  isGlassEffectAPIAvailable,
  isLiquidGlassAvailable,
} from 'expo-glass-effect';
import { useEffect, useState, type PropsWithChildren } from 'react';
import { AccessibilityInfo, Platform, View } from 'react-native';
import { useTheme } from '@/ui/theme';

export function TabBarSurface({ children }: PropsWithChildren) {
  const { scheme, colors } = useTheme();
  const [reduceTransparency, setReduceTransparency] = useState(true);
  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    let active = true;
    let revision = 0;
    const subscription = AccessibilityInfo.addEventListener(
      'reduceTransparencyChanged',
      (enabled) => {
        revision += 1;
        if (active) setReduceTransparency(enabled);
      },
    );
    void AccessibilityInfo.isReduceTransparencyEnabled()
      .then((enabled) => {
        if (active && revision === 0) setReduceTransparency(enabled);
      })
      .catch(() => {});
    return () => {
      active = false;
      subscription.remove();
    };
  }, []);
  const glass =
    Platform.OS === 'ios' &&
    !reduceTransparency &&
    isLiquidGlassAvailable() &&
    isGlassEffectAPIAvailable();
  const surfaceColor =
    reduceTransparency && Platform.OS === 'ios'
      ? colors.surface
      : `${colors.surface}${scheme === 'dark' ? 'f2' : 'e6'}`;
  const surfaceStyle = { borderRadius: 32, overflow: 'hidden' as const };
  return (
    <View
      testID="tab-bar-surface"
      style={{ borderRadius: 32, boxShadow: colors.workoutFocusShadow }}
    >
      {glass ? (
        <GlassView
          testID="tab-bar-glass"
          isInteractive
          glassEffectStyle="regular"
          colorScheme={scheme}
          style={surfaceStyle}
        >
          {children}
        </GlassView>
      ) : (
        <View
          testID="tab-bar-fallback"
          style={[
            surfaceStyle,
            {
              backgroundColor: surfaceColor,
              borderColor: colors.border,
              borderWidth: 1,
            },
          ]}
        >
          {children}
        </View>
      )}
    </View>
  );
}
