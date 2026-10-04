import { Image, type ImageProps } from 'expo-image';
import { useContext, useEffect, useState } from 'react';
import { NavigationContext } from 'expo-router/react-navigation';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';
import Svg, {
  Defs,
  Ellipse,
  RadialGradient,
  Stop,
  Text as SvgText,
} from 'react-native-svg';
import { useTimeline } from './animation';
import { sleepMarker, timelines, type MotionMode } from './keyframes';

export function useMascotFocus() {
  const navigation = useContext(NavigationContext);
  const [focused, setFocused] = useState(() => navigation?.isFocused() ?? true);
  useEffect(() => {
    if (!navigation) return;
    const focus = navigation.addListener('focus', () => setFocused(true));
    const blur = navigation.addListener('blur', () => setFocused(false));
    return () => {
      focus();
      blur();
    };
  }, [navigation]);
  return focused;
}

export function Gradient({ shadow = false }: { shadow?: boolean }) {
  return (
    <Svg
      width="100%"
      height="100%"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
    >
      <Defs>
        <RadialGradient
          id="gradient"
          cx="50%"
          cy="50%"
          r={shadow ? '50%' : '70%'}
        >
          {shadow
            ? [
                <Stop
                  key="start"
                  offset="0"
                  stopColor="#5a280a"
                  stopOpacity={0.28}
                />,
                <Stop
                  key="end"
                  offset="1"
                  stopColor="#5a280a"
                  stopOpacity={0}
                />,
              ]
            : [
                <Stop
                  key="start"
                  offset="0"
                  stopColor="#ffb23d"
                  stopOpacity={0.35}
                />,
                <Stop
                  key="middle"
                  offset="45%"
                  stopColor="#ff7a1f"
                  stopOpacity={0.12}
                />,
                <Stop
                  key="end"
                  offset="70%"
                  stopColor="#ff7a1f"
                  stopOpacity={0}
                />,
              ]}
        </RadialGradient>
      </Defs>
      <Ellipse cx="50" cy="50" rx="50" ry="50" fill="url(#gradient)" />
    </Svg>
  );
}

function SleepZ({ index, enabled }: { index: number; enabled: boolean }) {
  const animation = useTimeline(timelines.z, enabled, { delay: index * 1200 });
  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.zLetter, animation.style]}
    >
      <Svg width={24} height={24}>
        <SvgText
          x="0"
          y="18"
          fill="#b8866a"
          fontFamily="Montserrat_800ExtraBold"
          fontWeight="800"
          fontSize={[15, 14, 18][index]}
        >
          {sleepMarker}
        </SvgText>
      </Svg>
    </Animated.View>
  );
}

export function PngMotion({
  mode,
  entering = true,
  size,
  style,
  source,
  ...props
}: ImageProps & { mode: MotionMode; size: number; entering?: boolean }) {
  const focused = useMascotFocus();
  const body = useTimeline(timelines[mode], focused, {
    rotationFirst: mode === 'wave',
  });
  const shadow = useTimeline(
    mode === 'hop' ? timelines.shadowHop : timelines.shadowIdle,
    focused && (mode === 'idle' || mode === 'hop'),
  );
  const glow = useTimeline(timelines.glow, focused);
  const enter = useTimeline(timelines.enter, focused && entering, {
    repeat: false,
    delay: 120,
  });
  const poke = useTimeline(timelines.poke, focused, {
    repeat: false,
    initial: 100,
    scaleFirst: true,
  });
  const flattened = StyleSheet.flatten(style);
  const height =
    typeof flattened?.height === 'number' ? flattened.height : size;
  const width = typeof flattened?.width === 'number' ? flattened.width : size;
  return (
    <Animated.View
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[{ width: size, height: size }, style, enter.style]}
    >
      <Animated.View
        pointerEvents="none"
        style={[
          {
            position: 'absolute',
            left: '50%',
            top: '50%',
            width: '92%',
            height: width * 0.92,
            marginLeft: -width * 0.46,
            marginTop: -width * 0.92 * 0.48,
          },
          glow.style,
        ]}
      >
        <Gradient />
      </Animated.View>
      <Animated.View
        pointerEvents="none"
        style={[
          {
            position: 'absolute',
            bottom: -3,
            left: '21%',
            width: '58%',
            height: 12,
          },
          shadow.style,
        ]}
      >
        <Gradient shadow />
      </Animated.View>
      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          { transformOrigin: '50% 100%' },
          body.style,
        ]}
      >
        <Pressable
          accessible={false}
          onPress={poke.restart}
          style={StyleSheet.absoluteFill}
        >
          <Animated.View
            style={[
              StyleSheet.absoluteFill,
              { transformOrigin: '50% 100%' },
              poke.style,
            ]}
          >
            <Image
              {...props}
              source={source}
              accessible={false}
              contentFit="contain"
              contentPosition="bottom center"
              style={{ width, height }}
            />
          </Animated.View>
        </Pressable>
      </Animated.View>
      {mode === 'sleep' && (
        <View pointerEvents="none" style={styles.z}>
          {[0, 1, 2].map((index) => (
            <SleepZ key={index} index={index} enabled={focused} />
          ))}
        </View>
      )}
    </Animated.View>
  );
}
const styles = StyleSheet.create({
  z: { position: 'absolute', right: '8%', top: 0, width: 40, height: 60 },
  zLetter: { position: 'absolute', left: 0, bottom: 0 },
});
