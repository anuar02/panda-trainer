export type UpdateCommand = {
  programId: string;
  requestId: string;
  expectedProgramRevision: number;
  expectedWorkoutRevision: number;
  selectedKeys: string[];
};
export type UpdateValues = {
  sets: number | null;
  reps: string | number | null;
  seconds: string | number | null;
  weight_g: number | null;
};
export type UpdateOption = {
  key: string;
  kind: 'add' | 'replace' | 'skip' | 'sets' | 'values';
  exercise_id: string;
  name: string;
  old_name?: string | null;
  planned_sets?: number;
  checked: boolean;
  plan: UpdateValues;
  fact: UpdateValues;
};
export type UpdateContext = {
  account_id: string;
  workspace_id: string;
  workout_id: string;
  client_record_id: string;
  program_id: string;
  program_revision: number;
  workout_revision: number;
  program_name: string;
  options: UpdateOption[];
};
export type UpdateReceipt = {
  account_id: string;
  workspace_id: string;
  workout_id: string;
  client_record_id: string;
  program_id: string;
  request_id: string;
  revision: number;
  status: 'applied';
};
export const record = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
export const uuid = (v: unknown): v is string =>
  typeof v === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
    v,
  );
export const revision = (v: unknown): v is number =>
  typeof v === 'number' && Number.isInteger(v) && v > 0 && v <= 2147483647;
export function validateCommand(v: unknown): UpdateCommand {
  if (
    !record(v) ||
    Object.keys(v).sort().join(',') !==
      'expectedProgramRevision,expectedWorkoutRevision,programId,requestId,selectedKeys' ||
    !uuid(v.programId) ||
    !uuid(v.requestId) ||
    !revision(v.expectedProgramRevision) ||
    !revision(v.expectedWorkoutRevision) ||
    !Array.isArray(v.selectedKeys) ||
    v.selectedKeys.length < 1 ||
    v.selectedKeys.length > 100 ||
    v.selectedKeys.some(
      (k) =>
        typeof k !== 'string' ||
        !/^(add|replace|skip|sets|values):[0-9a-f-]{36}$/.test(k) ||
        !uuid(k.split(':')[1]),
    ) ||
    new Set(v.selectedKeys).size !== v.selectedKeys.length
  )
    throw new Error('update_invalid');
  const selectedKeys = [...v.selectedKeys] as string[];
  if (
    selectedKeys.some(
      (k) =>
        k.startsWith('skip:') &&
        selectedKeys.some(
          (x) => x !== k && x.split(':')[1] === k.split(':')[1],
        ),
    )
  )
    throw new Error('update_invalid');
  return {
    programId: v.programId,
    requestId: v.requestId,
    expectedProgramRevision: v.expectedProgramRevision,
    expectedWorkoutRevision: v.expectedWorkoutRevision,
    selectedKeys,
  };
}
function values(v: unknown, fact: boolean): v is UpdateValues {
  if (!record(v)) return false;
  const integer = (n: unknown, max: number) =>
    typeof n === 'number' && Number.isInteger(n) && n >= 0 && n <= max;
  const units = (n: unknown, digits: number) =>
    n === null ||
    (fact
      ? integer(n, 10 ** digits - 1)
      : typeof n === 'string' &&
        new RegExp(`^[0-9]{1,${digits}}([–-][0-9]{1,${digits}})?$`).test(n));
  return (
    (v.sets === null || integer(v.sets, 20)) &&
    units(v.reps, 3) &&
    units(v.seconds, 4) &&
    (v.reps === null || v.seconds === null) &&
    (v.weight_g === null || integer(v.weight_g, 1000000))
  );
}
export function validateContext(v: unknown): UpdateContext {
  if (
    !record(v) ||
    ![
      v.account_id,
      v.workspace_id,
      v.workout_id,
      v.client_record_id,
      v.program_id,
    ].every(uuid) ||
    !revision(v.program_revision) ||
    !revision(v.workout_revision) ||
    typeof v.program_name !== 'string' ||
    !Array.isArray(v.options) ||
    v.options.length > 100
  )
    throw new Error('update_response');
  const seen = new Set<string>();
  const options = v.options.map((o: unknown): UpdateOption => {
    if (
      !record(o) ||
      !uuid(o.exercise_id) ||
      typeof o.kind !== 'string' ||
      !['add', 'replace', 'skip', 'sets', 'values'].includes(o.kind) ||
      o.key !== `${o.kind}:${o.exercise_id}` ||
      seen.has(String(o.key)) ||
      typeof o.name !== 'string' ||
      (o.old_name !== undefined &&
        o.old_name !== null &&
        typeof o.old_name !== 'string') ||
      (o.planned_sets !== undefined &&
        (typeof o.planned_sets !== 'number' ||
          !Number.isInteger(o.planned_sets) ||
          o.planned_sets < 1 ||
          o.planned_sets > 20)) ||
      typeof o.checked !== 'boolean' ||
      !values(o.plan, false) ||
      !values(o.fact, true)
    )
      throw new Error('update_response');
    seen.add(String(o.key));
    return {
      key: String(o.key),
      kind: o.kind as UpdateOption['kind'],
      exercise_id: o.exercise_id,
      name: o.name,
      ...(o.planned_sets === undefined
        ? {}
        : { planned_sets: Number(o.planned_sets) }),
      ...(o.old_name === undefined
        ? {}
        : { old_name: typeof o.old_name === 'string' ? o.old_name : null }),
      checked: o.checked,
      plan: { ...o.plan },
      fact: { ...o.fact },
    };
  });
  return {
    account_id: String(v.account_id),
    workspace_id: String(v.workspace_id),
    workout_id: String(v.workout_id),
    client_record_id: String(v.client_record_id),
    program_id: String(v.program_id),
    program_revision: v.program_revision,
    workout_revision: v.workout_revision,
    program_name: v.program_name,
    options,
  };
}
