import { refundedMinorFromCapture, refundedMinorFromOrder, resolveRefundedMinor } from '../../src/refunds/refunded-total';
import { paypalClient } from '../../src/paypal/client';

jest.mock('../../src/paypal/client', () => ({ paypalClient: { getOrder: jest.fn() } }));
const getOrder = paypalClient.getOrder as jest.Mock;

// Shapes follow the PayPal v2 Payments API as returned by the Node SDK (camelCase): a GET capture has
// NO total-refunded field, only a status; the refund list lives on the order.
describe('refunded total at PayPal', () => {
  beforeEach(() => getOrder.mockReset());

  test('capture COMPLETED means nothing was ever refunded', () => {
    expect(refundedMinorFromCapture({ status: 'COMPLETED', amount: { currencyCode: 'EUR', value: '13.00' } }, 'EUR')).toBe(0);
  });

  test('capture REFUNDED means the whole capture amount', () => {
    expect(refundedMinorFromCapture({ status: 'REFUNDED', amount: { currencyCode: 'EUR', value: '13.00' } }, 'EUR')).toBe(1300);
  });

  test('PARTIALLY_REFUNDED alone does not establish an amount', () => {
    expect(refundedMinorFromCapture({ status: 'PARTIALLY_REFUNDED' }, 'EUR')).toBeNull();
  });

  test('a legacy total_refunded_amount is still honoured', () => {
    const capture = { sellerPayableBreakdown: { totalRefundedAmount: { currencyCode: 'EUR', value: '6.50' } } };
    expect(refundedMinorFromCapture(capture, 'EUR')).toBe(650);
  });

  test('wrong currency is never trusted', () => {
    expect(refundedMinorFromCapture({ status: 'REFUNDED', amount: { currencyCode: 'USD', value: '13.00' } }, 'EUR')).toBeNull();
  });

  test('order refunds are summed; failed refunds are ignored', () => {
    const order = {
      purchaseUnits: [
        {
          payments: {
            refunds: [
              { status: 'COMPLETED', amount: { currencyCode: 'EUR', value: '6.50' } },
              { status: 'FAILED', amount: { currencyCode: 'EUR', value: '1.00' } },
              { status: 'PENDING', amount: { currencyCode: 'EUR', value: '0.50' } },
            ],
          },
        },
      ],
    };
    expect(refundedMinorFromOrder(order, 'EUR')).toBe(700);
  });

  test('an unreadable refund makes the total unknown rather than guessed', () => {
    const order = { purchaseUnits: [{ payments: { refunds: [{ status: 'COMPLETED', amount: { value: 'x' } }] } }] };
    expect(refundedMinorFromOrder(order, 'EUR')).toBeNull();
  });

  test('PARTIALLY_REFUNDED falls through to the order lookup (the real crash-recovery case)', async () => {
    getOrder.mockResolvedValue({
      purchaseUnits: [{ payments: { refunds: [{ status: 'COMPLETED', amount: { currencyCode: 'EUR', value: '6.50' } }] } }],
    });
    expect(await resolveRefundedMinor({ status: 'PARTIALLY_REFUNDED' }, 'EUR', 'ORDER1')).toBe(650);
    expect(getOrder).toHaveBeenCalledWith('ORDER1');
  });

  test('PayPal unreachable or no order id → unknown (caller blocks, nothing is re-sent)', async () => {
    getOrder.mockRejectedValue(new Error('down'));
    expect(await resolveRefundedMinor({ status: 'PARTIALLY_REFUNDED' }, 'EUR', 'ORDER1')).toBeNull();
    expect(await resolveRefundedMinor({ status: 'PARTIALLY_REFUNDED' }, 'EUR', undefined)).toBeNull();
  });
});
