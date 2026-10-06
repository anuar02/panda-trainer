import { render, screen } from '@testing-library/react-native';
import '../src/lib/i18n';
import Home from '../app/(client)/home';
import History from '../app/(client)/history';
import Progress from '../app/(client)/progress';
import Program from '../app/(client)/program';
import { clientReadToken } from './client-read-auth-fixture';
import { user, card, workspace } from './som36-client-network';
let mockAuth = {
  session: { user: { id: user }, access_token: clientReadToken(user) } as {
    user: { id: string };
    access_token: string;
  } | null,
  loading: false,
  failed: false,
};
let mockContext = {
  context: {
    connections: [
      {
        workspace_id: workspace,
        client_record_id: card,
        client_name: 'Synthetic client',
        trainer_name: 'Synthetic trainer',
      },
    ],
  },
  loading: false,
  failed: false,
  retry: jest.fn(),
};
jest.mock('../src/features/auth/provider', () => ({ useAuth: () => mockAuth }));
jest.mock('../src/features/onboarding/use-onboarding-context', () => ({
  useOnboardingContext: () => mockContext,
}));
jest.mock('expo-router', () => ({
  Redirect: ({ href }: { href: unknown }) => {
    const { Text } =
      jest.requireActual<typeof import('react-native')>('react-native');
    return <Text>{JSON.stringify(href)}</Text>;
  },
}));
beforeEach(() => {
  mockAuth = {
    session: { user: { id: user }, access_token: clientReadToken(user) },
    loading: false,
    failed: false,
  };
  mockContext = {
    context: {
      connections: [
        {
          workspace_id: workspace,
          client_record_id: card,
          client_name: 'Synthetic client',
          trainer_name: 'Synthetic trainer',
        },
      ],
    },
    loading: false,
    failed: false,
    retry: jest.fn(),
  };
});
test.each([
  [Home, ''],
  [History, '/history'],
  [Progress, '/progress'],
  [Program, '/program'],
] as const)(
  'client tab routes through authenticated connection without demo fallback %s',
  async (Route, suffix) => {
    const view = await render(<Route />);
    expect(
      screen.getByText(
        JSON.stringify({
          pathname: `/connection/[clientRecordId]${suffix}`,
          params: { clientRecordId: card },
        }),
      ),
    ).toBeTruthy();
    mockAuth.session = null;
    await view.rerender(<Route />);
    expect(screen.getByText('"/auth/sign-in"')).toBeTruthy();
  },
);
test('unlinked and multiple-card accounts choose through account, loading/error do not navigate', async () => {
  mockContext.context.connections = [];
  const view = await render(<Home />);
  expect(screen.getByText('"/auth/account"')).toBeTruthy();
  mockContext.context.connections = [
    {
      workspace_id: workspace,
      client_record_id: card,
      client_name: 'Synthetic client',
      trainer_name: 'Synthetic trainer',
    },
    {
      workspace_id: user,
      client_record_id: user,
      client_name: 'Other card',
      trainer_name: 'Other trainer',
    },
  ];
  await view.rerender(<Home />);
  expect(screen.getByText('"/auth/account"')).toBeTruthy();
  mockContext.loading = true;
  await view.rerender(<Home />);
  expect(screen.queryByText('"/auth/account"')).toBeNull();
  mockContext.loading = false;
  mockContext.failed = true;
  await view.rerender(<Home />);
  expect(
    screen.getByRole('button', { name: 'Попробовать снова' }),
  ).toBeTruthy();
});
