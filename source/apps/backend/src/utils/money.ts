/**
 * Format integer minor units as a localized currency string.
 * NEVER hardcode currency symbols; always derive from currency + locale.
 */
export function formatMoney(minor: number, currency: string, locale: string): string {
  if (!Number.isInteger(minor)) {
    throw new Error('formatMoney requires integer minor units');
  }

  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
  }).format(minor / 100);
}
