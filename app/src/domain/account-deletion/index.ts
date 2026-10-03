export const inventoryKinds = Object.freeze([
  'pending',
  'rejected',
  'conflict',
  'correctionDraft',
] as const);

export const externalGates = Object.freeze([
  'backup',
  'logs',
  'otherDevices',
  'nativeStorage',
  'legal',
  'serverIdentity',
  'databaseAuthRecovery',
  'mutationInterlock',
] as const);

export type Scope = Readonly<{
  accountId: string;
  workspaceId: string;
  sessionId: string;
}>;
export type CountEvidence =
  Readonly<{ state: 'unknown' }> | Readonly<{ state: 'known'; count: number }>;
export type LocalProof =
  | Readonly<{ state: 'missing' }>
  | Readonly<{ state: 'unknown' }>
  | Readonly<{
      state: 'present';
      scope: Scope;
      snapshotId: string;
    }>;
export type DeletionEvidence = Readonly<{
  version: 1;
  scopeKind: 'trainer-workspace' | 'client-account';
  scope: Scope;
  observedAt: number;
  snapshotId: string;
  inventory: Readonly<Record<(typeof inventoryKinds)[number], CountEvidence>>;
  receipt: 'settled' | 'inflight' | 'unknown' | 'timeout';
  sharedClientAccount: 'yes' | 'no' | 'unknown';
  trainerAsClient: 'yes' | 'no' | 'unknown';
  localExport: LocalProof;
  localAcknowledgement: LocalProof;
  external: Readonly<
    Record<
      (typeof externalGates)[number],
      'unknown' | 'evidence-present' | 'review-required'
    >
  >;
}>;
export type PreflightContext = Readonly<{
  scopeKind: 'trainer-workspace' | 'client-account';
  scope: Scope;
  now: number;
  maxAgeMs: number;
}>;
export type BlockerCode =
  | 'malformedEvidence'
  | 'malformedContext'
  | 'scopeMismatch'
  | 'clientAccountReview'
  | 'accountMismatch'
  | 'workspaceMismatch'
  | 'sessionMismatch'
  | 'staleEvidence'
  | 'futureEvidence'
  | 'inventoryUnknown'
  | 'localOutstanding'
  | 'receiptInflight'
  | 'receiptUnknown'
  | 'receiptTimeout'
  | 'relationshipUnknown'
  | 'sharedClientReview'
  | 'dualRoleReview'
  | 'localProofMissing'
  | 'localProofUnknown'
  | 'proofScopeMismatch'
  | 'proofSnapshotMismatch'
  | 'externalEvidenceUnknown'
  | 'externalReviewRequired';
export type Blocker = Readonly<{
  code: BlockerCode;
  subject?:
    | (typeof inventoryKinds)[number]
    | (typeof externalGates)[number]
    | 'sharedClientAccount'
    | 'trainerAsClient'
    | 'localExport'
    | 'localAcknowledgement';
  state: 'unknown' | 'blocked' | 'review-required';
}>;
export type PreflightResult = Readonly<{
  state: 'unknown' | 'blocked' | 'review-required';
  deleteAuthorized: false;
  serverIdentityVerified: false;
  blockers: readonly Blocker[];
}>;

function record(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    return false;
  const prototype: unknown = Object.getPrototypeOf(value);
  return (
    (prototype === Object.prototype || prototype === null) &&
    Reflect.ownKeys(value).every((key) => {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      return typeof key === 'string' && descriptor && 'value' in descriptor;
    })
  );
}
function exact(
  value: Record<string, unknown>,
  keys: readonly string[],
): boolean {
  return (
    Reflect.ownKeys(value).length === keys.length &&
    keys.every((key) => Object.hasOwn(value, key))
  );
}
function id(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value);
}
function integer(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}
function scope(value: unknown): value is Scope {
  return (
    record(value) &&
    exact(value, ['accountId', 'workspaceId', 'sessionId']) &&
    id(value.accountId) &&
    id(value.workspaceId) &&
    id(value.sessionId)
  );
}
function oneOf<T extends string>(
  value: unknown,
  choices: readonly T[],
): value is T {
  return (
    typeof value === 'string' && choices.some((choice) => value === choice)
  );
}
function count(value: unknown): value is CountEvidence {
  return (
    record(value) &&
    ((value.state === 'unknown' && exact(value, ['state'])) ||
      (value.state === 'known' &&
        exact(value, ['state', 'count']) &&
        integer(value.count)))
  );
}
function proof(value: unknown): value is LocalProof {
  return (
    record(value) &&
    ((oneOf(value.state, ['missing', 'unknown']) && exact(value, ['state'])) ||
      (value.state === 'present' &&
        exact(value, ['state', 'scope', 'snapshotId']) &&
        scope(value.scope) &&
        id(value.snapshotId)))
  );
}
function context(value: unknown): value is PreflightContext {
  return (
    record(value) &&
    exact(value, ['scopeKind', 'scope', 'now', 'maxAgeMs']) &&
    oneOf(value.scopeKind, ['trainer-workspace', 'client-account']) &&
    scope(value.scope) &&
    integer(value.now) &&
    integer(value.maxAgeMs) &&
    value.maxAgeMs > 0
  );
}
function evidence(value: unknown): value is DeletionEvidence {
  if (!record(value)) return false;
  const inventory = value.inventory;
  const external = value.external;
  return (
    record(value) &&
    exact(value, [
      'version',
      'scopeKind',
      'scope',
      'observedAt',
      'snapshotId',
      'inventory',
      'receipt',
      'sharedClientAccount',
      'trainerAsClient',
      'localExport',
      'localAcknowledgement',
      'external',
    ]) &&
    value.version === 1 &&
    oneOf(value.scopeKind, ['trainer-workspace', 'client-account']) &&
    scope(value.scope) &&
    integer(value.observedAt) &&
    id(value.snapshotId) &&
    record(inventory) &&
    exact(inventory, inventoryKinds) &&
    inventoryKinds.every((kind) => count(inventory[kind])) &&
    oneOf(value.receipt, ['settled', 'inflight', 'unknown', 'timeout']) &&
    oneOf(value.sharedClientAccount, ['yes', 'no', 'unknown']) &&
    oneOf(value.trainerAsClient, ['yes', 'no', 'unknown']) &&
    proof(value.localExport) &&
    proof(value.localAcknowledgement) &&
    record(external) &&
    exact(external, externalGates) &&
    externalGates.every((gate) =>
      oneOf(external[gate], ['unknown', 'evidence-present', 'review-required']),
    )
  );
}
function sameScope(left: Scope, right: Scope): boolean {
  return (
    left.accountId === right.accountId &&
    left.workspaceId === right.workspaceId &&
    left.sessionId === right.sessionId
  );
}
function result(blockers: readonly Blocker[]): PreflightResult {
  return {
    state: blockers.some((blocker) => blocker.state === 'blocked')
      ? 'blocked'
      : blockers.some((blocker) => blocker.state === 'unknown')
        ? 'unknown'
        : 'review-required',
    deleteAuthorized: false,
    serverIdentityVerified: false,
    blockers,
  };
}

export function evaluateDeletionPreflight(
  input: unknown,
  expected: unknown,
): PreflightResult {
  try {
    if (!context(expected))
      return result([{ code: 'malformedContext', state: 'unknown' }]);
  } catch {
    return result([{ code: 'malformedContext', state: 'unknown' }]);
  }
  try {
    if (!evidence(input))
      return result([{ code: 'malformedEvidence', state: 'unknown' }]);
    const blockers: Blocker[] = [];
    const add = (
      code: BlockerCode,
      state: Blocker['state'],
      subject?: Blocker['subject'],
    ) => blockers.push({ code, state, ...(subject ? { subject } : {}) });
    if (input.scopeKind !== expected.scopeKind) add('scopeMismatch', 'blocked');
    if (input.scopeKind === 'client-account')
      add('clientAccountReview', 'review-required');
    if (input.scope.accountId !== expected.scope.accountId)
      add('accountMismatch', 'blocked');
    if (input.scope.workspaceId !== expected.scope.workspaceId)
      add('workspaceMismatch', 'blocked');
    if (input.scope.sessionId !== expected.scope.sessionId)
      add('sessionMismatch', 'blocked');
    if (input.observedAt > expected.now) add('futureEvidence', 'unknown');
    if (expected.now - input.observedAt > expected.maxAgeMs)
      add('staleEvidence', 'unknown');
    for (const kind of inventoryKinds) {
      const item = input.inventory[kind];
      if (item.state === 'unknown') add('inventoryUnknown', 'unknown', kind);
      else if (item.count > 0) add('localOutstanding', 'blocked', kind);
    }
    if (input.receipt === 'inflight') add('receiptInflight', 'blocked');
    if (input.receipt === 'unknown') add('receiptUnknown', 'unknown');
    if (input.receipt === 'timeout') add('receiptTimeout', 'unknown');
    for (const relationship of [
      'sharedClientAccount',
      'trainerAsClient',
    ] as const) {
      if (input[relationship] === 'unknown')
        add('relationshipUnknown', 'unknown', relationship);
      if (input[relationship] === 'yes')
        add(
          relationship === 'sharedClientAccount'
            ? 'sharedClientReview'
            : 'dualRoleReview',
          'review-required',
          relationship,
        );
    }
    for (const kind of ['localExport', 'localAcknowledgement'] as const) {
      const item = input[kind];
      if (item.state === 'missing') add('localProofMissing', 'blocked', kind);
      else if (item.state === 'unknown')
        add('localProofUnknown', 'unknown', kind);
      else {
        if (
          !sameScope(item.scope, expected.scope) ||
          !sameScope(item.scope, input.scope)
        )
          add('proofScopeMismatch', 'blocked', kind);
        if (item.snapshotId !== input.snapshotId)
          add('proofSnapshotMismatch', 'blocked', kind);
      }
    }
    for (const gate of externalGates) {
      add(
        input.external[gate] === 'unknown'
          ? 'externalEvidenceUnknown'
          : 'externalReviewRequired',
        input.external[gate] === 'unknown' ? 'unknown' : 'review-required',
        gate,
      );
    }
    return result(blockers);
  } catch {
    return result([{ code: 'malformedEvidence', state: 'unknown' }]);
  }
}
