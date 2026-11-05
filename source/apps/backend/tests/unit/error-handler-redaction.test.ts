import { errorHandler } from '../../src/middleware/error-handler';

describe('central error logging redaction', () => {
  test('redacts credential-looking text before logging', () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const req: any = { method: 'POST', path: '/api/x' };
      const res: any = { status: jest.fn().mockReturnThis(), json: jest.fn() };

      errorHandler(new Error('upstream rejected client_secret=abc123'), req, res, jest.fn());

      expect(spy).toHaveBeenCalledTimes(1);
      const logged = String(spy.mock.calls[0][0]);
      expect(logged).not.toContain('abc123');
      expect(logged).toContain('[redacted]');
    } finally {
      spy.mockRestore();
    }
  });
});
