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

let mockToken = 'original-token';
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
  createWorkspaceClient: jest.fn(),
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
  ) => (
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
  ),
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
