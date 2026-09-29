import { fireEvent, render, screen } from '@testing-library/react-native';
import { Button } from '../src/ui/button';
describe('Button', () => {
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
