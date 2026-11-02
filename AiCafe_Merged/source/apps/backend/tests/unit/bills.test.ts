import { BillService, computeEqualSplit, deriveBillProgress, deriveBillStatus, effectiveShareStatus } from '../../src/bills/service';
import { AppError } from '../../src/middleware/error-handler';
import { BillItem, BillShare, BillStatus, ShareStatus } from '../../src/bills/domain';
import { OrderService } from '../../src/orders/service';
import { OrderOrigin } from '../../src/orders/domain';

const billService = BillService.getInstance();
const orderService = OrderService.getInstance();

function itemsForTotal(totalMinor: number): BillItem[] {
  return [{ productId: 'p1', name: 'P1', quantity: totalMinor, unitPriceMinor: 1, lineTotalMinor: totalMinor }];
}

beforeEach(() => {
  billService.reset();
  orderService.reset();
});
afterEach(() => jest.restoreAllMocks());

describe('computeEqualSplit — deterministic equal split math', () => {
  test('sums exactly to total and differs by at most 1 minor unit', () => {
    for (const total of [999, 1000, 1001, 7, 1_000_000]) {
      for (const n of [2, 3, 5, 20]) {
        const amounts = computeEqualSplit(total, n);
        expect(amounts).toHaveLength(n);
        expect(amounts.reduce((a, b) => a + b, 0)).toBe(total);
        expect(Math.max(...amounts) - Math.min(...amounts)).toBeLessThanOrEqual(1);
        for (const a of amounts) expect(Number.isInteger(a)).toBe(true);
      }
    }
  });

  test('distributes the remainder to the lowest-indexed shares', () => {
    expect(computeEqualSplit(1000, 3)).toEqual([334, 333, 333]);
    expect(computeEqualSplit(1001, 2)).toEqual([501, 500]);
  });

  test('rejects out-of-range participant counts', () => {
    expect(() => computeEqualSplit(1000, 1)).toThrow(/participant count/);
    expect(() => computeEqualSplit(1000, 21)).toThrow(/participant count/);
    expect(() => computeEqualSplit(1000, 2.5)).toThrow(/participant count/);
  });
});

describe('derived status & progress', () => {
  const share = (status: ShareStatus, amountMinor = 100) => ({
    id: `share_${status}_${amountMinor}`,
    amountMinor,
    status,
  });

  test('all pending -> OPEN, zero progress', () => {
    const shares: any = [share(ShareStatus.PENDING), share(ShareStatus.PENDING)];
    expect(deriveBillStatus(shares)).toBe(BillStatus.OPEN);
    expect(deriveBillProgress(shares)).toEqual({
      sharesTotal: 2,
      sharesPaid: 0,
      sharesWaived: 0,
      paidMinor: 0,
    });
  });

  test('some paid -> PARTIALLY_SETTLED and paidMinor sums only paid shares', () => {
    const shares: any = [
      share(ShareStatus.PAID, 334),
      share(ShareStatus.PENDING, 333),
      share(ShareStatus.WAIVED, 333),
    ];
    expect(deriveBillStatus(shares)).toBe(BillStatus.PARTIALLY_SETTLED);
    expect(deriveBillProgress(shares)).toEqual({
      sharesTotal: 3,
      sharesPaid: 1,
      sharesWaived: 1,
      paidMinor: 334,
    });
  });

  test('all paid/waived -> SETTLED', () => {
    const shares: any = [share(ShareStatus.PAID), share(ShareStatus.WAIVED)];
    expect(deriveBillStatus(shares)).toBe(BillStatus.SETTLED);
  });
});

describe('BillService.createGroup', () => {
  test('binds owner to slot 0, leaves others open, computes server-authoritative amounts', () => {
    const group = billService.createGroup({
      createdByUserId: 'user-A',
      items: itemsForTotal(1000),
      participantCount: 3,
      currency: 'EUR',
      merchantId: 'ai-cafe',
    });
    expect(group.shares).toHaveLength(3);
    expect(group.shares[0].participantUserId).toBe('user-A');
    expect(group.shares[1].participantUserId).toBeUndefined();
    expect(group.shares[2].participantUserId).toBeUndefined();
    expect(group.totalMinor).toBe(1000);
    expect(group.shares.reduce((s, x) => s + x.amountMinor, 0)).toBe(1000);
    expect(group.strategy).toBe('EQUAL');
    expect(group.status).toBe(BillStatus.OPEN);
    expect(billService.isParticipant(group, 'user-A')).toBe(true);
    expect(billService.isParticipant(group, 'outsider')).toBe(false);
  });
});

describe('invite tokens — signature, single-use, abuse protection', () => {
  function createBill(n = 3) {
    return billService.createGroup({
      createdByUserId: 'user-A',
      items: itemsForTotal(1000),
      participantCount: n,
      currency: 'EUR',
      merchantId: 'ai-cafe',
    });
  }

  test('join binds the next open slot and consumes the token', async () => {
    const group = createBill(3);
    const { token } = billService.mintInvite(group.id);
    const { shareId } = await billService.joinWithToken(token, 'user-B');
    expect(group.shares[1].participantUserId).toBe('user-B');
    expect(shareId).toBe(group.shares[1].id);
    expect(billService.isParticipant(group, 'user-B')).toBe(true);
  });

  test('a token cannot be replayed after it is consumed', async () => {
    const group = createBill(4);
    const { token } = billService.mintInvite(group.id);
    await billService.joinWithToken(token, 'user-B');
    await expect(billService.joinWithToken(token, 'user-C')).rejects.toThrow(
      new AppError(409, 'Invite token already used')
    );
  });

  test('tampered signature is rejected', async () => {
    const group = createBill(3);
    const { token } = billService.mintInvite(group.id);
    const tampered = token.slice(0, -1) + (token.endsWith('a') ? 'b' : 'a');
    await expect(billService.joinWithToken(tampered, 'user-B')).rejects.toThrow(
      new AppError(400, 'Invalid invite token')
    );
  });

  test('malformed tokens are rejected', async () => {
    await expect(billService.joinWithToken('not-a-token', 'user-B')).rejects.toThrow(
      new AppError(400, 'Malformed invite token')
    );
    await expect(billService.joinWithToken('x.y.z', 'user-B')).rejects.toThrow(
      new AppError(400, 'Malformed invite token')
    );
  });

  test('expired tokens are rejected', async () => {
    const group = createBill(3);
    const { token } = billService.mintInvite(group.id);
    const realNow = Date.now();
    jest.spyOn(Date, 'now').mockReturnValue(realNow + 2 * 60 * 60 * 1000); // +2h
    await expect(billService.joinWithToken(token, 'user-B')).rejects.toThrow(
      new AppError(400, 'Invite token expired')
    );
  });

  test('a participant cannot join twice', async () => {
    const group = createBill(3);
    const { token } = billService.mintInvite(group.id);
    await billService.joinWithToken(token, 'user-B');
    const { token: token2 } = billService.mintInvite(group.id);
    await expect(billService.joinWithToken(token2, 'user-B')).rejects.toThrow(
      new AppError(409, 'You are already a participant in this bill')
    );
  });

  test('a full bill rejects further joiners with a fresh token', async () => {
    const group = createBill(2);
    // Both invites are minted while one slot is still open; only the first can win it.
    const t1 = billService.mintInvite(group.id).token;
    const t2 = billService.mintInvite(group.id).token;
    await billService.joinWithToken(t1, 'user-B');
    await expect(billService.joinWithToken(t2, 'user-C')).rejects.toThrow(
      new AppError(409, 'Bill is full')
    );
  });

  test('minting an invite for an already full bill is refused up front', async () => {
    const group = createBill(2);
    const t1 = billService.mintInvite(group.id).token;
    await billService.joinWithToken(t1, 'user-B');
    expect(() => billService.mintInvite(group.id)).toThrow(new AppError(409, 'Bill is full'));
  });

  test('mint for an unknown bill is a 404', () => {
    expect(() => billService.mintInvite('bill_unknown')).toThrow(
      new AppError(404, 'Bill not found')
    );
  });
});

describe('effectiveShareStatus (P2 — order-derived)', () => {
  test('a share bound to a PAID order is PAID', () => {
    const order = orderService.create(
      's',
      [{ productId: 'p', name: 'P', quantity: 1, unitPriceMinor: 100, lineTotalMinor: 100 }],
      'EUR',
      OrderOrigin.HUMAN
    );
    orderService.setPayPalOrderId(order.id, 'PP');
    orderService.setPayPalCaptureResult(order.id, 'CAP', 'COMPLETED');
    const share: BillShare = { id: 'share1', amountMinor: 100, status: ShareStatus.PENDING, orderId: order.id };
    expect(effectiveShareStatus(share)).toBe(ShareStatus.PAID);
  });

  test('a share bound to a failed order is FAILED', () => {
    const order = orderService.create(
      's',
      [{ productId: 'p', name: 'P', quantity: 1, unitPriceMinor: 100, lineTotalMinor: 100 }],
      'EUR',
      OrderOrigin.HUMAN
    );
    orderService.setPayPalOrderId(order.id, 'PP');
    orderService.setPayPalCaptureResult(order.id, 'CAP', 'DECLINED');
    const share: BillShare = { id: 'share1', amountMinor: 100, status: ShareStatus.PENDING, orderId: order.id };
    expect(effectiveShareStatus(share)).toBe(ShareStatus.FAILED);
  });

  test('falls back to the stored status when there is no order', () => {
    const share: BillShare = { id: 'share1', amountMinor: 100, status: ShareStatus.PENDING };
    expect(effectiveShareStatus(share)).toBe(ShareStatus.PENDING);
  });
});
