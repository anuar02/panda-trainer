import { act, renderHook } from '@testing-library/react-native';
import { useWorkspaceClock } from '../src/features/workspace-scheduling/use-clock';

let mockFocused = true;
jest.mock('expo-router', () => ({
  useFocusEffect: (effect: () => void | (() => void)) => {
    const { useEffect } = jest.requireActual<typeof import('react')>('react');
    const focused = mockFocused;
    useEffect(() => (focused ? effect() : undefined), [effect, focused]);
  },
}));

beforeEach(() => {
  mockFocused = true;
  jest.useFakeTimers();
  jest.setSystemTime(new Date('2026-10-02T18:59:30.000Z'));
});

afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
});

test('refreshes immediately on focus after the screen spent time away', async () => {
  mockFocused = false;
  const interval = jest.spyOn(global, 'setInterval');
  const hook = await renderHook(() => useWorkspaceClock());
  expect(hook.result.current.toISOString()).toBe('2026-10-02T18:59:30.000Z');
  expect(interval).not.toHaveBeenCalled();
  jest.setSystemTime(new Date('2026-10-03T09:00:00.000Z'));
  mockFocused = true;
  await hook.rerender(undefined);
  expect(hook.result.current.toISOString()).toBe('2026-10-03T09:00:00.000Z');
  expect(interval).toHaveBeenCalledTimes(1);
});

test('updates each minute so a mounted clock crosses the date boundary', async () => {
  jest.setSystemTime(new Date('2026-10-02T23:59:30.000Z'));
  const hook = await renderHook(() => useWorkspaceClock());
  await act(async () => {
    jest.advanceTimersByTime(59999);
  });
  expect(hook.result.current.toISOString()).toBe('2026-10-02T23:59:30.000Z');
  await act(async () => {
    jest.advanceTimersByTime(1);
  });
  expect(hook.result.current.toISOString()).toBe('2026-10-03T00:00:30.000Z');
  await act(async () => {
    jest.advanceTimersByTime(60000);
  });
  expect(hook.result.current.toISOString()).toBe('2026-10-03T00:01:30.000Z');
});

test('stops ticking on blur and unmount, then refreshes and starts one timer on refocus', async () => {
  const interval = jest.spyOn(global, 'setInterval');
  const clear = jest.spyOn(global, 'clearInterval');
  const hook = await renderHook(() => useWorkspaceClock());
  mockFocused = false;
  await hook.rerender(undefined);
  expect(clear).toHaveBeenCalledWith(interval.mock.results[0]?.value);
  await act(async () => {
    jest.advanceTimersByTime(120000);
  });
  expect(hook.result.current.toISOString()).toBe('2026-10-02T18:59:30.000Z');
  mockFocused = true;
  await hook.rerender(undefined);
  expect(hook.result.current.toISOString()).toBe('2026-10-02T19:01:30.000Z');
  expect(interval).toHaveBeenCalledTimes(2);
  await hook.rerender(undefined);
  expect(interval).toHaveBeenCalledTimes(2);
  await hook.unmount();
  expect(clear).toHaveBeenCalledWith(interval.mock.results[1]?.value);
});
