import { toDayString } from '../../src/persistence/pg-repositories';

// node-pg returns SQL `date` columns as JS Date objects. The API must expose the plain
// YYYY-MM-DD string, never String(Date) ("Fri Oct 30 2026 00:00:00 GMT…"), which broke the
// merchant dashboard's Day column and its sort order.
describe('toDayString', () => {
  test('formats a Date by its local calendar date', () => {
    expect(toDayString(new Date(2026, 9, 30))).toBe('2026-10-30'); // local midnight, as node-pg builds it
    expect(toDayString(new Date(2026, 0, 5))).toBe('2026-01-05');
  });
  test('passes ISO strings through and trims timestamps', () => {
    expect(toDayString('2026-10-30')).toBe('2026-10-30');
    expect(toDayString('2026-10-30T00:00:00.000Z')).toBe('2026-10-30');
  });
  test('ISO strings sort chronologically across month boundaries', () => {
    const days = ['2026-11-02', '2026-10-31', '2026-10-30'].sort();
    expect(days).toEqual(['2026-10-30', '2026-10-31', '2026-11-02']);
  });
});
