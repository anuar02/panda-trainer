import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { i18n } from '../src/lib/i18n';
import { sessionEditorRu } from '../src/features/session-editor/ru';
import { CreateSessionScreen } from '../src/features/session-editor/create-session-screen';
import type {
  EditorResult,
  CreateSessionScreenProps,
} from '../src/features/session-editor/types';

i18n.addResourceBundle(
  'ru',
  'translation',
  { sessionEditor: sessionEditorRu },
  true,
  true,
);
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView:
    jest.requireActual<typeof import('react-native')>('react-native').View,
}));
const press = (name: string) =>
  fireEvent.press(screen.getByRole('button', { name }));
const deferred = () => {
  let resolve!: (value: EditorResult) => void;
  let reject!: (value: Error) => void;
  const promise = new Promise<EditorResult>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};
const mount = (
  onCreate: CreateSessionScreenProps['onCreate'],
  extra: Partial<CreateSessionScreenProps> = {},
) =>
  render(
    <CreateSessionScreen
      clients={[{ id: 'c1', name: 'Анна', initials: 'А' }]}
      templates={[{ program: 'p1', name: 'Силовая А', meta: '3 упражнения' }]}
      dates={['2026-10-02']}
      today="2026-10-02"
      initialClientId="c1"
      getCollisions={() => []}
      onCreate={onCreate}
      onClose={jest.fn()}
      {...extra}
    />,
  );
const programStep = async () => {
  await press('Продолжить');
  await press('Продолжить');
  await press('Продолжить');
};

test('in-flight creation locks submission, close, steps, collision acknowledgement and program changes', async () => {
  const pending = deferred();
  const onCreate = jest.fn(() => pending.promise);
  const onClose = jest.fn();
  await mount(onCreate, {
    onClose,
    getCollisions: () => [{ id: 'collision', title: 'Дана', start: '19:00' }],
  });
  await programStep();
  await press('Силовая А');
  await press('Создать занятие');
  await press('Создать занятие');
  await press('Назначить программу позже');
  await press('Назад');
  await press('Закрыть');
  expect(onCreate).toHaveBeenCalledTimes(1);
  expect(onClose).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: 'Силовая А' })).toBeDisabled();
  expect(screen.getByRole('button', { name: '1. Клиенты' })).toBeDisabled();
  expect(screen.getByRole('checkbox')).toBeDisabled();
  await act(async () =>
    pending.resolve({ ok: false, error: 'Повторите запрос' }),
  );
  expect(screen.getByText('Повторите запрос')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Создать занятие' })).toBeEnabled();
  await press('Создать занятие');
  expect(onCreate).toHaveBeenNthCalledWith(
    2,
    expect.objectContaining({ program: 'p1', clientIds: ['c1'] }),
  );
});

test('unknown rejection displays translated error and permits retry', async () => {
  const pending = deferred();
  const onCreate = jest.fn(() => pending.promise);
  await mount(onCreate);
  await programStep();
  await press('Создать занятие');
  await act(async () => pending.reject(new Error('network')));
  expect(screen.getByRole('alert')).toHaveTextContent(i18n.t('common.error'));
  expect(screen.getByRole('button', { name: 'Создать занятие' })).toBeEnabled();
});

test('late rejected creation after unmount has no state update warning', async () => {
  const pending = deferred();
  const view = await mount(() => pending.promise);
  await programStep();
  await press('Создать занятие');
  await view.unmount();
  const log = jest.spyOn(console, 'error').mockImplementation(() => {});
  await act(async () => pending.reject(new Error('late')));
  expect(log).not.toHaveBeenCalled();
  log.mockRestore();
});

test.each([
  [45, 45],
  [75, 75],
  [90, 90],
  [0, 60],
  [61, 60],
  [Number.NaN, 60],
])(
  'initial duration %s normalizes to %s',
  async (initialDuration, expected) => {
    const onCreate = jest.fn(() => ({ ok: true as const }));
    await mount(onCreate, { initialDuration });
    await programStep();
    await press('Создать занятие');
    expect(onCreate).toHaveBeenCalledWith(
      expect.objectContaining({ duration: expected }),
    );
  },
);
