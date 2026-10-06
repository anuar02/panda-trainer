import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { View } from 'react-native';
import {
  cancelAnimation,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { Mascot } from '../src/ui/mascot';
import { MascotCelebration } from '../src/ui/mascot/celebration';
import {
  mascotPolicy,
  motionForPose,
  poseMotion,
  sampleTrack,
  timelines,
  type Timeline,
} from '../src/ui/mascot/keyframes';
import { confettiTimeline, sparkTimeline } from '../src/ui/mascot/particles';

let mockReduced = false;
let mockCalm = false;
jest.mock('../src/ui/motion', () => ({
  useSystemReduceMotion: () => mockReduced,
}));
jest.mock('../src/ui/calm-mode', () => ({
  useCalmMode: () => mockCalm,
  useCelebrationsEnabled: () => !mockCalm,
}));
jest.mock('expo-image', () => {
  const { View: MockView } =
    jest.requireActual<typeof import('react-native')>('react-native');
  return { Image: (props: object) => <MockView {...props} /> };
});

beforeEach(() => {
  mockReduced = false;
  mockCalm = false;
  jest.clearAllMocks();
});
afterEach(() => jest.useRealTimers());

const css = readFileSync(
  resolve(__dirname, '../../prototype-fresh/css/fresh.css'),
  'utf8',
);
const prototype = readFileSync(
  resolve(__dirname, '../../prototype-fresh/js/mascot.js'),
  'utf8',
);
const names = {
  idle: 'pandaIdle',
  shadowIdle: 'shadowIdle',
  breathe: 'pandaBreathe',
  wave: 'pandaWave',
  nod: 'pandaNod',
  hop: 'pandaHop',
  shadowHop: 'shadowHop',
  sway: 'pandaSway',
  sleep: 'pandaSleep',
  glow: 'glowPulse',
  z: 'zFloat',
  enter: 'pandaIn',
  poke: 'poke',
  fxPanda: 'fxPanda',
  fxFade: 'fxFade',
};

test('all ten pose modes match the prototype table; faces and back have no motion', () => {
  for (const [pose, mode] of Object.entries(poseMotion)) {
    expect(prototype).toMatch(
      new RegExp(
        `(?:'${pose}'|${pose}): \\{ w: \\d+, h: \\d+, motion: '${mode}' \\}`,
      ),
    );
    expect(motionForPose(pose)).toBe(mode);
  }
  for (const face of [
    'neutral',
    'laugh',
    'excited',
    'smile',
    'calm',
    'worried',
    'surprised',
    'sad',
    'back',
    'face-smile',
  ])
    expect(motionForPose(face)).toBeUndefined();
});

test.each(Object.entries(names))(
  '%s tracks retain every prototype property stop',
  (key, name) => {
    const timeline: Timeline = timelines[key as keyof typeof names];
    const remainder = css.split(`@keyframes ${name} {`)[1]!;
    let depth = 1;
    let end = 0;
    while (depth && end < remainder.length) {
      if (remainder[end] === '{') depth++;
      if (remainder[end] === '}') depth--;
      end++;
    }
    const block = remainder.slice(0, end - 1);
    const declarations = [...block.matchAll(/([\d%,\s]+)\{([^}]+)\}/g)];
    const expected: Record<string, [number, number][]> = {};
    for (const [, selectors, declaration] of declarations) {
      const points = [...selectors!.matchAll(/(\d+)%/g)].map((match) =>
        Number(match[1]),
      );
      const values: Record<string, number> = {};
      const opacity = declaration!.match(/opacity:\s*([\d.]+)/);
      if (opacity) values.opacity = Number(opacity[1]);
      if (declaration!.includes('transform:')) {
        Object.assign(values, { x: 0, y: 0, sx: 1, sy: 1, r: 0 });
        const translateY = declaration!.match(/translateY\(([-\d.]+)px\)/);
        if (translateY) values.y = Number(translateY[1]);
        const translate = declaration!.match(
          /translate\(([-\d.]+)(?:px)?,\s*([-\d.]+)(?:px)?\)/,
        );
        if (translate) {
          values.x = Number(translate[1]);
          values.y = Number(translate[2]);
        }
        const rotation = declaration!.match(/rotate\(([-\d.]+)deg\)/);
        if (rotation) values.r = Number(rotation[1]);
        const scale = declaration!.match(/scale\(([\d.]+)(?:,\s*([\d.]+))?\)/);
        if (scale) {
          values.sx = Number(scale[1]);
          values.sy = Number(scale[2] ?? scale[1]);
        }
      }
      for (const [property, value] of Object.entries(values)) {
        expected[property] ??= [];
        for (const percent of points)
          expected[property]!.push([percent, value]);
      }
    }
    for (const [property, track] of Object.entries(expected)) {
      const actual = timeline.frames[property as keyof Timeline['frames']];
      const sorted = track.sort((a, b) => a[0] - b[0]);
      if (sorted[0]![0] !== 0)
        sorted.unshift([
          0,
          property === 'opacity' || property.startsWith('s') ? 1 : 0,
        ]);
      if (actual) expect(actual).toEqual(sorted);
      else
        expect(
          sorted.every(
            ([, value]) =>
              value ===
              (property === 'opacity' || property.startsWith('s') ? 1 : 0),
          ),
        ).toBe(true);
    }
  },
);

test('durations and easing match CSS including overshooting spring and independent opacity intervals', () => {
  expect(Object.values(timelines).map((t) => t.duration)).toEqual([
    3400, 3400, 3000, 2400, 2600, 1300, 1300, 3200, 4000, 4000, 3600, 800, 700,
    2200, 2200,
  ]);
  expect(timelines.enter.easing).toEqual([0.34, 1.56, 0.64, 1]);
  expect(timelines.poke.easing).toEqual(timelines.enter.easing);
  expect(timelines.fxPanda.easing).toEqual(timelines.enter.easing);
  expect(timelines.nod.easing).toEqual([0.2, 0.8, 0.2, 1]);
  expect(timelines.hop.easing).toEqual([0.3, 0, 0.5, 1]);
  expect(sampleTrack(timelines.enter.frames.opacity, 30, (p) => p, 1)).toBe(
    0.5,
  );
  expect(sampleTrack(timelines.enter.frames.y, 30, (p) => p, 0)).toBeCloseTo(
    18.2,
  );
});

test.each(['empty', 'onboarding', 'hero', 'inline', 'celebration', undefined])(
  'calm policy respects explicit %s context and never moves',
  (context) => {
    expect(mascotPolicy('front', true, false, context)).toEqual({
      visible: context === 'empty' || context === 'onboarding',
      animated: false,
    });
  },
);

test('reduce motion and faces render plain PNG without starting cycles', async () => {
  mockReduced = true;
  const view = await render(<Mascot pose="front" size={100} testID="poster" />);
  expect(screen.getByTestId('poster')).toBeTruthy();
  expect(withRepeat).not.toHaveBeenCalled();
  mockReduced = false;
  await view.rerender(<Mascot pose="smile" size={100} />);
  expect(withRepeat).not.toHaveBeenCalled();
});

test('calm exceptions show static PNG; other and unspecified contexts are hidden', async () => {
  mockCalm = true;
  const view = await render(
    <Mascot pose="wave" size={100} context="onboarding" testID="poster" />,
  );
  expect(screen.getByTestId('poster')).toBeTruthy();
  expect(withRepeat).not.toHaveBeenCalled();
  await view.rerender(<Mascot pose="front" size={100} context="hero" />);
  expect(screen.toJSON()).toBeNull();
});

test('sleep has three decorative z layers, poke restarts timing, and unmount cancels loops', async () => {
  const view = await render(<Mascot pose="sleep" size={100} testID="panda" />);
  expect(JSON.stringify(screen.toJSON()).match(/"content":"z"/g)).toHaveLength(
    3,
  );
  expect(withRepeat).toHaveBeenCalledTimes(5);
  const before = jest.mocked(withTiming).mock.calls.length;
  await fireEvent.press(
    screen.getByTestId('panda', { includeHiddenElements: true }),
  );
  expect(jest.mocked(withTiming).mock.calls.length).toBe(before + 1);
  jest.mocked(cancelAnimation).mockClear();
  await view.unmount();
  expect(cancelAnimation).toHaveBeenCalledTimes(7);
});

test('many PNG mascots start independent UI timelines and dispose them', async () => {
  const view = await render(
    <View>
      {Array.from({ length: 20 }, (_, index) => (
        <Mascot key={index} pose="front" size={60} />
      ))}
    </View>,
  );
  expect(withRepeat).toHaveBeenCalledTimes(60);
  jest.mocked(cancelAnimation).mockClear();
  await view.unmount();
  expect(cancelAnimation).toHaveBeenCalledTimes(100);
});

test('celebration only starts on a new completion and lasts 2200 ms', async () => {
  jest.useFakeTimers();
  const view = await render(<MascotCelebration finished />);
  expect(screen.toJSON()).toBeNull();
  await view.rerender(<MascotCelebration finished={false} />);
  await view.rerender(<MascotCelebration finished />);
  expect(screen.toJSON()).not.toBeNull();
  expect(jest.getTimerCount()).toBeGreaterThan(0);
  await act(() => jest.advanceTimersByTime(2199));
  expect(screen.toJSON()).not.toBeNull();
  await act(() => jest.advanceTimersByTime(1));
  expect(screen.toJSON()).toBeNull();
});

test.each(['calm', 'reduced'])(
  'celebration is suppressed in %s mode',
  async (mode) => {
    if (mode === 'calm') mockCalm = true;
    else mockReduced = true;
    const view = await render(<MascotCelebration finished={false} />);
    await view.rerender(<MascotCelebration finished />);
    expect(screen.toJSON()).toBeNull();
    expect(withRepeat).not.toHaveBeenCalled();
  },
);

test('confetti and spark preserve displacement, rotations, scale, duration and easing', () => {
  const confetti = confettiTimeline(100, -200, 300);
  expect(confetti.duration).toBe(1800);
  expect(confetti.easing).toEqual([0.15, 0.7, 0.3, 1]);
  expect(confetti.frames.x).toEqual([
    [0, 0],
    [45, 100],
    [100, 110.00000000000001],
  ]);
  expect(confetti.frames.y).toEqual([
    [0, 0],
    [45, -200],
    [100, 20],
  ]);
  expect(confetti.frames.r).toEqual([
    [0, 0],
    [45, 180],
    [100, 300],
  ]);
  expect(sparkTimeline(0).frames.x).toEqual([
    [0, 0],
    [100, 46],
  ]);
  expect(sparkTimeline(0).duration).toBe(700);
  expect(sparkTimeline(0).easing).toEqual([0, 0, 0.58, 1]);
});

test('changing reduce motion disposes all active layers immediately', async () => {
  const view = await render(<Mascot pose="front" size={100} testID="poster" />);
  expect(withRepeat).toHaveBeenCalledTimes(3);
  jest.mocked(cancelAnimation).mockClear();
  mockReduced = true;
  await view.rerender(<Mascot pose="front" size={100} testID="poster" />);
  expect(cancelAnimation).toHaveBeenCalledTimes(5);
  expect(withRepeat).toHaveBeenCalledTimes(3);
  expect(screen.getByTestId('poster')).toBeTruthy();
});
