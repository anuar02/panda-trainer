export const syntheticSessionId = '00000000-0000-4000-8000-000000000088';
export function syntheticToken(
  userId: string,
  sessionId = syntheticSessionId,
  marker = 'signature',
) {
  return `header.${Buffer.from(JSON.stringify({ sub: userId, session_id: sessionId, exp: 4102444800 })).toString('base64url')}.${marker}`;
}
export function authenticatedRequest<T>(promise: Promise<T>) {
  const request: Promise<T> & { setHeader: jest.Mock; abortSignal: jest.Mock } =
    Object.assign(promise, {
      setHeader: jest.fn((_name: string, _value: string) => request),
      abortSignal: jest.fn((_signal: AbortSignal) => promise),
    });
  return request;
}
export function fluentRpc<T>(implementation: () => Promise<T>) {
  const mock = jest.fn(implementation);
  return new Proxy(mock, {
    apply(target, thisArg: unknown, argumentsList: unknown[]) {
      return authenticatedRequest(
        Reflect.apply(target, thisArg, argumentsList) as Promise<T>,
      );
    },
  });
}
