import { act, fireEvent, render, screen } from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';
import WorkspaceLibraryRoute from '../app/workspace/library';
import { useWorkspaceLibrary } from '../src/features/workspace-library/provider';
import '../src/lib/i18n';

jest.mock('../src/features/workspace-library/provider', () => ({
  useWorkspaceLibrary: jest.fn(),
}));
jest.mock('../src/features/workspace-library/launcher', () => ({
  useWorkspaceTemplateLauncher: () => ({
    start: jest.fn(),
    resume: jest.fn(),
    conflict: null,
  }),
}));
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn() },
  useLocalSearchParams: () => ({}),
}));
jest.mock('../src/ui/sheet', () => ({
  Sheet: ({ open, children }: PropsWithChildren<{ open: boolean }>) =>
    open ? children : null,
}));
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView:
    jest.requireActual<typeof import('react-native')>('react-native').View,
}));
const useStore = jest.mocked(useWorkspaceLibrary);
const first = {
  id: '81000000-0000-4000-8000-000000000001',
  name: 'Моя Ёлка',
  group: 'Грудь',
  equipment: 'штанга',
  aliases: [],
  instructions: [],
  sourceKey: null,
  archivedAt: null,
  revision: 1,
  measure: 'reps' as const,
  bodyweight: false,
};
const second = {
  ...first,
  id: '81000000-0000-4000-8000-000000000002',
  name: 'Второе',
};
const create = jest.fn<
  Promise<boolean>,
  Parameters<
    ReturnType<typeof useWorkspaceLibrary>['exerciseCommands']['create']
  >
>();
const archive = jest.fn<
  Promise<boolean>,
  Parameters<
    ReturnType<typeof useWorkspaceLibrary>['exerciseCommands']['archive']
  >
>();
const retry = jest.fn(async () => false);
const cancel = jest.fn();
const store = (scopeId = 'first', busy = false) => {
  const value = {
    workspaceId: '61000000-0000-4000-8000-000000000001',
    library: { exercises: [first, second], templates: [] },
    media: {},
    editor: { ready: true, readError: false, draft: null },
    exerciseCommands: {
      scopeId,
      busy,
      ready: true,
      error: null,
      create,
      archive,
      retry,
      cancel,
    },
  };
  useStore.mockReturnValue(
    value as unknown as ReturnType<typeof useWorkspaceLibrary>,
  );
};
const openArchive = async (name: string) => {
  await fireEvent.press(screen.getByText(name));
  await fireEvent.press(
    screen.getByRole('button', { name: 'Архивировать упражнение' }),
  );
};
beforeEach(() => {
  jest.clearAllMocks();
  create.mockResolvedValue(true);
  archive.mockResolvedValue(true);
  store();
});
test('normalized ё search finds existing exercise and new input delegates captured custom payload', async () => {
  await render(<WorkspaceLibraryRoute />);
  await fireEvent.changeText(
    screen.getByLabelText('Поиск упражнений'),
    '  моя елка  ',
  );
  expect(screen.getByText(first.name)).toBeTruthy();
  expect(screen.queryByText('Создать своё: «моя елка»')).toBeNull();
  await fireEvent.changeText(
    screen.getByLabelText('Поиск упражнений'),
    'Новый жим',
  );
  await fireEvent.press(
    screen.getByRole('button', { name: 'Создать своё: «Новый жим»' }),
  );
  expect(create).toHaveBeenCalledWith(
    expect.objectContaining({
      name: 'Новый жим',
      measure: 'reps',
      bodyweight: false,
    }),
    expect.any(Function),
  );
});
test('archive completion from old scope cannot close a new confirmation', async () => {
  let resolve: (value: boolean) => void = () => undefined;
  archive.mockImplementationOnce(
    () =>
      new Promise<boolean>((done) => {
        resolve = done;
      }),
  );
  const view = await render(<WorkspaceLibraryRoute />);
  await openArchive(first.name);
  await fireEvent.press(screen.getByRole('button', { name: 'Архивировать' }));
  const guard = archive.mock.calls[0]![1]!;
  expect(guard()).toBe(true);
  store('next');
  await view.rerender(<WorkspaceLibraryRoute />);
  expect(guard()).toBe(false);
  await openArchive(second.name);
  await act(() => {
    resolve(true);
  });
  expect(screen.getByRole('button', { name: 'Архивировать' })).toBeTruthy();
  expect(screen.getByText('Отмена')).toBeTruthy();
});
test('unmount cancels provider operation and revokes create caller guard', async () => {
  const view = await render(<WorkspaceLibraryRoute />);
  await fireEvent.changeText(
    screen.getByLabelText('Поиск упражнений'),
    'Новый',
  );
  await fireEvent.press(
    screen.getByRole('button', { name: 'Создать своё: «Новый»' }),
  );
  const guard = create.mock.calls[0]![1]!;
  expect(guard()).toBe(true);
  await view.unmount();
  expect(guard()).toBe(false);
  expect(cancel).toHaveBeenCalledTimes(1);
});
test('busy provider disables archive/create entry while retained error offers retry', async () => {
  store('first', true);
  await render(<WorkspaceLibraryRoute />);
  await fireEvent.press(screen.getByText(first.name));
  expect(
    screen.queryByRole('button', { name: 'Архивировать упражнение' }),
  ).toBeNull();
  await fireEvent.changeText(
    screen.getByLabelText('Поиск упражнений'),
    'Новый',
  );
  expect(
    screen.queryByRole('button', { name: 'Создать своё: «Новый»' }),
  ).toBeNull();
});

test('failed archive keeps current confirmation without clearing selection', async () => {
  archive.mockResolvedValueOnce(false);
  await render(<WorkspaceLibraryRoute />);
  await openArchive(first.name);
  await fireEvent.press(screen.getByRole('button', { name: 'Архивировать' }));
  expect(screen.getByRole('button', { name: 'Архивировать' })).toBeTruthy();
  expect(screen.getAllByText(first.name)).toHaveLength(2);
});
