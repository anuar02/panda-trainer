import { act, fireEvent, render, screen } from '@testing-library/react-native';
import {
  Pressable as MockPressable,
  Text as MockText,
  TextInput as MockTextInput,
  View as MockView,
} from 'react-native';
import type { ComponentProps, PropsWithChildren } from 'react';
import { WorkspaceClientsScreen } from '@/features/workspace-clients/clients-screen';
import type { Sheet } from '@/ui/sheet';
import '../src/lib/i18n';

let mockSheet: ComponentProps<typeof Sheet>;
jest.mock('@/ui/sheet', () => ({
  Sheet: (props: ComponentProps<typeof Sheet>) => {
    mockSheet = props;
    return props.open ? (
      <MockView>
        {props.children}
        {props.fixedContent?.footer}
      </MockView>
    ) : null;
  },
}));
jest.mock('@/ui/mascot', () => ({ Mascot: () => null }));
jest.mock('@/ui/icons', () => ({ Icon: () => null }));
jest.mock('@/ui/gradient-background', () => ({
  GradientBackground: () => null,
}));
jest.mock('@/ui/card', () => ({
  Card: ({ children }: PropsWithChildren) => <MockView>{children}</MockView>,
}));
jest.mock('@/ui/text', () => ({
  Text: ({ children }: PropsWithChildren) => <MockText>{children}</MockText>,
}));
jest.mock('@/ui/button', () => ({
  Button: (props: {
    label: string;
    onPress: () => void;
    disabled?: boolean;
  }) => (
    <MockPressable
      accessibilityLabel={props.label}
      onPress={props.onPress}
      disabled={props.disabled}
    >
      <MockText>{props.label}</MockText>
    </MockPressable>
  ),
}));
jest.mock('@/ui/field', () => ({
  Field: (props: {
    value: string;
    onChangeText: (value: string) => void;
    onSubmitEditing: () => void;
    error: string;
  }) => (
    <>
      <MockTextInput testID="name" {...props} />
      <MockText>{props.error}</MockText>
    </>
  ),
}));
function deferred() {
  let resolve!: () => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<void>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
const props = {
  rows: [],
  loading: false,
  error: false,
  busy: false,
  onRetry: jest.fn(),
  onBack: jest.fn(),
  onOpen: jest.fn(),
};
async function open() {
  const button = screen.getAllByLabelText('Добавить клиента')[0];
  if (!button) throw new Error('add control missing');
  await fireEvent.press(button);
  await fireEvent.changeText(screen.getByTestId('name'), 'Name');
}
test.each(['success', 'error'] as const)(
  'old sheet %s cannot close new sheet or release new lock',
  async (kind) => {
    const old = deferred();
    const current = deferred();
    const onAdd = jest
      .fn()
      .mockReturnValueOnce(old.promise)
      .mockReturnValueOnce(current.promise);
    await render(<WorkspaceClientsScreen {...props} onAdd={onAdd} />);
    await open();
    await fireEvent(screen.getByTestId('name'), 'submitEditing');
    await fireEvent(screen.getByTestId('name'), 'submitEditing');
    expect(onAdd).toHaveBeenCalledTimes(1);
    await act(async () => mockSheet.onClose());
    await open();
    await fireEvent(screen.getByTestId('name'), 'submitEditing');
    await act(async () => {
      if (kind === 'success') old.resolve();
      else old.reject(new Error('late'));
    });
    expect(mockSheet.open).toBe(true);
    expect(screen.getByTestId('name').props.value).toBe('Name');
    await fireEvent(screen.getByTestId('name'), 'submitEditing');
    expect(onAdd).toHaveBeenCalledTimes(2);
    await act(async () => current.resolve());
    expect(mockSheet.open).toBe(false);
  },
);
test('lost response keeps name for explicit retry and late rejection after unmount is ignored', async () => {
  const late = deferred();
  const onAdd = jest
    .fn()
    .mockRejectedValueOnce(new Error('lost'))
    .mockReturnValueOnce(late.promise);
  const view = await render(
    <WorkspaceClientsScreen {...props} onAdd={onAdd} />,
  );
  await open();
  await fireEvent(screen.getByTestId('name'), 'submitEditing');
  expect(screen.getByTestId('name').props.value).toBe('Name');
  await fireEvent(screen.getByTestId('name'), 'submitEditing');
  expect(onAdd.mock.calls).toEqual([['Name'], ['Name']]);
  await view.unmount();
  await act(async () => late.reject(new Error('late')));
});
