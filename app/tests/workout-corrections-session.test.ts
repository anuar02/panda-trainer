import { openCorrectionSession } from '@/features/workout-corrections/session';

const userId = '51000000-0000-4000-8000-000000000001';
const sessionId = '51000000-0000-4000-8000-000000000002';
const token = (sid = sessionId, suffix = 'one') =>
  `header.${Buffer.from(JSON.stringify({ sub: userId, session_id: sid })).toString('base64url')}.${suffix}`;
let current = { access_token: token(), user: { id: userId } };
let mockListener: (event: string, session: typeof current | null) => void;
const mockUnsubscribe = jest.fn();
const mockGetSession = jest.fn(async () => ({
  data: { session: current },
  error: null,
}));
jest.mock('@/features/auth/client', () => ({
  getSupabaseClient: () => ({
    auth: {
      getSession: () => mockGetSession(),
      onAuthStateChange: (callback: typeof mockListener) => {
        mockListener = callback;
        return { data: { subscription: { unsubscribe: mockUnsubscribe } } };
      },
    },
  }),
}));

beforeEach(() => {
  current = { access_token: token(), user: { id: userId } };
  jest.clearAllMocks();
});

test('refresh keeps the original login usable and returns refreshed credentials', async () => {
  const session = openCorrectionSession(userId, sessionId);
  expect(await session.token()).toBe(current.access_token);
  current = { ...current, access_token: token(sessionId, 'refreshed') };
  mockListener('TOKEN_REFRESHED', current);
  expect(await session.token()).toBe(current.access_token);
  session.dispose();
  session.dispose();
  expect(mockUnsubscribe).toHaveBeenCalledTimes(1);
});

test('same participant signing in again invalidates the original confirmation', async () => {
  const invalidated = jest.fn();
  const session = openCorrectionSession(userId, sessionId, invalidated);
  await session.token();
  current = {
    ...current,
    access_token: token('51000000-0000-4000-8000-000000000003'),
  };
  mockListener('SIGNED_IN', current);
  expect(session.valid()).toBe(false);
  expect(invalidated).toHaveBeenCalledWith(true);
  await expect(session.token()).rejects.toThrow(
    'Correction session unavailable',
  );
});

test('participant change cannot submit using a previously reviewed session', async () => {
  const session = openCorrectionSession(userId, sessionId);
  await session.token();
  mockListener('SIGNED_OUT', null);
  await expect(session.token()).rejects.toThrow(
    'Correction session unavailable',
  );
  expect(session.valid()).toBe(false);
});

test('silent token replacement requires fresh review', async () => {
  const session = openCorrectionSession(userId, sessionId);
  await session.token();
  current = { ...current, access_token: token(sessionId, 'unexpected') };
  await expect(session.token()).rejects.toThrow(
    'Correction session unavailable',
  );
  expect(session.valid()).toBe(false);
});

test('malformed login identity and a different actor are rejected', async () => {
  const session = openCorrectionSession(userId, sessionId);
  await expect(
    session.token('51000000-0000-4000-8000-000000000099'),
  ).rejects.toThrow();
  current = { ...current, access_token: 'malformed' };
  await expect(session.token()).rejects.toThrow();
});
