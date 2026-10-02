import { fireEvent, render, screen } from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';
import '../src/lib/i18n';
import {
  ClientBookingControls,
  ClientBookingStatusRecovery,
} from '../src/features/client-scheduling/client-booking-controls';
import type {
  ClientScheduleBooking,
  ClientScheduleProposal,
} from '../src/features/client-scheduling/service';
import type { WorkspaceProposalStore } from '../src/features/workspace-scheduling/workspace-proposal-controls';
import type { ClientBookingStatusStore } from '../src/features/client-scheduling/use-status';
jest.mock('expo-crypto', () => ({
  randomUUID: () => '30000000-0000-4000-8000-000000000001',
}));
jest.mock('../src/features/auth/client', () => ({
  getSupabaseClient: jest.fn(),
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
const booking: ClientScheduleBooking = {
  id: 'booking',
  workspace_id: 'workspace',
  client_record_id: 'client',
  group_session_id: 'group',
  starts_at: '2030-10-02T05:00:00.000Z',
  ends_at: '2030-10-02T06:00:00.000Z',
  status: 'proposed',
  revision: 3,
  program: null,
};
const proposal: ClientScheduleProposal = {
  id: 'proposal',
  bookingId: 'booking',
  proposedStartsAtUtc: '2030-10-03T05:00:00.000Z',
  proposedEndsAtUtc: '2030-10-03T06:00:00.000Z',
  baseRevision: 3,
  revision: 5,
  authorRole: 'trainer',
  booking,
};
const statusSubmit = jest.fn().mockResolvedValue(null),
  proposalSubmit = jest.fn().mockResolvedValue(null);
const status: ClientBookingStatusStore = {
  loading: false,
  busy: false,
  error: null,
  pending: null,
  submit: statusSubmit,
  resolve: jest.fn().mockResolvedValue(null),
  resume: jest.fn(),
  reload: jest.fn(),
};
const store: WorkspaceProposalStore = {
  ...status,
  pending: null,
  resolve: jest.fn().mockResolvedValue(null),
  resume: jest.fn().mockResolvedValue(null),
  userId: 'user',
  workspaceId: 'workspace',
  externalBusy: false,
  externalBlocked: false,
  submit: proposalSubmit,
};
const mount = (
  proposals: ClientScheduleProposal[] = [proposal],
  extra: {
    clientRecordId?: string;
    proposalOnly?: boolean;
    statusStore?: ClientBookingStatusStore;
    proposalStore?: WorkspaceProposalStore;
  } = {},
) =>
  render(
    <ClientBookingControls
      userId="user"
      workspaceId="workspace"
      clientRecordId={extra.clientRecordId ?? 'client'}
      clientName="Own client"
      proposalOnly={extra.proposalOnly}
      timezone="Asia/Almaty"
      booking={booking}
      proposals={proposals}
      statusStore={extra.statusStore ?? status}
      proposalStore={extra.proposalStore ?? store}
    />,
  );
beforeEach(() => {
  mockSheetModes.length = 0;
  statusSubmit.mockClear();
  proposalSubmit.mockClear();
});
test('confirm sends own booking revision through the durable status store', async () => {
  await mount();
  await fireEvent.press(screen.getByRole('button', { name: 'Подтвердить' }));
  expect(statusSubmit).toHaveBeenCalledWith({
    action: 'confirm',
    bookingId: 'booking',
    expectedRevision: 3,
    requestId: '30000000-0000-4000-8000-000000000001',
  });
});
test('trainer proposal accept uses both revisions and never self-withdraws', async () => {
  await mount();
  expect(screen.queryByRole('button', { name: 'Отозвать запрос' })).toBeNull();
  await fireEvent.press(screen.getByRole('button', { name: 'Принять' }));
  expect(proposalSubmit).toHaveBeenCalledWith({
    action: 'accept',
    bookingId: 'booking',
    expectedBookingRevision: 3,
    requestId: '30000000-0000-4000-8000-000000000001',
    proposalId: 'proposal',
    expectedProposalRevision: 5,
  });
});
test('client proposal only withdraws', async () => {
  await mount([{ ...proposal, authorRole: 'client' }]);
  expect(screen.queryByRole('button', { name: 'Принять' })).toBeNull();
  await fireEvent.press(
    screen.getByRole('button', { name: 'Отозвать запрос' }),
  );
  expect(proposalSubmit.mock.calls[0]?.[0].action).toBe('withdraw');
});
test('foreign participant blocks every action', async () => {
  await mount([proposal], { clientRecordId: 'peer' });
  for (const button of screen.getAllByRole('button'))
    expect(button).toBeDisabled();
  expect(statusSubmit).not.toHaveBeenCalled();
  expect(proposalSubmit).not.toHaveBeenCalled();
});
test('uncertain proposal blocks status and uncertain status blocks proposals', async () => {
  await mount([proposal], {
    proposalStore: {
      ...store,
      pending: {
        action: 'propose',
        bookingId: 'booking',
        expectedBookingRevision: 3,
        requestId: 'request',
        proposedStartsAtUtc: '2030-10-03T05:00:00Z',
      },
    },
  });
  expect(screen.getByRole('button', { name: 'Подтвердить' })).toBeDisabled();
});
test.each([
  ['propose', 'Предложить перенос'],
  ['counter', 'Другое время'],
] as const)(
  '%s converts own workspace target to UTC and keeps proposal revisions',
  async (action, label) => {
    await mount(action === 'propose' ? [] : [proposal]);
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
    expect(proposalSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        action,
        bookingId: 'booking',
        expectedBookingRevision: 3,
        proposedStartsAtUtc: '2030-10-03T06:15:00.000Z',
      }),
    );
    if (action === 'counter')
      expect(proposalSubmit.mock.calls[0]?.[0]).toEqual(
        expect.objectContaining({
          proposalId: 'proposal',
          expectedProposalRevision: 5,
        }),
      );
  },
);
test('durable status uncertainty blocks proposal responses', async () => {
  await mount([proposal], {
    statusStore: {
      ...status,
      pending: {
        action: 'confirm',
        bookingId: 'booking',
        expectedRevision: 3,
        requestId: 'request',
      },
    },
  });
  expect(screen.getByRole('button', { name: 'Принять' })).toBeDisabled();
  await fireEvent.press(screen.getByRole('button', { name: 'Принять' }));
  expect(proposalSubmit).not.toHaveBeenCalled();
});
test('cancel sends only own selected participant booking', async () => {
  await mount([]);
  await fireEvent.press(
    screen.getByRole('button', { name: 'Отменить запись' }),
  );
  expect(mockSheetModes.at(-1)).toBe('push');
  expect(statusSubmit).not.toHaveBeenCalled();
  await fireEvent.press(
    screen.getAllByRole('button', { name: 'Отменить запись' })[1]!,
  );
  expect(statusSubmit).toHaveBeenCalledWith({
    action: 'cancel',
    bookingId: 'booking',
    expectedRevision: 3,
    requestId: '30000000-0000-4000-8000-000000000001',
  });
});
test('cancellation keep closes confirmation without dispatching', async () => {
  await mount([]);
  await fireEvent.press(
    screen.getByRole('button', { name: 'Отменить запись' }),
  );
  expect(
    screen.getByText(
      'При отмене тренер отдельно решает вопрос списания. Отмена не создаёт автоматический штраф и не гарантирует, что занятие не будет списано.',
    ),
  ).toBeTruthy();
  await fireEvent.press(
    screen.getByRole('button', { name: 'Оставить занятие' }),
  );
  expect(screen.queryByRole('button', { name: 'Оставить занятие' })).toBeNull();
  expect(statusSubmit).not.toHaveBeenCalled();
});

test('request-only cards show both authoritative time pairs without duplicated booking actions', async () => {
  await mount([proposal], { proposalOnly: true });
  expect(screen.getByText('Действует')).toBeTruthy();
  expect(screen.getByText('Предложено')).toBeTruthy();
  expect(screen.getAllByText('10:00–11:00')).toHaveLength(2);
  expect(screen.queryByRole('button', { name: 'Подтвердить' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Отменить запись' })).toBeNull();
  expect(screen.getByRole('button', { name: 'Принять' })).toBeEnabled();
});

test('client recovery explicitly resolves pending request and blocks competing proposal action', async () => {
  const resolve = jest
    .fn()
    .mockResolvedValue({ outcome: 'abandoned', result: null });
  const recovery = {
    ...status,
    pending: {
      action: 'confirm' as const,
      bookingId: 'booking',
      expectedRevision: 1,
      requestId: 'request',
    },
    resolve,
  };
  const view = await render(
    <ClientBookingStatusRecovery store={recovery} externalBusy />,
  );
  await fireEvent.press(
    screen.getByRole('button', {
      name: 'Проверить результат и завершить запрос',
    }),
  );
  expect(resolve).not.toHaveBeenCalled();
  await view.rerender(<ClientBookingStatusRecovery store={recovery} />);
  await fireEvent.press(
    screen.getByRole('button', {
      name: 'Проверить результат и завершить запрос',
    }),
  );
  expect(resolve).toHaveBeenCalledTimes(1);
});
