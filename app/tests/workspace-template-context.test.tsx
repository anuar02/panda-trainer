import { act, renderHook } from '@testing-library/react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useWorkspaceTemplateLauncher } from '../src/features/workspace-library/launcher';
import {
  workspaceTemplateEditorHref,
  workspaceTemplateLibraryHref,
  workspaceTemplateRouteHref,
} from '../src/features/workspace-library/editor-routes';
import { useWorkspaceLibrary } from '../src/features/workspace-library/provider';

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn() },
}));
jest.mock('react-i18next', () => ({
  useTranslation: jest.fn(),
}));
jest.mock('../src/features/workspace-library/provider', () => ({
  useWorkspaceLibrary: jest.fn(),
}));
jest.mock('@/ui/button', () => ({ Button: () => null }));
jest.mock('@/ui/sheet', () => ({ Sheet: () => null }));
jest.mock('@/ui/text', () => ({ Text: () => null }));

const clientId = '61000000-0000-4000-8000-000000000001';
const templateId = '91000000-0000-4000-8000-000000000001';
const begin = jest.fn(() => true);
const editor = {
  ready: true,
  busy: false,
  draft: null,
  begin,
};
const store = { editor } as unknown as ReturnType<typeof useWorkspaceLibrary>;

describe('workspace template client context routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(useTranslation).mockReturnValue({
      t: (key: string) => key,
    } as ReturnType<typeof useTranslation>);
    jest.mocked(useWorkspaceLibrary).mockReturnValue(store);
  });

  it.each([
    ['create', undefined, undefined],
    ['edit', templateId, undefined],
    ['copy', templateId, true],
  ])(
    '%s opens the editor and starts the expected draft',
    async (_, id, copy) => {
      const { result } = await renderHook(() =>
        useWorkspaceTemplateLauncher(clientId),
      );

      await act(() => result.current.start(id, copy));

      expect(begin).toHaveBeenCalledWith(id, copy);
      expect(router.push).toHaveBeenCalledWith(
        workspaceTemplateEditorHref(clientId),
      );
    },
  );

  it('resumes the editor with the client context', async () => {
    const { result } = await renderHook(() =>
      useWorkspaceTemplateLauncher(clientId),
    );

    await act(() => result.current.resume());

    expect(router.push).toHaveBeenCalledWith(
      workspaceTemplateEditorHref(clientId),
    );
    expect(begin).not.toHaveBeenCalled();
  });

  it('returns to the client template library when leaving the editor', () => {
    expect(workspaceTemplateLibraryHref(clientId)).toEqual({
      pathname: '/workspace/library',
      params: { clientId, tab: 'templates' },
    });
  });

  it('opens the saved template with the client context', () => {
    expect(workspaceTemplateRouteHref(templateId, clientId)).toEqual({
      pathname: '/workspace/library/template/[id]',
      params: { id: templateId, clientId },
    });
  });

  it('keeps the existing routes outside client assignment context', () => {
    expect(workspaceTemplateEditorHref()).toBe('/workspace/library/editor');
    expect(workspaceTemplateLibraryHref()).toBe('/workspace/library');
    expect(workspaceTemplateRouteHref(templateId)).toEqual({
      pathname: '/workspace/library/template/[id]',
      params: { id: templateId },
    });
  });
});

it('old launcher cannot resume or begin after client context changes or unmount', async () => {
  const hook = await renderHook(
    ({ id }: { id: string }) => useWorkspaceTemplateLauncher(id),
    { initialProps: { id: clientId } },
  );
  const old = hook.result.current;
  await hook.rerender({ id: 'next-client' });
  await act(() => {
    old.resume();
    old.start(templateId);
  });
  expect(router.push).not.toHaveBeenCalled();
  expect(begin).not.toHaveBeenCalled();
  await act(() => hook.result.current.start(templateId, true));
  expect(router.push).toHaveBeenCalledWith(
    workspaceTemplateEditorHref('next-client'),
  );
  const leaving = hook.result.current;
  await hook.unmount();
  jest.clearAllMocks();
  await act(() => {
    leaving.resume();
    leaving.start(templateId);
  });
  expect(router.push).not.toHaveBeenCalled();
  expect(begin).not.toHaveBeenCalled();
});

it('old conflict close callback cannot dismiss the next scope confirmation', async () => {
  jest.mocked(useWorkspaceLibrary).mockReturnValue({
    ...store,
    editor: { ...editor, draft: {} },
  } as unknown as ReturnType<typeof useWorkspaceLibrary>);
  const hook = await renderHook(
    ({ id }: { id: string }) => useWorkspaceTemplateLauncher(id),
    { initialProps: { id: clientId } },
  );
  await act(() => hook.result.current.start(templateId));
  const oldClose = hook.result.current.conflict.props.onClose as () => void;
  await hook.rerender({ id: 'next-client' });
  await act(() => hook.result.current.start(templateId, true));
  expect(hook.result.current.conflict.props.open).toBe(true);
  await act(oldClose);
  expect(hook.result.current.conflict.props.open).toBe(true);
});
