import { fireEvent, render, screen } from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';
import { i18n } from '../src/lib/i18n';
import { sessionEditorRu } from '../src/features/session-editor/ru';
import {
  CreateSessionScreen,
  RescheduleSheet,
  type CreateSessionScreenProps,
  type RescheduleSheetProps,
} from '../src/features/session-editor';

i18n.addResourceBundle(
  'ru',
  'translation',
  { sessionEditor: sessionEditorRu },
  true,
  true,
);
jest.mock('react-native-safe-area-context', () => {
  const { View } =
    jest.requireActual<typeof import('react-native')>('react-native');
  return { SafeAreaView: View };
});
jest.mock('../src/ui/sheet', () => ({
  Sheet: ({ children, open }: PropsWithChildren<{ open: boolean }>) =>
    open ? children : null,
}));
const clients = [
  { id: 'c1', name: 'Анна', initials: 'А' },
  { id: 'c2', name: 'Дана', initials: 'Д' },
];
const templates = [
  { program: 'strength', name: 'Силовая А', meta: '3 упражнения' },
];
async function show(props: Partial<CreateSessionScreenProps> = {}) {
  const onCreate = jest.fn(() => ({ ok: true as const }));
  const onClose = jest.fn();
  await render(
    <CreateSessionScreen
      clients={clients}
      templates={templates}
      dates={['2026-09-14', '2026-09-15']}
      today="2026-09-14"
      getCollisions={() => []}
      onCreate={onCreate}
      onClose={onClose}
      {...props}
    />,
  );
  return { onCreate, onClose };
}
const press = async (name: string) =>
  fireEvent.press(screen.getByRole('button', { name }));
async function reachProgram() {
  await press('Анна');
  await press('Продолжить');
  await press('Продолжить');
}

test('requires a client and retains a group draft through all three steps', async () => {
  const { onCreate } = await show({ initialStart: '12:15' });
  expect(screen.getByRole('button', { name: 'Продолжить' })).toBeDisabled();
  await press('Анна');
  await press('Дана');
  await press('Продолжить');
  expect(screen.getByRole('button', { name: '12:15' })).toHaveProp(
    'accessibilityState',
    { selected: true, disabled: false },
  );
  await press('вт, 15 сен');
  await press('75 мин');
  await press('Продолжить');
  await press('Силовая А');
  await press('Создать занятие');
  expect(onCreate).toHaveBeenCalledWith({
    date: '2026-09-15',
    start: '12:15',
    duration: 75,
    clientIds: ['c1', 'c2'],
    program: 'strength',
    programLater: false,
    collisionAck: false,
  });
});

test('program later and a selected template are mutually exclusive', async () => {
  const { onCreate } = await show();
  await reachProgram();
  await press('Силовая А');
  await press('Назначить программу позже');
  await press('Создать занятие');
  expect(onCreate).toHaveBeenLastCalledWith(
    expect.objectContaining({ program: null, programLater: true }),
  );
  await press('Силовая А');
  await press('Создать занятие');
  expect(onCreate).toHaveBeenLastCalledWith(
    expect.objectContaining({ program: 'strength', programLater: false }),
  );
});

test('shows save errors and resets collision acknowledgement after time changes', async () => {
  const onCreate = jest.fn(() => ({
    ok: false as const,
    error: 'Подтвердите пересечение',
  }));
  await show({
    getCollisions: () => [{ id: 's1', start: '19:00', title: 'Дана' }],
    onCreate,
  });
  await reachProgram();
  expect(screen.getByText(/Пересечение с 1 записью: 19:00 Дана/)).toBeTruthy();
  await press('Назначить программу позже');
  await press('Создать занятие');
  expect(screen.getByRole('alert')).toHaveTextContent(
    'Подтвердите пересечение',
  );
  await fireEvent.press(screen.getByRole('checkbox'));
  expect(screen.getByRole('checkbox')).toBeChecked();
  await press('Назад');
  await press('18:30');
  await press('Продолжить');
  expect(screen.getByRole('checkbox')).not.toBeChecked();
  await press('Создать занятие');
  expect(onCreate).toHaveBeenLastCalledWith(
    expect.objectContaining({ start: '18:30', collisionAck: false }),
  );
});

test('close exits without creating and a blocked editor cannot advance', async () => {
  const { onCreate, onClose } = await show({
    initialClientId: 'c1',
    disabled: true,
    storageError: 'Не удалось прочитать данные',
  });
  expect(screen.getByText('Не удалось прочитать данные')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Продолжить' })).toBeDisabled();
  await press('Продолжить');
  await press('Закрыть');
  expect(onCreate).not.toHaveBeenCalled();
  expect(onClose).toHaveBeenCalledTimes(1);
});

const session = {
  id: 's1',
  date: '2026-09-14',
  start: '19:00',
  end: '20:00',
  clientName: 'Анна',
};
async function reschedule(props: Partial<RescheduleSheetProps> = {}) {
  const onSubmit = jest.fn(() => ({ ok: true as const }));
  const onClose = jest.fn();
  const view = await render(
    <RescheduleSheet
      open
      session={session}
      onSubmit={onSubmit}
      onClose={onClose}
      {...props}
    />,
  );
  return { onSubmit, onClose, ...view };
}

test('submits a proposal while retaining the current appointment display', async () => {
  const { onSubmit, onClose } = await reschedule();
  expect(screen.getByText('пн, 14 сен, 19:00–20:00')).toBeTruthy();
  await fireEvent.changeText(screen.getByLabelText('Новая дата'), '2026-09-15');
  await fireEvent.changeText(screen.getByLabelText('Начало'), '18:30');
  expect(screen.getByText('пн, 14 сен, 19:00–20:00')).toBeTruthy();
  await press('Отправить предложение');
  expect(onSubmit).toHaveBeenCalledWith({ date: '2026-09-15', start: '18:30' });
  expect(onClose).toHaveBeenCalledTimes(1);
});

test('rejected proposal stays open and permits correcting a counterproposal', async () => {
  const onSubmit = jest.fn(() => ({
    ok: false as const,
    error: 'Выберите другое будущее время',
  }));
  const { onClose } = await reschedule({
    onSubmit,
    counter: true,
    initialTarget: { date: '2026-09-16', start: '11:30' },
  });
  expect(screen.getByLabelText('Новая дата')).toHaveDisplayValue('2026-09-16');
  await press('Отправить предложение');
  expect(screen.getByRole('alert')).toHaveTextContent(
    'Выберите другое будущее время',
  );
  expect(onClose).not.toHaveBeenCalled();
  await fireEvent.changeText(screen.getByLabelText('Начало'), '14:00');
  expect(screen.queryByRole('alert')).toBeNull();
  await press('Отправить предложение');
  expect(onSubmit).toHaveBeenLastCalledWith({
    date: '2026-09-16',
    start: '14:00',
  });
});
