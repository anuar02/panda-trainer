import { useEffect, useState, type PropsWithChildren } from 'react';
import { AccessibilityInfo, type ViewProps } from 'react-native';
import Animated, {
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

export const motion = {
  sheetDuration: 420,
  sheetEasing: Easing.bezier(0.22, 1, 0.36, 1),
  enterDuration: 600,
  standardEasing: Easing.bezier(0.2, 0.8, 0.2, 1),
  recordedDuration: 200,
};
export function useSystemReduceMotion() {
  const [reduced, setReduced] = useState(true);
  useEffect(() => {
    let active = true;
    let changed = false;
    const subscription = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      (value) => {
        changed = true;
        setReduced(value);
      },
    );
    void AccessibilityInfo.isReduceMotionEnabled()
      .then((value) => {
        if (active && !changed) setReduced(value);
      })
      .catch(() => {});
    return () => {
      active = false;
      subscription.remove();
    };
  }, []);
  return reduced;
}
export function MotionView({
  children,
  recorded = false,
  revision,
  ...props
}: PropsWithChildren<ViewProps & { recorded?: boolean; revision?: string }>) {
  const reduced = useSystemReduceMotion();
  const progress = useSharedValue(1);
  useEffect(() => {
    if (reduced || (recorded && !revision)) {
      progress.value = 1;
      return;
    }
    progress.value = 0;
    progress.value = withTiming(1, {
      duration: recorded ? motion.recordedDuration : motion.enterDuration,
      easing: motion.standardEasing,
      reduceMotion: ReduceMotion.System,
    });
  }, [progress, recorded, reduced, revision]);
  const animatedStyle = useAnimatedStyle(() => ({
    opacity: reduced
      ? 1
      : recorded
        ? 0.4 + progress.value * 0.6
        : progress.value,
    transform: [
      { translateY: reduced || recorded ? 0 : (1 - progress.value) * 14 },
    ],
  }));
  return (
    <Animated.View {...props} style={[props.style, animatedStyle]}>
      {children}
    </Animated.View>
  );
}
