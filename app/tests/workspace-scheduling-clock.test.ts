import {
  calendarWeekDateKeys,
  paddedUtcWeekBounds,
  workspaceDateKey,
  workspaceMinuteOfDay,
  workspaceMondayWeekday,
} from '../src/features/workspace-scheduling/clock';

describe('workspace scheduling clock', () => {
  it('uses workspace-local date and minute across UTC midnight', () => {
    const instant = new Date('2026-10-01T19:30:00.000Z');
    expect(workspaceDateKey(instant, 'Asia/Almaty')).toBe('2026-10-02');
    expect(workspaceMinuteOfDay(instant, 'Asia/Almaty')).toBe(30);
    expect(workspaceMondayWeekday(instant, 'Asia/Almaty')).toBe(4);
  });

  it('does not assume Almaty is UTC+6', () => {
    const instant = new Date('2026-10-01T18:30:00.000Z');
    expect(workspaceDateKey(instant, 'Asia/Almaty')).toBe('2026-10-01');
    expect(workspaceMinuteOfDay(instant, 'Asia/Almaty')).toBe(23 * 60 + 30);
  });

  it('calculates Monday-first weekday from the workspace-local day', () => {
    expect(
      workspaceMondayWeekday(
        new Date('2026-10-04T19:30:00.000Z'),
        'Asia/Almaty',
      ),
    ).toBe(0);
  });

  it('handles the skipped spring-forward hour in New York', () => {
    expect(
      workspaceMinuteOfDay(
        new Date('2026-03-08T06:59:00.000Z'),
        'America/New_York',
      ),
    ).toBe(119);
    expect(
      workspaceMinuteOfDay(
        new Date('2026-03-08T07:00:00.000Z'),
        'America/New_York',
      ),
    ).toBe(180);
    expect(
      workspaceDateKey(
        new Date('2026-03-08T07:00:00.000Z'),
        'America/New_York',
      ),
    ).toBe('2026-03-08');
  });

  it('keeps both repeated fall-back times on the same local date and minute', () => {
    const first = new Date('2026-11-01T05:30:00.000Z');
    const second = new Date('2026-11-01T06:30:00.000Z');
    expect(workspaceDateKey(first, 'America/New_York')).toBe('2026-11-01');
    expect(workspaceDateKey(second, 'America/New_York')).toBe('2026-11-01');
    expect(workspaceMinuteOfDay(first, 'America/New_York')).toBe(90);
    expect(workspaceMinuteOfDay(second, 'America/New_York')).toBe(90);
  });

  it('returns Monday through Sunday date keys using calendar-only UTC math', () => {
    expect(calendarWeekDateKeys('2026-10-01')).toEqual([
      '2026-09-28',
      '2026-09-29',
      '2026-09-30',
      '2026-10-01',
      '2026-10-02',
      '2026-10-03',
      '2026-10-04',
    ]);
  });

  it('pads bounds to cover timezone offsets and DST around the visible week', () => {
    expect(paddedUtcWeekBounds('2026-03-08')).toEqual({
      startsAtUtc: '2026-03-01T00:00:00.000Z',
      endsAtUtc: '2026-03-10T00:00:00.000Z',
    });
  });

  it('rejects invalid dates and timezone identifiers', () => {
    expect(() => workspaceDateKey(new Date(Number.NaN), 'UTC')).toThrow(
      RangeError,
    );
    expect(() => workspaceDateKey(new Date(), 'Mars/Olympus')).toThrow(
      RangeError,
    );
    expect(() => calendarWeekDateKeys('2026-02-30')).toThrow(RangeError);
    expect(() => paddedUtcWeekBounds('not-a-date')).toThrow(RangeError);
  });
});
