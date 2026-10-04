import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PropsWithChildren,
} from 'react';
import { AccessibilityInfo } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from './text';
import Animated, {
  ReduceMotion,
  cancelAnimation,
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  withSequence,
} from 'react-native-reanimated';
import { motion, useMotionDisabled } from './motion';
import { Mascot } from './mascot';
import { useCalmMode } from './calm-mode';
import { GradientBackground } from './gradient-background';
import { tokens, useTheme } from './theme';
const ToastContext = createContext<(message: string) => void>(() => {});
export function ToastProvider({ children }: PropsWithChildren) {
  const [message, setMessage] = useState<{
    text: string;
    revision: number;
  } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const insets = useSafeAreaInsets();
  const show = useCallback((value: string) => {
    if (timer.current) clearTimeout(timer.current);
    setMessage((previous) => ({
      text: value,
      revision: (previous?.revision ?? 0) + 1,
    }));
    AccessibilityInfo.announceForAccessibility(value);
    timer.current = setTimeout(() => setMessage(null), tokens.duration.toast);
  }, []);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  return (
    <ToastContext.Provider value={show}>
      {children}
      {message && (
        <ToastMessage
          message={message.text}
          revision={message.revision}
          bottom={insets.bottom + 118}
        />
      )}
    </ToastContext.Provider>
  );
}
function ToastMessage({
  message,
  revision,
  bottom,
}: {
  message: string;
  revision: number;
  bottom: number;
}) {
  const disabled = useMotionDisabled();
  const calm = useCalmMode();
  const { scheme } = useTheme();
  const progress = useSharedValue(disabled ? 1 : 0);
  const face = useSharedValue(disabled ? 1 : 0);
  useLayoutEffect(() => {
    cancelAnimation(progress);
    cancelAnimation(face);
    if (disabled) {
      progress.value = 1;
      face.value = 1;
      return;
    }
    progress.value = 0;
    face.value = 0;
    progress.value = withTiming(1, {
      duration: motion.enterDuration,
      easing: motion.springEasing,
      reduceMotion: ReduceMotion.System,
    });
    face.value = withDelay(
      150,
      withSequence(
        withTiming(0.6, {
          duration: 420,
          easing: motion.springEasing,
          reduceMotion: ReduceMotion.System,
        }),
        withTiming(1, {
          duration: 280,
          easing: motion.springEasing,
          reduceMotion: ReduceMotion.System,
        }),
      ),
      ReduceMotion.System,
    );
    return () => {
      cancelAnimation(progress);
      cancelAnimation(face);
    };
  }, [disabled, revision, progress, face]);
  const style = useAnimatedStyle(() => ({
    opacity: disabled ? 1 : progress.value,
    transform: [
      { translateY: disabled ? 0 : 30 * (1 - progress.value) },
      { scale: disabled ? 1 : 0.85 + 0.15 * progress.value },
    ],
  }));
  const faceStyle = useAnimatedStyle(() => {
    const p = disabled ? 1 : face.value;
    const first = p <= 0.6;
    return {
      opacity: disabled ? 1 : Math.min(1, p / 0.6),
      transform: [
        {
          translateY: first ? 12 - (18 * p) / 0.6 : -6 + (6 * (p - 0.6)) / 0.4,
        },
        {
          rotate: `${first ? -12 + (18 * p) / 0.6 : 6 - (6 * (p - 0.6)) / 0.4}deg`,
        },
        {
          scale: first
            ? 0.6 + (0.48 * p) / 0.6
            : 1.08 - (0.08 * (p - 0.6)) / 0.4,
        },
      ],
    };
  });
  return (
    <Animated.View
      testID="toast"
      pointerEvents="none"
      style={[
        {
          position: 'absolute',
          bottom,
          alignSelf: 'center',
          maxWidth: '92%',
          flexDirection: 'row',
          alignItems: 'center',
          borderRadius: 20,
          paddingVertical: 10,
          paddingLeft: 12,
          paddingRight: 16,
          gap: 10,
        },
        style,
      ]}
    >
      <GradientBackground
        start={scheme === 'dark' ? '#26272e' : '#262b45'}
        end={scheme === 'dark' ? '#18191d' : '#141726'}
        radius={20}
      />
      {!calm && (
        <Animated.View
          style={[
            { width: 36, marginTop: -14, marginBottom: -8, marginLeft: -4 },
            faceStyle,
          ]}
        >
          <Mascot pose="front" size={36} />
        </Animated.View>
      )}
      <Text
        style={{
          color: scheme === 'dark' ? '#f2f2f3' : '#f4f5fb',
          flexShrink: 1,
          lineHeight: 20.25,
        }}
      >
        {message}
      </Text>
    </Animated.View>
  );
}
export const useToast = () => useContext(ToastContext);
