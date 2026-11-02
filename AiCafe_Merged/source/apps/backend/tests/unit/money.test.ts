import { formatMoney } from '../../src/utils/money';

describe('formatMoney', () => {
  test('formats EUR minor units with business locale', () => {
    const expected = new Intl.NumberFormat('en-DE', { style: 'currency', currency: 'EUR' }).format(16);
    expect(formatMoney(1600, 'EUR', 'en-DE')).toBe(expected);
  });

  test('formats USD correctly (proves no hardcoded €)', () => {
    expect(formatMoney(1250, 'USD', 'en-US')).toBe('$12.50');
  });

  test('rejects non-integer minor units', () => {
    expect(() => formatMoney(12.5, 'EUR', 'en-DE')).toThrow('integer minor units');
  });
});
