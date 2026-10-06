import {
  createNativeExportAdapter,
  type NativeFileApi,
} from '@/features/account-export/native-adapter';
import { createWebExportAdapter } from '@/features/account-export/file.web';
import { AccountExportError } from '@/features/account-export/service';
import snapshot from './snapshot.json';
const json = JSON.stringify(snapshot);
const scope = {
  userId: snapshot.owner_user_id,
  workspaceId: snapshot.workspace_id,
};
const guard = async () => undefined;
function native(platform = 'ios') {
  return {
    platform,
    cache: 'file:///cache/',
    id: () => 'synthetic-id',
    pick: jest.fn(async () => ({
      granted: true,
      directoryUri: 'content://chosen',
    })),
    create: jest.fn(async () => 'content://chosen/export.json'),
    write: jest.fn(async (_uri: string, _json: string) => undefined),
    remove: jest.fn(async () => undefined),
    share: jest.fn(async () => 'shared' as 'shared' | 'cancelled'),
  } satisfies NativeFileApi;
}
test.each(['shared', 'cancelled'] as const)(
  'iOS %s cleans scoped UTF-8 JSON; no save claim',
  async (result) => {
    const api = native();
    api.share.mockResolvedValue(result);
    expect(await createNativeExportAdapter(api)(json, scope, guard)).toEqual({
      result,
      evidence: null,
    });
    const uri = api.write.mock.calls[0]?.[0];
    expect(uri).toContain(`${scope.userId}-${scope.workspaceId}`);
    expect(api.write).toHaveBeenCalledWith(uri, json);
    expect(api.remove).toHaveBeenCalledWith(uri);
  },
);
test.each(['write', 'share', 'remove'] as const)(
  'iOS %s failure never claims success',
  async (operation) => {
    const api = native();
    api[operation].mockRejectedValueOnce(new Error('synthetic failure'));
    await expect(
      createNativeExportAdapter(api)(json, scope, guard),
    ).rejects.toMatchObject({
      code:
        operation === 'write'
          ? 'storage'
          : operation === 'share'
            ? 'share'
            : 'cleanup',
    });
    expect(api.remove).toHaveBeenCalledTimes(1);
  },
);
test('Android saves only after write and keeps the user destination', async () => {
  const api = native('android');
  expect(await createNativeExportAdapter(api)(json, scope, guard)).toEqual({
    result: 'saved',
    evidence: null,
  });
  expect(api.write).toHaveBeenCalledWith('content://chosen/export.json', json);
  expect(api.share).not.toHaveBeenCalled();
  expect(api.remove).not.toHaveBeenCalled();
});
test('Android directory cancel creates no file', async () => {
  const api = native('android');
  api.pick.mockResolvedValue({ granted: false, directoryUri: '' });
  expect(await createNativeExportAdapter(api)(json, scope, guard)).toEqual({
    result: 'cancelled',
    evidence: null,
  });
  expect(api.create).not.toHaveBeenCalled();
});
test.each(['create', 'write'] as const)(
  'Android %s error cleans partial file',
  async (operation) => {
    const api = native('android');
    api[operation].mockRejectedValueOnce(new Error('synthetic'));
    await expect(
      createNativeExportAdapter(api)(json, scope, guard),
    ).rejects.toMatchObject({ code: 'storage' });
    expect(api.remove).toHaveBeenCalledTimes(operation === 'write' ? 1 : 0);
  },
);
test('switch after picker creates no file; switch after create removes partial file', async () => {
  for (const failureAt of [2, 3, 4]) {
    const api = native('android');
    let checks = 0;
    await expect(
      createNativeExportAdapter(api)(json, scope, async () => {
        if (++checks === failureAt)
          throw new AccountExportError('sessionChanged');
      }),
    ).rejects.toMatchObject({ code: 'sessionChanged' });
    expect(api.remove).toHaveBeenCalledTimes(failureAt > 3 ? 1 : 0);
    expect(api.share).not.toHaveBeenCalled();
  }
});
function web() {
  const writer = {
    write: jest.fn(async (_blob: Blob) => undefined),
    close: jest.fn(async () => undefined),
    abort: jest.fn(async () => undefined),
  };
  const picker = jest.fn(async () => ({ createWritable: async () => writer }));
  return { writer, picker, save: createWebExportAdapter(picker) };
}
test('web writes UTF-8 blob and reports saved only after close', async () => {
  const x = web();
  expect(await x.save(json, scope, guard)).toEqual({
    result: 'saved',
    evidence: null,
  });
  const blob = x.writer.write.mock.calls[0]?.[0];
  expect(blob?.type).toBe('application/json;charset=utf-8');
  expect(await blob?.text()).toBe(json);
  expect(x.writer.close).toHaveBeenCalledTimes(1);
  expect(x.writer.abort).not.toHaveBeenCalled();
});
test.each(['write', 'close'] as const)(
  'web %s failure aborts pending write',
  async (operation) => {
    const x = web();
    x.writer[operation].mockRejectedValueOnce(new Error('synthetic'));
    await expect(x.save(json, scope, guard)).rejects.toMatchObject({
      code: 'storage',
    });
    expect(x.writer.abort).toHaveBeenCalledTimes(1);
  },
);
test('web picker abort and unsupported are distinct', async () => {
  const x = web();
  x.picker.mockRejectedValueOnce(
    Object.assign(new Error('synthetic'), { name: 'AbortError' }),
  );
  expect(await x.save(json, scope, guard)).toEqual({
    result: 'cancelled',
    evidence: null,
  });
  await expect(
    createWebExportAdapter()(json, scope, guard),
  ).rejects.toMatchObject({ code: 'unsupported' });
});
test('web session switch after write aborts before commit', async () => {
  const x = web();
  let checks = 0;
  await expect(
    x.save(json, scope, async () => {
      if (++checks === 3) throw new AccountExportError('sessionChanged');
    }),
  ).rejects.toMatchObject({ code: 'sessionChanged' });
  expect(x.writer.close).not.toHaveBeenCalled();
  expect(x.writer.abort).toHaveBeenCalledTimes(1);
});
test('web cleanup failure is explicit', async () => {
  const x = web();
  x.writer.write.mockRejectedValueOnce(new Error('synthetic'));
  x.writer.abort.mockRejectedValueOnce(new Error('synthetic'));
  await expect(x.save(json, scope, guard)).rejects.toMatchObject({
    code: 'cleanup',
  });
});
