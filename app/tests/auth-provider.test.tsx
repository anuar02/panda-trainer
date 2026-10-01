import { act, render, screen, waitFor } from '@testing-library/react-native';
import { Text } from 'react-native';
import type { AuthChangeEvent, Session } from '@supabase/supabase-js';
import { AuthProvider, useAuth } from '../src/features/auth/provider';

const mockGetSession = jest.fn();
const mockUnsubscribe = jest.fn();
const mockStart = jest.fn();
const mockStop = jest.fn();
let mockListener: (event: AuthChangeEvent, session: Session | null) => void;
const mockClient = {
  auth: { startAutoRefresh: mockStart, stopAutoRefresh: mockStop },
};

jest.mock('../src/features/auth/client', () => ({
  getSupabaseClient: () => mockClient,
}));
jest.mock('../src/features/auth/service', () => ({
  authService: {
    getSession: () => mockGetSession(),
    onAuthStateChange: (listener: typeof mockListener) => {
      mockListener = listener;
      return { unsubscribe: mockUnsubscribe };
    },
  },
}));

const session: Session = {
  access_token: 'synthetic-token',
  refresh_token: 'synthetic-refresh',
  expires_in: 3600,
  token_type: 'bearer',
  user: {
    id: 'synthetic-user',
    app_metadata: {},
    user_metadata: {},
    aud: 'authenticated',
    created_at: '2026-10-01T00:00:00Z',
  },
};

function Probe() {
  const auth = useAuth();
  return (
    <Text>
      {auth.loading
        ? 'loading'
        : auth.failed
          ? 'failed'
          : (auth.session?.user.id ?? 'signed-out')}
    </Text>
  );
}

beforeEach(() => jest.clearAllMocks());

test('a later sign-out event wins over an older session restoration', async () => {
  let resolve: (value: Session | null) => void = () => {};
  mockGetSession.mockReturnValue(
    new Promise<Session | null>((done) => {
      resolve = done;
    }),
  );
  const view = await render(
    <AuthProvider>
      <Probe />
    </AuthProvider>,
  );
  await act(() => mockListener('SIGNED_OUT', null));
  await act(() => resolve(session));
  expect(screen.getByText('signed-out')).toBeTruthy();
  await view.unmount();
  expect(mockUnsubscribe).toHaveBeenCalledTimes(1);
});

test('a storage failure stays visible rather than looking like a clean logout', async () => {
  mockGetSession.mockRejectedValue(new Error('Secure storage unavailable'));
  await render(
    <AuthProvider>
      <Probe />
    </AuthProvider>,
  );
  await waitFor(() => expect(screen.getByText('failed')).toBeTruthy());
});

test('expired or revoked sessions remove the authenticated state', async () => {
  mockGetSession.mockResolvedValue(session);
  await render(
    <AuthProvider>
      <Probe />
    </AuthProvider>,
  );
  await waitFor(() => expect(screen.getByText('synthetic-user')).toBeTruthy());
  await act(() => mockListener('SIGNED_OUT', null));
  expect(screen.getByText('signed-out')).toBeTruthy();
});
