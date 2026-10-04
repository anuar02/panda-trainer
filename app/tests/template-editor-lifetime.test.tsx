import { act, fireEvent, render, screen } from '@testing-library/react-native';
import type { PropsWithChildren, ReactNode } from 'react';
import '../src/lib/i18n';
import { TemplateEditorScreen } from '../src/features/template-editor/screen';
import type { TemplateEditorStore } from '../src/features/template-editor/provider';
import type { TemplateResult } from '../src/domain/templates';
import { useToast } from '../src/ui/toast';

jest.mock('../src/ui/toast', () => ({ useToast: jest.fn() }));
jest.mock('../src/ui/sheet', () => ({
  Sheet: ({
    open,
    children,
    fixedContent,
  }: PropsWithChildren<{
    open: boolean;
    fixedContent?: { header: ReactNode; footer: ReactNode };
  }>) =>
    open ? (
      <>
        {fixedContent?.header}
        {children}
        {fixedContent?.footer}
      </>
    ) : null,
}));
jest.mock('@gorhom/bottom-sheet', () => ({
  BottomSheetTextInput:
    jest.requireActual<typeof import('react-native')>('react-native').TextInput,
}));
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView:
    jest.requireActual<typeof import('react-native')>('react-native').View,
}));
const toast = jest.fn();
const onSaved = jest.fn();
const onLeave = jest.fn();
const success: TemplateResult = {
  ok: true,
  template: { id: 'saved', name: 'Низ А', description: '', exercises: [] },
};
const makeStore = (scope = 1): TemplateEditorStore => ({
  scope,
  templates: [],
  draft: { id: null, name: 'Низ А', description: '', exercises: [] },
  ready: true,
  readError: false,
  busy: false,
  status: 'saved',
  begin: jest.fn(() => true),
  update: jest.fn(),
  retry: jest.fn(),
  save: jest.fn(async () => success),
  discard: jest.fn(async () => true),
});
const form = (store: TemplateEditorStore, callerScope = 'client-a') => (
  <TemplateEditorScreen
    store={store}
    callerScope={callerScope}
    suppliedExercises={[]}
    onSaved={onSaved}
    onLeave={onLeave}
  />
);
beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(useToast).mockReturnValue(toast);
});
test.each(
  [
    'leave',
    'unmount',
    'draft',
    'clientId',
    'store',
    'session',
    'account',
    'workspace',
    'relogin',
  ].flatMap((change) =>
    [
      success,
      { ok: false as const, error: 'name' as const },
      { ok: false as const, error: 'storage' as const },
    ].map((outcome) => [change, outcome] as const),
  ),
)(
  'late save after %s with %s cannot publish feedback and next save works',
  async (change, outcome) => {
    const store = makeStore();
    let resolve: (value: TemplateResult) => void = () => undefined;
    let current = true;
    store.capture = () => () => current;
    jest.mocked(store.save).mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    const view = await render(form(store));
    await fireEvent.press(
      screen.getByRole('button', { name: 'Сохранить шаблон' }),
    );
    await fireEvent.press(
      screen.getByRole('button', { name: 'Сохранить шаблон' }),
    );
    expect(store.save).toHaveBeenCalledTimes(1);
    if (change === 'leave')
      await fireEvent.press(screen.getByRole('button', { name: 'Назад' }));
    if (change === 'unmount') await view.unmount();
    if (change === 'draft')
      await view.rerender(
        form({ ...store, scope: 2, draft: { ...store.draft!, name: 'Новый' } }),
      );
    if (change === 'clientId') await view.rerender(form(store, 'client-b'));
    if (change === 'store')
      await view.rerender(form({ ...makeStore(), scope: 2 }));
    if (change === 'session' || change === 'relogin') current = false;
    if (change === 'account' || change === 'workspace')
      await view.rerender(form(makeStore(2)));
    await act(() => resolve(outcome));
    if (change !== 'unmount') expect(screen.queryByRole('alert')).toBeNull();
    expect(toast).not.toHaveBeenCalled();
    expect(onSaved).not.toHaveBeenCalled();
    if (change === 'unmount') await render(form(makeStore(3)));
    else await view.rerender(form(makeStore(3)));
    await fireEvent.press(
      screen.getByRole('button', { name: 'Сохранить шаблон' }),
    );
    expect(onSaved).toHaveBeenCalledWith('saved');
  },
);
test.each([
  { ok: false, error: 'name' } as const,
  { ok: false, error: 'storage' } as const,
])('late save error %s does not appear on a new form', async (result) => {
  const store = makeStore();
  let resolve: (value: TemplateResult) => void = () => undefined;
  jest.mocked(store.save).mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  const view = await render(form(store));
  await fireEvent.press(
    screen.getByRole('button', { name: 'Сохранить шаблон' }),
  );
  await fireEvent.press(
    screen.getByRole('button', { name: 'Добавить упражнения' }),
  );
  await view.rerender(form(makeStore(2)));
  await act(() => resolve(result));
  expect(screen.queryByRole('alert')).toBeNull();
  expect(screen.queryByLabelText('Поиск упражнений для шаблона')).toBeNull();
  expect(onSaved).not.toHaveBeenCalled();
});
test('late discard cannot close the new confirmation or navigate', async () => {
  const store = makeStore();
  let resolve: (value: boolean) => void = () => undefined;
  jest.mocked(store.discard).mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  const view = await render(form(store));
  await fireEvent.press(
    screen.getByRole('button', { name: 'Удалить черновик' }),
  );
  await fireEvent.press(
    screen.getAllByRole('button', { name: 'Удалить черновик' })[1]!,
  );
  await view.rerender(form(makeStore(2)));
  await fireEvent.press(
    screen.getByRole('button', { name: 'Удалить черновик' }),
  );
  await act(() => resolve(true));
  expect(onLeave).not.toHaveBeenCalled();
  expect(screen.getByText('Продолжить редактирование')).toBeTruthy();
});
test('normal rerender during save still publishes its result', async () => {
  const store = makeStore();
  let resolve: (value: TemplateResult) => void = () => undefined;
  jest.mocked(store.save).mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  const view = await render(form(store));
  await fireEvent.press(
    screen.getByRole('button', { name: 'Сохранить шаблон' }),
  );
  await view.rerender(form({ ...store, busy: true }));
  await view.rerender(form({ ...store, draft: null }));
  await act(() => resolve(success));
  expect(onSaved).toHaveBeenCalledWith('saved');
  expect(toast).toHaveBeenCalledTimes(1);
});

test('discard from a closed confirmation cannot close a later picker in the same form', async () => {
  const store = makeStore();
  let resolve: (value: boolean) => void = () => undefined;
  jest.mocked(store.discard).mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  await render(form(store));
  await fireEvent.press(
    screen.getByRole('button', { name: 'Удалить черновик' }),
  );
  await fireEvent.press(
    screen.getAllByRole('button', { name: 'Удалить черновик' })[1]!,
  );
  await fireEvent.press(
    screen.getByRole('button', { name: 'Продолжить редактирование' }),
  );
  await fireEvent.press(
    screen.getByRole('button', { name: 'Добавить упражнения' }),
  );
  await act(() => resolve(true));
  expect(onLeave).not.toHaveBeenCalled();
  expect(screen.getByLabelText('Поиск упражнений для шаблона')).toBeTruthy();
});

test('reopened form can begin again when a save from the previous screen finishes', async () => {
  const store = { ...makeStore(), busy: true };
  const view = await render(form(store));
  expect(store.begin).not.toHaveBeenCalled();
  await view.rerender(form({ ...store, draft: null, busy: false }));
  expect(store.begin).toHaveBeenCalledTimes(1);
  expect(onSaved).not.toHaveBeenCalled();
  expect(toast).not.toHaveBeenCalled();
});
