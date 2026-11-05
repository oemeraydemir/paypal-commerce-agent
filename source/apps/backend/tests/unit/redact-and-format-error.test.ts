import { redactSecrets } from '../../src/ops/ops-agent';
import { formatError } from '../../src/utils/error';

describe('redactSecrets: bare provider keys', () => {
  test.each([
    ['OpenAI exploded: sk-secret-123', 'sk-secret-123'],
    ['401 Incorrect API key provided: sk-proj-abcDEF1234567890xyz', 'abcDEF1234567890xyz'],
    ['Groq rejected gsk_abcdEFGH1234567890', 'abcdEFGH1234567890'],
    ['Google said AIzaSyA1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q', 'SyA1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q'],
  ])('masks the key in %j', (input, secret) => {
    const out = redactSecrets(input);
    expect(out).not.toContain(secret);
    expect(out).toContain('[redacted]');
  });

  test('keeps the existing labelled and Bearer masking', () => {
    expect(redactSecrets('client_secret=abc123')).toBe('client_secret=[redacted]');
    expect(redactSecrets('Authorization: Bearer abc.def-123')).toBe('Authorization: Bearer [redacted]');
  });

  test('leaves harmless text alone (no over-redaction)', () => {
    const s = 'Task skipped: ask about disk usage, risk-free';
    expect(redactSecrets(s)).toBe(s);
  });
});

describe('formatError', () => {
  test('Error -> message', () => expect(formatError(new Error('boom'))).toBe('boom'));
  test('string -> itself', () => expect(formatError('plain')).toBe('plain'));
  test('plain object with message -> message', () => expect(formatError({ message: 'bad gateway', status: 502 })).toBe('bad gateway'));
  test('plain object without message is JSON, never "[object Object]"', () => {
    const out = formatError({ status: 502, name: 'HttpError' });
    expect(out).not.toBe('[object Object]');
    expect(out).toContain('502');
  });
  test('circular object does not throw', () => {
    const o: any = {};
    o.self = o;
    expect(() => formatError(o)).not.toThrow();
  });
  test('null / undefined / number', () => {
    expect(formatError(null)).toBe('null');
    expect(formatError(undefined)).toBe('undefined');
    expect(formatError(42)).toBe('42');
  });
});
