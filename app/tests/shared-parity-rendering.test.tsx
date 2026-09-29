import { fireEvent, render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { Text } from '../src/ui/text';
import { GradientBackground } from '../src/ui/gradient-background';

test('explicit registered text styles become fresh inline values with array precedence', async () => {
  const styles = StyleSheet.create({
    title: {
      fontSize: 27,
      fontFamily: 'Montserrat_800ExtraBold',
      color: '#ffffff',
    },
  });
  await render(
    <Text
      testID="title"
      className="text-body"
      style={[styles.title, { fontSize: 30 }]}
    >
      Title
    </Text>,
  );
  const result = screen.getByTestId('title').props.style;
  expect(result).toEqual({
    fontSize: 30,
    fontFamily: 'Montserrat_800ExtraBold',
    color: '#ffffff',
  });
  expect(result).not.toBe(styles.title);
});

test('gradient viewport follows measured layout dimensions', async () => {
  await render(
    <GradientBackground
      testID="gradient"
      start="#2e4be0"
      end="#2136b0"
      radius={18}
      radials={[
        { color: '#ffffff', opacity: 0.2, cx: 0.5, cy: 0.5, rx: 40, ry: 20 },
      ]}
    />,
  );
  const view = screen.getByTestId('gradient');
  await fireEvent(view, 'layout', {
    nativeEvent: { layout: { width: 318, height: 56 } },
  });
  const svg = screen.getByTestId('gradient-viewport');
  expect(svg.props.bbWidth).toBe(318);
  expect(svg.props.bbHeight).toBe(56);
  expect(JSON.stringify(screen.toJSON())).toContain(
    '"gradientTransform":[40,0,0,20,159,28]',
  );
});
