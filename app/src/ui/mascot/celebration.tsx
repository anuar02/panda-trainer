import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Mascot } from '../mascot';
import { useCelebrationsEnabled } from '../calm-mode';
import Animated from 'react-native-reanimated';
import { useSystemReduceMotion } from '../motion';
import { useTimeline } from './animation';
import { timelines } from './keyframes';
import { CelebrationParticles } from './particles';
import { useMascotFocus } from './png-motion';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';

type Props = { finished: boolean; hidden?: boolean };

export function MascotCelebration({ finished, hidden = false }: Props) {
  const celebrationsEnabled = useCelebrationsEnabled();
  const suppressed = hidden || !celebrationsEnabled;
  const previous = useRef(finished);
  const [visible, setVisible] = useState(false);
  const reduced = useSystemReduceMotion();
  const focused = useMascotFocus();
  useEffect(() => {
    const completed = finished && !previous.current;
    previous.current = finished;
    if (!completed || suppressed || reduced || !focused) return;
    setVisible(true);
    const timer = setTimeout(() => setVisible(false), 2200);
    return () => {
      clearTimeout(timer);
      setVisible(false);
    };
  }, [finished, suppressed, reduced, focused]);
  if (!visible || suppressed || reduced || !focused) return null;
  return <CelebrationMotion />;
}

function CelebrationMotion() {
  const [bounds, setBounds] = useState({ width: 390, height: 844 });
  const fade = useTimeline(timelines.fxFade, true, { repeat: false });
  const panda = useTimeline(timelines.fxPanda, true, { repeat: false });
  return (
    <Animated.View
      onLayout={({ nativeEvent: { layout } }) =>
        setBounds((previous) =>
          previous.width === layout.width && previous.height === layout.height
            ? previous
            : { width: layout.width, height: layout.height },
        )
      }
      pointerEvents="none"
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.overlay, fade.style]}
    >
      <Svg
        width="100%"
        height="100%"
        viewBox={`0 0 ${bounds.width} ${bounds.height}`}
        style={StyleSheet.absoluteFill}
      >
        <Defs>
          <RadialGradient
            id="celebration-glow"
            gradientUnits="userSpaceOnUse"
            cx={bounds.width / 2}
            cy={bounds.height * 0.7}
            r={Math.hypot(bounds.width / 2, bounds.height * 0.7)}
          >
            <Stop offset="0" stopColor="#ffb23d" stopOpacity={0.2} />
            <Stop offset="60%" stopColor="#ffb23d" stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect
          width={bounds.width}
          height={bounds.height}
          fill="url(#celebration-glow)"
        />
      </Svg>
      <View style={styles.burst}>
        <CelebrationParticles />
      </View>
      <Animated.View style={[styles.panda, panda.style]}>
        <Mascot
          pose="jump"
          clipPlace="celebration"
          size={170}
          context="celebration"
          style={{ height: 200 }}
        />
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 200,
    borderRadius: 36,
    overflow: 'hidden',
  },
  burst: { position: 'absolute', left: '50%', top: '62%', width: 0, height: 0 },
  panda: {
    position: 'absolute',
    left: '50%',
    bottom: 170,
    width: 170,
    height: 200,
    marginLeft: -85,
  },
});
