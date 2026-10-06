import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
import { Text as MockText, Pressable as MockPressable } from 'react-native';
import type { ComponentProps } from 'react';
import type { WorkspaceClientsScreen } from '@/features/workspace-clients/clients-screen';
import type { WorkspaceClientDetailsScreen } from '@/features/workspace-clients/details-screen';
import WorkspaceClientsRoute from '../app/workspace/clients';
import WorkspaceClientDetailsRoute from '../app/workspace/client/[id]';
import {
  setupRead,
  userId,
  workspaceId,
  person,
} from './workspace-client-read-fixtures';
import '../src/lib/i18n';

let mockUuid = 0;
jest.mock('expo-crypto', () => ({
  randomUUID: () =>
    `91000000-0000-4000-8000-${String(++mockUuid).padStart(12, '0')}`,
}));
let mockToken = 'original-token';
let mockListProps: ComponentProps<typeof WorkspaceClientsScreen>;
const mockCreate = jest.fn<Promise<void>, unknown[]>();
let mockWorkspaceId = workspaceId;
const mockReload = jest.fn();
const mockUserId = userId;
const mockRead = jest.fn<Promise<unknown>, unknown[]>();
const mockClientId = person.id;
jest.mock('@/features/auth/client', () => ({ getSupabaseClient: jest.fn() }));
jest.mock('@/features/auth/provider', () => ({
  useAuth: () => ({
    loading: false,
    failed: false,
    session: { user: { id: mockUserId }, access_token: mockToken },
  }),
}));
jest.mock('@/features/onboarding/use-onboarding-context', () => ({
  useOnboardingContext: () => ({
    loading: false,
    failed: false,
    context: { workspace: { id: mockWorkspaceId, timezone: 'Asia/Almaty' } },
  }),
}));
jest.mock('expo-router', () => ({
  router: { replace: jest.fn(), push: jest.fn() },
  Redirect: () => null,
  useLocalSearchParams: () => ({ id: mockClientId }),
  useFocusEffect: (callback: () => void) => {
    jest
      .requireActual<typeof import('react')>('react')
      .useEffect(callback, [callback]);
  },
}));
jest.mock('@/features/workspace-clients/service', () => ({
  loadWorkspaceClients: (...args: unknown[]) => mockRead(...args),
  loadWorkspaceClientDetails: (...args: unknown[]) => mockRead(...args),
  createWorkspaceClient: (...args: unknown[]) => mockCreate(...args),
}));
jest.mock('@/features/workspace-programs/use-assignment', () => ({
  useClientProgramAssignment: () => ({
    pending: null,
    loading: false,
    error: null,
    reload: mockReload,
  }),
}));
jest.mock('@/features/trainer-billing/client-purchase-controls', () => ({
  ClientPurchaseControls: () => null,
}));
jest.mock('@/features/workspace-scheduling/mutation-provider', () => ({
  WorkspaceMutationBoundary: ({
    children,
  }: import('react').PropsWithChildren) => children,
}));
jest.mock('@/features/workspace-clients/clients-screen', () => ({
  WorkspaceClientsScreen: (
    props: ComponentProps<typeof WorkspaceClientsScreen>,
  ) => {
    mockListProps = props;
    return (
      <>
        <MockText>
          {props.loading
            ? 'loading'
            : props.error
              ? 'error'
              : props.rows.map((row) => row.name).join(',')}
        </MockText>
        <MockPressable
          accessibilityRole="button"
          accessibilityLabel="retry"
          onPress={props.onRetry}
        />
      </>
    );
  },
}));
jest.mock('@/features/workspace-clients/details-screen', () => ({
  WorkspaceClientDetailsScreen: (
    props: ComponentProps<typeof WorkspaceClientDetailsScreen>,
  ) => (
    <>
      <MockText>
        {props.loading
          ? 'loading'
          : props.error
            ? 'error'
            : (props.data?.client.display_name ?? 'not-found')}
      </MockText>
      <MockPressable
        accessibilityRole="button"
        accessibilityLabel="retry"
        onPress={props.onRetry}
      />
    </>
  ),
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
const client = {
  ...person,
  created_by: null,
  programName: null,
  nextStartsAt: null,
  nextIsGroup: false,
};
const detail = { client, program: null, bookings: [] };
beforeEach(() => {
  jest.clearAllMocks();
  mockRead.mockReset();
  mockToken = 'original-token';
  mockWorkspaceId = workspaceId;
  setupRead();
});

for (const mode of ['list', 'details'] as const) {
  const Route =
    mode === 'list' ? WorkspaceClientsRoute : WorkspaceClientDetailsRoute;
  const snapshot = mode === 'list' ? [client] : detail;
  const loader = () => mockRead;
  test.each(['success', 'error'])(
    `${mode}: same-user session change suppresses late %s`,
    async (kind) => {
      const pending = deferred<typeof snapshot>();
      loader()
        .mockImplementationOnce(() => pending.promise)
        .mockResolvedValueOnce(snapshot);
      const view = await render(<Route />);
      expect(screen.getByText('loading')).toBeTruthy();
      mockToken = 'new-session';
      await view.rerender(<Route />);
      await waitFor(() =>
        expect(screen.getByText(person.display_name)).toBeTruthy(),
      );
      await act(async () => {
        if (kind === 'success')
          pending.resolve(
            mode === 'list'
              ? [{ ...client, display_name: 'old private name' }]
              : {
                  ...detail,
                  client: { ...client, display_name: 'old private name' },
                },
          );
        else pending.reject(new Error('old session error'));
      });
      expect(screen.queryByText('old private name')).toBeNull();
      expect(screen.queryByText('error')).toBeNull();
      expect(loader().mock.calls[1]?.at(-1)).toMatchObject({
        userId,
        token: 'new-session',
      });
    },
  );
  test(`${mode}: retry and scope change immediately clear displayed data, late retry after unmount is ignored`, async () => {
    const pending = deferred<typeof snapshot>();
    loader()
      .mockResolvedValueOnce(snapshot)
      .mockImplementationOnce(() => pending.promise)
      .mockResolvedValueOnce(snapshot);
    const view = await render(<Route />);
    await waitFor(() =>
      expect(screen.getByText(person.display_name)).toBeTruthy(),
    );
    await fireEvent.press(screen.getByRole('button', { name: 'retry' }));
    expect(screen.queryByText(person.display_name)).toBeNull();
    expect(screen.getByText('loading')).toBeTruthy();
    mockWorkspaceId = '61000000-0000-4000-8000-000000000002';
    await view.rerender(<Route />);
    await waitFor(() =>
      expect(screen.getByText(person.display_name)).toBeTruthy(),
    );
    await view.unmount();
    await act(async () => pending.reject(new Error('late retry')));
    expect(loader()).toHaveBeenCalledTimes(3);
  });
}

test('creation retry preserves ID, double tap locks, old scope finally leaves new submit busy', async () => {
  mockRead.mockResolvedValue([]);
  const first = deferred<void>();
  const second = deferred<void>();
  mockCreate
    .mockReset()
    .mockImplementationOnce(() => first.promise)
    .mockImplementationOnce(() => second.promise)
    .mockResolvedValue(undefined);
  const view = await render(<WorkspaceClientsRoute />);
  let old!: Promise<void>;
  await act(async () => {
    old = mockListProps.onAdd('Name');
    void old.catch(() => {});
  });
  await expect(mockListProps.onAdd('Name')).rejects.toThrow();
  expect(mockCreate).toHaveBeenCalledTimes(1);
  mockWorkspaceId = '61000000-0000-4000-8000-000000000002';
  await view.rerender(<WorkspaceClientsRoute />);
  expect(mockListProps.busy).toBe(false);
  let current!: Promise<void>;
  await act(async () => {
    current = mockListProps.onAdd('Name');
    void current.catch(() => {});
  });
  const reads = mockRead.mock.calls.length;
  await act(async () => {
    first.resolve();
    await expect(old).rejects.toThrow();
  });
  expect(mockListProps.busy).toBe(true);
  expect(mockRead).toHaveBeenCalledTimes(reads);
  await act(async () => {
    second.reject(new Error('lost response'));
    await expect(current).rejects.toThrow();
  });
  const requestId = mockCreate.mock.calls[1]?.[1];
  await act(async () => {
    await mockListProps.onAdd('Name');
  });
  expect(mockCreate.mock.calls[2]?.[1]).toBe(requestId);
  await view.unmount();
});

test.each(['resolve', 'reject'] as const)(
  'same actor relogin suppresses old creation %s and drops old request',
  async (kind) => {
    const jwt = (sessionId: string) =>
      `header.${Buffer.from(JSON.stringify({ sub: userId, session_id: sessionId })).toString('base64url')}.signature`;
    mockToken = jwt('91000000-0000-4000-8000-000000000001');
    mockRead.mockResolvedValue([]);
    const old = deferred<void>();
    mockCreate
      .mockReset()
      .mockImplementationOnce(() => old.promise)
      .mockResolvedValue(undefined);
    const view = await render(<WorkspaceClientsRoute />);
    let command!: Promise<void>;
    await act(async () => {
      command = mockListProps.onAdd('Name');
      void command.catch(() => {});
    });
    const request = mockCreate.mock.calls[0]?.[1];
    mockToken = jwt('91000000-0000-4000-8000-000000000002');
    await view.rerender(<WorkspaceClientsRoute />);
    const reads = mockRead.mock.calls.length;
    await act(async () => {
      if (kind === 'resolve') old.resolve();
      else old.reject(new Error('late'));
      await expect(command).rejects.toThrow();
    });
    expect(mockListProps.busy).toBe(false);
    expect(mockRead).toHaveBeenCalledTimes(reads);
    await act(async () => {
      await mockListProps.onAdd('Name');
    });
    expect(mockCreate.mock.calls[1]?.[1]).not.toBe(request);
    await view.unmount();
  },
);

test('same session refresh retains caller and retry ID after cancelled auth attempt', async () => {
  const jwt = (version: number) =>
    `header.${Buffer.from(JSON.stringify({ sub: userId, session_id: '91000000-0000-4000-8000-000000000001', version })).toString('base64url')}.signature`;
  mockToken = jwt(1);
  mockRead.mockResolvedValue([]);
  mockCreate
    .mockReset()
    .mockRejectedValueOnce(new Error('auth cancelled'))
    .mockResolvedValue(undefined);
  const view = await render(<WorkspaceClientsRoute />);
  await act(async () => {
    await expect(mockListProps.onAdd('Name')).rejects.toThrow();
  });
  const requestId = mockCreate.mock.calls[0]?.[1];
  mockToken = jwt(2);
  await view.rerender(<WorkspaceClientsRoute />);
  await act(async () => {
    await mockListProps.onAdd('Name');
  });
  expect(mockCreate.mock.calls[1]?.[1]).toBe(requestId);
  expect(mockCreate.mock.calls[1]?.[2]).toMatchObject({ token: mockToken });
  await view.unmount();
});
