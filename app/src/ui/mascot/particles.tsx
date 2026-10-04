import { useState } from 'react';
import { StyleSheet } from 'react-native';
import Animated from 'react-native-reanimated';
import { useTimeline } from './animation';
import { type Timeline } from './keyframes';

const colors = [
  '#e0561b',
  '#ff7a1f',
  '#ffb23d',
  '#5b3a29',
  '#1f9d55',
  '#f6d9b8',
];
export function confettiTimeline(
  dx: number,
  dy: number,
  rotation: number,
): Timeline {
  return {
    duration: 1800,
    easing: [0.15, 0.7, 0.3, 1],
    frames: {
      x: [
        [0, 0],
        [45, dx],
        [100, dx * 1.1],
      ],
      y: [
        [0, 0],
        [45, dy],
        [100, dy + 220],
      ],
      r: [
        [0, 0],
        [45, rotation * 0.6],
        [100, rotation],
      ],
      sx: [
        [0, 0.4],
        [45, 1],
        [100, 0.9],
      ],
      sy: [
        [0, 0.4],
        [45, 1],
        [100, 0.9],
      ],
      opacity: [
        [0, 1],
        [45, 1],
        [100, 0],
      ],
    },
  };
}
export function sparkTimeline(index: number): Timeline {
  const angle = (index / 12) * Math.PI * 2;
  return {
    duration: 700,
    easing: [0, 0, 0.58, 1],
    frames: {
      x: [
        [0, 0],
        [100, Math.cos(angle) * 46],
      ],
      y: [
        [0, 0],
        [100, Math.sin(angle) * 46],
      ],
      sx: [
        [0, 1],
        [100, 0.2],
      ],
      sy: [
        [0, 1],
        [100, 0.2],
      ],
      opacity: [
        [0, 1],
        [100, 0],
      ],
    },
  };
}
function Confetti({ index }: { index: number }) {
  const [particle] = useState(() => {
    const angle = ((Math.random() * 140 + 200) * Math.PI) / 180;
    const distance = 140 + Math.random() * 180;
    return {
      timeline: confettiTimeline(
        Math.round(Math.cos(angle) * distance),
        Math.round(Math.sin(angle) * distance),
        Math.round(Math.random() * 720 - 360),
      ),
      delay: Math.round(Math.random() * 120),
    };
  });
  const animation = useTimeline(particle.timeline, true, {
    repeat: false,
    delay: particle.delay,
  });
  const shape = index % 3;
  return (
    <Animated.View
      style={[
        styles.bit,
        {
          backgroundColor: colors[index % colors.length],
          width: shape === 1 ? 6 : 10,
          height: shape === 1 ? 14 : 10,
          borderRadius: shape === 0 ? 5 : 2,
        },
        animation.style,
      ]}
    />
  );
}
function Spark({ index }: { index: number }) {
  const [timeline] = useState(() => sparkTimeline(index));
  const animation = useTimeline(timeline, true, { repeat: false });
  return (
    <Animated.View
      style={[
        styles.spark,
        { backgroundColor: colors[index % 4] },
        animation.style,
      ]}
    />
  );
}
export function CelebrationParticles() {
  return (
    <>
      {Array.from({ length: 34 }, (_, index) => (
        <Confetti key={`bit-${index}`} index={index} />
      ))}
      {Array.from({ length: 12 }, (_, index) => (
        <Spark key={`spark-${index}`} index={index} />
      ))}
    </>
  );
}
const styles = StyleSheet.create({
  bit: { position: 'absolute', left: -5, top: -5 },
  spark: {
    position: 'absolute',
    left: -3,
    top: -3,
    width: 6,
    height: 6,
    borderRadius: 3,
  },
});
