import { act, fireEvent, render, screen } from '@testing-library/react-native';
import WorkspaceTemplateEditorRoute from '../app/workspace/library/editor';
import { useWorkspaceLibrary } from '../src/features/workspace-library/provider';
import '../src/lib/i18n';

jest.mock('../src/features/workspace-library/provider', () => ({
  useWorkspaceLibrary: jest.fn(),
}));
jest.mock('expo-router', () => ({
  router: { replace: jest.fn() },
  useLocalSearchParams: () => ({ clientId: mockClientId }),
}));
jest.mock('../src/features/template-editor/screen', () => ({
  TemplateEditorScreen: ({ header }: { header: import('react').ReactNode }) =>
    header,
}));
let mockClientId = 'client-a';
const reload = jest.fn<Promise<void>, []>();
let current = true;
const setStore = (scope = 1) =>
  jest.mocked(useWorkspaceLibrary).mockReturnValue({
    editor: { scope, capture: () => () => current },
    library: { exercises: [] },
    media: {},
    commandError: 'conflict',
    reloadServerDraft: reload,
  } as unknown as ReturnType<typeof useWorkspaceLibrary>);
beforeEach(() => {
  jest.clearAllMocks();
  current = true;
  mockClientId = 'client-a';
  setStore();
});
test.each(['unmount', 'clientId', 'draft', 'session', 'newer reload'])(
  'late reload failure after %s is ignored',
  async (change) => {
    let reject: (error: Error) => void = () => undefined;
    reload.mockImplementationOnce(
      () =>
        new Promise((_resolve, fail) => {
          reject = fail;
        }),
    );
    const view = await render(<WorkspaceTemplateEditorRoute />);
    await fireEvent.press(
      screen.getByText('Заменить черновик серверной версией'),
    );
    if (change === 'unmount') await view.unmount();
    if (change === 'clientId') {
      mockClientId = 'client-b';
      await view.rerender(<WorkspaceTemplateEditorRoute />);
    }
    if (change === 'draft') {
      setStore(2);
      await view.rerender(<WorkspaceTemplateEditorRoute />);
    }
    if (change === 'session') current = false;
    if (change === 'newer reload') {
      reload.mockResolvedValueOnce();
      await fireEvent.press(
        screen.getByText('Заменить черновик серверной версией'),
      );
    }
    await act(() => reject(new Error('offline')));
    if (change !== 'unmount')
      expect(
        screen.queryByText(
          'Этот шаблон больше недоступен. Вернитесь в библиотеку.',
        ),
      ).toBeNull();
  },
);
test('current reload failure displays feedback and a new attempt clears it', async () => {
  reload.mockRejectedValueOnce(new Error('offline'));
  await render(<WorkspaceTemplateEditorRoute />);
  await fireEvent.press(
    screen.getByText('Заменить черновик серверной версией'),
  );
  expect(screen.getAllByRole('alert')).toHaveLength(2);
  reload.mockResolvedValueOnce();
  await fireEvent.press(
    screen.getByText('Заменить черновик серверной версией'),
  );
  expect(screen.getAllByRole('alert')).toHaveLength(1);
});
