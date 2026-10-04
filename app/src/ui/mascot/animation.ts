import { useEffect, useMemo } from 'react';
import {
  cancelAnimation,
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { sampleTrack, type Timeline } from './keyframes';

export function useTimeline(
  timeline: Timeline,
  enabled: boolean,
  {
    repeat = true,
    delay = 0,
    initial = 0,
    scaleFirst = false,
    rotationFirst = false,
  }: {
    repeat?: boolean;
    delay?: number;
    initial?: number;
    scaleFirst?: boolean;
    rotationFirst?: boolean;
  } = {},
) {
  const progress = useSharedValue(initial);
  const easing = useMemo(
    () => Easing.bezier(...timeline.easing).factory(),
    [timeline],
  );
  useEffect(() => {
    cancelAnimation(progress);
    if (!enabled) {
      progress.value = initial;
      return;
    }
    progress.value = initial;
    if (!repeat && initial === 100) return () => cancelAnimation(progress);
    const timing = withTiming(100, {
      duration: timeline.duration,
      easing: Easing.linear,
      reduceMotion: ReduceMotion.System,
    });
    progress.value = withDelay(
      delay,
      repeat
        ? withRepeat(timing, -1, false, undefined, ReduceMotion.System)
        : timing,
    );
    return () => cancelAnimation(progress);
  }, [delay, enabled, initial, progress, repeat, timeline]);
  const style = useAnimatedStyle(() => {
    if (!enabled) return { opacity: 1, transform: [] };
    const f = timeline.frames;
    const x = sampleTrack(f.x, progress.value, easing, 0);
    const y = sampleTrack(f.y, progress.value, easing, 0);
    const sx = sampleTrack(f.sx, progress.value, easing, 1);
    const sy = sampleTrack(f.sy, progress.value, easing, 1);
    const r = `${sampleTrack(f.r, progress.value, easing, 0)}deg`;
    return {
      opacity: sampleTrack(f.opacity, progress.value, easing, 1),
      transform: scaleFirst
        ? [
            { scaleX: sx },
            { scaleY: sy },
            { translateX: x },
            { translateY: y },
            { rotate: r },
          ]
        : rotationFirst
          ? [
              { rotate: r },
              { translateX: x },
              { translateY: y },
              { scaleX: sx },
              { scaleY: sy },
            ]
          : [
              { translateX: x },
              { translateY: y },
              { rotate: r },
              { scaleX: sx },
              { scaleY: sy },
            ],
    };
  });
  function restart() {
    if (!enabled) return;
    cancelAnimation(progress);
    progress.set(0);
    progress.set(
      withTiming(100, {
        duration: timeline.duration,
        easing: Easing.linear,
        reduceMotion: ReduceMotion.System,
      }),
    );
  }
  return { style, restart };
}
