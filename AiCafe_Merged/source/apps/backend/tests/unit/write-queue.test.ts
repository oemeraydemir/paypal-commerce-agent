import { WriteQueue } from '../../src/persistence/write-queue';

describe('WriteQueue', () => {
  test('runs jobs strictly in the order they were queued', async () => {
    const q = new WriteQueue([1]);
    const log: string[] = [];
    const slow = q.enqueue('a', async () => {
      await new Promise((r) => setTimeout(r, 20));
      log.push('a');
    });
    const fast = q.enqueue('b', async () => {
      log.push('b');
    });
    await Promise.all([slow, fast]);
    expect(log).toEqual(['a', 'b']);
  });

  test('retries with backoff and then succeeds', async () => {
    const q = new WriteQueue([1, 1, 1]);
    let calls = 0;
    await q.enqueue('flaky', async () => {
      if (++calls < 3) throw new Error('transient');
    });
    expect(calls).toBe(3);
  });

  test('gives up after the configured retries and rejects only that job', async () => {
    const q = new WriteQueue([1]);
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const bad = q.enqueue('bad', async () => {
      throw new Error('down');
    });
    await expect(bad).rejects.toThrow('down');
    let ran = false;
    await q.enqueue('next', async () => {
      ran = true;
    });
    expect(ran).toBe(true); // one failed job never blocks the queue
    jest.restoreAllMocks();
  });

  test('retries: 0 fails fast (request paths)', async () => {
    const q = new WriteQueue([1000]);
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const start = Date.now();
    await expect(q.enqueue('x', async () => { throw new Error('no'); }, { retries: 0 })).rejects.toThrow('no');
    expect(Date.now() - start).toBeLessThan(500);
    jest.restoreAllMocks();
  });
});
