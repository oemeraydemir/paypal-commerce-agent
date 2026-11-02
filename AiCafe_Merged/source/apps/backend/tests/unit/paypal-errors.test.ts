import { extractPayPalIssue } from '../../src/paypal/errors';

// The shape below is what the PayPal server SDK really throws (probed against the sandbox):
// own keys request/statusCode/headers/body/result, with NO top-level `details`.
const sdkError = (issue: string) =>
  Object.assign(new Error(''), {
    statusCode: 422,
    headers: {},
    body: JSON.stringify({ name: 'UNPROCESSABLE_ENTITY', details: [{ issue, description: 'x' }] }),
    result: { name: 'UNPROCESSABLE_ENTITY', details: [{ issue, description: 'x' }] },
  });

describe('extractPayPalIssue', () => {
  test.each(['ORDER_NOT_APPROVED', 'INSTRUMENT_DECLINED', 'ORDER_ALREADY_CAPTURED'])(
    'reads %s from err.result.details (the real SDK shape)',
    (issue) => {
      expect(extractPayPalIssue(sdkError(issue))).toBe(issue);
    }
  );

  test('falls back to the JSON string body when result is missing', () => {
    const err = Object.assign(new Error(''), {
      statusCode: 422,
      body: JSON.stringify({ details: [{ issue: 'ORDER_NOT_APPROVED' }] }),
    });
    expect(extractPayPalIssue(err)).toBe('ORDER_NOT_APPROVED');
  });

  test('keeps supporting the legacy err.details shape', () => {
    expect(extractPayPalIssue({ details: [{ issue: 'INSTRUMENT_DECLINED' }] })).toBe('INSTRUMENT_DECLINED');
  });

  test('returns undefined for transport errors, malformed bodies and non-objects', () => {
    expect(extractPayPalIssue(new Error('ECONNRESET'))).toBeUndefined();
    expect(extractPayPalIssue({ body: '<html>502</html>' })).toBeUndefined();
    expect(extractPayPalIssue(undefined)).toBeUndefined();
    expect(extractPayPalIssue(null)).toBeUndefined();
    expect(extractPayPalIssue({ result: { details: [] } })).toBeUndefined();
  });
});
