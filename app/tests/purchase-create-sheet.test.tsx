import { act, fireEvent, render } from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';
import {
  PurchaseCreateSheet,
  parsePurchasePrice,
} from '../src/features/trainer-billing/purchase-create-sheet';
jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
jest.mock('../src/ui/sheet', () => ({
  Sheet: ({ children }: PropsWithChildren) => {
    const { View } =
      jest.requireActual<typeof import('react-native')>('react-native');
    return <View>{children}</View>;
  },
}));
jest.mock('../src/ui/button', () => ({
  Button: ({
    label,
    onPress,
    disabled,
    loading,
  }: {
    label: string;
    onPress: () => void;
    disabled: boolean;
    loading: boolean;
  }) => {
    const { Pressable, Text } =
      jest.requireActual<typeof import('react-native')>('react-native');
    return (
      <Pressable
        accessibilityRole="button"
        disabled={disabled || loading}
        onPress={onPress}
      >
        <Text>{label}</Text>
      </Pressable>
    );
  },
}));
test.each([
  ['90071992547409.93', '9007199254740993'],
  ['92233720368547758,07', '9223372036854775807'],
  ['001.5', '150'],
  ['92233720368547758.08', null],
  ['0', null],
  ['-1', null],
  ['1e3', null],
  ['1.001', null],
])('price %s preserves precise minor amount', (value, expected) => {
  expect(parsePurchasePrice(value)).toBe(expected);
});
const key = (name: string) => `trainerBillingPurchase.${name}`;
const fill = async (
  screen: Awaited<ReturnType<typeof render>>,
  expiry = '',
) => {
  await fireEvent.changeText(screen.getByLabelText(key('name')), '  Пакет  ');
  await fireEvent.changeText(screen.getByLabelText(key('units')), '8');
  await fireEvent.changeText(
    screen.getByLabelText(key('price')),
    '90071992547409.93',
  );
  await fireEvent.changeText(screen.getByLabelText(key('expiry')), expiry);
};
test('invalid units and impossible calendar dates prevent submission', async () => {
  const submit = jest.fn().mockResolvedValue(true);
  const screen = await render(
    <PurchaseCreateSheet
      open
      clientName="Client"
      onClose={jest.fn()}
      onSubmit={submit}
    />,
  );
  await fill(screen, '2026-02-30');
  await fireEvent.changeText(screen.getByLabelText(key('units')), '2147483648');
  await fireEvent.press(screen.getByText(key('save')));
  expect(submit).not.toHaveBeenCalled();
  expect(screen.getByText(key('invalidUnits'))).toBeTruthy();
  expect(screen.getByText(key('invalidExpiry'))).toBeTruthy();
});
test('submission keeps input after failure, locks repeated taps and closes on success', async () => {
  let resolve = (_value: boolean) => {};
  const submit = jest.fn().mockImplementation(
    () =>
      new Promise<boolean>((complete) => {
        resolve = complete;
      }),
  );
  const close = jest.fn();
  const screen = await render(
    <PurchaseCreateSheet
      open
      clientName="Client"
      onClose={close}
      onSubmit={submit}
    />,
  );
  await fill(screen);
  await fireEvent.press(screen.getByText(key('save')));
  await fireEvent.press(screen.getByText(key('save')));
  expect(submit).toHaveBeenCalledTimes(1);
  expect(submit).toHaveBeenCalledWith({
    title: 'Пакет',
    units: 8,
    priceMinor: '9007199254740993',
    expiresOn: null,
  });
  await act(async () => resolve(false));
  expect(close).not.toHaveBeenCalled();
  expect(screen.getByText(key('submitError'))).toBeTruthy();
  expect(screen.getByLabelText(key('name')).props.value).toBe('  Пакет  ');
  await fireEvent.press(screen.getByText(key('save')));
  await act(async () => resolve(true));
  expect(close).toHaveBeenCalledTimes(1);
});
test('dismissal clears form and old completion cannot close a reopened sheet', async () => {
  let resolve = (_value: boolean) => {};
  const submit = jest.fn().mockImplementation(
    () =>
      new Promise<boolean>((complete) => {
        resolve = complete;
      }),
  );
  const close = jest.fn();
  const props = { clientName: 'Client', onClose: close, onSubmit: submit };
  const screen = await render(<PurchaseCreateSheet open {...props} />);
  await fill(screen);
  await fireEvent.press(screen.getByText(key('save')));
  await screen.rerender(<PurchaseCreateSheet open={false} {...props} />);
  await screen.rerender(<PurchaseCreateSheet open {...props} />);
  await act(async () => resolve(true));
  expect(close).not.toHaveBeenCalled();
  expect(screen.getByLabelText(key('name')).props.value).toBe('');
});

test('caller cancellation during deferred failure cannot publish feedback or close', async () => {
  let current = true;
  let complete: (value: boolean) => void = () => {};
  const submit = jest.fn(
    () =>
      new Promise<boolean>((resolve) => {
        complete = resolve;
      }),
  );
  const close = jest.fn();
  const screen = await render(
    <PurchaseCreateSheet
      open
      clientName="Client"
      isCurrent={() => current}
      onClose={close}
      onSubmit={submit}
    />,
  );
  await fill(screen);
  await fireEvent.press(screen.getByText(key('save')));
  current = false;
  await act(async () => complete(false));
  expect(close).not.toHaveBeenCalled();
  expect(screen.queryByText(key('submitError'))).toBeNull();
});
