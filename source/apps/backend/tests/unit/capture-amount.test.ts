import {
  amountMatches,
  checkCapturedAmount,
  describeCapturedAmount,
  extractCapturedAmount,
  validateCompletedCapture,
} from '../../src/paypal/capture-amount';
import { Order, OrderOrigin, OrderStatus } from '../../src/orders/domain';

// The amount/currency binding that guards every path which can mark an order
// PAID: the synchronous capture response, the PayPal lookup used by the
// reconciler, and the signed webhook. All three share this module.

const order = (totalMinor: number, currency = 'EUR'): Order => ({
  id: 'ord-1',
  sessionId: 'sess-1',
  status: OrderStatus.PAYMENT_PENDING,
  origin: OrderOrigin.HUMAN,
  items: [],
  totalMinor,
  currency,
  createdAt: new Date(),
  updatedAt: new Date(),
});

const captureResult = (value: string, currency: string) => ({
  id: 'PP-1',
  status: 'COMPLETED',
  purchaseUnits: [
    {
      payments: { captures: [{ id: 'CAP-1', status: 'COMPLETED', amount: { value, currency_code: currency } }] },
    },
  ],
});

describe('extractCapturedAmount', () => {
  test('reads the capture amount from an SDK camelCase result', () => {
    expect(extractCapturedAmount(captureResult('13.00', 'EUR'))).toEqual({
      value: '13.00',
      currency_code: 'EUR',
    });
  });

  test('reads snake_case raw JSON as well', () => {
    const raw = {
      status: 'COMPLETED',
      purchase_units: [
        { payments: { captures: [{ id: 'C', amount: { value: '2.50', currency_code: 'EUR' } }] } },
      ],
    };
    expect(extractCapturedAmount(raw)).toEqual({ value: '2.50', currency_code: 'EUR' });
  });

  test('does NOT treat the purchase-unit amount as capture evidence (it is only the order intent)', () => {
    const res = { status: 'COMPLETED', purchaseUnits: [{ amount: { value: '9.30', currencyCode: 'EUR' } }] };
    expect(extractCapturedAmount(res)).toBeUndefined();
  });

  test('a webhook resource is itself the capture', () => {
    expect(extractCapturedAmount({ id: 'C', status: 'COMPLETED', amount: { value: '3.00', currency_code: 'EUR' } })).toEqual({
      value: '3.00',
      currency_code: 'EUR',
    });
  });

  test('more than one purchase unit or capture is ambiguous: no amount is guessed', () => {
    const cap = { id: 'C', status: 'COMPLETED', amount: { value: '3.00', currency_code: 'EUR' } };
    expect(extractCapturedAmount({ purchaseUnits: [{ payments: { captures: [cap, cap] } }] })).toBeUndefined();
    expect(extractCapturedAmount({ purchaseUnits: [{ payments: { captures: [cap] } }, { payments: { captures: [cap] } }] })).toBeUndefined();
  });

  test('returns undefined when no amount is present at all', () => {
    expect(extractCapturedAmount({ status: 'COMPLETED', purchaseUnits: [{ payments: { captures: [{}] } }] })).toBeUndefined();
    expect(extractCapturedAmount(undefined)).toBeUndefined();
    expect(extractCapturedAmount({})).toBeUndefined();
  });
});

describe('amountMatches', () => {
  test('equal amounts and currency match', () => {
    expect(amountMatches(1300, '13.00', 'EUR', 'EUR')).toBe(true);
  });

  test('trailing zeros are compared as integers, never as floats', () => {
    expect(amountMatches(1300, '13.0', 'EUR', 'EUR')).toBe(true);
    expect(amountMatches(1300, '13', 'EUR', 'EUR')).toBe(true);
    expect(amountMatches(1300, '13.000', 'EUR', 'EUR')).toBe(true);
  });

  test('a different amount never matches', () => {
    expect(amountMatches(1300, '1.00', 'EUR', 'EUR')).toBe(false);
    expect(amountMatches(1300, '13.01', 'EUR', 'EUR')).toBe(false);
  });

  test('a different currency never matches', () => {
    expect(amountMatches(1300, '13.00', 'EUR', 'USD')).toBe(false);
  });

  test('unparseable, negative or non-string values never match', () => {
    expect(amountMatches(1300, 'not-a-number', 'EUR', 'EUR')).toBe(false);
    expect(amountMatches(1300, '-13.00', 'EUR', 'EUR')).toBe(false);
    expect(amountMatches(1300, NaN as unknown as string, 'EUR', 'EUR')).toBe(false);
    expect(amountMatches(1300, null as unknown as string, 'EUR', 'EUR')).toBe(false);
    expect(amountMatches(1300, { value: 13 } as unknown as string, 'EUR', 'EUR')).toBe(false);
    expect(amountMatches(1300, '13.00', 'EUR', 42 as unknown as string)).toBe(false);
  });

  test('extra fractional digits are accepted only when they are zero', () => {
    expect(amountMatches(1300, '13.001', 'EUR', 'EUR')).toBe(false);
    expect(amountMatches(1300, '12.999', 'EUR', 'EUR')).toBe(false);
  });

  test('minor units are exact for a 3-decimal-looking value', () => {
    expect(amountMatches(1250, '12.50', 'EUR', 'EUR')).toBe(true);
    expect(amountMatches(1250, '12.5', 'EUR', 'EUR')).toBe(true);
  });
});

describe('checkCapturedAmount', () => {
  test('a matching capture is accepted', () => {
    expect(checkCapturedAmount(order(1300), captureResult('13.00', 'EUR'))).toBe('match');
  });

  test('a wrong amount is a mismatch', () => {
    expect(checkCapturedAmount(order(1300), captureResult('1.00', 'EUR'))).toBe('mismatch');
  });

  test('a wrong currency is a mismatch', () => {
    expect(checkCapturedAmount(order(1300), captureResult('13.00', 'USD'))).toBe('mismatch');
  });

  test('a capture without an amount is "unknown", not "match"', () => {
    const noAmount = { status: 'COMPLETED', purchaseUnits: [{ payments: { captures: [{ id: 'C' }] } }] };
    expect(checkCapturedAmount(order(1300), noAmount)).toBe('unknown');
  });

  test('a non-numeric amount is a mismatch, never a silent pass', () => {
    const weird = {
      status: 'COMPLETED',
      purchaseUnits: [{ payments: { captures: [{ amount: { value: 'abc', currency_code: 'EUR' } }] } }],
    };
    expect(checkCapturedAmount(order(1300), weird)).toBe('mismatch');
  });

  test('a negative amount is a mismatch', () => {
    const negative = {
      status: 'COMPLETED',
      purchaseUnits: [{ payments: { captures: [{ amount: { value: '-13.00', currency_code: 'EUR' } }] } }],
    };
    expect(checkCapturedAmount(order(1300), negative)).toBe('mismatch');
  });
});

describe('describeCapturedAmount', () => {
  test('renders the amount for a log line without credentials', () => {
    expect(describeCapturedAmount({ value: '13.00', currency_code: 'EUR' })).toBe('13.00 EUR');
  });

  test('renders a missing amount safely', () => {
    expect(describeCapturedAmount(undefined)).toBe('no amount in capture');
  });
});

describe('validateCompletedCapture (the single settlement gate)', () => {
  const cap = (over: Record<string, unknown> = {}) => ({
    id: 'CAP-1',
    status: 'COMPLETED',
    amount: { value: '13.00', currency_code: 'EUR' },
    ...over,
  });
  const wrap = (c: unknown) => ({ id: 'PP-1', status: 'COMPLETED', purchaseUnits: [{ payments: { captures: [c] } }] });

  test('COMPLETED + exact amount + exact currency is a match (order response and webhook shape)', () => {
    expect(validateCompletedCapture(order(1300), wrap(cap()))).toBe('match');
    expect(validateCompletedCapture(order(1300), cap())).toBe('match');
  });

  test('a missing amount, missing currency or missing status is "unknown", never a match', () => {
    expect(validateCompletedCapture(order(1300), wrap(cap({ amount: undefined })))).toBe('unknown');
    expect(validateCompletedCapture(order(1300), wrap(cap({ amount: { value: '13.00' } })))).toBe('unknown');
    expect(validateCompletedCapture(order(1300), wrap(cap({ status: undefined })))).toBe('unknown');
    expect(validateCompletedCapture(order(1300), {})).toBe('unknown');
    expect(validateCompletedCapture(order(1300), undefined)).toBe('unknown');
  });

  test('PENDING, DECLINED and other statuses are "unknown" even with a matching amount', () => {
    for (const status of ['PENDING', 'DECLINED', 'FAILED', 'VOIDED']) {
      expect(validateCompletedCapture(order(1300), wrap(cap({ status })))).toBe('unknown');
    }
  });

  test('a REFUNDED capture is accepted only for a lookup (allowRefunded), never for a fresh capture or webhook', () => {
    const refunded = wrap(cap({ status: 'PARTIALLY_REFUNDED' }));
    expect(validateCompletedCapture(order(1300), refunded)).toBe('unknown');
    expect(validateCompletedCapture(order(1300), refunded, { allowRefunded: true })).toBe('match');
    expect(validateCompletedCapture(order(1300), wrap(cap({ status: 'REFUNDED' })), { allowRefunded: true })).toBe('match');
  });

  test('a wrong amount or currency is a mismatch, a multi-capture shape is unknown', () => {
    expect(validateCompletedCapture(order(1300), wrap(cap({ amount: { value: '1.00', currency_code: 'EUR' } })))).toBe('mismatch');
    expect(validateCompletedCapture(order(1300), wrap(cap({ amount: { value: '13.00', currency_code: 'USD' } })))).toBe('mismatch');
    expect(validateCompletedCapture(order(1300), { purchaseUnits: [{ payments: { captures: [cap(), cap()] } }] })).toBe('unknown');
  });
});
