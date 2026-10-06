import { cssInterop } from 'nativewind';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import {
  useId,
  Children,
  Fragment,
  isValidElement,
  cloneElement,
  type ReactNode,
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useState,
  type ComponentProps,
  type Ref,
  type PropsWithChildren,
} from 'react';
import { useTheme } from './theme';

import { NavigationContext } from 'expo-router/react-navigation';
import { useCalmMode } from './calm-mode';
import {
  AccessibilityInfo,
  Pressable,
  ScrollView,
  View,
  StyleSheet,
  type StyleProp,
  type ViewStyle,
  type PressableProps,
  type ScrollViewProps,
  type ViewProps,
} from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  withDelay,
  withRepeat,
  withSequence,
  useReducedMotion,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

type AnimatedStyle = ComponentProps<typeof Animated.View>['style'];
type AnimatedViewProps = ComponentProps<typeof Animated.View> & {
  animatedStyle?: AnimatedStyle;
};
export function AnimatedView({
  style,
  animatedStyle,
  ...props
}: AnimatedViewProps) {
  return <Animated.View {...props} style={[style, animatedStyle]} />;
}
cssInterop(AnimatedView, { className: 'style' });
const AnimatedPressable = Animated.createAnimatedComponent(Pressable);
type AnimatedPressableViewProps = Omit<PressableProps, 'style'> & {
  style?: StyleProp<ViewStyle>;
  animatedStyle?: AnimatedStyle;
};
export function AnimatedPressableView({
  style,
  animatedStyle,
  ...props
}: AnimatedPressableViewProps) {
  return <AnimatedPressable {...props} style={[style, animatedStyle]} />;
}
cssInterop(AnimatedPressableView, { className: 'style' });

export const motion = {
  sheetDuration: 420,
  sheetEasing: Easing.bezier(0.22, 1, 0.36, 1),
  enterDuration: 600,
  standardEasing: Easing.bezier(0.2, 0.8, 0.2, 1),
  recordedDuration: 200,
  springEasing: Easing.bezier(0.34, 1.56, 0.64, 1),
  ease: Easing.bezier(0.25, 0.1, 0.25, 1),
  indicatorDuration: 450,
  colorDuration: 200,
  iconDuration: 400,
  tabPopDuration: 600,
  pressDuration: 80,
  buttonReleaseDuration: 350,
  rowReleaseDuration: 300,
  buttonScale: 0.96,
  chipScale: 0.94,
  rowScale: 0.985,
  inboxScale: 0.92,
  requestScale: 0.94,
  riseDistance: 14,
  stagger: [40, 100, 160, 220, 280, 340, 400],
  agendaDuration: 550,
  agendaStagger: [220, 270, 320, 370, 420, 470],
  inviteStagger: [0, 180, 240, 300, 360, 420],
  rowDuration: 500,
  rowStagger: [0, 60, 120, 180, 240],
  growDuration: 1100,
  growDelay: 350,
  easeOut: Easing.bezier(0, 0, 0.58, 1),
  pulseDuration: 1800,
  pulseGrowDuration: 1440,
  pulseHoldDuration: 360,
  shimmerDuration: 1400,
  indicatorScale: 0.6,
  tabPopScale: 0.6,
  tabPopPeak: 1.18,
  tabPopLift: -2,
  pulseRadius: 9,
  shimmerHair: { light: '#efefeb', dark: '#212227' },
};
export function useSystemReduceMotion(enabled = true, initial = true) {
  const [reduced, setReduced] = useState(initial);
  useEffect(() => {
    if (!enabled) return;
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
  }, [enabled]);
  return reduced;
}
export function MotionView({
  children,
  recorded = false,
  revision,
  delay = 0,
  duration = motion.enterDuration,
  active = true,
  ...props
}: PropsWithChildren<
  ViewProps & {
    recorded?: boolean;
    revision?: string;
    delay?: number;
    duration?: number;
    active?: boolean;
  }
>) {
  const reduced = useMotionDisabled();
  const progress = useSharedValue(reduced || !active || recorded ? 1 : 0);
  useLayoutEffect(() => {
    cancelAnimation(progress);
    if (reduced || !active || (recorded && !revision)) {
      progress.value = 1;
      return;
    }
    progress.value = 0;
    progress.value = withDelay(
      delay,
      withTiming(1, {
        duration: recorded ? motion.recordedDuration : duration,
        easing: motion.standardEasing,
        reduceMotion: ReduceMotion.System,
      }),
      ReduceMotion.System,
    );
    return () => cancelAnimation(progress);
  }, [progress, recorded, reduced, revision, delay, duration, active]);
  const animatedStyle = useAnimatedStyle(() => ({
    opacity: reduced
      ? 1
      : recorded
        ? 0.4 + progress.value * 0.6
        : progress.value,
    transform: [
      {
        translateY:
          reduced || recorded ? 0 : (1 - progress.value) * motion.riseDistance,
      },
    ],
  }));
  return (
    <AnimatedView {...props} animatedStyle={animatedStyle}>
      {children}
    </AnimatedView>
  );
}

const MotionPolicyContext = createContext<boolean | undefined>(undefined);
export function MotionPolicyProvider({ children }: PropsWithChildren) {
  const initial = useReducedMotion();
  const system = useSystemReduceMotion(true, initial);
  const calm = useCalmMode();
  return (
    <MotionPolicyContext.Provider value={system || calm}>
      {children}
    </MotionPolicyContext.Provider>
  );
}
export function useMotionDisabled() {
  const inherited = useContext(MotionPolicyContext);
  const system = useSystemReduceMotion(inherited === undefined);
  const calm = useCalmMode();
  return inherited ?? (system || calm);
}
export function MotionHeader({
  motionKey,
  ...props
}: ViewProps & { motionKey?: string }) {
  const entry = useScreenEntrance();
  return (
    <MotionView
      {...props}
      {...entry}
      revision={`${entry.revision}:${motionKey ?? ''}`}
    />
  );
}
export function AgendaMotion(props: ViewProps) {
  return <MotionGroup {...props} kind="agenda" />;
}
function blocks(children: ReactNode): ReactNode[] {
  return Children.toArray(children).flatMap((child) =>
    isValidElement<{ children?: ReactNode }>(child) && child.type === Fragment
      ? blocks(child.props.children)
      : [child],
  );
}
const outerLayoutKeys = [
  'flex',
  'flexBasis',
  'flexGrow',
  'flexShrink',
  'alignSelf',
  'width',
  'height',
  'minWidth',
  'maxWidth',
  'minHeight',
  'maxHeight',
  'margin',
  'marginTop',
  'marginBottom',
  'marginLeft',
  'marginRight',
  'marginHorizontal',
  'marginVertical',
  'position',
  'top',
  'bottom',
  'left',
  'right',
  'zIndex',
] as const;
function MotionBlock({
  children,
  ...props
}: PropsWithChildren<React.ComponentProps<typeof MotionView>>) {
  if (
    !isValidElement<{ style?: StyleProp<ViewStyle>; className?: string }>(
      children,
    ) ||
    typeof children.props.style === 'function'
  )
    return <MotionView {...props}>{children}</MotionView>;
  if (children.type === View)
    return <MotionView {...children.props} {...props} />;
  const style = { ...StyleSheet.flatten(children.props.style) };
  const outer: ViewStyle = {};
  for (const key of outerLayoutKeys) {
    if (key in style) {
      Object.assign(outer, { [key]: style[key] });
      delete style[key];
    }
  }
  const classes = children.props.className?.split(' ') ?? [];
  const outerClasses = classes.filter((value) =>
    /^(?:flex-1|flex-auto|flex-none|flex-initial|self-|w-|h-|min-w-|max-w-|min-h-|max-h-|m[trblxy]?-)/.test(
      value,
    ),
  );
  return (
    <MotionView {...props} className={outerClasses.join(' ')} style={outer}>
      {cloneElement(children, {
        style: {
          ...style,
          ...(outer.width !== undefined ? { width: '100%' } : {}),
          ...(outer.height !== undefined ? { height: '100%' } : {}),
        },
        className: classes
          .filter((value) => !outerClasses.includes(value))
          .join(' '),
      })}
    </MotionView>
  );
}
export const entranceDelay = (index: number) =>
  motion.stagger[Math.min(index, motion.stagger.length - 1)];
const EntranceContext = createContext({ active: true, revision: 'initial' });
export function useScreenEntrance() {
  const navigation = useContext(NavigationContext);
  const [entry, setEntry] = useState({
    active: navigation?.isFocused() ?? true,
    revision: 0,
  });
  useEffect(() => {
    if (!navigation) return;
    const focus = navigation.addListener('focus', () =>
      setEntry((previous) => ({
        active: true,
        revision: previous.revision + 1,
      })),
    );
    const blur = navigation.addListener('blur', () =>
      setEntry((previous) => ({ ...previous, active: false })),
    );
    return () => {
      focus();
      blur();
    };
  }, [navigation]);
  return { active: entry.active, revision: String(entry.revision) };
}
export function MotionScrollView({
  children,
  motionKey,
  ...props
}: ScrollViewProps & { ref?: Ref<ScrollView>; motionKey?: string }) {
  const focus = useScreenEntrance();
  const entry = { ...focus, revision: `${focus.revision}:${motionKey ?? ''}` };
  return (
    <EntranceContext.Provider value={entry}>
      <ScrollView {...props}>
        {props.horizontal
          ? children
          : blocks(children).map((child, index) => (
              <MotionBlock
                key={isValidElement(child) ? (child.key ?? index) : index}
                {...entry}
                delay={entranceDelay(index)}
              >
                {child}
              </MotionBlock>
            ))}
      </ScrollView>
    </EntranceContext.Provider>
  );
}
export function MotionGroup({
  children,
  kind = 'rows',
  ...props
}: PropsWithChildren<ViewProps & { kind?: 'rows' | 'agenda' | 'invite' }>) {
  const entry = useContext(EntranceContext);
  const delays =
    kind === 'agenda'
      ? motion.agendaStagger
      : kind === 'invite'
        ? motion.inviteStagger
        : motion.rowStagger;
  return (
    <AnimatedView {...props}>
      {blocks(children).map((child, index) => (
        <MotionBlock
          key={isValidElement(child) ? (child.key ?? index) : index}
          {...entry}
          delay={delays[Math.min(index, delays.length - 1)]}
          duration={
            kind === 'agenda'
              ? motion.agendaDuration
              : kind === 'invite'
                ? motion.enterDuration
                : motion.rowDuration
          }
        >
          {child}
        </MotionBlock>
      ))}
    </AnimatedView>
  );
}
export function MotionPressable({
  motionKind = 'row',
  style,
  onPressIn,
  onPressOut,
  disabled,
  ...props
}: PressableProps & {
  motionKind?: 'button' | 'row' | 'chip' | 'inbox' | 'request';
}) {
  const reduced = useMotionDisabled();
  const scale = useSharedValue(1);
  const [pressed, setPressed] = useState(false);
  useEffect(() => {
    if (reduced || disabled) {
      cancelAnimation(scale);
      scale.value = 1;
    }
    return () => cancelAnimation(scale);
  }, [reduced, disabled, scale]);
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: reduced || disabled ? 1 : scale.value }],
  }));
  const update = (down: boolean) => {
    setPressed(down);
    cancelAnimation(scale);
    scale.set(
      reduced || disabled
        ? 1
        : withTiming(down ? motion[`${motionKind}Scale`] : 1, {
            duration:
              motionKind === 'button'
                ? down
                  ? motion.pressDuration
                  : motion.buttonReleaseDuration
                : motionKind === 'inbox' || motionKind === 'request'
                  ? motion.buttonReleaseDuration
                  : motion.rowReleaseDuration,
            easing: motion.springEasing,
            reduceMotion: ReduceMotion.System,
          }),
    );
  };
  return (
    <AnimatedPressableView
      {...props}
      disabled={disabled}
      onPressIn={(event) => {
        update(true);
        onPressIn?.(event);
      }}
      onPressOut={(event) => {
        update(false);
        onPressOut?.(event);
      }}
      style={typeof style === 'function' ? style({ pressed }) : style}
      animatedStyle={animatedStyle}
    />
  );
}
export function TabMotion({
  children,
  selected,
  indicator = false,
  revision,
  inactive,
  ...props
}: PropsWithChildren<
  ViewProps & {
    selected: boolean;
    indicator?: boolean;
    revision?: string;
    inactive?: React.ReactNode;
  }
>) {
  const reduced = useMotionDisabled();
  const scale = useSharedValue(indicator ? motion.indicatorScale : 1);
  const opacity = useSharedValue(selected ? 1 : 0);
  const pop = useSharedValue(1);
  const lift = useSharedValue(0);
  useEffect(() => {
    cancelAnimation(scale);
    cancelAnimation(opacity);
    cancelAnimation(pop);
    cancelAnimation(lift);
    if (reduced) {
      scale.value = 1;
      opacity.value = selected ? 1 : 0;
      pop.value = 1;
      lift.value = 0;
      return;
    }
    scale.value = withTiming(selected ? 1 : motion.indicatorScale, {
      duration: motion.indicatorDuration,
      easing: motion.springEasing,
      reduceMotion: ReduceMotion.System,
    });
    opacity.value = withTiming(selected ? 1 : 0, {
      duration: motion.colorDuration,
      easing: motion.ease,
      reduceMotion: ReduceMotion.System,
    });
    if (selected && !indicator) {
      const timing = (duration: number) => ({
        duration,
        easing: motion.springEasing,
        reduceMotion: ReduceMotion.System,
      });
      pop.value = motion.tabPopScale;
      lift.value = 0;
      pop.value = withSequence(
        withTiming(motion.tabPopPeak, timing(motion.tabPopDuration * 0.6)),
        withTiming(1, timing(motion.tabPopDuration * 0.4)),
      );
      lift.value = withSequence(
        withTiming(motion.tabPopLift, timing(motion.tabPopDuration * 0.6)),
        withTiming(0, timing(motion.tabPopDuration * 0.4)),
      );
    } else {
      pop.value = withTiming(1, {
        duration: motion.iconDuration,
        easing: motion.springEasing,
      });
      lift.value = withTiming(0, {
        duration: motion.iconDuration,
        easing: motion.springEasing,
      });
    }
    return () => {
      cancelAnimation(scale);
      cancelAnimation(opacity);
      cancelAnimation(pop);
      cancelAnimation(lift);
    };
  }, [selected, reduced, indicator, revision, scale, opacity, pop, lift]);
  const animatedStyle = useAnimatedStyle(() => ({
    opacity: indicator ? (reduced ? (selected ? 1 : 0) : opacity.value) : 1,
    transform: [
      { scale: reduced ? 1 : indicator ? scale.value : pop.value },
      { translateY: reduced || indicator ? 0 : lift.value },
    ],
  }));
  const activeStyle = useAnimatedStyle(() => ({
    opacity: reduced ? (selected ? 1 : 0) : opacity.value,
  }));
  const inactiveStyle = useAnimatedStyle(() => ({
    opacity: reduced ? (selected ? 0 : 1) : 1 - opacity.value,
  }));
  return (
    <AnimatedView {...props} animatedStyle={animatedStyle}>
      {inactive ? (
        <>
          <Animated.View style={activeStyle}>{children}</Animated.View>
          <Animated.View style={[{ position: 'absolute' }, inactiveStyle]}>
            {inactive}
          </Animated.View>
        </>
      ) : (
        children
      )}
    </AnimatedView>
  );
}
export function PulseDot({ color, pulse }: { color: string; pulse: boolean }) {
  const reduced = useMotionDisabled();
  const progress = useSharedValue(0);
  useEffect(() => {
    cancelAnimation(progress);
    progress.value = 0;
    if (pulse && !reduced)
      progress.value = withRepeat(
        withSequence(
          withTiming(1, {
            duration: motion.pulseGrowDuration,
            easing: motion.easeOut,
            reduceMotion: ReduceMotion.System,
          }),
          withTiming(1, {
            duration: motion.pulseHoldDuration,
            easing: motion.easeOut,
            reduceMotion: ReduceMotion.System,
          }),
        ),
        -1,
        false,
      );
    return () => cancelAnimation(progress);
  }, [progress, pulse, reduced]);
  const animatedStyle = useAnimatedStyle(() => ({
    opacity: reduced ? 0 : 0.55 * (1 - progress.value),
    transform: [
      {
        scale: 1 + (progress.value * motion.pulseRadius) / 4,
      },
    ],
  }));
  return (
    <Animated.View
      style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }}
    >
      {pulse && (
        <Animated.View
          style={[
            {
              position: 'absolute',
              width: 8,
              height: 8,
              borderRadius: 4,
              backgroundColor: 'rgb(34,165,90)',
            },
            animatedStyle,
          ]}
        />
      )}
      <Animated.View
        style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }}
      />
    </Animated.View>
  );
}
export function Shimmer({ style, children, ...props }: ViewProps) {
  const reduced = useMotionDisabled();
  const { colors, scheme } = useTheme();
  const id = useId().replace(/:/g, '');
  const progress = useSharedValue(0);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    cancelAnimation(progress);
    progress.value = 0;
    if (!reduced)
      progress.value = withRepeat(
        withTiming(1, {
          duration: motion.shimmerDuration,
          easing: Easing.linear,
          reduceMotion: ReduceMotion.System,
        }),
        -1,
        false,
      );
    return () => cancelAnimation(progress);
  }, [progress, reduced]);
  const animatedStyle = useAnimatedStyle(() => ({
    opacity: reduced ? 0 : 1,
    transform: [{ translateX: (-2 + progress.value * 6) * width }],
  }));
  return (
    <AnimatedView
      {...props}
      onLayout={(event) => {
        setWidth(event.nativeEvent.layout.width);
        props.onLayout?.(event);
      }}
      style={[style, { overflow: 'hidden' }]}
    >
      {children}
      <Animated.View
        pointerEvents="none"
        style={[
          {
            position: 'absolute',
            top: 0,
            bottom: 0,
            width: '900%',
            left: '-600%',
          },
          animatedStyle,
        ]}
      >
        <Svg width="100%" height="100%">
          <Defs>
            <LinearGradient id={id} x1="0%" y1="0%" x2="100%" y2="0%">
              <Stop offset="0%" stopColor={colors.sunken} />
              <Stop offset="40%" stopColor={motion.shimmerHair[scheme]} />
              <Stop offset="80%" stopColor={colors.sunken} />
            </LinearGradient>
          </Defs>
          {[0, 1, 2].map((index) => (
            <Rect
              key={index}
              x={`${(index * 100) / 3}%`}
              width="33.333333%"
              height="100%"
              fill={`url(#${id})`}
            />
          ))}
        </Svg>
      </Animated.View>
    </AnimatedView>
  );
}

export function GrowX({ children, ...props }: PropsWithChildren<ViewProps>) {
  const reduced = useMotionDisabled();
  const entry = useContext(EntranceContext);
  const progress = useSharedValue(1);
  useEffect(() => {
    cancelAnimation(progress);
    if (reduced || !entry.active) {
      progress.value = 1;
      return;
    }
    progress.value = 0;
    progress.value = withDelay(
      motion.growDelay,
      withTiming(1, {
        duration: motion.growDuration,
        easing: motion.standardEasing,
        reduceMotion: ReduceMotion.System,
      }),
      ReduceMotion.System,
    );
    return () => cancelAnimation(progress);
  }, [progress, reduced, entry.active, entry.revision]);
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scaleX: reduced ? 1 : progress.value }],
    transformOrigin: 'left center',
  }));
  return (
    <AnimatedView {...props} animatedStyle={animatedStyle}>
      {children}
    </AnimatedView>
  );
}
