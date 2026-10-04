import { act, renderHook, waitFor } from '@testing-library/react-native';
import { useProgramUpdate } from '@/features/program-update/use-update';
import { createProgramUpdateTransport } from '@/features/program-update/service';
import {
  updateContext as context,
  updateParticipant as participant,
  updateSession as session,
} from './program-update-fixtures';
jest.mock('@/features/program-update/service', () => ({
  createProgramUpdateTransport: jest.fn(),
}));
jest.mock('@/features/program-update/pending', () => ({
  loadPendingUpdateCommand: jest.fn(async () => null),
  savePendingUpdateCommand: jest.fn(async () => {}),
  clearPendingUpdateCommand: jest.fn(async () => true),
}));
function transport() {
  let active = true;
  return {
    valid: () => active,
    dispose: jest.fn(() => {
      active = false;
    }),
    load: jest.fn(async () => context),
    apply: jest.fn(),
  };
}
beforeEach(() => {
  jest.clearAllMocks();
});
test('dismiss disposes caller immediately and reopen gets a fresh reviewed context', async () => {
  const first = transport();
  const second = transport();
  jest
    .mocked(createProgramUpdateTransport)
    .mockReturnValueOnce(first)
    .mockReturnValue(second);
  const hook = await renderHook(() =>
    useProgramUpdate(session, () => session, participant),
  );
  await waitFor(() => expect(hook.result.current.state?.ready).toBe(true));
  await act(() => hook.result.current.close());
  expect(first.dispose).toHaveBeenCalled();
  await waitFor(() => expect(second.load).toHaveBeenCalled());
  await act(() => hook.result.current.open());
  await waitFor(() => expect(hook.result.current.opened).toBe(true));
});
test('client switch and correction revision hide old data before late review completes', async () => {
  const first = transport();
  const second = transport();
  let resolve: (v: typeof context) => void = () => {};
  first.load.mockImplementation(
    () =>
      new Promise((r) => {
        resolve = r;
      }),
  );
  jest
    .mocked(createProgramUpdateTransport)
    .mockReturnValueOnce(first)
    .mockReturnValue(second);
  const hook = await renderHook(
    ({ p }: { p: typeof participant }) =>
      useProgramUpdate(session, () => session, p),
    { initialProps: { p: participant } },
  );
  await waitFor(() => expect(first.load).toHaveBeenCalled());
  await hook.rerender({ p: { ...participant, workoutRevision: 4 } });
  await act(async () => {
    resolve(context);
    await Promise.resolve();
  });
  expect(first.dispose).toHaveBeenCalled();
  await waitFor(() => expect(second.load).toHaveBeenCalled());
  await hook.unmount();
  expect(second.dispose).toHaveBeenCalled();
});
