import { fireEvent, render, screen } from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';
import { ProgramUpdatePanel } from '@/features/program-update/panel';
import { useProgramUpdate } from '@/features/program-update/use-update';
import {
  updateParticipant,
  updateSession,
  updateContext,
  updateCommand,
} from './program-update-fixtures';
import '@/lib/i18n';
jest.mock('@/features/program-update/use-update', () => ({
  useProgramUpdate: jest.fn(),
}));
jest.mock('@/ui/sheet', () => ({
  Sheet: ({ open, children }: PropsWithChildren<{ open: boolean }>) =>
    open ? children : null,
}));
const confirm = jest.fn();
const toggle = jest.fn();
const close = jest.fn();
const open = jest.fn();
async function fixture(selected: string[] = [], pending = false) {
  jest.mocked(useProgramUpdate).mockReturnValue({
    state: {
      context: updateContext,
      selected,
      pending: pending ? updateCommand : null,
      busy: false,
      error: pending ? 'update_unknown' : null,
      applied: false,
      ready: true,
    },
    opened: true,
    invalid: false,
    confirm,
    toggle,
    close,
    open,
    reject: jest.fn(),
    reload: jest.fn(),
  });
  return await render(
    <ProgramUpdatePanel
      session={updateSession}
      getSession={() => updateSession}
      participant={updateParticipant}
    />,
  );
}
beforeEach(() => jest.clearAllMocks());
test('sheet renders real plan/fact and opt-in values with accessible unchecked choice', async () => {
  await fixture();
  expect(screen.getByRole('checkbox').props.accessibilityState).toMatchObject({
    checked: false,
  });
  expect(screen.getByText('План: 3 · 10 кг · 8 повт. · — сек.')).toBeTruthy();
  expect(screen.getByText('Факт: 1 · 12 кг · 10 повт. · — сек.')).toBeTruthy();
  await fireEvent.press(
    screen.getByText('Сохранить в программу Synthetic client'),
  );
  expect(confirm).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByRole('checkbox'));
  expect(toggle).toHaveBeenCalledWith(updateContext.options[0]!.key);
});
test('explicit selection submits and unknown recovery locks choices with same retry', async () => {
  await fixture(updateCommand.selectedKeys);
  await fireEvent.press(
    screen.getByText('Сохранить в программу Synthetic client'),
  );
  expect(confirm).toHaveBeenCalledTimes(1);
  await screen.unmount();
  await fixture(updateCommand.selectedKeys, true);
  expect(screen.getByRole('checkbox').props.accessibilityState).toMatchObject({
    checked: true,
    disabled: true,
  });
  await fireEvent.press(screen.getByText('Попробовать снова'));
  expect(confirm).toHaveBeenCalledTimes(2);
});
test('no changes hides action; dismiss delegates lifetime invalidation', async () => {
  await fixture();
  await screen.unmount();
  jest.mocked(useProgramUpdate).mockReturnValue({
    state: {
      context: { ...updateContext, options: [] },
      selected: [],
      pending: null,
      busy: false,
      error: null,
      applied: false,
      ready: true,
    },
    opened: false,
    invalid: false,
    confirm,
    toggle,
    close,
    open,
    reject: jest.fn(),
    reload: jest.fn(),
  });
  await render(
    <ProgramUpdatePanel
      session={updateSession}
      getSession={() => updateSession}
      participant={updateParticipant}
    />,
  );
  expect(screen.queryByText('Обновить программу клиента')).toBeNull();
});
