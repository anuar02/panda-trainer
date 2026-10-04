import { pushOpenPayload } from '@/features/push/routing';
const payload = {
  version: 1,
  notificationId: '59000000-0000-4000-8000-000000000001',
  workspaceId: '69000000-0000-4000-8000-000000000001',
};
test('only versioned feed ids are accepted; arbitrary URLs and foreign snapshots rejected', () => {
  expect(pushOpenPayload(payload)).toEqual({
    notificationId: payload.notificationId,
    workspaceId: payload.workspaceId,
  });
  for (const value of [
    null,
    [],
    { ...payload, version: 2 },
    { ...payload, url: '/workspace' },
    { ...payload, notificationId: 'invalid' },
    { ...payload, privateNotes: 'text' },
  ])
    expect(pushOpenPayload(value)).toBeNull();
});
