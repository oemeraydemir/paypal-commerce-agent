import crypto from 'crypto';
import { OrderService } from '../orders/service';
import { OrderStatus } from '../orders/domain';
import { paypalClient } from '../paypal/client';
import { buildEvidencePackage } from '../evidence/service';
import { getRepos } from '../persistence/registry';
import { DisputeAuditRow, DisputeCaseRow, DisputeCaseStatus } from '../persistence/types';

export class DisputeError extends Error {
  constructor(public readonly status: number, message: string) { super(message); }
}

const terminal = new Set<DisputeCaseStatus>(['RESOLVED', 'WITHDRAWN', 'EXPIRED', 'FAILED']);
const safeText = (value: string) => value.replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, '[redacted email]')
  .replace(/(?:\+?\d[\d ().-]{7,}\d)/g, '[redacted phone]').slice(0, 2000);

export class DisputeService {
  private readonly cases = new Map<string, DisputeCaseRow>();
  private readonly audit = new Map<string, DisputeAuditRow>();

  async hydrate(): Promise<number> {
    const rows = await getRepos()?.disputes.loadAll() ?? [];
    for (const row of rows) this.cases.set(row.id, row);
    return rows.length;
  }

  list(): DisputeCaseRow[] { return [...this.cases.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt)); }
  get(id: string): DisputeCaseRow | undefined { return this.cases.get(id); }
  reset(): void { this.cases.clear(); this.audit.clear(); }

  private async record(row: DisputeCaseRow, eventType: string, actor: string, details: Record<string, unknown> = {}) {
    const event: DisputeAuditRow = { id: crypto.randomUUID(), disputeCaseId: row.id, eventType, actor, details, occurredAt: new Date().toISOString() };
    this.audit.set(event.id, event);
    try { await getRepos()?.disputes.appendAudit(event); }
    catch { console.error(`DISPUTE_AUDIT_FAILED id=${row.id} event=${eventType}`); }
  }

  async auditFor(id: string): Promise<DisputeAuditRow[]> {
    return await getRepos()?.disputes.loadAudit(id) ?? [...this.audit.values()].filter((e) => e.disputeCaseId === id).sort((a,b) => a.occurredAt.localeCompare(b.occurredAt));
  }

  async create(orderId: string, paypalDisputeId: string, actor: string): Promise<DisputeCaseRow> {
    const order = OrderService.getInstance().getById(orderId);
    if (!order || ![OrderStatus.PAID, OrderStatus.ORDER_CONFIRMED].includes(order.status) || !order.paypalCaptureId) {
      throw new DisputeError(409, 'A dispute can only be linked to a paid order with a recorded capture.');
    }
    if (!/^[A-Za-z0-9._-]{3,128}$/.test(paypalDisputeId)) throw new DisputeError(400, 'paypalDisputeId is invalid.');
    if (this.list().some((item) => item.paypalDisputeId === paypalDisputeId)) throw new DisputeError(409, 'This PayPal dispute is already registered.');
    let remote: any;
    try { remote = await paypalClient.getDispute(paypalDisputeId); }
    catch { throw new DisputeError(503, 'PayPal dispute could not be verified; no case was created.'); }
    if (remote?.dispute_id !== paypalDisputeId) throw new DisputeError(502, 'PayPal dispute response did not match the requested case.');
    const now = new Date().toISOString();
    const requested = (remote.evidences ?? []).find((e: any) => e?.source === 'REQUESTED_FROM_SELLER')?.evidence_type;
    const row: DisputeCaseRow = {
      id: crypto.randomUUID(), orderId, paypalDisputeId,
      status: remote.status === 'RESOLVED' ? 'RESOLVED' : 'OPEN', paypalStatus: remote.status,
      lifecycleStage: remote.dispute_life_cycle_stage, requestedEvidenceType: requested,
      sellerResponseDueAt: remote.seller_response_due_date, createdBy: actor, createdAt: now, updatedAt: now,
      ...(remote.status === 'RESOLVED' ? { resolvedAt: now } : {}),
    };
    const repo = getRepos()?.disputes;
    if (repo && !(await repo.create(row))) throw new DisputeError(409, 'This PayPal dispute is already registered.');
    this.cases.set(row.id, row);
    await this.record(row, 'CASE_REGISTERED', actor, { paypalStatus: row.paypalStatus });
    return row;
  }

  async refresh(id: string, actor: string): Promise<DisputeCaseRow> {
    const row = this.cases.get(id);
    if (!row) throw new DisputeError(404, 'Dispute case not found.');
    let remote: any;
    try { remote = await paypalClient.getDispute(row.paypalDisputeId); }
    catch { throw new DisputeError(503, 'PayPal dispute status could not be refreshed.'); }
    if (remote?.dispute_id !== row.paypalDisputeId) throw new DisputeError(502, 'PayPal dispute response did not match the registered case.');
    row.paypalStatus = remote.status;
    row.lifecycleStage = remote.dispute_life_cycle_stage;
    row.requestedEvidenceType = (remote.evidences ?? []).find((e: any) => e?.source === 'REQUESTED_FROM_SELLER')?.evidence_type;
    row.sellerResponseDueAt = remote.seller_response_due_date;
    const prior = row.status;
    if (remote.status === 'RESOLVED') { row.status = 'RESOLVED'; row.resolvedAt = new Date().toISOString(); }
    else if ((prior === 'SUBMISSION_UNCERTAIN' || prior === 'SUBMISSION_PENDING') && this.evidenceConfirmed(remote, row)) row.status = 'SUBMITTED';
    else if (prior === 'SUBMISSION_PENDING') {
      row.status = 'SUBMISSION_UNCERTAIN';
      row.lastError = 'A previous submission attempt has no verified PayPal evidence record. Do not resubmit automatically.';
    }
    else if (!terminal.has(prior) && row.requestedEvidenceType && remote.status === 'WAITING_FOR_SELLER_RESPONSE' && prior === 'OPEN') row.status = 'EVIDENCE_READY';
    row.updatedAt = new Date().toISOString();
    await this.persist(row, [prior]);
    if (prior !== row.status || remote.status !== row.paypalStatus) await this.record(row, 'PAYPAL_STATUS_REFRESHED', actor, { status: row.status });
    return row;
  }

  private evidenceConfirmed(remote: any, row: DisputeCaseRow): boolean {
    return (remote.evidences ?? []).some((e: any) => e?.source === 'SUBMITTED_BY_SELLER' && e?.evidence_type === row.evidenceType);
  }

  async prepare(id: string, actor: string): Promise<DisputeCaseRow> {
    const row = this.cases.get(id);
    if (!row) throw new DisputeError(404, 'Dispute case not found.');
    if (terminal.has(row.status)) throw new DisputeError(409, `Dispute is ${row.status}.`);
    if (!row.requestedEvidenceType) throw new DisputeError(409, 'PayPal has not requested seller evidence; refresh the case first.');
    const pkg = buildEvidencePackage(row.orderId);
    if (!pkg) throw new DisputeError(404, 'Order evidence is unavailable.');
    const prior = row.status;
    row.evidenceSnapshot = pkg as unknown as Record<string, unknown>;
    row.evidenceDigest = pkg.integrity.digest;
    row.status = 'EVIDENCE_READY';
    row.updatedAt = new Date().toISOString();
    await this.persist(row, [prior]);
    await this.record(row, 'EVIDENCE_PREPARED', actor, { digest: row.evidenceDigest });
    return row;
  }

  async submit(id: string, input: { evidenceType: string; notes?: string }, actor: string): Promise<DisputeCaseRow> {
    const row = this.cases.get(id);
    if (!row) throw new DisputeError(404, 'Dispute case not found.');
    if (row.status !== 'EVIDENCE_READY' || !row.evidenceSnapshot || !row.evidenceDigest) throw new DisputeError(409, 'Prepare the evidence package and refresh PayPal status before submission.');
    if (!input.evidenceType || input.evidenceType !== row.requestedEvidenceType) throw new DisputeError(422, 'Evidence type must match PayPal’s current seller request.');
    const notes = safeText(input.notes ?? '');
    if (input.evidenceType !== 'OTHER') throw new DisputeError(422, 'This workflow supports text-only OTHER evidence. Use PayPal’s merchant-controlled Resolution Center for document or evidence-specific submissions.');
    if (!notes) throw new DisputeError(422, 'A merchant note is required for text-only OTHER evidence.');
    // The case has to be re-read from PayPal immediately before submission. No request is sent
    // unless the seller action remains available in the current HATEOAS links.
    const remote = await paypalClient.getDispute(row.paypalDisputeId).catch(() => { throw new DisputeError(503, 'PayPal dispute status could not be verified; evidence was not submitted.'); });
    const canSubmit = remote?.dispute_id === row.paypalDisputeId && remote.status === 'WAITING_FOR_SELLER_RESPONSE' &&
      (remote.links ?? []).some((l: any) => l?.rel === 'provide-evidence');
    if (!canSubmit) throw new DisputeError(409, 'PayPal is not currently accepting seller evidence for this case.');
    const prior = row.status;
    row.status = 'SUBMISSION_PENDING';
    row.evidenceType = input.evidenceType;
    row.evidenceNotes = notes;
    row.updatedAt = new Date().toISOString();
    await this.persist(row, [prior]);
    await this.record(row, 'SUBMISSION_REQUESTED', actor, { evidenceType: row.evidenceType, evidenceDigest: row.evidenceDigest });
    try {
      const result = await paypalClient.provideDisputeEvidence(row.paypalDisputeId, {
        evidence_type: input.evidenceType,
        ...(notes ? { notes } : {}),
      });
      if (result?._httpStatus !== 200 || !(result?.links ?? []).some((l: any) => l?.rel === 'self' || l?.rel === 'provide-evidence')) {
        row.status = 'SUBMISSION_UNCERTAIN';
        row.lastError = 'PayPal returned no verifiable successful submission response; refresh the dispute before any further action.';
      } else {
        row.status = 'SUBMITTED';
        row.submittedAt = new Date().toISOString();
        row.lastError = undefined;
      }
    } catch {
      row.status = 'SUBMISSION_UNCERTAIN';
      row.lastError = 'The PayPal submission outcome is uncertain. Refresh the case before attempting another submission.';
    }
    row.updatedAt = new Date().toISOString();
    await this.persist(row, ['SUBMISSION_PENDING']);
    await this.record(row, row.status === 'SUBMITTED' ? 'EVIDENCE_SUBMITTED' : 'SUBMISSION_UNCERTAIN', actor, { evidenceDigest: row.evidenceDigest });
    return row;
  }

  private async persist(row: DisputeCaseRow, expected: DisputeCaseStatus[]): Promise<void> {
    const repo = getRepos()?.disputes;
    if (!repo) return;
    const ok = await repo.transition(row, expected);
    if (!ok) {
      const current = await repo.get(row.id);
      if (current) this.cases.set(current.id, current);
      throw new DisputeError(409, 'The case changed concurrently; refresh it and retry.');
    }
  }

  async exportEvidence(id: string) {
    const row = this.cases.get(id);
    if (!row) throw new DisputeError(404, 'Dispute case not found.');
    return {
      case: { id: row.id, orderId: row.orderId, paypalDisputeId: row.paypalDisputeId, status: row.status,
        paypalStatus: row.paypalStatus, lifecycleStage: row.lifecycleStage, requestedEvidenceType: row.requestedEvidenceType,
        sellerResponseDueAt: row.sellerResponseDueAt, evidenceType: row.evidenceType,
        evidenceNotes: row.evidenceNotes ? safeText(row.evidenceNotes) : undefined,
        evidenceDigest: row.evidenceDigest, createdAt: row.createdAt, updatedAt: row.updatedAt,
        submittedAt: row.submittedAt, resolvedAt: row.resolvedAt },
      package: row.evidenceSnapshot,
      audit: await this.auditFor(id),
      submissionMode: 'MERCHANT_CONTROLLED',
    };
  }
}

export const disputeService = new DisputeService();
