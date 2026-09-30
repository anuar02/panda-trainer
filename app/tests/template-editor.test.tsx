import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';
import '../src/lib/i18n';
import { TemplateProvider } from '../src/features/template-editor/provider';
import { TemplateEditorScreen } from '../src/features/template-editor/screen';
import { decodeTemplates } from '../src/domain/templates';
jest.mock('../src/ui/sheet', () => ({
  Sheet: ({
    open,
    children,
    title,
  }: PropsWithChildren<{ open: boolean; title: string }>) => {
    const { Text } =
      jest.requireActual<typeof import('react-native')>('react-native');
    return open ? (
      <>
        <Text>{title}</Text>
        {children}
      </>
    ) : null;
  },
}));
jest.mock('react-native-safe-area-context', () => {
  const { View } =
    jest.requireActual<typeof import('react-native')>('react-native');
  return { SafeAreaView: View };
});
test('builder creates a timed plan, reorders exercises, persists draft and saves', async () => {
  let raw: string | null = null;
  const storage = {
    getItem: async () => raw,
    setItem: async (_key: string, value: string) => {
      raw = value;
    },
  };
  const onSaved = jest.fn();
  await render(
    <TemplateProvider storage={storage}>
      <TemplateEditorScreen onLeave={() => {}} onSaved={onSaved} />
    </TemplateProvider>,
  );
  await waitFor(() =>
    expect(screen.getByLabelText('Название шаблона')).toBeTruthy(),
  );
  await fireEvent.changeText(
    screen.getByLabelText('Название шаблона'),
    'Тестовый план',
  );
  await fireEvent.press(
    screen.getByRole('button', { name: 'Добавить упражнения' }),
  );
  await fireEvent.changeText(
    screen.getByLabelText('Поиск упражнений для шаблона'),
    'присед',
  );
  await fireEvent.press(
    screen.getByRole('button', { name: 'Приседания со штангой' }),
  );
  await fireEvent.changeText(
    screen.getByLabelText('Поиск упражнений для шаблона'),
    'планка',
  );
  await fireEvent.press(screen.getByRole('button', { name: 'Планка' }));
  await fireEvent.press(
    screen.getByRole('button', { name: 'Готово · 2 упражнения' }),
  );
  await fireEvent.changeText(screen.getByLabelText('Время, сек: Планка'), '60');
  await fireEvent.press(screen.getByRole('button', { name: 'Выше: Планка' }));
  await waitFor(() =>
    expect(decodeTemplates(raw)?.draft?.exercises[0]?.name).toBe('Планка'),
  );
  await fireEvent.press(
    screen.getByRole('button', { name: 'Сохранить шаблон' }),
  );
  await waitFor(() => expect(onSaved).toHaveBeenCalled());
  expect(decodeTemplates(raw)?.items[0]?.exercises[0]).toMatchObject({
    name: 'Планка',
    reps: '60 сек',
    unit: 'сек',
  });
  expect(decodeTemplates(raw)?.draft).toBeNull();
});
test('discard requires confirmation and invalid empty plan stays in editor', async () => {
  const onLeave = jest.fn();
  await render(
    <TemplateProvider
      storage={{ getItem: async () => null, setItem: async () => {} }}
    >
      <TemplateEditorScreen onLeave={onLeave} onSaved={() => {}} />
    </TemplateProvider>,
  );
  await waitFor(() =>
    expect(screen.getByLabelText('Название шаблона')).toBeTruthy(),
  );
  await fireEvent.press(
    screen.getByRole('button', { name: 'Сохранить шаблон' }),
  );
  await waitFor(() =>
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Введите название шаблона (до 80 символов).',
    ),
  );
  await fireEvent.press(
    screen.getByRole('button', { name: 'Удалить черновик' }),
  );
  expect(onLeave).not.toHaveBeenCalled();
  await fireEvent.press(
    screen.getByRole('button', { name: 'Продолжить редактирование' }),
  );
  await fireEvent.press(
    screen.getByRole('button', { name: 'Удалить черновик' }),
  );
  await act(async () => {
    await fireEvent.press(
      screen.getAllByRole('button', { name: 'Удалить черновик' })[1]!,
    );
  });
  expect(onLeave).toHaveBeenCalledTimes(1);
});
