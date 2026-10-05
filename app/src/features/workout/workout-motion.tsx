import { useTheme } from '@/ui/theme';
import {
  useLayoutEffect,
  useRef,
  useState,
  type PropsWithChildren,
} from 'react';
import {
  type PressableProps,
  type StyleProp,
  type ViewProps,
  type ViewStyle,
} from 'react-native';
import Animated, {
  Easing,
  ReduceMotion,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import {
  AnimatedPressableView,
  AnimatedView,
  motion,
  useMotionDisabled,
} from '@/ui/motion';

export const workoutMotion = {
  newDuration: 1200,
  notesDuration: 400,
  stepDuration: 150,
  restFillDuration: 500,
  restFinishedDuration: 400,
  dockDuration: 2000,
  holdInDuration: 350,
  holdOutDuration: 250,
  bubbleDuration: 450,
  bubbleDelay: 80,
  voiceItemDuration: 450,
  micDuration: 1800,
  holdMicDuration: 1400,
  micHintDuration: 2800,
  barDuration: 900,
  barDelay: 150,
  easeInOut: Easing.bezier(0.42, 0, 0.58, 1),
};

type EffectKind =
  | 'recorded'
  | 'new'
  | 'rest-finished'
  | 'dock'
  | 'bubble'
  | 'voice-item'
  | 'mic'
  | 'hold-mic'
  | 'mic-hint'
  | 'bar';
export function WorkoutEffect({
  kind,
  revision,
  active = true,
  delay = 0,
  children,
  ...props
}: PropsWithChildren<
  ViewProps & {
    kind: EffectKind;
    revision?: string | number;
    active?: boolean;
    delay?: number;
  }
>) {
  const disabled = useMotionDisabled();
  const { colors } = useTheme();
  const progress = useSharedValue(
    disabled || !active || kind === 'recorded' ? 1 : 0,
  );
  const previous = useRef(revision);
  const previousActive = useRef(active);
  const highlighted = useRef(new Set<string | number>());
  const duration =
    kind === 'recorded'
      ? motion.recordedDuration
      : kind === 'new'
        ? workoutMotion.newDuration
        : kind === 'rest-finished'
          ? workoutMotion.restFinishedDuration
          : kind === 'dock'
            ? workoutMotion.dockDuration
            : kind === 'bubble'
              ? workoutMotion.bubbleDuration
              : kind === 'voice-item'
                ? workoutMotion.voiceItemDuration
                : kind === 'mic'
                  ? workoutMotion.micDuration
                  : kind === 'hold-mic'
                    ? workoutMotion.holdMicDuration
                    : kind === 'bar'
                      ? workoutMotion.barDuration
                      : workoutMotion.micHintDuration;
  useLayoutEffect(() => {
    cancelAnimation(progress);
    const changed =
      kind !== 'recorded' ||
      (typeof revision === 'number' &&
        typeof previous.current === 'number' &&
        revision > previous.current &&
        previousActive.current &&
        active);
    const finishedRest =
      kind !== 'rest-finished' || (!previousActive.current && active);
    previousActive.current = active;
    previous.current = revision;
    const repeated =
      kind === 'new' &&
      revision !== undefined &&
      highlighted.current.has(revision);
    if (kind === 'new' && active && revision !== undefined)
      highlighted.current.add(revision);
    if (disabled || !active || !changed || repeated || !finishedRest) {
      progress.value = kind === 'rest-finished' ? 0 : 1;
      return;
    }
    const config = {
      duration,
      easing:
        kind === 'recorded' || kind === 'new'
          ? motion.standardEasing
          : kind === 'rest-finished'
            ? motion.standardEasing
            : kind === 'bubble' || kind === 'voice-item'
              ? motion.springEasing
              : kind === 'mic' || kind === 'hold-mic' || kind === 'mic-hint'
                ? motion.easeOut
                : workoutMotion.easeInOut,
      reduceMotion: ReduceMotion.System,
    };
    progress.value = 0;
    const animation =
      kind === 'dock' || kind === 'bar' || kind === 'rest-finished'
        ? withSequence(
            withTiming(1, { ...config, duration: duration / 2 }),
            withTiming(0, { ...config, duration: duration / 2 }),
          )
        : kind === 'mic-hint'
          ? withSequence(
              withTiming(0, { ...config, duration: duration * 0.6 }),
              withTiming(1, { ...config, duration: duration * 0.4 }),
            )
          : withTiming(1, config);
    const loop = ['dock', 'bar', 'mic', 'hold-mic', 'mic-hint'].includes(kind);
    progress.value = withDelay(
      delay + (kind === 'bubble' ? workoutMotion.bubbleDelay : 0),
      loop
        ? withRepeat(animation, -1, false, undefined, ReduceMotion.System)
        : animation,
      ReduceMotion.System,
    );
    return () => cancelAnimation(progress);
  }, [disabled, active, kind, revision, progress, duration, delay]);
  const style = useAnimatedStyle(() => {
    const p = disabled || !active ? 1 : progress.value;
    if (kind === 'new')
      return {
        boxShadow: [
          {
            offsetX: 0,
            offsetY: 0,
            blurRadius: 0,
            spreadDistance: disabled || !active ? 0 : 14 * p,
            color: `rgba(${colors.workoutAccentRgb},${disabled || !active ? 0 : 0.5 * (1 - p)})`,
          },
          {
            offsetX: 0,
            offsetY: 18,
            blurRadius: 40,
            spreadDistance: -18,
            color: colors.workoutElevation,
          },
        ],
      };
    if (kind === 'dock' || kind === 'mic-hint')
      return {
        boxShadow: [
          {
            offsetX: 0,
            offsetY: 0,
            blurRadius: 0,
            spreadDistance:
              disabled || !active ? 0 : p * (kind === 'dock' ? 5 : 12),
            color:
              kind === 'dock'
                ? `rgba(${colors.workoutDockRgb},${disabled || !active ? 0 : 0.22 * p})`
                : `rgba(${colors.workoutAccentRgb},${disabled || !active ? 0 : 0.4 * (1 - p)})`,
          },
        ],
      };
    if (kind === 'recorded') return { opacity: 0.4 + 0.6 * p };
    if (kind === 'rest-finished')
      return { opacity: disabled || !active ? 1 : 1 - 0.6 * p };
    if (kind === 'bubble' || kind === 'voice-item')
      return {
        opacity: p,
        transform: [
          { translateY: 10 * (1 - p) },
          {
            scale:
              (kind === 'bubble' ? 0.6 : 0.96) +
              (kind === 'bubble' ? 0.4 : 0.04) * p,
          },
        ],
        transformOrigin: kind === 'bubble' ? 'left bottom' : 'center',
      };
    if (kind === 'bar')
      return {
        transform: [{ scaleY: disabled || !active ? 1 : 0.3 + 0.7 * p }],
      };
    return {};
  });
  const halo = useAnimatedStyle(() => {
    const p = progress.value;
    const hidden = disabled || !active;
    return {
      opacity: hidden ? 0 : 0.9 * (1 - p),
      transform: [{ scale: 1 + 0.9 * p }],
    };
  });
  const hasHalo = kind === 'mic' || kind === 'hold-mic';
  return (
    <AnimatedView {...props} animatedStyle={style}>
      {hasHalo && (
        <Animated.View
          pointerEvents="none"
          testID={`${kind}-halo`}
          style={[
            {
              position: 'absolute',
              top: 0,
              bottom: 0,
              left: 0,
              right: 0,
              borderRadius: 999,
              backgroundColor:
                kind === 'hold-mic'
                  ? colors.workoutHoldHalo
                  : colors.workoutMicHalo,
            },
            halo,
          ]}
        />
      )}
      {children}
    </AnimatedView>
  );
}

export function WorkoutStep({
  onPressIn,
  onPressOut,
  ...props
}: PressableProps) {
  const disabled = useMotionDisabled();
  const scale = useSharedValue(1);
  const [pressed, setPressed] = useState(false);
  useLayoutEffect(() => {
    if (disabled || props.disabled) {
      cancelAnimation(scale);
      scale.value = 1;
    }
    return () => cancelAnimation(scale);
  }, [disabled, props.disabled, scale]);
  const style = useAnimatedStyle(() => ({
    transform: [{ scale: disabled ? 1 : scale.value }],
  }));
  const target = (value: number) => {
    cancelAnimation(scale);
    scale.set(
      disabled || props.disabled
        ? 1
        : withTiming(value, {
            duration: workoutMotion.stepDuration,
            easing: motion.springEasing,
            reduceMotion: ReduceMotion.System,
          }),
    );
  };
  return (
    <AnimatedPressableView
      {...props}
      style={
        typeof props.style === 'function'
          ? props.style({ pressed })
          : props.style
      }
      animatedStyle={style}
      onPressIn={(event) => {
        setPressed(true);
        target(0.88);
        onPressIn?.(event);
      }}
      onPressOut={(event) => {
        setPressed(false);
        target(1);
        onPressOut?.(event);
      }}
    />
  );
}
export function WorkoutRestFill({
  progress: target,
  ...props
}: ViewProps & { progress: number }) {
  const disabled = useMotionDisabled();
  const value = Math.max(0, Math.min(100, target));
  const progress = useSharedValue(value);
  useLayoutEffect(() => {
    cancelAnimation(progress);
    progress.value = disabled
      ? value
      : withTiming(value, {
          duration: workoutMotion.restFillDuration,
          easing: Easing.linear,
          reduceMotion: ReduceMotion.System,
        });
    return () => cancelAnimation(progress);
  }, [disabled, value, progress]);
  const style = useAnimatedStyle(() => ({
    width: `${disabled ? value : progress.value}%`,
  }));
  return <AnimatedView {...props} animatedStyle={style} />;
}
export function WorkoutRow({
  selected,
  children,
  ...props
}: Omit<PressableProps, 'children' | 'style'> &
  PropsWithChildren<{ selected: boolean; style?: StyleProp<ViewStyle> }>) {
  const disabled = useMotionDisabled();
  const { colors } = useTheme();
  const opacity = useSharedValue(selected ? 1 : 0);
  useLayoutEffect(() => {
    cancelAnimation(opacity);
    opacity.value = disabled
      ? Number(selected)
      : withTiming(Number(selected), {
          duration: motion.colorDuration,
          easing: motion.ease,
          reduceMotion: ReduceMotion.System,
        });
    return () => cancelAnimation(opacity);
  }, [disabled, selected, opacity]);
  const style = useAnimatedStyle(() => ({
    opacity: disabled ? Number(selected) : opacity.value,
  }));
  return (
    <AnimatedPressableView {...props}>
      <Animated.View
        pointerEvents="none"
        style={[
          {
            position: 'absolute',
            top: 0,
            bottom: 0,
            left: 0,
            right: 0,
            backgroundColor: colors.workoutAccentSoft,
          },
          style,
        ]}
      />
      {children}
    </AnimatedPressableView>
  );
}
export function useNewWorkoutExercises(
  scope: string,
  ids: readonly string[],
  ready = true,
) {
  const key = JSON.stringify(ids);
  const [snapshot, setSnapshot] = useState({
    scope,
    key,
    ready,
    ids,
    fresh: null as string | null,
  });
  if (
    snapshot.scope !== scope ||
    snapshot.key !== key ||
    snapshot.ready !== ready
  ) {
    const fresh =
      ready && snapshot.ready && snapshot.scope === scope
        ? (ids.find((id) => !snapshot.ids.includes(id)) ??
          (ids.includes(snapshot.fresh ?? '') ? snapshot.fresh : null))
        : null;
    setSnapshot({ scope, key, ready, ids, fresh });
    return fresh;
  }
  return snapshot.fresh;
}
export function WorkoutHoldMotion({
  visible,
  children,
  ...props
}: PropsWithChildren<ViewProps & { visible: boolean }>) {
  const disabled = useMotionDisabled();
  const [presence, setPresence] = useState({ visible, mounted: visible });
  if (presence.visible !== visible)
    setPresence({ visible, mounted: visible || presence.mounted });
  const progress = useSharedValue(disabled ? Number(visible) : 0);
  const translateY = useSharedValue(0);
  const current = useRef(visible);

  const finish = () => {
    if (!current.current) setPresence({ visible: false, mounted: false });
  };
  useLayoutEffect(() => {
    cancelAnimation(progress);
    cancelAnimation(translateY);
    current.current = visible;
    if (disabled) {
      progress.value = Number(visible);
      translateY.value = 0;
      return;
    }
    translateY.value = withTiming(visible ? 0 : 12, {
      duration: visible
        ? workoutMotion.holdInDuration
        : workoutMotion.holdOutDuration,
      easing: visible ? motion.standardEasing : motion.ease,
      reduceMotion: ReduceMotion.System,
    });
    if (visible)
      progress.value = withTiming(1, {
        duration: workoutMotion.holdInDuration,
        easing: motion.standardEasing,
        reduceMotion: ReduceMotion.System,
      });
    else
      progress.value = withTiming(
        0,
        {
          duration: workoutMotion.holdOutDuration,
          easing: motion.ease,
          reduceMotion: ReduceMotion.System,
        },
        (finished) => {
          if (finished) scheduleOnRN(finish);
        },
      );
    return () => {
      cancelAnimation(progress);
      cancelAnimation(translateY);
    };
  }, [disabled, visible, progress, translateY]);
  const style = useAnimatedStyle(() => ({
    opacity: disabled ? Number(visible) : progress.value,
    transform: [{ translateY: disabled ? 0 : translateY.value }],
  }));
  if ((!presence.mounted || disabled) && !visible) return null;
  return (
    <AnimatedView {...props} pointerEvents="none" animatedStyle={style}>
      {children}
    </AnimatedView>
  );
}
