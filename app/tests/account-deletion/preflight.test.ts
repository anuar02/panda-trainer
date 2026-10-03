import {
  evaluateDeletionPreflight,
  type DeletionEvidence,
  type PreflightContext,
} from '@/domain/account-deletion';

const scope = {
  accountId: 'synthetic-account-A',
  workspaceId: 'synthetic-workspace-A',
  sessionId: 'synthetic-login-2',
};
const context: PreflightContext = {
  scopeKind: 'trainer-workspace',
  scope,
  now: 2000,
  maxAgeMs: 1000,
};
function fixture(): DeletionEvidence {
  return {
    version: 1,
    scopeKind: 'trainer-workspace',
    scope: { ...scope },
    observedAt: 1500,
    snapshotId: 'synthetic-snapshot-4',
    inventory: {
      pending: { state: 'known', count: 0 },
      rejected: { state: 'known', count: 0 },
      conflict: { state: 'known', count: 0 },
      correctionDraft: { state: 'known', count: 0 },
    },
    receipt: 'settled',
    sharedClientAccount: 'no',
    trainerAsClient: 'no',
    localExport: {
      state: 'present',
      scope: { ...scope },
      snapshotId: 'synthetic-snapshot-4',
    },
    localAcknowledgement: {
      state: 'present',
      scope: { ...scope },
      snapshotId: 'synthetic-snapshot-4',
    },
    external: {
      backup: 'evidence-present',
      logs: 'evidence-present',
      otherDevices: 'evidence-present',
      nativeStorage: 'evidence-present',
      legal: 'evidence-present',
      serverIdentity: 'evidence-present',
      databaseAuthRecovery: 'evidence-present',
      mutationInterlock: 'evidence-present',
    },
  };
}
const evaluate = (value: unknown) => evaluateDeletionPreflight(value, context);

test('zero local inventory with matching proofs still needs eight distinct external reviews', () => {
  const output = evaluate(fixture());
  expect(output.state).toBe('review-required');
  expect(output.deleteAuthorized).toBe(false);
  expect(output.serverIdentityVerified).toBe(false);
  expect(output.blockers).toHaveLength(8);
  expect(output.blockers.map((item) => item.subject)).toEqual([
    'backup',
    'logs',
    'otherDevices',
    'nativeStorage',
    'legal',
    'serverIdentity',
    'databaseAuthRecovery',
    'mutationInterlock',
  ]);
  expect(
    output.blockers.every((item) => item.code === 'externalReviewRequired'),
  ).toBe(true);
});

test.each(['pending', 'rejected', 'conflict', 'correctionDraft'] as const)(
  '%s cannot be dropped by acknowledgement; unknown differs from zero',
  (kind) => {
    const base = fixture();
    const outstanding = evaluate({
      ...base,
      inventory: { ...base.inventory, [kind]: { state: 'known', count: 1 } },
    });
    expect(outstanding.state).toBe('blocked');
    expect(outstanding.blockers).toContainEqual({
      code: 'localOutstanding',
      subject: kind,
      state: 'blocked',
    });
    const unread = evaluate({
      ...base,
      inventory: { ...base.inventory, [kind]: { state: 'unknown' } },
    });
    expect(unread.state).toBe('unknown');
    expect(unread.blockers).toContainEqual({
      code: 'inventoryUnknown',
      subject: kind,
      state: 'unknown',
    });
    expect(evaluate(base).blockers.some((item) => item.subject === kind)).toBe(
      false,
    );
  },
);

test.each([
  ['accountId', 'accountMismatch'],
  ['workspaceId', 'workspaceMismatch'],
  ['sessionId', 'sessionMismatch'],
] as const)(
  'rejects foreign %s, including same account after a new login',
  (key, code) => {
    const base = fixture();
    const output = evaluate({ ...base, scope: { ...scope, [key]: 'foreign' } });
    expect(output.state).toBe('blocked');
    expect(output.blockers).toContainEqual({ code, state: 'blocked' });
  },
);

test('account and workspace scopes are not interchangeable', () => {
  expect(
    evaluate({ ...fixture(), scopeKind: 'client-account' }).blockers,
  ).toContainEqual({ code: 'scopeMismatch', state: 'blocked' });
  const output = evaluateDeletionPreflight(
    { ...fixture(), scopeKind: 'client-account' },
    { ...context, scopeKind: 'client-account' },
  );
  expect(output.blockers).toContainEqual({
    code: 'clientAccountReview',
    state: 'review-required',
  });
});

test.each([
  ['inflight', 'receiptInflight', 'blocked'],
  ['unknown', 'receiptUnknown', 'unknown'],
  ['timeout', 'receiptTimeout', 'unknown'],
] as const)(
  '%s receipt never means settled or zero',
  (receipt, code, state) => {
    const output = evaluate({ ...fixture(), receipt });
    expect(output.state).toBe(state);
    expect(output.blockers).toContainEqual({ code, state });
  },
);

test.each(['sharedClientAccount', 'trainerAsClient'] as const)(
  '%s always adds review even with proofs',
  (kind) => {
    const output = evaluate({ ...fixture(), [kind]: 'yes' });
    expect(output.state).toBe('review-required');
    expect(output.blockers).toContainEqual({
      code:
        kind === 'sharedClientAccount'
          ? 'sharedClientReview'
          : 'dualRoleReview',
      subject: kind,
      state: 'review-required',
    });
    expect(evaluate({ ...fixture(), [kind]: 'unknown' }).state).toBe('unknown');
  },
);

test.each(['localExport', 'localAcknowledgement'] as const)(
  '%s must be local and match the current session and snapshot',
  (kind) => {
    const base = fixture();
    expect(
      evaluate({ ...base, [kind]: { state: 'missing' } }).blockers,
    ).toContainEqual({
      code: 'localProofMissing',
      subject: kind,
      state: 'blocked',
    });
    expect(evaluate({ ...base, [kind]: { state: 'unknown' } }).state).toBe(
      'unknown',
    );
    expect(
      evaluate({
        ...base,
        [kind]: {
          state: 'present',
          scope: { ...scope, sessionId: 'synthetic-login-1' },
          snapshotId: base.snapshotId,
        },
      }).blockers,
    ).toContainEqual({
      code: 'proofScopeMismatch',
      subject: kind,
      state: 'blocked',
    });
    expect(
      evaluate({
        ...base,
        [kind]: { state: 'present', scope, snapshotId: 'older-snapshot' },
      }).blockers,
    ).toContainEqual({
      code: 'proofSnapshotMismatch',
      subject: kind,
      state: 'blocked',
    });
  },
);

test('server export cannot substitute local pending proof', () => {
  const base = fixture();
  expect(
    evaluate({
      ...base,
      localExport: { state: 'missing' },
      serverExport: { state: 'present' },
    }).state,
  ).toBe('unknown');
  const output = evaluate({
    ...base,
    localExport: { state: 'missing' },
    inventory: { ...base.inventory, pending: { state: 'known', count: 2 } },
  });
  expect(output.blockers.map((item) => item.code)).toEqual(
    expect.arrayContaining(['localOutstanding', 'localProofMissing']),
  );
});

test.each([
  ['backup'],
  ['logs'],
  ['otherDevices'],
  ['nativeStorage'],
  ['legal'],
  ['serverIdentity'],
  ['databaseAuthRecovery'],
  ['mutationInterlock'],
] as const)('missing %s evidence remains its own external gate', (gate) => {
  const base = fixture();
  const output = evaluate({
    ...base,
    external: { ...base.external, [gate]: 'unknown' },
  });
  expect(output.state).toBe('unknown');
  expect(output.blockers).toContainEqual({
    code: 'externalEvidenceUnknown',
    subject: gate,
    state: 'unknown',
  });
});

test.each([
  [999, 'staleEvidence'],
  [2001, 'futureEvidence'],
] as const)(
  'observation at %i cannot establish a current inventory',
  (observedAt, code) => {
    expect(evaluate({ ...fixture(), observedAt }).blockers).toContainEqual({
      code,
      state: 'unknown',
    });
  },
);

test('freshness boundary is explicit, evaluation is deterministic and does not mutate frozen input', () => {
  const value = Object.freeze({ ...fixture(), observedAt: 1000 });
  const before = JSON.stringify(value);
  expect(evaluate(value)).toEqual(evaluate(value));
  expect(evaluate(value).state).toBe('review-required');
  expect(JSON.stringify(value)).toBe(before);
});

test.each([
  null,
  undefined,
  [],
  {},
  { ...fixture(), version: 2 },
  { ...fixture(), credentials: 'synthetic-secret' },
  { ...fixture(), scope: { ...scope, token: 'synthetic-secret' } },
  { ...fixture(), external: {} },
  { ...fixture(), receipt: 'accepted' },
  { ...fixture(), localExport: { state: 'present' } },
  { ...fixture(), sharedClientAccount: true },
])('malformed evidence fails closed without echoing input %#', (value) => {
  expect(evaluate(value)).toEqual({
    state: 'unknown',
    deleteAuthorized: false,
    serverIdentityVerified: false,
    blockers: [{ code: 'malformedEvidence', state: 'unknown' }],
  });
});

test.each([
  -1,
  0.5,
  NaN,
  Infinity,
  Number.MAX_SAFE_INTEGER + 1,
  '0',
  null,
  undefined,
])('invalid count %s is never coerced to zero', (count) => {
  const base = fixture();
  expect(
    evaluate({
      ...base,
      inventory: { ...base.inventory, pending: { state: 'known', count } },
    }).blockers,
  ).toEqual([{ code: 'malformedEvidence', state: 'unknown' }]);
});

test('extra payload, contradictory unknown count, accessor and prototype objects are rejected', () => {
  const base = fixture();
  const accessor = Object.defineProperty({ ...base }, 'receipt', {
    get: () => {
      throw new Error('synthetic-secret');
    },
  });
  for (const value of [
    {
      ...base,
      inventory: { ...base.inventory, pending: { state: 'unknown', count: 0 } },
    },
    {
      ...base,
      localExport: {
        state: 'present',
        scope,
        snapshotId: base.snapshotId,
        payload: 'private-note',
      },
    },
    Object.create(base) as unknown,
    accessor,
    new Proxy(base, {
      ownKeys: () => {
        throw new Error('synthetic-secret');
      },
    }),
  ]) {
    const output = evaluate(value);
    expect(output.blockers).toEqual([
      { code: 'malformedEvidence', state: 'unknown' },
    ]);
    expect(JSON.stringify(output)).not.toMatch(/synthetic-secret|private-note/);
  }
});

test.each([
  null,
  {},
  { ...context, maxAgeMs: 0 },
  { ...context, now: Infinity },
  { ...context, scope: { ...scope, sessionId: '' } },
])('invalid evaluation context fails closed %#', (value) => {
  expect(evaluateDeletionPreflight(fixture(), value).blockers).toEqual([
    { code: 'malformedContext', state: 'unknown' },
  ]);
});

test('combined blockers remain bounded, structured and retain review gates alongside blocking facts', () => {
  const base = fixture();
  const value = {
    ...base,
    receipt: 'inflight',
    sharedClientAccount: 'yes',
    trainerAsClient: 'yes',
    localExport: { state: 'missing' },
    localAcknowledgement: { state: 'missing' },
    inventory: {
      pending: { state: 'known', count: 5 },
      rejected: { state: 'known', count: 3 },
      conflict: { state: 'known', count: 2 },
      correctionDraft: { state: 'unknown' },
    },
  };
  const output = evaluate(value);
  expect(output.state).toBe('blocked');
  expect(output.blockers.map((item) => item.code)).toEqual(
    expect.arrayContaining([
      'inventoryUnknown',
      'sharedClientReview',
      'dualRoleReview',
      'externalReviewRequired',
    ]),
  );
  expect(output.blockers.length).toBeLessThanOrEqual(24);
  expect(JSON.stringify(output)).not.toContain(scope.accountId);
  expect(output.deleteAuthorized).toBe(false);
});

test.each(['accountId', 'workspaceId'] as const)(
  'foreign proof %s is not a proof for this account',
  (key) => {
    const base = fixture();
    expect(
      evaluate({
        ...base,
        localAcknowledgement: {
          state: 'present',
          scope: { ...scope, [key]: 'foreign' },
          snapshotId: base.snapshotId,
        },
      }).blockers,
    ).toContainEqual({
      code: 'proofScopeMismatch',
      subject: 'localAcknowledgement',
      state: 'blocked',
    });
  },
);

test('unread evidence fields have no default approvals', () => {
  const base = fixture();
  for (const key of Object.keys(base)) {
    const value: Record<string, unknown> = { ...base };
    delete value[key];
    expect(evaluate(value).blockers).toEqual([
      { code: 'malformedEvidence', state: 'unknown' },
    ]);
  }
});

test('the maximum blocker matrix contains 25 unique safe entries', () => {
  const base = fixture();
  const proof = {
    state: 'present',
    scope: { ...scope, accountId: 'foreign' },
    snapshotId: 'foreign-snapshot',
  };
  const output = evaluate({
    ...base,
    scopeKind: 'client-account',
    scope: {
      accountId: 'foreign',
      workspaceId: 'foreign',
      sessionId: 'foreign',
    },
    observedAt: 0,
    receipt: 'timeout',
    sharedClientAccount: 'yes',
    trainerAsClient: 'yes',
    inventory: {
      pending: { state: 'known', count: 1 },
      rejected: { state: 'unknown' },
      conflict: { state: 'known', count: 1 },
      correctionDraft: { state: 'unknown' },
    },
    localExport: proof,
    localAcknowledgement: proof,
  });
  expect(output.blockers).toHaveLength(25);
  expect(
    new Set(output.blockers.map((item) => `${item.code}:${item.subject ?? ''}`))
      .size,
  ).toBe(25);
});
