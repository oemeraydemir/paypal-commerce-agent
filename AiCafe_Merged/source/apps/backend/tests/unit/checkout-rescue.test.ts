import { checkoutRescueError, paypalBusyError } from '../../src/checkout/rescue';

/**
 * Stage 3: Checkout Rescue — the typed error schema must be stable, honest and
 * never fabricate payment outcomes. These tests lock that contract.
 */
describe('checkout rescue schema', () => {
  test('a transient busy error is retryable with guidance and cart-safety', () => {
    const err = paypalBusyError('UPSTREAM_502');
    expect(err.statusCode).toBe(502);
    expect(err.details).toMatchObject({
      code: 'PAYPAL_BUSY',
      retryable: true,
      retryAfterSeconds: 30,
      cartSaved: true,
    });
    expect(err.details.suggestion).toContain('30 seconds');
    expect(err.details.paypalIssue).toBe('UPSTREAM_502');
  });

  test('the helper never fabricates a decline reason', () => {
    const err = paypalBusyError('ORDER_NOT_APPROVED');
    // The issue is always the verified category passed in; no invented reasons.
    expect(err.details.paypalIssue).toBe('ORDER_NOT_APPROVED');
    expect(err.details.retryable).toBe(true);
  });

  test('clients can branch on the stable code instead of free-text', () => {
    const err = checkoutRescueError(400, 'Order not approved', {
      code: 'ORDER_NOT_APPROVED',
      retryable: true,
      paypalIssue: 'ORDER_NOT_APPROVED',
    });
    expect(err.details.code).toBe('ORDER_NOT_APPROVED');
    expect(err.details.retryable).toBe(true);
  });
});
