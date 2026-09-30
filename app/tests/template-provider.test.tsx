import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';
import {
  TemplateProvider,
  useTemplates,
} from '../src/features/template-editor/provider';
import { decodeTemplates, templateStorageKey } from '../src/domain/templates';
function mount(storage: {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, raw: string) => Promise<void>;
}) {
  return renderHook(() => useTemplates(), {
    wrapper: ({ children }: PropsWithChildren) => (
      <TemplateProvider storage={storage}>{children}</TemplateProvider>
    ),
  });
}
test('draft edits and saved copy persist in order and restore independently of built-ins', async () => {
  let raw: string | null = null;
  const storage = {
    getItem: async () => raw,
    setItem: jest.fn(async (_key: string, value: string) => {
      raw = value;
    }),
  };
  const hook = await mount(storage);
  await waitFor(() => expect(hook.result.current.ready).toBe(true));
  await act(() => {
    hook.result.current.begin('t1', true);
  });
  await act(() => {
    hook.result.current.update({
      ...hook.result.current.draft!,
      name: 'Мой план',
    });
  });
  await waitFor(() => expect(hook.result.current.status).toBe('saved'));
  expect(decodeTemplates(raw)?.draft?.name).toBe('Мой план');
  await hook.unmount();
  const restored = await mount(storage);
  await waitFor(() =>
    expect(restored.result.current.draft?.name).toBe('Мой план'),
  );
  await act(async () => {
    expect((await restored.result.current.save()).ok).toBe(true);
  });
  expect(restored.result.current.draft).toBeNull();
  expect(restored.result.current.templates).toHaveLength(5);
  expect(decodeTemplates(raw)?.items[0]?.name).toBe('Мой план');
  expect(storage.setItem).toHaveBeenLastCalledWith(templateStorageKey, raw);
});
test('failed save retains draft, exposes error and can be retried without publishing a fake template', async () => {
  let fail = false;
  const storage = {
    getItem: async () => null,
    setItem: async () => {
      if (fail) throw new Error('full');
    },
  };
  const hook = await mount(storage);
  await waitFor(() => expect(hook.result.current.ready).toBe(true));
  await act(() => {
    hook.result.current.begin('t1', true);
  });
  await waitFor(() => expect(hook.result.current.status).toBe('saved'));
  fail = true;
  await act(async () => {
    expect(await hook.result.current.save()).toEqual({
      ok: false,
      error: 'storage',
    });
  });
  expect(hook.result.current.draft).not.toBeNull();
  expect(hook.result.current.templates).toHaveLength(4);
  expect(hook.result.current.status).toBe('error');
  fail = false;
  await act(async () => {
    expect((await hook.result.current.save()).ok).toBe(true);
  });
  expect(hook.result.current.templates).toHaveLength(5);
});
test('failed hydration blocks writes and retry recovers stored draft', async () => {
  let fail = true;
  const storage = {
    getItem: async () => {
      if (fail) throw new Error('read');
      return null;
    },
    setItem: jest.fn(async () => {}),
  };
  const hook = await mount(storage);
  await waitFor(() => expect(hook.result.current.readError).toBe(true));
  await act(() => {
    expect(hook.result.current.begin()).toBe(false);
  });
  expect(storage.setItem).not.toHaveBeenCalled();
  fail = false;
  await act(() => hook.result.current.retry());
  await waitFor(() => expect(hook.result.current.ready).toBe(true));
});
test('discard removes only the draft; editing keeps the template id', async () => {
  const storage = { getItem: async () => null, setItem: async () => {} };
  const hook = await mount(storage);
  await waitFor(() => expect(hook.result.current.ready).toBe(true));
  await act(() => {
    hook.result.current.begin('t1');
  });
  await act(() => {
    hook.result.current.update({
      ...hook.result.current.draft!,
      name: 'Низ новый',
    });
  });
  await act(async () => {
    const result = await hook.result.current.save();
    expect(result).toMatchObject({
      ok: true,
      template: { id: 't1', name: 'Низ новый' },
    });
  });
  await act(() => {
    hook.result.current.begin('t1', true);
  });
  await act(async () => {
    expect(await hook.result.current.discard()).toBe(true);
  });
  expect(hook.result.current.draft).toBeNull();
  expect(hook.result.current.templates.find((t) => t.id === 't1')?.name).toBe(
    'Низ новый',
  );
});
