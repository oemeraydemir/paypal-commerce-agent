/**
 * Focused regression test for the smoke harness's failure path: when the real
 * PostgreSQL connection cannot be established (bad DATABASE_URL), the suite
 * must report a SINGLE setup failure rather than ten misleading per-business-test
 * failures, and its afterAll must not crash on an un-initialized pool/schema.
 *
 * This shells out to jest using the smoke config under a deliberately
 * unreachable connection string. It does NOT touch real credentials and never
 * prints a connection string.
 */
import { execFileSync } from 'child_process';
import path from 'path';

const BACKEND = path.join(__dirname, '../..');

describe('pg-pickup-atomicity cleanup on failed connection', () => {
  test('reports one setup failure, skips business tests, and does not crash in afterAll', () => {
    const jestBin = path.join(BACKEND, 'node_modules', 'jest', 'bin', 'jest.js');
    const args = ['-c', 'jest.smoke.config.js', '--runInBand', 'tests/smoke/pg-pickup-atomicity.test.ts'];
    // Localhost port 1 is guaranteed closed → immediate ECONNREFUSED.
    const env = {
      ...process.env,
      DATABASE_URL: 'postgres://smoke:test@127.0.0.1:1/unreachable',
      SMOKE_REQUIRE_REAL: '1',
    };

    let stdout = '';
    let stderr = '';
    let code = 0;
    try {
      stdout = execFileSync(process.execPath, [jestBin, ...args], {
        cwd: BACKEND,
        env,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 120_000,
      });
    } catch (err: any) {
      code = typeof err?.status === 'number' ? err.status : 1;
      stdout = String(err?.stdout || '');
      stderr = String(err?.stderr || '');
    }
    const out = stdout + stderr;

    // Must NOT crash in afterAll reading `pool.end()` off an undefined pool.
    expect(out).not.toMatch(/Cannot read properties of undefined \(reading 'end'\)/);

    // The failure surfaces through the single setup test, not the business tests.
    expect(out).toMatch(/setup: connect to real PostgreSQL/);
    expect(out).toMatch(/PostgreSQL setup failed/);

    // Exactly one test fails (the setup gate) — not the ten business tests.
    expect(out).toMatch(/Tests:\s+1 failed,\s+10 passed,\s+11 total/);

    // A failed real-integration run must be a hard failure when enforcement is on.
    expect(code).not.toBe(0);
  });
});
