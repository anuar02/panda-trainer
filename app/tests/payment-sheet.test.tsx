import { act, fireEvent, render } from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';
import {
  PaymentSheet,
  parsePaymentAmount,
} from '../src/features/trainer-payments/payment-sheet';
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { amount?: string }) =>
      options?.amount ? `${key}:${options.amount}` : key,
    i18n: { language: 'ru-RU' },
  }),
}));
jest.mock('../src/ui/sheet', () => ({
  Sheet: ({ children }: PropsWithChildren) => {
    const { View } =
      jest.requireActual<typeof import('react-native')>('react-native');
    return <View>{children}</View>;
  },
}));
let mockSavePress: (() => void) | undefined;
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
    if (label === 'trainerPayments.save') mockSavePress = onPress;
    return (
      <Pressable
        accessibilityRole="button"
        onPress={onPress}
        disabled={disabled || loading}
      >
        <Text>{label}</Text>
      </Pressable>
    );
  },
}));
const key = (name: string) => `trainerPayments.${name}`;
const props = {
  open: true,
  clientName: 'Анна',
  purchaseTitle: 'Пакет',
  dueMinor: '50000',
  today: '2026-10-03',
  onClose: jest.fn(),
  onSubmit: jest.fn<Promise<boolean>, [unknown]>().mockResolvedValue(true),
};
beforeEach(() => jest.clearAllMocks());
test.each([
  ['92233720368547758.07', '9223372036854775807'],
  ['90071992547409,93', '9007199254740993'],
  ['1.5', '150'],
  ['0', null],
  ['-1', null],
  ['1e3', null],
  ['1.001', null],
  ['92233720368547758.08', null],
])('parses %s without precision loss', (value, expected) =>
  expect(parsePaymentAmount(value)).toBe(expected),
);
test('prefills exact debt with Kaspi and supplied date', async () => {
  const screen = await render(
    <PaymentSheet {...props} dueMinor="9007199254740993" />,
  );
  expect(screen.getByLabelText(key('amount')).props.value).toBe(
    '90071992547409.93',
  );
  await fireEvent.press(screen.getByText(key('save')));
  expect(props.onSubmit).toHaveBeenCalledWith({
    amountMinor: '9007199254740993',
    paidOn: '2026-10-03',
    method: 'Kaspi',
  });
  expect(props.onClose).toHaveBeenCalledTimes(1);
});
test('accepts partial payment and another canonical method', async () => {
  const screen = await render(<PaymentSheet {...props} />);
  await fireEvent.changeText(screen.getByLabelText(key('amount')), '100,25');
  await fireEvent.press(screen.getByText(key('methodCash')));
  await fireEvent.press(screen.getByText(key('save')));
  expect(props.onSubmit).toHaveBeenCalledWith({
    amountMinor: '10025',
    paidOn: props.today,
    method: 'Наличные',
  });
});
test('over debt and zero fail locally', async () => {
  const screen = await render(<PaymentSheet {...props} />);
  await fireEvent.changeText(screen.getByLabelText(key('amount')), '501');
  await fireEvent.press(screen.getByText(key('save')));
  expect(screen.getByText(`${key('overDebt')}:500 ₸`)).toBeTruthy();
  await fireEvent.changeText(screen.getByLabelText(key('amount')), '0');
  await fireEvent.press(screen.getByText(key('save')));
  expect(screen.getByText(key('invalidAmount'))).toBeTruthy();
  expect(props.onSubmit).not.toHaveBeenCalled();
});
test.each([
  { dueMinor: 'bad' },
  { dueMinor: '0' },
  { today: '2026-02-30' },
  { busy: true },
  { disabled: true },
])('blocks invalid context or external lock %j', async (patch) => {
  const screen = await render(<PaymentSheet {...props} {...patch} />);
  await fireEvent.press(screen.getByText(key('save')));
  expect(props.onSubmit).not.toHaveBeenCalled();
});
test('false outcome remains open with feedback', async () => {
  const screen = await render(
    <PaymentSheet {...props} onSubmit={jest.fn().mockResolvedValue(false)} />,
  );
  await fireEvent.press(screen.getByText(key('save')));
  expect(screen.getByText(key('submitError'))).toBeTruthy();
  expect(props.onClose).not.toHaveBeenCalled();
});
test('synchronous lock prevents double submission and old result cannot close reopened sheet', async () => {
  let resolve = (_value: boolean) => {};
  const submit = jest.fn(
    () =>
      new Promise<boolean>((done) => {
        resolve = done;
      }),
  );
  const screen = await render(<PaymentSheet {...props} onSubmit={submit} />);
  await act(async () => {
    const handler = mockSavePress;
    if (!handler) throw new Error('Payment save handler is unavailable');
    handler();
    handler();
  });
  expect(submit).toHaveBeenCalledTimes(1);
  await screen.rerender(
    <PaymentSheet {...props} open={false} onSubmit={submit} />,
  );
  await screen.rerender(<PaymentSheet {...props} onSubmit={submit} />);
  await act(async () => resolve(true));
  expect(props.onClose).not.toHaveBeenCalled();
  expect(screen.getByLabelText(key('amount')).props.value).toBe('500');
});
test('cancel closes without submitting and invalid date explains disabled save', async () => {
  const screen = await render(<PaymentSheet {...props} today="2026-02-30" />);
  expect(screen.getByText(key('invalidDate'))).toBeTruthy();
  await fireEvent.press(screen.getByText(key('cancel')));
  expect(props.onClose).toHaveBeenCalledTimes(1);
  expect(props.onSubmit).not.toHaveBeenCalled();
});

test('same-title purchases use their IDs and a late result cannot close the newly selected purchase', async () => {
  let complete: (value: boolean) => void = () => {};
  const submit = jest.fn(
    () =>
      new Promise<boolean>((resolve) => {
        complete = resolve;
      }),
  );
  const screen = await render(
    <PaymentSheet {...props} purchaseId="first" onSubmit={submit} />,
  );
  await fireEvent.changeText(screen.getByLabelText(key('amount')), '40');
  await fireEvent.press(screen.getByText(key('save')));
  await screen.rerender(
    <PaymentSheet
      {...props}
      purchaseId="second"
      dueMinor="60000"
      onSubmit={submit}
    />,
  );
  expect(screen.getByLabelText(key('amount')).props.value).toBe('600');
  await act(async () => complete(true));
  expect(props.onClose).not.toHaveBeenCalled();
  expect(screen.getByLabelText(key('amount')).props.value).toBe('600');
});
test('dismissal invalidates immediately even before the parent commits its close/reopen', async () => {
  let complete: (value: boolean) => void = () => {};
  const submit = jest.fn(
    () =>
      new Promise<boolean>((resolve) => {
        complete = resolve;
      }),
  );
  const screen = await render(<PaymentSheet {...props} onSubmit={submit} />);
  await fireEvent.press(screen.getByText(key('save')));
  await fireEvent.press(screen.getByText(key('cancel')));
  expect(props.onClose).toHaveBeenCalledTimes(1);
  await fireEvent.changeText(screen.getByLabelText(key('amount')), '10');
  await act(async () => complete(false));
  expect(screen.queryByText(key('submitError'))).toBeNull();
  expect(screen.getByLabelText(key('amount')).props.value).toBe('10');
  expect(screen.getByLabelText(key('amount')).props.editable).toBe(true);
});
