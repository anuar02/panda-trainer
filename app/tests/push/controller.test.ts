import { PushController, type PushAdapter } from '@/features/push/controller';
const owner = { userId: 'a', sessionId: 'session-a', token: 'bearer-a' };
const token = 'ExpoPushToken[synthetic_device_token]';
const fixture = () => {
  const adapter: PushAdapter = {
    supported: () => true,
    device: jest.fn(async () => 'device'),
    permission: jest.fn(async () => 'granted'),
    asked: jest.fn(async () => false),
    rememberAsked: jest.fn(async () => undefined),
    request: jest.fn(async () => true),
    token: jest.fn(async () => token),
    generation: jest.fn(() => 'generation'),
    register: jest.fn(async () => undefined),
    unregister: jest.fn(async () => undefined),
    reconcile: jest.fn(async () => undefined),
  };
  return { adapter, controller: new PushController(adapter) };
};
test('register, refresh same token, rotation and logout use captured binding', async () => {
  const { adapter, controller } = fixture();
  await controller.update(owner);
  await controller.update({ ...owner, token: 'refreshed' });
  expect(adapter.register).toHaveBeenCalledTimes(1);
  adapter.token = jest.fn(async () => 'ExpoPushToken[rotated_synthetic_token]');
  await controller.update({ ...owner, token: 'refreshed' });
  expect(adapter.register).toHaveBeenCalledTimes(2);
  await controller.detach();
  expect(adapter.unregister).toHaveBeenCalledWith(
    { ...owner, token: 'refreshed' },
    'device',
    'generation',
  );
});
test.each([
  { userId: 'b', sessionId: 'session-b', token: 'b' },
  { ...owner, sessionId: 'relogin' },
])(
  'account switch and same-user relogin detach before register',
  async (next) => {
    const { adapter, controller } = fixture();
    await controller.update(owner);
    await controller.update(next);
    expect(adapter.unregister).toHaveBeenCalledWith(
      owner,
      'device',
      'generation',
    );
    expect(adapter.register).toHaveBeenLastCalledWith(
      next,
      'device',
      token,
      'generation',
    );
  },
);
test('denied permission never prompts and clears registration', async () => {
  const { adapter, controller } = fixture();
  await controller.update(owner);
  adapter.permission = jest.fn(async () => 'denied');
  await controller.update(owner);
  expect(adapter.request).not.toHaveBeenCalled();
  expect(adapter.unregister).toHaveBeenCalledTimes(1);
});
test('prompt is persisted before first request; remembered undetermined never prompts', async () => {
  const { adapter, controller } = fixture();
  adapter.permission = jest.fn(async () => 'undetermined');
  adapter.request = jest.fn(async () => false);
  await controller.update(owner);
  expect(adapter.rememberAsked).toHaveBeenCalledTimes(1);
  expect(adapter.register).not.toHaveBeenCalled();
  adapter.asked = jest.fn(async () => true);
  await controller.update(owner);
  expect(adapter.request).toHaveBeenCalledTimes(1);
});
test('invalid rotated token removes existing binding', async () => {
  const { adapter, controller } = fixture();
  await controller.update(owner);
  adapter.token = jest.fn(async () => 'invalid');
  await controller.update(owner);
  expect(adapter.unregister).toHaveBeenCalledTimes(1);
  expect(adapter.register).toHaveBeenCalledTimes(1);
});
test('late permission/token cannot register after logout', async () => {
  const { adapter, controller } = fixture();
  let finish!: (value: string) => void;
  adapter.token = jest.fn(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const pending = controller.update(owner);
  for (let i = 0; i < 10; i++) await Promise.resolve();
  const logout = controller.detach();
  finish(token);
  await pending;
  await logout;
  expect(adapter.register).not.toHaveBeenCalled();
});
test('late register gets conditional cleanup before next user', async () => {
  const { adapter, controller } = fixture();
  let finish!: () => void;
  adapter.register = jest.fn(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  const pending = controller.update(owner);
  for (let i = 0; i < 10; i++) await Promise.resolve();
  const logout = controller.detach();
  finish();
  await pending;
  await logout;
  expect(adapter.unregister).toHaveBeenCalledTimes(1);
});
test('ambiguous registration error attempts cleanup and blocks logout on cleanup failure', async () => {
  const { adapter, controller } = fixture();
  adapter.register = jest.fn(async () => {
    throw new Error('transport');
  });
  adapter.unregister = jest.fn(async () => {
    throw new Error('offline');
  });
  await expect(controller.update(owner)).rejects.toThrow();
  await expect(controller.detach()).rejects.toThrow();
});
test('web/demo is never registered', async () => {
  const { adapter, controller } = fixture();
  adapter.supported = () => false;
  await controller.update(owner);
  expect(adapter.permission).not.toHaveBeenCalled();
  expect(adapter.register).not.toHaveBeenCalled();
});
