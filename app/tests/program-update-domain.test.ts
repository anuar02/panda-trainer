import { validateCommand, validateContext } from '@/domain/program-update';
import {
  updateCommand as command,
  updateContext as context,
  updateId as id,
} from './program-update-fixtures';
test('empty, duplicated, malformed and incompatible exercise choices fail closed', () => {
  for (const selectedKeys of [
    [],
    [command.selectedKeys[0], command.selectedKeys[0]],
    ['values:foreign'],
    [`skip:${id(7)}`, `values:${id(7)}`],
  ])
    expect(() => validateCommand({ ...command, selectedKeys })).toThrow();
});
test('command captures exact independent selection array and revision', () => {
  const original = { ...command, selectedKeys: [...command.selectedKeys] };
  const snapshot = validateCommand(original);
  original.selectedKeys.length = 0;
  expect(snapshot.selectedKeys).toEqual(command.selectedKeys);
  expect(() =>
    validateCommand({ ...command, expectedWorkoutRevision: 0 }),
  ).toThrow();
  expect(() => validateCommand({ ...command, token: 'secret' })).toThrow();
});
test('timed and zero-weight results are validated; malformed server data cannot become a choice', () => {
  expect(validateContext(context)).toEqual(context);
  const option = context.options[0]!;
  expect(
    validateContext({
      ...context,
      options: [
        { ...option, fact: { sets: 1, reps: null, seconds: 30, weight_g: 0 } },
      ],
    }).options[0]?.fact.seconds,
  ).toBe(30);
  for (const fact of [
    { ...option.fact, reps: -1 },
    { ...option.fact, seconds: 30 },
    { ...option.fact, weight_g: 1000001 },
    { ...option.fact, sets: 21 },
  ])
    expect(() =>
      validateContext({ ...context, options: [{ ...option, fact }] }),
    ).toThrow();
  expect(() =>
    validateContext({ ...context, options: [option, option] }),
  ).toThrow();
});
