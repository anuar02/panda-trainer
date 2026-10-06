export const assignmentSessionId = 'b1000000-0000-4000-8000-000000000001';
export const nextAssignmentSessionId = 'b1000000-0000-4000-8000-000000000002';

export function assignmentJwt(
  sub: string,
  sessionId = assignmentSessionId,
  generation = 'first',
) {
  return assignmentClaimsJwt({ sub, session_id: sessionId, generation });
}

export function assignmentClaimsJwt(claims: unknown) {
  return `e30.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.signature`;
}
