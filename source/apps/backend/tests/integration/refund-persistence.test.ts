import request from 'supertest';
import { newDb } from 'pg-mem';
import { createApp } from '../../src/app';
import { paypalClient } from '../../src/paypal/client';
import { OrderService } from '../../src/orders/service';
import { OrderOrigin } from '../../src/orders/domain';
import { RefundError, refundService } from '../../src/refunds/service';
import { resetRefundRouteState } from '../../src/routes/refunds';
import { dailySpendTracker } from '../../src/policy/daily-spend-tracker';
import { policyStorage } from '../../src/policy/storage';
import { sessionStore } from '../../src/session';
import { resetIdempotencyMemory } from '../../src/middleware/idempotency';
import { attachPersistence, detachPersistence, PoolLike } from '../../src/persistence/init';
import { getRepos, writeQueue } from '../../src/persistence/registry';

jest.mock('../../src/paypal/client', () => ({
  paypalClient: { createOrder: jest.fn(), captureOrder: jest.fn(), getOrder: jest.fn(), refundCapture: jest.fn(), getRefund: jest.fn(), getCapture: jest.fn() },
}));
const mockRefund = paypalClient.refundCapture as jest.Mock;
const mockGetRefund = paypalClient.getRefund as jest.Mock;
const mockGetCapture = paypalClient.getCapture as jest.Mock;
// What PayPal reports on the capture: total refunded so far (minor units -> decimal string).
const capturedWithRefunded = (minor: number, currency = 'EUR') => ({
  sellerPayableBreakdown: { totalRefundedAmount: { currencyCode: currency, value: (minor / 100).toFixed(2) } },
});

const KEY = 'merchant-key-0123456789';
const app = createApp();
const orders = OrderService.getInstance();
let pool: PoolLike;

function newPool(): PoolLike {
  const { Pool } = newDb().adapters.createPg();
  return new Pool() as unknown as PoolLike;
}

function wipeMemory(): void {
  orders.reset();
  dailySpendTracker.reset();
  sessionStore.reset();
  refundService.reset();
  policyStorage.reset();
  resetIdempotencyMemory();
}

async function restart(opts: { flush?: boolean } = {}) {
  if (opts.flush !== false) await writeQueue.idle();
  wipeMemory();
  return attachPersistence(pool, { advisoryLock: false });
}

function paidOrder(totalMinor = 1300) {
  const order = orders.create(
    'sess-refund-db',
    [{ productId: 'coffee', name: 'Coffee', quantity: 1, unitPriceMinor: totalMinor, lineTotalMinor: totalMinor }],
    'EUR',
    OrderOrigin.AI_ASSISTED
  );
  orders.setPayPalOrderId(order.id, `PP-${order.id}`);
  orders.setPayPalCaptureResult(order.id, `CAP-${order.id}`, 'COMPLETED');
  return orders.getById(order.id)!;
}

const propose = (orderId: string, body: any = {}) =>
  request(app).post('/api/refunds/propose').set('X-Ops-Key', KEY).send({ orderId, reason: 'Cold coffee', ...body });
const approve = (id: string) => request(app).post(`/api/refunds/${id}/approve`).set('X-Ops-Key', KEY);
const reject = (id: string) => request(app).post(`/api/refunds/${id}/reject`).set('X-Ops-Key', KEY);
const dbRefunds = async () => (await pool.query('SELECT * FROM refund_requests ORDER BY created_at')).rows;

beforeEach(async () => {
  (writeQueue as any).retryDelaysMs = [1, 1, 1];
  process.env.OPS_COPILOT_KEY = KEY;
  resetRefundRouteState();
  wipeMemory();
  mockRefund.mockReset();
  mockRefund.mockResolvedValue({ id: 'REFUND-1', status: 'COMPLETED' });
  mockGetRefund.mockReset();
  mockGetRefund.mockResolvedValue({ status: 'COMPLETED', id: 'REFUND-1' });
  pool = newPool();
  await attachPersistence(pool, { advisoryLock: false });
});

afterEach(async () => {
  await writeQueue.idle();
  jest.restoreAllMocks();
  detachPersistence();
  wipeMemory();
});

describe('refund queue durability', () => {
  test('a proposal is stored before it is acknowledged and survives a restart', async () => {
    const order = paidOrder();
    const res = await propose(order.id);
    expect(res.status).toBe(201);
    expect((await dbRefunds())[0]).toMatchObject({ id: res.body.id, status: 'PROPOSED', amount_minor: 1300 });

    await restart();
    const back = refundService.get(res.body.id)!;
    expect(back).toMatchObject({ status: 'PROPOSED', orderId: order.id, amountMinor: 1300, reason: 'Cold coffee' });
    // still blocks a second open proposal for the same order
    expect((await propose(order.id)).status).toBe(409);
  });

  test('approved refunds stay REFUNDED: the refundable amount is not reset by a restart', async () => {
    const order = paidOrder(1300);
    const res = await propose(order.id, { amountMinor: 500 });
    expect((await approve(res.body.id)).status).toBe(200);
    expect(refundService.refundedMinor(order.id)).toBe(500);

    await restart();
    const back = refundService.get(res.body.id)!;
    expect(back).toMatchObject({ status: 'REFUNDED', paypalRefundId: 'REFUND-1' });
    expect(refundService.refundedMinor(order.id)).toBe(500);
    // only 800 left: a refund of 900 must still be refused after the restart
    expect((await propose(order.id, { amountMinor: 900 })).status).toBe(422);
  });

  test('a rejected proposal stays rejected after a restart', async () => {
    const order = paidOrder();
    const res = await propose(order.id);
    await request(app).post(`/api/refunds/${res.body.id}/reject`).set('X-Ops-Key', KEY);
    await restart();
    expect(refundService.get(res.body.id)!.status).toBe('REJECTED');
  });

  test('PROCESSING is stored BEFORE PayPal is asked', async () => {
    const order = paidOrder();
    const res = await propose(order.id);
    mockRefund.mockImplementationOnce(async () => {
      expect((await dbRefunds())[0].status).toBe('PROCESSING');
      return { id: 'REFUND-WA', status: 'COMPLETED' };
    });
    expect((await approve(res.body.id)).status).toBe(200);
    await writeQueue.idle();
    expect((await dbRefunds())[0]).toMatchObject({ status: 'REFUNDED', paypal_refund_id: 'REFUND-WA' });
  });

  test('crash while PayPal was being asked: re-opened with a warning, retry is idempotent', async () => {
    const order = paidOrder();
    const res = await propose(order.id);
    await writeQueue.idle();
    const repos = getRepos()!;
    mockRefund.mockImplementationOnce(async () => {
      // PayPal accepts the refund, then the database "disappears" before the result is stored
      jest.spyOn(repos.refunds, 'save').mockRejectedValue(new Error('db down'));
      return { id: 'REFUND-CRASH', status: 'COMPLETED' };
    });
    const first = await approve(res.body.id);
    expect(first.status).toBe(200); // PayPal is the truth: a storage error is not a failed refund
    await writeQueue.idle();
    jest.restoreAllMocks();
    expect((await dbRefunds())[0].status).toBe('PROCESSING'); // last durable state

    await restart({ flush: false });
    const reopened = refundService.get(res.body.id)!;
    expect(reopened.status).toBe('PROPOSED');
    expect(reopened.lastError).toMatch(/Interrupted by a server restart/);
    expect((await propose(order.id)).status).toBe(409); // cannot propose a second refund meanwhile

    // PayPal DID issue it (the capture shows the refunded total): approving must NOT send it again.
    mockGetCapture.mockResolvedValue(capturedWithRefunded(1300));
    const callsBefore = mockRefund.mock.calls.length;
    const retry = await approve(res.body.id);
    expect(retry.status).toBe(200);
    expect(retry.body.status).toBe('REFUNDED');
    expect(retry.body.lastError).toMatch(/Confirmed at PayPal/);
    expect(mockRefund.mock.calls.length).toBe(callsBefore); // no second refund request
    await writeQueue.idle();
    expect((await dbRefunds())[0]).toMatchObject({ status: 'REFUNDED' });
  });

  describe('interrupted refund (no refund id): verified against the capture before anything is re-sent', () => {
    async function interrupted(amountMinor?: number) {
      const order = paidOrder(1300);
      const res = await propose(order.id, amountMinor ? { amountMinor } : {});
      await writeQueue.idle();
      const repos = getRepos()!;
      mockRefund.mockImplementationOnce(async () => {
        jest.spyOn(repos.refunds, 'save').mockRejectedValue(new Error('db down'));
        return { id: 'REFUND-X', status: 'COMPLETED' };
      });
      await approve(res.body.id);
      await writeQueue.idle();
      jest.restoreAllMocks();
      await restart({ flush: false });
      mockRefund.mockClear();
      return { order, id: res.body.id as string };
    }

    test('PayPal shows nothing refunded: it is safe to send, with the same request id', async () => {
      const { order, id } = await interrupted();
      mockGetCapture.mockResolvedValue(capturedWithRefunded(0));
      mockRefund.mockResolvedValue({ id: 'REFUND-NEW', status: 'COMPLETED' });
      const out = await approve(id);
      expect(out.status).toBe(200);
      expect(out.body.status).toBe('REFUNDED');
      expect(mockRefund).toHaveBeenCalledTimes(1);
      expect(mockRefund).toHaveBeenLastCalledWith(`CAP-${order.id}`, expect.anything(), `aicafe-refund-${id}`);
    });

    test('PayPal unreachable: 503, NOTHING is sent, the request stays blocked with its warning', async () => {
      const { id } = await interrupted();
      mockGetCapture.mockRejectedValue(new Error('network'));
      const out = await approve(id);
      expect(out.status).toBe(503);
      expect(mockRefund).not.toHaveBeenCalled();
      const rec = refundService.get(id)!;
      expect(rec.status).toBe('PROPOSED');
      expect(rec.lastError).toMatch(/Interrupted by a server restart/);
      // once PayPal is reachable again the same record can be resolved
      mockGetCapture.mockResolvedValue(capturedWithRefunded(1300));
      expect((await approve(id)).body.status).toBe('REFUNDED');
      expect(mockRefund).not.toHaveBeenCalled();
    });

    test('PayPal does not report a refunded total: blocked, nothing sent', async () => {
      const { id } = await interrupted();
      mockGetCapture.mockResolvedValue({});
      expect((await approve(id)).status).toBe(503);
      expect(mockRefund).not.toHaveBeenCalled();
    });

    test('an amount that matches neither "nothing" nor "this refund": 409, nothing sent', async () => {
      const { id } = await interrupted(500);
      mockGetCapture.mockResolvedValue(capturedWithRefunded(200)); // someone refunded 2.00 elsewhere
      const out = await approve(id);
      expect(out.status).toBe(409);
      expect(out.body.error ?? out.body.message).toMatch(/outside this queue|partial state/);
      expect(mockRefund).not.toHaveBeenCalled();
    });

    test('a refund of a different currency is never trusted', async () => {
      const { id } = await interrupted();
      mockGetCapture.mockResolvedValue(capturedWithRefunded(1300, 'USD'));
      expect((await approve(id)).status).toBe(503);
      expect(mockRefund).not.toHaveBeenCalled();
    });
  });

  test('if the proposal cannot be stored it is withdrawn and 503 is returned', async () => {
    const order = paidOrder();
    jest.spyOn(getRepos()!.refunds, 'save').mockRejectedValue(new Error('db down'));
    const res = await propose(order.id);
    expect(res.status).toBe(503);
    expect(refundService.list()).toHaveLength(0);
  });

  test('if a refund rejection cannot be stored, the endpoint fails and the proposal remains open', async () => {
    const order = paidOrder();
    const proposal = await propose(order.id);
    expect(proposal.status).toBe(201);
    await writeQueue.idle();

    jest.spyOn(getRepos()!.refunds, 'save').mockRejectedValue(new Error('db down'));
    const out = await reject(proposal.body.id);

    expect(out.status).toBe(503);
    expect(refundService.get(proposal.body.id)!.status).toBe('PROPOSED');
    expect((await dbRefunds())[0].status).toBe('PROPOSED');
  });

  test('if PROCESSING cannot be stored, PayPal is never asked', async () => {
    const order = paidOrder();
    const res = await propose(order.id);
    await writeQueue.idle();
    jest.spyOn(getRepos()!.refunds, 'save').mockRejectedValue(new Error('db down'));
    const out = await approve(res.body.id);
    expect(out.status).toBe(503);
    expect(mockRefund).not.toHaveBeenCalled();
    expect(refundService.get(res.body.id)!.status).toBe('PROPOSED');
  });

  test('PROCESSING with a persisted PayPal refund id is reconciled at startup: COMPLETED is corrected', async () => {
    const order = paidOrder();
    const res = await propose(order.id);
    await writeQueue.idle();

    // Simulate the crash window: PayPal responded with a refund id, but the DB
    // write of the final outcome failed. Update the DB record to PROCESSING
    // with a paypal_refund_id (what would have been saved before PayPal was called).
    await pool.query(
      `UPDATE refund_requests SET status = 'PROCESSING', paypal_refund_id = $1, paypal_refund_status = $2
       WHERE id = $3`,
      ['REFUND-RECON', 'COMPLETED', res.body.id]
    );

    // At startup, hydrate() should call getRefund and correct status to REFUNDED.
    mockGetRefund.mockResolvedValueOnce({ status: 'COMPLETED', id: 'REFUND-RECON' });
    await restart({ flush: false });

    const reconciled = refundService.get(res.body.id)!;
    expect(reconciled.status).toBe('REFUNDED');
    expect(reconciled.paypalRefundId).toBe('REFUND-RECON');
    expect(mockGetRefund).toHaveBeenCalledWith('REFUND-RECON');
  });

  test('a PENDING PayPal refund remains blocked after restart and is not reissued', async () => {
    const order = paidOrder();
    const res = await propose(order.id);
    await writeQueue.idle();

    await pool.query(
      `UPDATE refund_requests SET status = 'PROCESSING', paypal_refund_id = $1
       WHERE id = $2`,
      ['REFUND-PENDING', res.body.id]
    );
    mockGetRefund.mockResolvedValue({ status: 'PENDING', id: 'REFUND-PENDING' });
    await restart({ flush: false });

    const reopened = refundService.get(res.body.id)!;
    expect(reopened.status).toBe('PROPOSED');
    expect(reopened.paypalRefundStatus).toBe('PENDING');
    expect((await approve(res.body.id)).status).toBe(409);
    expect(mockRefund).not.toHaveBeenCalled();
  });

  test('PROCESSING with PayPal unreachable at startup stays PROPOSED with a warning (no auto-retry)', async () => {
    const order = paidOrder();
    const res = await propose(order.id);
    await writeQueue.idle();

    await pool.query(
      `UPDATE refund_requests SET status = 'PROCESSING', paypal_refund_id = $1
       WHERE id = $2`,
      ['REFUND-UNKNOWN', res.body.id]
    );

    // getRefund is called by hydrate() and again by approve()'s pre-flight.
    // Make BOTH calls fail so the record stays PROPOSED and approve throws 503.
    mockGetRefund.mockRejectedValue(new Error('network'));
    await restart({ flush: false });

    const reopened = refundService.get(res.body.id)!;
    expect(reopened.status).toBe('PROPOSED');
    expect(reopened.lastError).toMatch(/Could not verify refund/);
  });

  test('approve on a reopened refund with PayPal returning FAILED is retryable', async () => {
    const order = paidOrder();
    const res = await propose(order.id);
    await writeQueue.idle();

    await pool.query(
      `UPDATE refund_requests SET status = 'PROCESSING', paypal_refund_id = $1
       WHERE id = $2`,
      ['REFUND-FAIL', res.body.id]
    );

    // Both hydrate() and approve()'s pre-flight call getRefund; return FAILED both times.
    mockGetRefund.mockResolvedValue({ status: 'FAILED', id: 'REFUND-FAIL' });
    await restart({ flush: false });

    const reopened = refundService.get(res.body.id)!;
    expect(reopened.status).toBe('PROPOSED');
    expect(reopened.lastError).toMatch(/FAILED/);

    // Now approving should proceed to PayPal with a new refund (PayPal allows retry for FAILED refunds).
    mockRefund.mockResolvedValueOnce({ id: 'REFUND-NEWT', status: 'COMPLETED' });
    const result = await approve(res.body.id);
    expect(result.status).toBe(200);
    const record = refundService.get(res.body.id)!;
    expect(record.status).toBe('REFUNDED');
    expect(record.paypalRefundId).toBe('REFUND-NEWT');
  });

  test('approve on a reopened refund with PayPal unreachable throws 503 (no blind retry)', async () => {
    const order = paidOrder();
    const res = await propose(order.id);
    await writeQueue.idle();

    await pool.query(
      `UPDATE refund_requests SET status = 'PROCESSING', paypal_refund_id = $1
       WHERE id = $2`,
      ['REFUND-BLOCKED', res.body.id]
    );

    // Both hydrate() and approve()'s pre-flight call getRefund; reject both to simulate PayPal being unreachable.
    mockGetRefund.mockRejectedValue(new Error('network'));
    await restart({ flush: false });

    // Approving now should fail because we cannot verify the prior refund's status.
    const result = await approve(res.body.id);
    expect(result.status).toBe(503);
    expect(mockRefund).not.toHaveBeenCalled();
  });

  test('concurrent approvals of a reopened refund call PayPal at most once', async () => {
    const order = paidOrder();
    const res = await propose(order.id);
    await writeQueue.idle();

    // Simulate a record reopened after a crash that already carries a PayPal
    // refund id: the retry path that must reconcile before re-issuing.
    await pool.query(
      `UPDATE refund_requests SET status = 'PROPOSED', paypal_refund_id = $1 WHERE id = $2`,
      ['REFUND-CONC', res.body.id]
    );
    await restart({ flush: false }); // loads paypalRefundId into the in-memory record

    // Hold the first reconciliation at PayPal so both approvals genuinely overlap.
    let release!: (value: any) => void;
    const gate = new Promise((resolve) => (release = resolve));
    mockGetRefund.mockImplementationOnce(() => gate);
    mockRefund.mockResolvedValueOnce({ id: 'REFUND-NEW', status: 'COMPLETED' });

    const first = refundService.approve(res.body.id); // claims PROCESSING, awaits the gate
    const second = refundService.approve(res.body.id); // must see PROCESSING and reject
    release({ status: 'FAILED', id: 'REFUND-CONC' });

    const [firstResult, secondResult] = await Promise.allSettled([first, second]);
    expect(firstResult.status).toBe('fulfilled');
    expect(secondResult.status).toBe('rejected');
    expect((secondResult as PromiseRejectedResult).reason).toBeInstanceOf(RefundError);
    expect((secondResult as PromiseRejectedResult).reason.status).toBe(409);

    // The whole point: PayPal is asked at most once for concurrent approvals.
    expect(mockRefund).toHaveBeenCalledTimes(1);
    expect(refundService.get(res.body.id)!.status).toBe('REFUNDED');
  });
});

describe('policy event durability', () => {
  const event = (n: number) =>
    policyStorage.recordEvent({
      userId: 'u1',
      cartId: `cart-${n}`,
      agent: 'AI_AGENT',
      amountMinor: 300,
      currency: 'EUR',
      evaluation: { decision: 'AUTO_ALLOW', violations: [] } as any,
      policy: policyStorage.getOrCreatePolicy('u1'),
    });

  test('history and stats survive a restart, and new ids never collide', async () => {
    event(1);
    event(2);
    await writeQueue.idle();
    const before = policyStorage.getEvents().length;

    await restart();
    expect(policyStorage.getEvents('u1')).toHaveLength(before);
    expect(policyStorage.getStats('u1').totalRequests).toBe(2);

    event(3);
    await writeQueue.idle();
    const ids = policyStorage.getEvents('u1').map((e) => e.id);
    expect(new Set(ids).size).toBe(3); // no duplicate id after the restart
    const rows = (await pool.query('SELECT id FROM policy_events')).rows;
    expect(rows).toHaveLength(3);
  });
});
