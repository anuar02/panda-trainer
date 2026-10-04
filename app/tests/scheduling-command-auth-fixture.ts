import { bookingAuthFixture } from './booking-creation-auth-fixture';

export function schedulingAuthFixture(
  userId: string,
  workspaceId: string,
  clientRecordId = '71000000-0000-4000-8000-000000000001',
) {
  const fixture = bookingAuthFixture(userId);
  const from = jest.fn((table: string) => {
    const filters: Record<string, string> = {};
    type Query = {
      select: (columns: string) => Query;
      eq: (key: string, value: string) => Query;
      maybeSingle: () => Query;
      setHeader: (
        key: string,
        value: string,
      ) => Promise<{
        data: Record<string, string | undefined> | null;
        error: null;
      }>;
    };
    const query: Query = {
      select: jest.fn(() => query),
      eq: jest.fn((key: string, value: string) => {
        filters[key] = value;
        return query;
      }),
      maybeSingle: jest.fn(() => query),
      setHeader: jest.fn(async () => ({
        data:
          table === 'bookings'
            ? {
                id: filters.id,
                workspace_id: workspaceId,
                client_record_id: clientRecordId,
              }
            : {
                id: filters.id,
                workspace_id: workspaceId,
                booking_id: filters.booking_id,
              },
        error: null,
      })),
    };
    return query;
  });
  return {
    ...fixture,
    get listenerCount() {
      return fixture.listenerCount;
    },
    from,
    client: { ...fixture.client, from } as unknown as typeof fixture.client,
  };
}
