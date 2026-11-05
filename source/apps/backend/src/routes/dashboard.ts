import { Router } from 'express';
import { requireDashboardAccess, dashboardIsPublic } from '../middleware/merchant-key';
import { policyStorage } from '../policy/storage';
import { refundService } from '../refunds/service';
import { disputeService } from '../disputes/service';
import { BillService, deriveBillStatus } from '../bills/service';
import { formatMoney } from '../utils/money';
import { currentBusiness } from '../config/business-config';
import { OrderService } from '../orders/service';
import { OrderStatus } from '../orders/domain';
import { BillStatus, ShareStatus } from '../bills/domain';
import { defaultPolicy } from '../policy/default-policy';
import { sessionStore } from '../session';

const router = Router();
const orderService = OrderService.getInstance();
const billService = BillService.getInstance();

// Redirect the bare /dashboard path to the static HTML page.
router.get('/dashboard', (_req, res) => {
  res.redirect('/dashboard.html');
});

// ---- Agent Control Center summary endpoint -------------------------------
//
// Aggregates EXISTING backend data into a single read-only payload so the
// dashboard can render a holistic view of:
//   - AI agent operations (from policy events + order origins)
//   - Policy decisions (allowed vs blocked)
//   - Money movement (revenue, refunds, disputes)
//   - Spending Mandate status
//   - Wellbeing decisions
//   - Split Bill status
//   - Dispute cases
//   - Refund queue summary
//
// Every value comes from an existing service; nothing is fabricated.
// If a data source returns empty, the dashboard shows an honest empty state.
router.get('/api/dashboard/summary', requireDashboardAccess, async (_req, res, next) => {
  try {
    res.set('Cache-Control', 'no-store');

    // ---- Orders & revenue ----
    const orders = orderService.getAll();
    const paidOrders = orders.filter((o) => o.status === OrderStatus.PAID);
    const revenueMinor = paidOrders.reduce((sum, o) => sum + o.totalMinor, 0);
    const refundedMinor = orders.reduce((sum, o) => sum + refundService.refundedMinor(o.id), 0);
    const pendingRefundMinor = orders.reduce((sum, o) => sum + refundService.pendingMinor(o.id), 0);

    // ---- Policy events ----
    const events = policyStorage.getEvents();
    const blockedEvents = events.filter((e) => e.decision === 'BLOCK');
    const allowedEvents = events.filter((e) => e.decision !== 'BLOCK');
    const confirmationEvents = events.filter((e) => e.decision === 'REQUIRE_CONFIRMATION');
    const wellbeingEvents = events.filter((e) => e.wellbeingDecision);

    // ---- AI agent operations ----
    const aiAgentOrders = orders.filter((o) => o.origin === 'AI_AGENT');
    const aiAssistedOrders = orders.filter((o) => o.origin === 'AI_ASSISTED');
    const aiPolicyEvents = events.filter((e) => e.agent !== 'server' && e.agent !== 'human');

    // ---- Spending mandates ----
    // Every session owns its own server-issued identity and its own policy, enforced
    // at /orders/create. The dashboard therefore does NOT pretend there is one "current"
    // mandate: it shows the template new sessions start from, plus real counts of the
    // sessions/policies that exist right now. Reading never creates a policy.
    let mandateSummary: Record<string, unknown>;
    try {
      const stats = policyStorage.sessionPolicyStats();
      mandateSummary = {
        maxPerPurchaseMinor: defaultPolicy.maxPerPurchaseMinor,
        dailySpendLimitMinor: defaultPolicy.dailySpendLimitMinor,
        confirmationThresholdMinor: defaultPolicy.confirmationThresholdMinor,
        currency: defaultPolicy.currency,
        enabled: defaultPolicy.enabled,
        activeSessions: sessionStore.size(),
        activePolicies: stats.active,
        customizedPolicies: stats.customized,
        source: 'default-session-template',
        note: 'Template every new session starts from. Each session has its own authoritative policy enforced at checkout; individual sessions are not listed.',
      };
    } catch {
      mandateSummary = { note: 'Could not read the policy template; mandate limits not available.' };
    }

    // ---- Agent timeline ----
    // One chronological feed merged from data that already exists (policy events,
    // orders, refunds). Public mode keeps kind / decision / amount / time only; ids and
    // free-text reasons stay merchant-only.
    const isMerchantView = !dashboardIsPublic();
    type TimelineEntry = { at: string; kind: string; label: string; amountFormatted?: string; actor?: string; ref?: string };
    const timeline: TimelineEntry[] = [];
    for (const e of events.slice(-60)) {
      const actor = e.agent === 'server' ? 'server' : e.agent === 'human' ? 'human' : 'ai-agent';
      const wb = (e as any).wellbeingDecision?.status as string | undefined;
      timeline.push({
        at: e.timestamp,
        kind: 'policy',
        label: 'Policy ' + e.decision + (wb ? ' · wellbeing ' + wb : ''),
        amountFormatted: formatMoney(e.amountMinor, e.currency, currentBusiness.locale),
        actor,
        ref: isMerchantView ? (e.reason || undefined) : undefined,
      });
    }
    for (const o of orders.slice(-60)) {
      timeline.push({
        at: o.createdAt instanceof Date ? o.createdAt.toISOString() : String(o.createdAt),
        kind: 'order',
        label: 'Order ' + o.status,
        amountFormatted: formatMoney(o.totalMinor, o.currency ?? currentBusiness.currency, currentBusiness.locale),
        actor: o.origin === 'AI_AGENT' ? 'ai-agent' : o.origin === 'AI_ASSISTED' ? 'ai-assisted' : 'human',
        ref: isMerchantView ? o.id : undefined,
      });
    }
    for (const r of refundService.list().slice(-30)) {
      timeline.push({
        at: String(r.createdAt),
        kind: 'refund',
        label: 'Refund ' + r.status,
        amountFormatted: formatMoney(r.amountMinor, r.currency, currentBusiness.locale),
        actor: String(r.proposedBy ?? 'unknown').toLowerCase(),
        ref: isMerchantView ? r.orderId : undefined,
      });
    }
    timeline.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
    const timelineOut = timeline.slice(0, 40);

    // ---- Split bills ----
    const billGroups = billService.listGroups();
    const billSummary = billGroups.map((g) => {
      const effectiveShares = billService.effectiveShares(g);
      const status = g.status === BillStatus.CANCELLED ? BillStatus.CANCELLED : deriveBillStatus(effectiveShares);
      const paidShares = effectiveShares.filter((s: any) => s.status === ShareStatus.PAID).length;
      const pendingShares = effectiveShares.filter((s: any) => s.status === ShareStatus.PENDING).length;
      const failedShares = effectiveShares.filter((s: any) => s.status === ShareStatus.FAILED).length;
      return {
        id: g.id,
        status,
        totalMinor: g.totalMinor,
        totalFormatted: formatMoney(g.totalMinor, g.currency, currentBusiness.locale),
        currency: g.currency,
        participantCount: effectiveShares.length,
        paidShares,
        pendingShares,
        failedShares,
        createdAt: g.createdAt instanceof Date ? g.createdAt.toISOString() : String(g.createdAt),
      };
    });

    // ---- Merchant-only detail gate ------------------------------------------
    // Public demo mode (DASHBOARD_PUBLIC=true) intentionally exposes aggregate
    // order/policy/revenue counts, but NOT per-record merchant-sensitive data:
    // dispute cases, refund records (incl. PayPal refund ids), or wellbeing
    // decisions tied to specific orders. Those require the same X-Ops-Key that
    // guards /api/disputes and /api/refunds. Aggregate counts stay visible so
    // the dashboard remains useful in public mode without leaking detail.
    const isMerchant = !dashboardIsPublic();

    // ---- Disputes ----
    const allDisputes = disputeService.list();
    const disputes = isMerchant ? allDisputes.map((d) => ({
      id: d.id,
      orderId: d.orderId,
      status: d.status,
      paypalStatus: d.paypalStatus,
      lifecycleStage: d.lifecycleStage,
      requestedEvidenceType: d.requestedEvidenceType,
      sellerResponseDueAt: d.sellerResponseDueAt,
      evidenceDigest: d.evidenceDigest,
      createdAt: d.createdAt,
      updatedAt: d.updatedAt,
      submittedAt: d.submittedAt,
      resolvedAt: d.resolvedAt,
    })) : [];

    // ---- Refund queue ----
    const allRefunds = refundService.list();
    const refunds = isMerchant ? allRefunds.map((r) => ({
      id: r.id,
      orderId: r.orderId,
      amountMinor: r.amountMinor,
      amountFormatted: formatMoney(r.amountMinor, r.currency, currentBusiness.locale),
      currency: r.currency,
      status: r.status,
      proposedBy: r.proposedBy,
      reason: r.reason,
      paypalRefundId: r.paypalRefundId,
      paypalRefundStatus: r.paypalRefundStatus,
      createdAt: r.createdAt,
      decidedAt: r.decidedAt,
      lastError: r.lastError,
    })) : [];

    // ---- Wellbeing decisions (from policy events) ----
    // Per-event wellbeing detail is merchant-only; public mode keeps only the
    // aggregate count (below) so the operator can see "N wellbeing checks ran"
    // without exposing which orders/items were involved.
    const wellbeingSummary = isMerchant ? wellbeingEvents.slice(-50).map((e: any) => ({
      eventId: e.id,
      timestamp: e.timestamp,
      orderId: e.orderId ?? null,
      wellbeingStatus: e.wellbeingDecision?.status ?? 'UNKNOWN',
      productDataVersion: e.wellbeingDecision?.productDataVersion ?? '',
      itemCount: e.wellbeingDecision?.items?.length ?? 0,
      decision: e.decision,
    })) : [];

    res.json({
      redactedDetail: !isMerchant,
      orders: {
        total: orders.length,
        paid: paidOrders.length,
        pending: orders.filter((o) => o.status === OrderStatus.PAYMENT_PENDING).length,
        cancelled: orders.filter((o) => o.status === OrderStatus.ORDER_CANCELLED).length,
        failed: orders.filter((o) => o.status === OrderStatus.PAYMENT_FAILED).length,
        aiAgent: aiAgentOrders.length,
        aiAssisted: aiAssistedOrders.length,
        human: orders.filter((o) => o.origin === 'HUMAN').length,
      },
      revenue: {
        capturedMinor: revenueMinor,
        capturedFormatted: formatMoney(revenueMinor, currentBusiness.currency, currentBusiness.locale),
        refundedMinor,
        refundedFormatted: formatMoney(refundedMinor, currentBusiness.currency, currentBusiness.locale),
        pendingRefundMinor,
        netMinor: revenueMinor - refundedMinor,
        netFormatted: formatMoney(revenueMinor - refundedMinor, currentBusiness.currency, currentBusiness.locale),
        currency: currentBusiness.currency,
      },
      policy: {
        totalEvents: events.length,
        allowed: allowedEvents.length,
        blocked: blockedEvents.length,
        requireConfirmation: confirmationEvents.length,
        aiPolicyEvents: aiPolicyEvents.length,
      },
      mandate: mandateSummary,
      timeline: timelineOut,
      splitBills: {
        total: billSummary.length,
        open: billSummary.filter((b) => b.status === BillStatus.OPEN).length,
        partiallySettled: billSummary.filter((b) => b.status === BillStatus.PARTIALLY_SETTLED).length,
        settled: billSummary.filter((b) => b.status === BillStatus.SETTLED).length,
        cancelled: billSummary.filter((b) => b.status === BillStatus.CANCELLED).length,
        groups: billSummary,
      },
      disputes: {
        total: disputes.length,
        open: disputes.filter((d) => d.status === 'OPEN').length,
        resolved: disputes.filter((d) => d.status === 'RESOLVED').length,
        cases: disputes,
      },
      refunds: {
        total: refunds.length,
        proposed: refunds.filter((r) => r.status === 'PROPOSED').length,
        processing: refunds.filter((r) => r.status === 'PROCESSING').length,
        refunded: refunds.filter((r) => r.status === 'REFUNDED').length,
        rejected: refunds.filter((r) => r.status === 'REJECTED').length,
        records: refunds,
      },
      wellbeing: {
        totalEvents: wellbeingEvents.length,
        decisions: wellbeingSummary,
      },
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
});

export default router;
