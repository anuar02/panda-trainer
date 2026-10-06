import type { Session, SupabaseClient } from '@supabase/supabase-js';
import * as WebBrowser from 'expo-web-browser';
import type { Database } from '../src/lib/database.types';
import { getSupabaseClient } from '../src/features/auth/client';
import { authService, AuthServiceError } from '../src/features/auth/service';

jest.mock('../src/features/auth/client', () => ({
  getSupabaseClient: jest.fn(),
}));
jest.mock('expo-web-browser', () => ({
  WebBrowserResultType: { CANCEL: 'cancel' },
  openAuthSessionAsync: jest.fn(),
  maybeCompleteAuthSession: jest.fn(),
}));

const getClient = jest.mocked(getSupabaseClient);
const mockSession: Session = {
  access_token: 'access-token',
  refresh_token: 'refresh-token',
  token_type: 'bearer',
  expires_in: 3600,
  expires_at: 1_800_000_000,
  user: {
    id: 'user-id',
    app_metadata: {},
    user_metadata: {},
    aud: 'authenticated',
    created_at: '2026-01-01T00:00:00Z',
  },
};

const createMockClient = (auth: Record<string, unknown>) =>
  ({ auth }) as unknown as SupabaseClient<Database>;

describe('auth service', () => {
  beforeEach(() => {
    getClient.mockReset();
  });

  it('sends and verifies an email OTP using the email flow', async () => {
    const signInWithOtp = jest.fn().mockResolvedValue({ error: null });
    const verifyOtp = jest.fn().mockResolvedValue({
      data: { session: mockSession },
      error: null,
    });
    getClient.mockReturnValue(createMockClient({ signInWithOtp, verifyOtp }));

    await authService.sendEmailCode(' coach@example.com ');
    const session = await authService.verifyEmailCode(
      ' coach@example.com ',
      ' 123456 ',
    );

    expect(signInWithOtp).toHaveBeenCalledWith({
      email: 'coach@example.com',
      options: { shouldCreateUser: true },
    });
    expect(verifyOtp).toHaveBeenCalledWith({
      email: 'coach@example.com',
      token: '123456',
      type: 'email',
    });
    expect(session).toBe(mockSession);
  });

  it('surfaces rejected email codes as a stable service error', async () => {
    const verifyOtp = jest.fn().mockResolvedValue({
      data: { session: null },
      error: { code: 'otp_expired' },
    });
    getClient.mockReturnValue(createMockClient({ verifyOtp }));

    await expect(
      authService.verifyEmailCode('coach@example.com', '123456'),
    ).rejects.toMatchObject({
      code: 'code',
    });
  });

  it('rejects untrusted callback parameters before exchanging a code', async () => {
    const exchangeCodeForSession = jest.fn();
    getClient.mockReturnValue(createMockClient({ exchangeCodeForSession }));

    await expect(
      authService.completeOAuthCallback(
        'panda-trainer://auth/callback?code=sample&access_token=secret',
      ),
    ).rejects.toBeInstanceOf(AuthServiceError);
    expect(exchangeCodeForSession).not.toHaveBeenCalled();
  });

  it('shares duplicate PKCE callback exchanges', async () => {
    const exchangeCodeForSession = jest.fn().mockResolvedValue({
      data: { session: mockSession },
      error: null,
    });
    getClient.mockReturnValue(createMockClient({ exchangeCodeForSession }));
    const callback = 'panda-trainer://auth/callback?code=unique-auth-code';

    const first = authService.completeOAuthCallback(callback);
    const duplicate = authService.completeOAuthCallback(callback);

    await expect(first).resolves.toBe(mockSession);
    await expect(duplicate).resolves.toBe(mockSession);
    expect(exchangeCodeForSession).toHaveBeenCalledTimes(1);
  });

  it('returns null when the user cancels provider sign-in', async () => {
    const signInWithOAuth = jest.fn().mockResolvedValue({
      data: {
        url: 'https://provider.example/authorize?code_challenge_method=s256',
      },
      error: null,
    });
    getClient.mockReturnValue(createMockClient({ signInWithOAuth }));
    jest.mocked(WebBrowser.openAuthSessionAsync).mockResolvedValue({
      type: WebBrowser.WebBrowserResultType.CANCEL,
    });

    await expect(authService.signInWithProvider('google')).resolves.toBeNull();
    expect(signInWithOAuth).toHaveBeenCalledWith({
      provider: 'google',
      options: {
        redirectTo: 'panda-trainer://auth/callback',
        skipBrowserRedirect: true,
      },
    });
  });

  it('rejects a downgraded PKCE flow before opening the provider', async () => {
    jest.mocked(WebBrowser.openAuthSessionAsync).mockClear();
    const signInWithOAuth = jest.fn().mockResolvedValue({
      data: {
        url: 'https://provider.example/authorize?code_challenge_method=plain',
      },
      error: null,
    });
    getClient.mockReturnValue(createMockClient({ signInWithOAuth }));
    await expect(
      authService.signInWithProvider('google'),
    ).rejects.toMatchObject({
      code: 'configuration',
    });
    expect(WebBrowser.openAuthSessionAsync).not.toHaveBeenCalled();
  });

  it('signs out only the current local session', async () => {
    const signOut = jest.fn().mockResolvedValue({ error: null });
    getClient.mockReturnValue(createMockClient({ signOut }));

    await authService.signOut();

    expect(signOut).toHaveBeenCalledWith({ scope: 'local' });
  });
});
