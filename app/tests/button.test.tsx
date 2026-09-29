import { fireEvent, render, screen } from '@testing-library/react-native';
import { Button } from '../src/ui/button';
describe('Button', () => {
  test('preserves explicit style and press-state callbacks', async () => {
    const onPressIn = jest.fn();
    const onPressOut = jest.fn();
    await render(
      <Button
        label="Сохранить"
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1, marginTop: 20 })}
      />,
    );
    const button = screen.getByRole('button', { name: 'Сохранить' });
    expect(button).toHaveStyle({ opacity: 1, marginTop: 20 });
    await fireEvent(button, 'pressIn');
    expect(button).toHaveStyle({ opacity: 0.7, marginTop: 20 });
    expect(onPressIn).toHaveBeenCalledTimes(1);
    await fireEvent(button, 'pressOut');
    expect(button).toHaveStyle({ opacity: 1, marginTop: 20 });
    expect(onPressOut).toHaveBeenCalledTimes(1);
  });
  test('fires one action when enabled', async () => {
    const onPress = jest.fn();
    await render(<Button label="Сохранить" onPress={onPress} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Сохранить' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
  test.each([{ disabled: true }, { loading: true }])(
    'prevents repeated actions while unavailable: %o',
    async (props) => {
      const onPress = jest.fn();
      await render(<Button label="Сохранить" onPress={onPress} {...props} />);
      const button = screen.getByRole('button', { name: 'Сохранить' });
      expect(button).toBeDisabled();
      await fireEvent.press(button);
      expect(onPress).not.toHaveBeenCalled();
    },
  );
});
