import { resolveWorkspaceLocalTime } from '../src/features/workspace-scheduling/clock';

describe('workspace local time resolution', () => {
  it.each([
    ['2026-10-02', '00:30', 'Asia/Almaty', '2026-10-01T19:30:00.000Z'],
    ['2026-10-02', '09:15', 'Asia/Kathmandu', '2026-10-02T03:30:00.000Z'],
    ['2026-10-02', '00:00', 'Pacific/Kiritimati', '2026-10-01T10:00:00.000Z'],
    ['2026-10-02', '23:59', 'Pacific/Pago_Pago', '2026-10-03T10:59:00.000Z'],
    ['2028-02-29', '12:00', 'UTC', '2028-02-29T12:00:00.000Z'],
    ['1900-01-01', '12:00', 'Europe/Paris', '1900-01-01T11:50:39.000Z'],
  ])('resolves %s %s in %s', (date, time, zone, expected) => {
    expect(resolveWorkspaceLocalTime(date, time, zone)).toEqual({
      status: 'unique',
      startsAtUtc: expected,
    });
  });

  it('reports both repeated fall-back instants without choosing one', () => {
    expect(
      resolveWorkspaceLocalTime('2026-11-01', '01:30', 'America/New_York'),
    ).toEqual({
      status: 'ambiguous',
      candidatesUtc: ['2026-11-01T05:30:00.000Z', '2026-11-01T06:30:00.000Z'],
    });
  });

  it('handles a repeated half-hour on Lord Howe Island', () => {
    expect(
      resolveWorkspaceLocalTime('2026-04-05', '01:45', 'Australia/Lord_Howe'),
    ).toEqual({
      status: 'ambiguous',
      candidatesUtc: ['2026-04-04T14:45:00.000Z', '2026-04-04T15:15:00.000Z'],
    });
  });

  it.each([
    ['2026-03-08', '02:30', 'America/New_York'],
    ['2026-10-04', '02:15', 'Australia/Lord_Howe'],
    ['2011-12-30', '12:00', 'Pacific/Apia'],
  ])('reports skipped calendar times %s %s in %s', (date, time, zone) => {
    expect(resolveWorkspaceLocalTime(date, time, zone)).toEqual({
      status: 'nonexistent',
    });
  });

  it.each([
    ['2026-02-30', '12:00', 'UTC'],
    ['2026-10-02', '24:00', 'UTC'],
    ['2026-10-02', '12:60', 'UTC'],
    ['2026-10-02', '9:00', 'UTC'],
    ['2026-10-02', '12:00:00', 'UTC'],
    ['2026-10-02', '12:00', 'Mars/Olympus'],
  ])('rejects invalid input %s %s %s', (date, time, zone) => {
    expect(() => resolveWorkspaceLocalTime(date, time, zone)).toThrow(
      RangeError,
    );
  });
});
