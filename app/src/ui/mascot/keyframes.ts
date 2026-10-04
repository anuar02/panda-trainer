export const sleepMarker = 'z';
export const poseMotion = {
  front: 'idle',
  wave: 'wave',
  thumbs: 'nod',
  jump: 'hop',
  sit: 'breathe',
  clipboard: 'idle',
  stretch: 'sway',
  sleep: 'sleep',
  side: 'idle',
  'three-quarter': 'idle',
} as const;
export type MotionMode = (typeof poseMotion)[keyof typeof poseMotion];
export type Track = readonly (readonly [number, number])[];
export type Frames = Partial<
  Record<'x' | 'y' | 'sx' | 'sy' | 'r' | 'opacity', Track>
>;
export type Timeline = {
  duration: number;
  easing: readonly [number, number, number, number];
  frames: Frames;
};
const smooth = [0.42, 0, 0.58, 1] as const;
const spring = [0.34, 1.56, 0.64, 1] as const;
const pulse = (value: number): Track => [
  [0, 1],
  [50, value],
  [100, 1],
];
export const timelines = {
  idle: {
    duration: 3400,
    easing: smooth,
    frames: {
      y: [
        [0, 0],
        [50, -5],
        [100, 0],
      ],
      sx: pulse(1.01),
      sy: pulse(0.995),
    },
  },
  shadowIdle: {
    duration: 3400,
    easing: smooth,
    frames: { sx: pulse(0.86), sy: pulse(0.86), opacity: pulse(0.75) },
  },
  breathe: {
    duration: 3000,
    easing: smooth,
    frames: { sx: pulse(1.015), sy: pulse(1.03) },
  },
  wave: {
    duration: 2400,
    easing: smooth,
    frames: {
      r: [
        [0, 0],
        [15, -4],
        [30, 3],
        [45, -3],
        [60, 2],
        [75, 0],
        [100, 0],
      ],
      y: [
        [0, 0],
        [15, 0],
        [30, 0],
        [45, 0],
        [60, 0],
        [75, -3],
        [100, 0],
      ],
    },
  },
  nod: {
    duration: 2600,
    easing: [0.2, 0.8, 0.2, 1],
    frames: {
      y: [
        [0, 0],
        [60, 0],
        [70, 2],
        [82, -8],
        [92, 0],
        [100, 0],
      ],
      sx: [
        [0, 1],
        [60, 1],
        [70, 1.03],
        [82, 0.98],
        [92, 1.01],
        [100, 1],
      ],
      sy: [
        [0, 1],
        [60, 1],
        [70, 0.96],
        [82, 1.03],
        [92, 0.99],
        [100, 1],
      ],
    },
  },
  hop: {
    duration: 1300,
    easing: [0.3, 0, 0.5, 1],
    frames: {
      y: [
        [0, 0],
        [15, 0],
        [50, -22],
        [85, 0],
        [100, 0],
      ],
      sx: [
        [0, 1.06],
        [15, 0.96],
        [50, 0.98],
        [85, 1.04],
        [100, 1.06],
      ],
      sy: [
        [0, 0.92],
        [15, 1.05],
        [50, 1.03],
        [85, 0.95],
        [100, 0.92],
      ],
    },
  },
  shadowHop: {
    duration: 1300,
    easing: [0.3, 0, 0.5, 1],
    frames: {
      sx: [
        [0, 1],
        [15, 1],
        [50, 0.6],
        [85, 1],
        [100, 1],
      ],
      sy: [
        [0, 1],
        [15, 1],
        [50, 0.6],
        [85, 1],
        [100, 1],
      ],
      opacity: [
        [0, 1],
        [15, 1],
        [50, 0.45],
        [85, 1],
        [100, 1],
      ],
    },
  },
  sway: {
    duration: 3200,
    easing: smooth,
    frames: {
      r: [
        [0, -3],
        [50, 3],
        [100, -3],
      ],
    },
  },
  sleep: {
    duration: 4000,
    easing: smooth,
    frames: { sx: pulse(1.02), sy: pulse(1.05) },
  },
  glow: {
    duration: 4000,
    easing: smooth,
    frames: {
      sx: [
        [0, 0.94],
        [50, 1.06],
        [100, 0.94],
      ],
      sy: [
        [0, 0.94],
        [50, 1.06],
        [100, 0.94],
      ],
      opacity: [
        [0, 0.85],
        [50, 1],
        [100, 0.85],
      ],
    },
  },
  z: {
    duration: 3600,
    easing: [0.42, 0, 1, 1],
    frames: {
      x: [
        [0, 0],
        [100, 22],
      ],
      y: [
        [0, 0],
        [100, -56],
      ],
      sx: [
        [0, 0.6],
        [100, 1.2],
      ],
      sy: [
        [0, 0.6],
        [100, 1.2],
      ],
      r: [
        [0, 0],
        [100, 12],
      ],
      opacity: [
        [0, 0],
        [20, 1],
        [100, 0],
      ],
    },
  },
  enter: {
    duration: 800,
    easing: spring,
    frames: {
      y: [
        [0, 26],
        [100, 0],
      ],
      sx: [
        [0, 0.7],
        [100, 1],
      ],
      sy: [
        [0, 0.7],
        [100, 1],
      ],
      opacity: [
        [0, 0],
        [60, 1],
        [100, 1],
      ],
    },
  },
  poke: {
    duration: 700,
    easing: spring,
    frames: {
      sx: [
        [0, 1],
        [25, 1.12],
        [55, 0.92],
        [80, 1.04],
        [100, 1],
      ],
      sy: [
        [0, 1],
        [25, 0.86],
        [55, 1.1],
        [80, 0.97],
        [100, 1],
      ],
      y: [
        [0, 0],
        [25, 4],
        [55, -16],
        [80, 0],
        [100, 0],
      ],
      r: [
        [0, 0],
        [25, 0],
        [55, -4],
        [80, 2],
        [100, 0],
      ],
    },
  },
  fxPanda: {
    duration: 2200,
    easing: spring,
    frames: {
      y: [
        [0, 260],
        [22, 0],
        [78, 0],
        [100, 280],
      ],
      sx: [
        [0, 0.8],
        [22, 1],
        [78, 1],
        [100, 0.9],
      ],
      sy: [
        [0, 0.8],
        [22, 1],
        [78, 1],
        [100, 0.9],
      ],
      opacity: [
        [0, 1],
        [78, 1],
        [100, 0],
      ],
    },
  },
  fxFade: {
    duration: 2200,
    easing: [0.25, 0.1, 0.25, 1],
    frames: {
      opacity: [
        [0, 0],
        [8, 1],
        [85, 1],
        [100, 0],
      ],
    },
  },
} satisfies Record<string, Timeline>;
export function motionForPose(pose: string): MotionMode | undefined {
  return Object.hasOwn(poseMotion, pose)
    ? poseMotion[pose as keyof typeof poseMotion]
    : undefined;
}
export function mascotPolicy(
  pose: string,
  calm: boolean,
  reduced: boolean,
  context?: string,
) {
  return {
    visible: !calm || context === 'empty' || context === 'onboarding',
    animated: !calm && !reduced && motionForPose(pose) !== undefined,
  };
}
export function sampleTrack(
  track: Track | undefined,
  percent: number,
  easing: (value: number) => number,
  fallback: number,
) {
  'worklet';
  if (!track?.length) return fallback;
  if (percent <= track[0]![0]) return track[0]![1];
  for (let i = 1; i < track.length; i++) {
    const [end, value] = track[i]!;
    const [start, previous] = track[i - 1]!;
    if (percent <= end)
      return (
        previous +
        (value - previous) * easing((percent - start) / (end - start))
      );
  }
  return track[track.length - 1]![1];
}
