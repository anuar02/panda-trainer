import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';
import '../src/lib/i18n';
import {
  AttendanceControls,
  type AttendanceControlsProps,
} from '../src/features/trainer-billing/attendance-controls';
import type { BillingAttendance } from '../src/features/trainer-billing/types';
jest.mock('expo-crypto', () => ({
  randomUUID: () => '30000000-0000-4000-8000-000000000001',
}));
jest.mock('../src/features/auth/client', () => ({
  getSupabaseClient: jest.fn(),
}));
jest.mock('../src/ui/sheet', () => ({
  Sheet: ({ open, children }: PropsWithChildren<{ open: boolean }>) =>
    open ? children : null,
}));
const onCommand = jest.fn().mockResolvedValue(true);
const props: AttendanceControlsProps = {
  booking: {
    id: 'booking',
    client_record_id: 'client',
    client_name: 'Анна Иванова',
    status: 'confirmed',
    revision: 3,
    starts_at: '2030-10-02T05:00:00Z',
  },
  attendance: null,
  charged: false,
  eligiblePurchases: [
    { id: 'first', title: 'Первый', remaining: 2 },
    { id: 'second', title: 'Второй', remaining: 4 },
  ],
  onCommand,
};
const attendance: BillingAttendance = {
  id: 'attendance',
  workspaceId: 'workspace',
  clientRecordId: 'client',
  bookingId: 'booking',
  status: 'present',
  revision: 2,
  cycle: 1,
  serviceDate: '2030-10-02',
  createdAt: '',
  updatedAt: '',
};
beforeEach(() => onCommand.mockClear());
it('requires attendance confirmation, uses selected package and blocks duplicate presses', async () => {
  await render(<AttendanceControls {...props} />);
  await fireEvent.press(screen.getByText('Пришёл'));
  expect(onCommand).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByText('Второй · осталось 4'));
  const confirmation = screen.getByText('Отметить и списать');
  await fireEvent.press(confirmation);
  await fireEvent.press(confirmation);
  await waitFor(() => expect(onCommand).toHaveBeenCalledTimes(1));
  expect(onCommand).toHaveBeenCalledWith(
    expect.objectContaining({
      action: 'markAttended',
      charge: true,
      purchaseId: 'second',
      expectedBookingRevision: 3,
    }),
  );
});
it('allows mark only without an eligible purchase', async () => {
  await render(<AttendanceControls {...props} eligiblePurchases={[]} />);
  await fireEvent.press(screen.getByText('Пришёл'));
  await fireEvent.press(screen.getByText('Отметить и списать'));
  expect(onCommand).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByText('Только отметить, без списания'));
  await waitFor(() =>
    expect(onCommand).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'markAttended', charge: false }),
    ),
  );
});
it('requires correction reason and sends attendance revision without bookingId', async () => {
  await render(
    <AttendanceControls {...props} attendance={attendance} charged />,
  );
  await fireEvent.press(screen.getByText('Исправить отметку'));
  await fireEvent.press(screen.getByText('Отменить отметку'));
  expect(onCommand).not.toHaveBeenCalled();
  await fireEvent.changeText(screen.getByLabelText('Причина'), '  Ошибка  ');
  await fireEvent.press(screen.getByText('Отменить отметку'));
  await waitFor(() => expect(onCommand).toHaveBeenCalledTimes(1));
  expect(onCommand.mock.calls[0]?.[0]).toEqual({
    action: 'undoAttendance',
    attendanceId: 'attendance',
    expectedAttendanceRevision: 2,
    expectedBookingRevision: 3,
    requestId: '30000000-0000-4000-8000-000000000001',
    reason: 'Ошибка',
  });
});
it('keeps cancellation penalty explicit with a required reason', async () => {
  await render(
    <AttendanceControls
      {...props}
      booking={{ ...props.booking, status: 'cancelled_by_trainer' }}
    />,
  );
  expect(screen.queryByText('Пришёл')).toBeNull();
  await fireEvent.press(screen.getByText('Списать за отмену или неявку'));
  await fireEvent.press(screen.getByText('Списать 1 занятие'));
  expect(onCommand).not.toHaveBeenCalled();
  await fireEvent.changeText(
    screen.getByLabelText('Причина'),
    'Поздняя отмена',
  );
  await fireEvent.press(screen.getByText('Списать 1 занятие'));
  await waitFor(() =>
    expect(onCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'chargeLateCancellation',
        reason: 'Поздняя отмена',
        purchaseId: 'first',
      }),
    ),
  );
});
it('resets stale confirmation on revision changes and respects disabled state', async () => {
  const tree = await render(<AttendanceControls {...props} />);
  await fireEvent.press(screen.getByText('Пришёл'));
  await tree.rerender(
    <AttendanceControls
      {...props}
      booking={{ ...props.booking, revision: 4 }}
      disabled
    />,
  );
  expect(screen.queryByText('Отметить и списать')).toBeNull();
  await fireEvent.press(screen.getByText('Не пришёл'));
  expect(onCommand).not.toHaveBeenCalled();
});

it('shows a standalone cancellation debit without another penalty or attendance correction', async () => {
  await render(
    <AttendanceControls
      {...props}
      booking={{ ...props.booking, status: 'cancelled_by_client' }}
      charged
    />,
  );
  expect(screen.getByText('Отмена · списано')).toBeTruthy();
  expect(screen.queryByText('Списать за отмену или неявку')).toBeNull();
  expect(screen.queryByText('Исправить отметку')).toBeNull();
  expect(screen.queryByText('Пришёл')).toBeNull();
});
