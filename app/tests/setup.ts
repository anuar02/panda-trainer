jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn().mockResolvedValue(null),
  setItem: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('react-native-reanimated', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const { View, Easing } =
    jest.requireActual<typeof import('react-native')>('react-native');
  return {
    __esModule: true,
    default: {
      View,
      createAnimatedComponent: (component: unknown) => component,
    },
    Easing,
    ReduceMotion: { System: 'system', Always: 'always', Never: 'never' },
    useSharedValue: (value: number) =>
      React.useRef({
        value,
        set(next: number) {
          this.value = next;
        },
      }).current,
    useAnimatedStyle: (style: () => object) => style(),
    useReducedMotion: jest.fn(() => false),
    cancelAnimation: jest.fn(),
    withDelay: jest.fn((_delay: number, value: number) => value),
    withSequence: jest.fn((...values: number[]) => values[values.length - 1]),
    withRepeat: jest.fn((value: number) => value),
    interpolate: (value: number, input: number[], output: number[]) =>
      output[0]! + value * (output[output.length - 1]! - output[0]!),
    withTiming: jest.fn((value: number) => value),
  };
});

beforeEach(() => {
  const { AccessibilityInfo } =
    jest.requireActual<typeof import('react-native')>('react-native');
  jest
    .spyOn(AccessibilityInfo, 'isReduceMotionEnabled')
    .mockResolvedValue(false);
  jest
    .spyOn(AccessibilityInfo, 'addEventListener')
    .mockReturnValue({ remove: jest.fn() } as unknown as ReturnType<
      typeof AccessibilityInfo.addEventListener
    >);
});
