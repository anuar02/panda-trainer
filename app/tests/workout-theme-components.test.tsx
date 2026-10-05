import { render } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { ThemeProvider, tokens } from '../src/ui/theme';
import { WorkoutRestPanel } from '../src/features/workout-demo/rest-panel';
import '../src/lib/i18n';

jest.mock('../src/features/workout-demo/runtime', () => ({
  useWorkoutRuntime: () => ({
    rest: { done: false, startedAt: 1, left: 30, total: 60, label: '0:30' },
    adjustRest: jest.fn(),
    skipRest: jest.fn(),
  }),
}));

test.each(['light', 'dark'] as const)(
  '%s theme reaches the rest panel',
  async (scheme) => {
    const colors = tokens.colors[scheme];
    const view = await render(
      <ThemeProvider role={scheme === 'dark' ? 'trainer' : 'client'}>
        <WorkoutRestPanel sessionId="s1" clientId="c1" />
      </ThemeProvider>,
    );
    expect(
      StyleSheet.flatten(view.getByTestId('workout-rest').props.style)
        .backgroundColor,
    ).toBe(colors.workoutAccentSoft);
  },
);
