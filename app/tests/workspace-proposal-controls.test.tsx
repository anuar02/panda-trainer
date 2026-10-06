import { bookingAuthFixture } from './booking-creation-auth-fixture';
import { getSupabaseClient } from '../src/features/auth/client';
import type { PropsWithChildren } from 'react';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
import '../src/lib/i18n';
import {
  WorkspaceProposalProvider,
  WorkspaceProposalRecovery,
  WorkspaceProposalControls,
  type WorkspaceProposalStore,
} from '../src/features/workspace-scheduling/workspace-proposal-controls';
import { loadPendingWorkspaceProposal } from '../src/features/workspace-scheduling/proposal-pending';
import { submitWorkspaceProposal } from '../src/features/workspace-scheduling/proposal-submission';
import type {
  WorkspaceProposalCommand,
  WorkspaceProposalResult,
} from '../src/features/workspace-scheduling/proposal-operation';
import type {
  WorkspaceScheduleBooking,
  WorkspaceScheduleProposal,
} from '../src/features/workspace-scheduling/service';
jest.mock('../src/features/auth/client', () => ({
  getSupabaseClient: jest.fn(),
}));
jest.mock('expo-crypto', () => ({
  randomUUID: () => '30000000-0000-4000-8000-000000000001',
}));
jest.mock('../src/features/workspace-scheduling/proposal-pending', () => ({
  ...jest.requireActual<
    typeof import('../src/features/workspace-scheduling/proposal-pending')
  >('../src/features/workspace-scheduling/proposal-pending'),
  loadPendingWorkspaceProposal: jest.fn(),
}));
jest.mock('../src/features/workspace-scheduling/proposal-submission', () => ({
  submitWorkspaceProposal: jest.fn(),
}));
const mockSheetModes: (string | undefined)[] = [];
jest.mock('../src/ui/sheet', () => ({
  Sheet: ({
    open,
    children,
    stackBehavior,
  }: PropsWithChildren<{ open: boolean; stackBehavior?: string }>) => {
    if (open) mockSheetModes.push(stackBehavior);
    return open ? children : null;
  },
}));
const bookingId = '20000000-0000-4000-8000-000000000001';
const proposalId = '40000000-0000-4000-8000-000000000001';
const booking: WorkspaceScheduleBooking = {
  id: bookingId,
  workspace_id: 'workspace',
  client_record_id: 'client',
  group_session_id: 'group',
  client_name: 'Real participant',
  starts_at: '2030-10-02T05:00:00.000Z',
  ends_at: '2030-10-02T06:00:00.000Z',
  status: 'confirmed',
  revision: 3,
};
const proposal: WorkspaceScheduleProposal = {
  id: proposalId,
  workspace_id: 'workspace',
  booking_id: bookingId,
  proposed_starts_at: '2030-10-03T05:00:00.000Z',
  proposed_ends_at: '2030-10-03T06:00:00.000Z',
  base_revision: 3,
  status: 'pending',
  revision: 5,
  created_at: '2030-10-01T05:00:00.000Z',
  updated_at: '2030-10-01T05:00:00.000Z',
  authorRole: 'client',
  booking,
};
const result: WorkspaceProposalResult = {
  proposalId,
  proposalRevision: 6,
  proposalStatus: 'accepted',
  bookingId,
  bookingRevision: 4,
  bookingStatus: 'confirmed',
  startsAtUtc: proposal.proposed_starts_at,
  endsAtUtc: proposal.proposed_ends_at,
  replayed: false,
};
const load = jest.mocked(loadPendingWorkspaceProposal);
const submit = jest.mocked(submitWorkspaceProposal);
const changed = jest.fn();
const mount = (
  proposals: WorkspaceScheduleProposal[] = [proposal],
  extra: {
    externalBlocked?: boolean;
    externalBusy?: boolean;
    timezone?: string;
    controls?: boolean;
  } = {},
) =>
  render(
    <WorkspaceProposalProvider
      userId="user"
      workspaceId="workspace"
      onChanged={changed}
      externalBlocked={extra.externalBlocked}
      externalBusy={extra.externalBusy}
    >
      <WorkspaceProposalRecovery />
      {extra.controls !== false && (
        <WorkspaceProposalControls
          userId="user"
          workspaceId="workspace"
          timezone={extra.timezone ?? 'Asia/Almaty'}
          booking={booking}
          proposals={proposals}
        />
      )}
    </WorkspaceProposalProvider>,
  );
beforeEach(() => {
  jest
    .mocked(getSupabaseClient)
    .mockReturnValue(bookingAuthFixture('user').client);
  load.mockReset().mockResolvedValue(null);
  submit.mockReset().mockResolvedValue(result);
  changed.mockReset();
  mockSheetModes.length = 0;
});
test('detached portal controls use the explicit store to dispatch a selected booking response', async () => {
  const dispatch = jest.fn().mockResolvedValue(result);
  const store: WorkspaceProposalStore = {
    userId: 'user',
    workspaceId: 'workspace',
    externalBlocked: false,
    externalBusy: false,
    pending: null,
    scopeKey: 'fixture-scope',
    loading: false,
    busy: false,
    error: null,
    reload: jest.fn(),
    resolve: jest.fn().mockResolvedValue(null),
    resume: jest.fn().mockResolvedValue(null),
    submit: dispatch,
  };
  await render(
    <WorkspaceProposalControls
      userId="user"
      workspaceId="workspace"
      timezone="Asia/Almaty"
      booking={booking}
      proposals={[proposal]}
      store={store}
    />,
  );
  await fireEvent.press(screen.getByRole('button', { name: 'Принять' }));
  expect(dispatch).toHaveBeenCalledWith({
    action: 'accept',
    bookingId,
    expectedBookingRevision: 3,
    requestId: '30000000-0000-4000-8000-000000000001',
    proposalId,
    expectedProposalRevision: 5,
  });
});
test.each([
  ['Принять', 'accept'],
  ['Отклонить', 'decline'],
] as const)(
  'client proposal %s sends exactly selected booking and both revisions',
  async (label, action) => {
    await mount([
      proposal,
      { ...proposal, id: 'other', booking_id: 'other-booking' },
    ]);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: label })).toBeEnabled(),
    );
    await fireEvent.press(screen.getByRole('button', { name: label }));
    await waitFor(() =>
      expect(submit).toHaveBeenCalledWith(
        'user',
        'workspace',
        {
          action,
          bookingId,
          expectedBookingRevision: 3,
          requestId: '30000000-0000-4000-8000-000000000001',
          proposalId,
          expectedProposalRevision: 5,
        },
        expect.any(Function),
        undefined,
      ),
    );
    expect(changed).toHaveBeenCalledTimes(1);
  },
);
test('trainer authored proposal permits withdrawal but cannot self-accept', async () => {
  await mount([{ ...proposal, authorRole: 'trainer' }]);
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: 'Отозвать запрос' }),
    ).toBeEnabled(),
  );
  expect(screen.queryByRole('button', { name: 'Принять' })).toBeNull();
  await fireEvent.press(
    screen.getByRole('button', { name: 'Отозвать запрос' }),
  );
  await waitFor(() =>
    expect(submit.mock.calls[0]?.[2].action).toBe('withdraw'),
  );
});
test('pending recovery exists without any selected booking and external busy blocks its exact retry', async () => {
  const pending: WorkspaceProposalCommand = {
    action: 'accept',
    bookingId,
    expectedBookingRevision: 3,
    requestId: '30000000-0000-4000-8000-000000000001',
    proposalId,
    expectedProposalRevision: 5,
  };
  load.mockResolvedValue(pending);
  const view = await mount([], { controls: false, externalBusy: true });
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: 'Повторить перенос' }),
    ).toBeDisabled(),
  );
  await fireEvent.press(
    screen.getByRole('button', { name: 'Повторить перенос' }),
  );
  expect(submit).not.toHaveBeenCalled();
  await view.rerender(
    <WorkspaceProposalProvider
      userId="user"
      workspaceId="workspace"
      onChanged={changed}
      externalBlocked
    >
      <WorkspaceProposalRecovery />
    </WorkspaceProposalProvider>,
  );
  await fireEvent.press(
    screen.getByRole('button', { name: 'Повторить перенос' }),
  );
  await waitFor(() =>
    expect(submit).toHaveBeenCalledWith(
      'user',
      'workspace',
      pending,
      expect.any(Function),
      undefined,
    ),
  );
});
test('external status pending blocks new proposal responses while saved proposal remains resumable', async () => {
  await mount([proposal], { externalBlocked: true });
  await waitFor(() => expect(load).toHaveBeenCalled());
  expect(screen.getByRole('button', { name: 'Принять' })).toBeDisabled();
  await fireEvent.press(screen.getByRole('button', { name: 'Принять' }));
  expect(submit).not.toHaveBeenCalled();
});
test('invalid and ambiguous local time keep the editor open and do not submit', async () => {
  await mount([], { timezone: 'Europe/London' });
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: 'Перенос занятия' }),
    ).toBeEnabled(),
  );
  await fireEvent.press(
    screen.getByRole('button', { name: 'Перенос занятия' }),
  );
  expect(mockSheetModes.at(-1)).toBe('push');
  await fireEvent.changeText(screen.getByLabelText('Новая дата'), '2030-10-27');
  await fireEvent.changeText(screen.getByLabelText('Начало'), '01:30');
  await fireEvent.press(
    screen.getByRole('button', { name: 'Отправить предложение' }),
  );
  expect(
    screen.getByText(
      'Это время недоступно или неоднозначно в выбранном часовом поясе.',
    ),
  ).toBeTruthy();
  expect(submit).not.toHaveBeenCalled();
});
test('proposal submission locks all participant responses until its response is persisted', async () => {
  let resolve!: (value: WorkspaceProposalResult) => void;
  submit.mockReturnValueOnce(
    new Promise((yes) => {
      resolve = yes;
    }),
  );
  await mount();
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Принять' })).toBeEnabled(),
  );
  await fireEvent.press(screen.getByRole('button', { name: 'Принять' }));
  expect(screen.getByRole('button', { name: 'Отклонить' })).toBeDisabled();
  await fireEvent.press(screen.getByRole('button', { name: 'Отклонить' }));
  expect(submit).toHaveBeenCalledTimes(1);
  await act(async () => resolve(result));
});

test.each([
  ['propose', 'Перенос занятия'],
  ['counter', 'Другое время'],
] as const)(
  '%s uses unique workspace UTC target and exact selected booking revision',
  async (action, label) => {
    await mount(action === 'propose' ? [] : [proposal]);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: label })).toBeEnabled(),
    );
    await fireEvent.press(screen.getByRole('button', { name: label }));
    expect(mockSheetModes.at(-1)).toBe('push');
    await fireEvent.changeText(
      screen.getByLabelText('Новая дата'),
      '2030-10-03',
    );
    await fireEvent.changeText(screen.getByLabelText('Начало'), '11:15');
    await fireEvent.press(
      screen.getByRole('button', { name: 'Отправить предложение' }),
    );
    await waitFor(() =>
      expect(submit).toHaveBeenCalledWith(
        'user',
        'workspace',
        expect.objectContaining({
          action,
          bookingId,
          expectedBookingRevision: 3,
          proposedStartsAtUtc: '2030-10-03T06:15:00.000Z',
        }),
        expect.any(Function),
        undefined,
      ),
    );
    if (action === 'counter')
      expect(submit.mock.calls[0]?.[2]).toEqual(
        expect.objectContaining({ proposalId, expectedProposalRevision: 5 }),
      );
    else expect(submit.mock.calls[0]?.[2]).not.toHaveProperty('proposalId');
  },
);

test('reschedule summary preserves physical duration over a daylight saving transition', async () => {
  const daylightBooking = {
    ...booking,
    starts_at: '2030-10-27T00:00:00.000Z',
    ends_at: '2030-10-27T02:00:00.000Z',
  };
  await render(
    <WorkspaceProposalProvider
      userId="user"
      workspaceId="workspace"
      onChanged={changed}
    >
      <WorkspaceProposalControls
        userId="user"
        workspaceId="workspace"
        timezone="Europe/London"
        booking={daylightBooking}
        proposals={[]}
      />
    </WorkspaceProposalProvider>,
  );
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: 'Перенос занятия' }),
    ).toBeEnabled(),
  );
  await fireEvent.press(
    screen.getByRole('button', { name: 'Перенос занятия' }),
  );
  expect(screen.getByText('Real participant · 120 мин')).toBeTruthy();
});
