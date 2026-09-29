import { render } from '@testing-library/react-native';
import { Field } from '../src/ui/field';
test('exposes a field error as an alert and input hint', async () => {
  const view = await render(<Field label="Имя" error="Введите имя" />);
  expect(view.getByRole('alert')).toHaveTextContent('Введите имя');
  expect(view.getByLabelText('Имя')).toHaveProp(
    'accessibilityHint',
    'Введите имя',
  );
});
